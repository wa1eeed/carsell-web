import { db } from '@/lib/db';
import { ProviderType, type ServiceRequestStatus } from '@/generated/prisma/enums';
import { MIN_FAIL_REASON } from './provider-rules';
import { completionFormFor, type CompletionFormKind } from './completion-schema';

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
   * أيفتح هذا الفعل نموذجًا قبل أن يقع؟ — **ومن مصدرٍ واحد**.
   *
   * كانت القيمةُ مكتوبةً بيدٍ لكل صنف: `INSPECTION` للفاحص و`null`
   * للستّة الباقية، **فستّةُ أصناف تُنهي بلا حقلٍ واحد** — ناقلٌ يضغط
   * «أنهِ» فلا نعلم رقم البوليصة. وتُشتقّ الآن من
   * `completion-schema.ts`: مخطّطٌ لكل صنف ونموذجٌ واحد يرسمه.
   */
  form: CompletionFormKind | null;
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

/**
 * **والجدولُ يُبنى لا يُكتب.** كان سبعةَ أسطرٍ متوأمة تختلف في كلمة،
 * فصنفٌ جديد يُضاف إلى التعداد ولا يُضاف هنا يخرج **بلا خطواتٍ
 * أصلًا** — طابورٌ يستلم طلبًا ولا زرَّ فيه.
 *
 * **ومن التعداد نفسه لا من نسخةٍ له**: قائمةٌ مكتوبةٌ بيد بأسماء
 * الأصناف هي العطبُ نفسه مؤجَّلًا خطوةً.
 */
export const STEPS_BY_TYPE: Readonly<Record<string, readonly Step[]>> = Object.fromEntries(
  Object.values(ProviderType).map((type) => [
    type,
    [
      ...COMMON,
      { key: 'complete', from: 'IN_PROGRESS', to: 'DONE', form: completionFormFor(type) },
    ] as readonly Step[],
  ]),
);

/**
 * **والتعذّر خطوةٌ من كل حالٍ عاملة** — لا نهايةَ واحدة.
 *
 * فاحصٌ يصل فلا يجد المركبة، وناقلٌ يتعذّر عليه النقل: بلا هذا الباب
 * يبقى الطلب «قيد التنفيذ» أبدًا، أو يُنهيه المزوّد كذبًا ليتخلّص منه.
 */
export const FAIL_STEP: Step = { key: 'fail', from: 'IN_PROGRESS', to: 'FAILED', form: null };

/**
 * ═══ والمنتهي فات موعدُه ليس متأخّرًا ═══
 *
 * **لا أحد ينتظره.** كان الحسابُ `dueAt <= now` وحدَه، فطلبٌ أُنجز أمس
 * يحمل شارة «تجاوز المهلة» إلى الأبد — قِيس على الشاشة بعد إنهاء طلبِ
 * نقل ملكية: «مكتمل» و«تجاوز المهلة» في سطرٍ واحد، **وسمان
 * متناقضان**. وهو نمطُ «لا مرحلةَ طلبٍ تُعرض وحدها» نفسُه: الحالُ
 * يُقرأ مع الزمن لا بعده.
 *
 * و`adminServiceRequestDetail` تفعلها منذ كُتبت — فكان مدخلان لقاعدةٍ
 * واحدة، أحدُهما يقولها والآخر يسكت.
 */
const OPEN_STATUSES: readonly ServiceRequestStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS'];

function isOverdue(
  status: ServiceRequestStatus,
  dueAt: Date | null,
  now: Date,
): boolean {
  return dueAt !== null && dueAt.getTime() <= now.getTime() && OPEN_STATUSES.includes(status);
}

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
    overdue: isOverdue(row.status, row.dueAt, now),
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
  /**
   * ═══ والرقمُ يُكشف بطلبٍ ويُسجَّل ═══
   *
   * كانت اللوحة تعرض رقمَي العميل وصاحب المركبة **كاملين عند فتحها**،
   * ولا سطر يقول من نظر فيهما. والمزوّدُ هويةٌ ثالثة — مركزُ فحصٍ
   * خارجيّ بحسابه — فيرى رقمَي شخصين لم يتعاملا معه بعد، ولا أثرَ
   * يُراجَع إن أُسيء استعمالهما.
   *
   * ومعيار A18 مبنيٌّ لكشف الهوية في الأدمن: سببٌ يُكتب وسجلٌّ
   * يُكتب. والرقمُ هنا أخفّ — المزوّد يحتاجه ليُنجز عملَه — فيُكشف
   * بنقرةٍ بلا سبب، **والنقرةُ نفسها هي القصد، والسجلّ هو الحساب**.
   */
  requester: { name: string | null; phoneTail: string };
  /** عند من المركبة — و`null` حين يكون هو الطالب نفسه */
  keeper: { name: string | null; phoneTail: string } | null;
  steps: Step[];
  /** صنفُ الخدمة — ومنه عنوانُ نموذج الإنجاز ووجهتُه */
  type: ProviderType | null;
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
    overdue: isOverdue(row.status, row.dueAt, now),
    /** **ولا يدخل الرقمُ الكائن أصلًا** — وما لا يُجلَب لا يتسرّب في حمولة RSC. */
    requester: { name: row.user.name, phoneTail: row.user.phone.slice(-4) },
    keeper:
      row.seller === null
        ? null
        : { name: row.seller.name, phoneTail: row.seller.phone.slice(-4) },
    steps: stepsFor(row.service.providerType, row.status),
    type: row.service.providerType,
    mine,
  };
}

export type StepFailure =
  | 'REQUEST_NOT_FOUND'
  | 'NOT_YOURS'
  /** خطوةٌ لا تقبلها الحال — والزرّ لا يُعرض أصلًا، والحارس هنا */
  | 'STEP_NOT_ALLOWED'
  | 'REASON_REQUIRED'
  /**
   * **نموذجُ الإنجاز ناقص.** `form` كان علامةً لا شرطًا: الفاحص يُنهي
   * بلا تقرير فيُعترف بالإيراد وتخرج الفاتورة ويُقبض المال على فحصٍ
   * لا وجود له. والاسمُ يقول ما ينقص لا «تعذّرت الخطوة».
   */
  | 'FORM_INCOMPLETE';

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
   * ═══ ونموذجُ الإنجاز شرطٌ لا علامة ═══
   *
   * `form: 'INSPECTION'` مكتوبٌ في الجدول منذ بُني **ولم يُفرَض قطّ**:
   * زرُّ «أنهِ» معروضٌ بجوار رابط النموذج، فيُضغط بلا أن يُفتح — ثمّ
   * `recordServiceEarned` و`issueServiceInvoice` و`captureServicePayment`
   * تمرّ كلُّها، **فيُقبض ثمنُ فحصٍ لا تقريرَ له**. والعميل يقرأ
   * «اكتمل».
   *
   * **وحارسٌ في الشاشة ليس حارسًا**: الشاشة تعرض الرابط، والنداء
   * المباشر يتجاوزه. فالشرط هنا، على مدخل الحال الوحيد.
   */
  if (step.form !== null) {
    const row = await db.serviceRequest.findUnique({
      where: { ref: input.ref },
      select: { id: true, service: { select: { providerType: true } } },
    });
    const type = row?.service.providerType ?? null;
    if (row === null || type === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };

    const { completionComplete } = await import('./service-completion');
    if (!(await completionComplete(row.id, type, now))) {
      return { ok: false, reason: 'FORM_INCOMPLETE' };
    }
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

  /**
   * ═══ ومن دفع يُخطَر بما وقع ═══
   *
   * كانت الدالّة تكتب الحال وتسكت، فمن دفع ثمنَ فحصٍ لا يعلم أن
   * مركزًا استلمه ولا أنه أُنجز ولا أنه تعذّر — **والطرف الثاني
   * يُبنى مع الأوّل**.
   *
   * وبعد الكتابة لا معها: الإخطار أثرٌ لا شرط، وفشلُ البثّ لا يُعيد
   * الطلب إلى حاله.
   */
  if (step.to === 'ASSIGNED' || step.to === 'DONE' || step.to === 'FAILED') {
    const row = await db.serviceRequest.findUnique({
      where: { ref: input.ref },
      select: {
        userId: true,
        amount: true,
        adminFee: true,
        vatAmount: true,
        paymentId: true,
        providerId: true,
        vehicleId: true,
        service: { select: { nameAr: true } },
      },
    });
    if (row !== null) {
      /**
       * ═══ والإنجاز لحظةُ الاستحقاق ═══
       *
       * التوريد وقع، فالإيراد يُعترف به الآن لا يوم قُبض المال.
       * والقيد **قبل الإخطار**: ما يمسّ الدفتر يسبق ما يمسّ الجرس،
       * فإخفاقُ بثٍّ لا يترك مالًا بلا قيد.
       *
       * **وطلبٌ لم يُدفع لا يُقيَّد**: الزرع يُنشئ طلباتٍ مُنجَزة بلا
       * دفعة، وقيدٌ لها يُنشئ إيرادًا لم يُقبض مقابلُه.
       */
      /**
       * **وخدمةٌ أُنجزت على مركبةٍ تدخل تاريخَها.** `VehicleHistoryItem`
       * كان بلا كاتبٍ في المنتج كلِّه — فسيارةٌ خُدمت عندنا تبقى بلا
       * سطر. وتُكتب لكلّ منجَزة ولو لم تُدفع بعد: الواقعةُ وقعت،
       * والدفترُ شأنٌ آخر.
       */
      if (step.to === 'DONE' && row.vehicleId !== null) {
        const { recordService } = await import('./vehicle-history');
        await recordService(db, row.vehicleId, row.service.nameAr, now);
      }

      if (step.to === 'DONE' && row.paymentId !== null) {
        const { recordServiceEarned } = await import('./ledger-events');
        await recordServiceEarned(
          db,
          {
            ref: input.ref,
            paymentId: row.paymentId,
            requesterId: row.userId,
            total: row.amount,
            platformFee: row.adminFee,
            vat: row.vatAmount,
            providerId: row.providerId,
          },
          now,
        );

        /**
         * **والفاتورة مع القيد لا بعده بيوم.** تسويةُ المركبة تقول منذ
         * كُتبت إن الخدمات «مُفوتَرةٌ بدفعتها» — ولم تكن، فتُرصد
         * ضريبةٌ في الدفتر بلا وثيقةٍ تخرج لمن دفع.
         *
         * وإخفاقُها لا يُسقط الخطوة: الخدمة أُنجزت فعلًا، والسببُ
         * يظهر في طابور الضريبة (قاعدةٌ تنتظر إقرارًا مثلًا).
         */
        const { issueServiceInvoice, captureServicePayment } = await import('./service-lifecycle');
        await issueServiceInvoice(input.ref, now);

        /**
         * **والحجزُ يُحصَّل متى وقع التوريد.** قِيس على الشاشة: طلبٌ
         * `DONE` بفاتورةٍ وإيرادٍ مُعترَفٍ به ودفعةٌ **`HELD`** — حجزٌ
         * ينقضي بعد أيّام فيعود المال إلى بطاقة من دفع، وقد أدّينا
         * الخدمة وأصدرنا له وثيقةً بها.
         *
         * **ولا يُحصَّل قبل الإنجاز**: الحجز كافٍ حتى يقع التوريد،
         * وقبضٌ على عملٍ لم يقع يُردّ.
         *
         * وإخفاقُه لا يُسقط الخطوة ولا الفاتورة: الحال تبقى `HELD`
         * فيلتقطها `captureDoneServices` في المُجدوِل، والدفترُ لا يقول
         * «وصل» إلا حين يصل.
         */
        await captureServicePayment(input.ref, now);
      }

      /**
       * **والفشل يردّ المال قبل أن يُخطَر به.** الإشعار يقول «وما دُفع
       * يُردّ» — فلو سبق الردَّ لوصل وعدٌ قبل وقوعه. وفشلُ الردّ لا
       * يمنع الإخطار: العميل يعرف أن خدمته تعذّرت، والمال يُلاحَق.
       */
      if (step.to === 'FAILED' && row.paymentId !== null) {
        const { refundFailedService } = await import('./service-lifecycle');
        await refundFailedService(input.ref, now);
      }

      const { notifyServiceStep } = await import('./service-lifecycle');
      await notifyServiceStep(input.ref, row.userId, step.to, row.service.nameAr);
    }
  }

  return { ok: true, status: step.to };
}

/**
 * ═══ كشفُ رقمٍ للمزوّد — بنقرةٍ وسجلّ ═══
 *
 * **ولا يُكشف إلّا لمن الطلبُ طلبُه**: الفحص نفسه الذي يحرس عرض
 * الطلب (`providerRequestView`) يحرس رقمَه — وإلّا صار المسارُ بابًا
 * خلفيًّا يقرأ أرقام كل العملاء بمرجعٍ مخمَّن.
 *
 * **ويُسجَّل قبل أن يُعاد الرقم**: سجلٌّ يُكتب بعد الإرجاع يسقط مع
 * أوّل انقطاع، فيصل الرقمُ ولا أثرَ له.
 */
export type RevealFailure = 'REQUEST_NOT_FOUND' | 'NOT_YOURS' | 'UNKNOWN_PARTY';

export type RevealResult =
  | { ok: true; phone: string }
  | { ok: false; reason: RevealFailure };

export async function revealRequestPhone(
  input: {
    ref: string;
    party: 'requester' | 'keeper';
    providerId: string;
    providerUserId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<RevealResult> {
  const view = await providerRequestView(input.ref, input.providerId, now);
  if (view === null) return { ok: false, reason: 'NOT_YOURS' };

  const row = await db.serviceRequest.findUnique({
    where: { ref: input.ref },
    select: { id: true, user: { select: { phone: true } }, seller: { select: { phone: true } } },
  });
  if (row === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' };

  const phone = input.party === 'requester' ? row.user.phone : (row.seller?.phone ?? null);
  if (phone === null) return { ok: false, reason: 'UNKNOWN_PARTY' };

  await db.auditLog.create({
    data: {
      actorId: input.providerUserId,
      actorType: 'provider',
      entity: 'ServiceRequest',
      entityId: input.ref,
      action: `contact.revealed.${input.party}`,
      /** **والرقم لا يُنسخ إلى السجلّ** — وإلّا صار السجلّ هو التسريب. */
      after: { party: input.party },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, phone };
}
