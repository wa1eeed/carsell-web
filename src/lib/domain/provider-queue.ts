import { db } from '@/lib/db';
import type { ProviderType, ServiceRequestStatus } from '@/generated/prisma/enums';
import { MIN_FAIL_REASON } from './provider-rules';

/**
 * ═══ طابورُ المزوّد — ولوحةٌ موحَّدة لا لوحةً لكلٍّ ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «لوحة مزوّدين موحَّدة مهما كان نوع الخدمة
 * … **الفرق يكون في صفحة تفاصيل الطلب**: كرت معلومات الطلب، ثمّ قسمٌ
 * أسفله متغيّر حسب نوعية الطلب وفيه أزرار الأكشن».
 *
 * فالصدفةُ واحدة: طابورٌ واحد وبطاقةُ معلوماتٍ واحدة، **والخطوات
 * تُعرَّف بصنف المزوّد**. وإضافةُ «نقل الملكية» لاحقًا تعريفٌ جديد لا
 * شاشةٌ جديدة — وشاشتان متوأمتان تتباعدان أوّل تعديل في إحداهما.
 */

/**
 * ═══ الخطوة — فعلٌ يُقدّم الطلب حالًا واحدة ═══
 *
 * و**من الحال الحالية وحدها**: زرٌّ يُعرض على حالٍ لا يقبله يردّ ٤٠٩
 * بعد الضغط، وهو أسوأ من غيابه.
 */
export type Step = {
  /** مفتاحٌ لاتينيّ — والتسمية في `src/lib/labels/` */
  key: string;
  from: ServiceRequestStatus;
  to: ServiceRequestStatus;
  /**
   * أيفتح هذا الفعل نموذجًا قبل أن يقع؟
   *
   * الفاحص يُنهي بتعبئة نتائج الفحص، ومزوّدُ النقل يؤكّد بلا نموذج —
   * وهو الفرقُ الذي قصده المالك بـ«قسمٌ متغيّر».
   */
  form: 'INSPECTION' | null;
};

/**
 * ═══ خطواتُ كل صنف ═══
 *
 * **والقبول والبدء والإنهاء مشتركة** — فهي رحلةُ أي عملٍ يُسنَد: تقبله،
 * تبدأه، تُنهيه. والفرقُ في ما يُطلب عند الإنهاء وحده.
 *
 * ونقلُ الملكية سيُضاف هنا سطرًا لا شاشة.
 */
const COMMON: readonly Step[] = [
  { key: 'accept', from: 'NEW', to: 'ASSIGNED', form: null },
  { key: 'start', from: 'ASSIGNED', to: 'IN_PROGRESS', form: null },
];

export const STEPS_BY_TYPE: Readonly<Record<string, readonly Step[]>> = {
  INSPECTION: [
    ...COMMON,
    /** الفاحص يُنهي بنموذج النتائج — وحقولُه يزوّدنا بها المالك */
    { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: 'INSPECTION' },
  ],
  SHIPPING: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
  INSURANCE: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
  DETAILING: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
  PHOTOGRAPHY: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
  FINANCE: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
  OTHER: [...COMMON, { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: null }],
};

/**
 * **والتعذّر خطوةٌ من كل حالٍ عاملة** — لا نهايةَ واحدة.
 *
 * فاحصٌ يصل فلا يجد المركبة، وناقلٌ يتعذّر عليه النقل: بلا هذا الباب
 * يبقى الطلب «قيد التنفيذ» أبدًا، أو يُنهيه المزوّد كذبًا ليتخلّص منه.
 */
export const FAIL_STEP: Step = { key: 'fail', from: 'IN_PROGRESS', to: 'FAILED', form: null };

export function stepsFor(type: ProviderType | null, status: ServiceRequestStatus): Step[] {
  const all = type === null ? [] : (STEPS_BY_TYPE[type] ?? []);
  const next = all.filter((step) => step.from === status);
  return status === 'IN_PROGRESS' ? [...next, FAIL_STEP] : next;
}

/** ما يراه المزوّد في طابوره — صفٌّ لا يقول أكثر ممّا يلزم للترتيب. */
export type QueueRow = {
  ref: string;
  serviceName: string;
  status: ServiceRequestStatus;
  city: string | null;
  createdAt: string;
  scheduledAt: string | null;
  dueAt: string | null;
  /** تجاوزت مهلتُه — **بالوقت لا بالحالة وحدها** (البوابة ٤٢) */
  overdue: boolean;
};

/**
 * ═══ ما يصل المزوّد ═══
 *
 * **المدفوعُ وحده**: طلبٌ ينتظر إذنًا أو سدادًا ليس عملًا بعد، وعرضُه
 * يجعل الفاحص يخرج إلى موعدٍ لم يُدفع ثمنُه.
 *
 * **والمُسنَد إليه أو المعروضُ على صنفه في مدينته**: `NEW` بلا مزوّدٍ
 * معيَّن يراه كلُّ من يصلح لها فيقبله أوّلُهم، وما أُسنِد لغيره لا يراه.
 */
export async function providerQueue(
  providerId: string,
  now: Date = new Date(),
): Promise<QueueRow[]> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { type: true, cities: true },
  });
  if (provider === null) return [];

  const rows = await db.serviceRequest.findMany({
    where: {
      status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
      OR: [
        { providerId },
        {
          providerId: null,
          status: 'NEW',
          service: { providerType: provider.type },
          ...(provider.cities.length === 0 ? {} : { city: { in: provider.cities } }),
        },
      ],
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      ref: true,
      status: true,
      city: true,
      createdAt: true,
      scheduledAt: true,
      dueAt: true,
      service: { select: { nameAr: true } },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    serviceName: row.service.nameAr,
    status: row.status,
    city: row.city,
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: row.dueAt !== null && row.dueAt.getTime() <= now.getTime(),
  }));
}

/**
 * ═══ بطاقةُ الطلب كما يراها المزوّد ═══
 *
 * قرار المالك: «كرت معلومات الطلب فيه رقم الطلب وتاريخ ووقت الطلب
 * وحالة الطلب **ومعلومات طالب الخدمة**».
 *
 * **وطالبُ الخدمة ليس دائمًا صاحب المركبة**: مشترٍ يفحص سيارة غيره.
 * فيُعرض الطرفان — من طلب، ومن تُقابَل عنده المركبة — ولكلٍّ صفتُه،
 * وإلّا اتّصل الفاحص بمن لا يملك فتح الباب.
 */
export type ProviderRequestView = {
  ref: string;
  status: ServiceRequestStatus;
  serviceName: string;
  vehicleTitle: string;
  city: string | null;
  createdAt: string;
  scheduledAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  /** من طلب الخدمة ودفع ثمنها */
  requester: { name: string | null; phone: string };
  /** عند من المركبة — و`null` حين يكون هو الطالب نفسه */
  keeper: { name: string | null; phone: string } | null;
  steps: Step[];
  /** أهو مُسنَدٌ إلى هذا المزوّد بعد، أم معروضٌ على صنفه */
  mine: boolean;
};

export async function providerRequestView(
  ref: string,
  providerId: string,
  now: Date = new Date(),
): Promise<ProviderRequestView | null> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { type: true, cities: true },
  });
  if (provider === null) return null;

  const row = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      ref: true,
      status: true,
      city: true,
      createdAt: true,
      scheduledAt: true,
      dueAt: true,
      providerId: true,
      sellerId: true,
      service: { select: { nameAr: true, providerType: true } },
      user: { select: { name: true, phone: true } },
      seller: { select: { name: true, phone: true } },
      vehicle: { select: { brandName: true, modelName: true, trimName: true } },
    },
  });
  if (row === null) return null;

  /**
   * **ولا يراه مزوّدٌ لا شأن له به.** المسنَدُ إليه، أو المعروضُ على
   * صنفه في مدينته — وما عداه ٤٠٤: وجودُ الطلب نفسه معلومة.
   */
  const mine = row.providerId === providerId;
  const offered =
    row.providerId === null &&
    row.status === 'NEW' &&
    row.service.providerType === provider.type &&
    (provider.cities.length === 0 || (row.city !== null && provider.cities.includes(row.city)));
  if (!mine && !offered) return null;

  /** والمدفوعُ وحده يصل المزوّد — وما قبله ليس عملًا بعد. */
  const { isPaidStatus } = await import('./service-lifecycle');
  if (!isPaidStatus(row.status)) return null;

  return {
    ref: row.ref,
    status: row.status,
    serviceName: row.service.nameAr,
    vehicleTitle: [row.vehicle?.brandName, row.vehicle?.modelName, row.vehicle?.trimName]
      .filter((part) => part !== null && part !== undefined && part !== '')
      .join(' '),
    city: row.city,
    createdAt: row.createdAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    overdue: row.dueAt !== null && row.dueAt.getTime() <= now.getTime(),
    requester: { name: row.user.name, phone: row.user.phone },
    keeper:
      row.seller === null ? null : { name: row.seller.name, phone: row.seller.phone },
    steps: stepsFor(row.service.providerType, row.status),
    mine,
  };
}

export type StepFailure =
  | 'REQUEST_NOT_FOUND'
  | 'NOT_YOURS'
  /** خطوةٌ لا تقبلها الحال — والزرّ لا يُعرض أصلًا، والحارس هنا */
  | 'STEP_NOT_ALLOWED'
  | 'REASON_REQUIRED';

export type StepResult =
  | { ok: true; status: ServiceRequestStatus }
  | { ok: false; reason: StepFailure };

/**
 * سببُ التعذّر يُكتب — و«تعذّر» بلا سببٍ لا يُصلحها أحد.
 * **والقاعدة في وحدةٍ بلا `db`** لتقرأها الشاشة بلا أن تجرّ Prisma.
 */
export { MIN_FAIL_REASON } from './provider-rules';

/**
 * ═══ تطبيقُ خطوة — **والحارس في الخادم** ═══
 *
 * الشاشة تعرض ما تقبله الحال، **وشرطٌ تفرضه الشاشة وحدها اقتراحٌ لا
 * حارس**: نداءٌ مباشر يُنهي طلبًا لم يبدأ، أو يقبل طلبَ مزوّدٍ آخر.
 *
 * و«اقبل» تُسنِد الطلب إلى هذا المزوّد — وهي اللحظة التي يصير فيها
 * عملًا له وحده، فلا يقبله اثنان.
 */
export async function applyStep(
  input: { ref: string; providerId: string; step: string; reason: string | null },
  now: Date = new Date(),
): Promise<StepResult> {
  const view = await providerRequestView(input.ref, input.providerId, now);
  if (view === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };

  const step = view.steps.find((candidate) => candidate.key === input.step);
  if (step === undefined) return { ok: false, reason: 'STEP_NOT_ALLOWED' };

  const reason = input.reason?.trim() ?? '';
  if (step.key === 'fail' && reason.length < MIN_FAIL_REASON) {
    return { ok: false, reason: 'REASON_REQUIRED' };
  }

  /**
   * **والإسناد يقع مرّةً واحدة.** `providerId: null` في الشرط يجعل
   * قبولَين متزامنين يُنتج فائزًا واحدًا — والثاني يقرأ صفرَ صفوفٍ
   * متأثّرة فيعرف أن غيره سبقه، لا أن الطلب اختفى.
   */
  const { count } = await db.serviceRequest.updateMany({
    where: {
      ref: input.ref,
      status: step.from,
      ...(step.key === 'accept'
        ? { providerId: null }
        : { providerId: input.providerId }),
    },
    data: {
      status: step.to,
      ...(step.key === 'accept' ? { providerId: input.providerId } : {}),
    },
  });

  if (count === 0) return { ok: false, reason: 'STEP_NOT_ALLOWED' };

  return { ok: true, status: step.to };
}
