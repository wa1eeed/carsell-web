import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';
import type {
  ProviderType,
  ServiceCategory,
  ServiceFeeMode,
  ServiceRequestStatus,
} from '@/generated/prisma/enums';
import { candidatesFor } from './assignment';

/**
 * الخدمات في اللوحة — A6 وA7.
 *
 * **السعر لقطة في الطلب** (معيار A7): `ServiceRequest.amount` يُملأ وقت
 * الإنشاء، وتعديل `Service.price` لاحقًا لا يمسّه. عميلٌ طلب فحصًا بـ٣٥٠
 * ثم رُفع السعر إلى ٤٥٠ يدفع ٣٥٠ — والعكس تغييرٌ للعقد بعد انعقاده.
 */

export type ServiceRequestRow = {
  ref: string;
  serviceKey: string;
  serviceName: string;
  status: string;
  amount: string;
  createdAt: string;
  dueAt: string | null;
  /**
   * موعدُ **العميل** — غيرُ `dueAt` التي هي مهلةُ المزوّد. والمشغّل
   * الذي يُسنِد طلبًا يحتاج أن يعرف متى طلبه صاحبُه وأين، لا متى
   * ينتهي صبرُنا على المزوّد.
   */
  scheduledAt: string | null;
  city: string | null;
  /** ساعات التأخّر عن المهلة — سالبٌ يعني أنها لم تحن بعد. */
  overdueHours: number | null;
  /** **بارز** (معيار A6): المهلة فاتت والطلب لم يُنجَز. */
  overdue: boolean;
  providerName: string | null;
  customer: string;
  listingRef: string | null;
  /**
   * ═══ وكلُّ اسمٍ يفتح صفحته ═══
   *
   * الصفّ كان يعرض اسم العميل نصًّا، ومن يُسنِد طلبًا يحتاج أن يعرف
   * من هو — أموثَّقٌ وكم طلبًا له — وكان ذلك بحثًا في شاشةٍ أخرى.
   */
  customerId: string;
  providerId: string | null;
};

const OPEN_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS'] as const;

/** المفتوحُ — ما لم يُنجَز ولم يُلغَ. يقرؤه العدّاد والقائمة معًا. */
const OPEN_WHERE: Prisma.ServiceRequestWhereInput = { status: { in: [...OPEN_STATUSES] } };

/**
 * ═══ «تجاوزت المهلة» تُعرَّف مرّة ═══
 *
 * كانت في أربعة مواضع: رايةُ الصفّ (`overdueHours > 0`)، وبطاقةُ
 * الشاشة، وزرٌّ داخل مكوّن العميل، ومرشّحُ النطاق — وأيُّ اثنين منها
 * يتباعدان أوّلَ تعديل. وقد تباعدا فعلًا: راية الصفّ تشترط ساعةً
 * كاملة، ومرشّحٌ بـ`dueAt < now` كان سيُرجع طلبًا متجاوزًا بعشرين
 * دقيقة **بلا شارةٍ حمراء** — صفٌّ يقول الجدولُ إنه متأخّر ولا يقول.
 *
 * والساعةُ ليست تسامحًا بل شرطُ العرض: `Duration hours={0}` تُخرج «لا
 * ساعات»، فالطلبُ يُقال متجاوزًا حين يصير لتجاوزه مدّةٌ تُقرأ.
 */
const OVERDUE_GRACE_MS = 3_600_000;

function overdueBoundary(now: Date): Date {
  return new Date(now.getTime() - OVERDUE_GRACE_MS);
}

/**
 * مواضعُ الطابور الثلاثة قيدًا واحدًا — تقرؤه `serviceQueueHealth`
 * للعدّ و`listServiceRequests` للقائمة، فالبطاقةُ تفتح ما عدّته بالضبط.
 */
function scopeWhere(
  scope: { onlyOverdue?: boolean; onlyUnassigned?: boolean },
  now: Date,
): Prisma.ServiceRequestWhereInput {
  return {
    ...(scope.onlyOverdue === true ? { dueAt: { lte: overdueBoundary(now) } } : {}),
    ...(scope.onlyUnassigned === true ? { providerId: null } : {}),
  };
}

/**
 * ═══ صحّةُ الطابور — أرقامُ البطاقات ═══
 *
 * **ولا تُحسب من القائمة المعروضة.** كانت تُحسب منها، فأوّلُ نقرةٍ على
 * بطاقة تجعل البطاقات تصف نفسها: على `?overdue=1` تقول «الإجمالي ١»
 * والطابور فيه ثمانية، و«بلا مزوّد» تنزل من ٢ إلى ١. فالبطاقاتُ حالُ
 * الطابور كلِّه، والجدولُ وحده يتبع المرشّح.
 */
export type QueueHealth = { open: number; overdue: number; unassigned: number; total: number };

export async function serviceQueueHealth(now: Date = new Date()): Promise<QueueHealth> {
  const [total, open, overdue, unassigned] = await Promise.all([
    db.serviceRequest.count(),
    db.serviceRequest.count({ where: OPEN_WHERE }),
    db.serviceRequest.count({ where: { ...OPEN_WHERE, ...scopeWhere({ onlyOverdue: true }, now) } }),
    db.serviceRequest.count({ where: { ...OPEN_WHERE, ...scopeWhere({ onlyUnassigned: true }, now) } }),
  ]);
  return { open, overdue, unassigned, total };
}

const REQUEST_SELECT = {
  ref: true, status: true, amount: true, createdAt: true, dueAt: true,
  scheduledAt: true, city: true,
  service: { select: { key: true, nameAr: true } },
  provider: { select: { id: true, nameAr: true } },
  user: { select: { id: true, name: true, phone: true } },
  listing: { select: { ref: true } },
} as const;

/** سقف المنجَز وحده — والمفتوح لا سقف له. */
const CLOSED_HISTORY = 200;

/**
 * شرائح A6 — **حالةٌ أو نوعُ خدمة**، والتصميم يخلطهما في شريطٍ واحد:
 * الكل · معلّقة · مسندة · قيد التنفيذ · مكتملة · ملغاة · ثم الأنواع.
 * وهو خلطٌ مقصود: المشغّل يسأل «ما المتأخّر؟» و«كم فحصًا اليوم؟»
 * بالتبادل، وشريطان يضاعفان النقرات.
 */
export type RequestFilter = string | null;

export async function serviceRequestCounts(): Promise<Record<string, number>> {
  const [byStatus, byKind] = await Promise.all([
    db.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    db.serviceRequest.groupBy({ by: ['serviceId'], _count: { _all: true } }),
  ]);
  const services = await db.service.findMany({ select: { id: true, key: true } });
  const keyOf = new Map(services.map((row) => [row.id, row.key]));

  const out: Record<string, number> = {
    all: byStatus.reduce((n, row) => n + row._count._all, 0),
  };
  for (const row of byStatus) out[row.status] = row._count._all;
  for (const row of byKind) {
    const key = keyOf.get(row.serviceId);
    if (key !== undefined) out[key] = (out[key] ?? 0) + row._count._all;
  }
  return out;
}

export async function listServiceRequests(
  filters: {
    onlyOverdue?: boolean;
    /**
     * **بلا مزوّدٍ مُسنَد** — وهي الحال التي لا يتحرّك فيها الطلب:
     * مدفوعٌ ولا أحد يعمل عليه. وبطاقةُ «بلا مزوّد» كانت تعدّها ولا
     * تفتحها، فيقرأ المشغّل «٢» ويبحث عنهما بين الجدول.
     */
    onlyUnassigned?: boolean;
    /** المفتوحةُ وحدها — بطاقةُ «مفتوحة» كانت تعدّ ولا تفتح. */
    onlyOpen?: boolean;
    filter?: RequestFilter;
  } = {},
  now: Date = new Date(),
): Promise<ServiceRequestRow[]> {
  /**
   * **والشريحة تُرشَّح في الاستعلام.** الترشيح بعد الجلب يقصّ المنجَز
   * (محدودٌ بـ`CLOSED_HISTORY`) قبل أن يُرشَّح، فتبدو «مكتملة» أصغر.
   */
  const pick = filters.filter ?? null;
  const STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'FAILED', 'REFUNDED'];
  const byStatus = pick !== null && STATUSES.includes(pick);

  /**
   * ═══ المفتاحان لا يجتمعان في كائنٍ واحد ═══
   *
   * كان `{ ...extra, status: { in: OPEN_STATUSES } }` — و`extra` يحمل
   * `status: pick`، **فالمفتاح الثاني يطمس الأوّل صامتًا**. فكان ترشيح
   * الحالة يسقط ولا يرمي شيئًا: شريحة «معلّقة» تعرض المكتملة، وكلُّ
   * شريحةٍ تعرض كلَّ شيء. ولا شيء يكشفه إلا أن يُقارَن العدّاد بالقائمة.
   *
   * فالحالة المطلوبة تُقاطَع مع نطاق كلِّ استعلام: المفتوحُ لا يُسأل
   * عن `DONE`، والمغلقُ لا يُسأل عن `NEW` — والجواب قائمةٌ فارغة.
   */
  const service = pick !== null && !byStatus ? { service: { key: pick } } : {};
  const wanted = byStatus ? (pick as ServiceRequestStatus) : null;
  const isOpen = (status: ServiceRequestStatus): boolean =>
    (OPEN_STATUSES as readonly string[]).includes(status);

  const openStatus =
    wanted === null
      ? { in: [...OPEN_STATUSES] }
      : isOpen(wanted)
        ? wanted
        : null;
  const closedStatus =
    wanted === null
      ? { notIn: [...OPEN_STATUSES] }
      : isOpen(wanted)
        ? null
        : wanted;
  /**
   * استعلامان لا واحد: **المفتوح لا يُقتطَع.**
   *
   * طلبٌ مفتوح منذ ستّة أشهر هو أحوج ما يكون إلى الظهور، و`take` على
   * جدول واحد كان سيُسقطه لأنه ليس ضمن الأحدث. أمّا المنجَز فتاريخٌ
   * يُقرأ أحدثه.
   */
  /**
   * **والمرشّحُ في الاستعلام هو الذي يعدّه العدّاد.** كان يُطبَّق بعد
   * الجلب بـ`filter` على الصفوف — تعريفٌ ثانٍ بجوار تعريف البطاقة،
   * وهما يتباعدان. والثلاثةُ مفتوحةُ الحال كلُّها، فالمنجَزُ لا يُجلَب
   * أصلًا متى سُئل عن أحدها.
   */
  const extra = scopeWhere(filters, now);
  const openOnly =
    filters.onlyOpen === true || filters.onlyOverdue === true || filters.onlyUnassigned === true;

  const [openRows, closedRows] = await Promise.all([
    openStatus === null
      ? Promise.resolve([])
      : db.serviceRequest.findMany({
          where: { ...service, ...extra, status: openStatus },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
          select: REQUEST_SELECT,
        }),
    closedStatus === null || openOnly
      ? Promise.resolve([])
      : db.serviceRequest.findMany({
          where: { ...service, status: closedStatus },
          orderBy: { createdAt: 'desc' },
          take: CLOSED_HISTORY,
          select: REQUEST_SELECT,
        }),
  ]);

  const mapped: ServiceRequestRow[] = [...openRows, ...closedRows].map((request) => {
    const open = (OPEN_STATUSES as readonly string[]).includes(request.status);
    const overdueHours =
      request.dueAt === null
        ? null
        : Math.floor((now.getTime() - request.dueAt.getTime()) / 3_600_000);

    return {
      ref: request.ref,
      serviceKey: request.service.key,
      serviceName: request.service.nameAr,
      status: request.status,
      amount: request.amount.toString(),
      createdAt: request.createdAt.toISOString(),
      dueAt: request.dueAt?.toISOString() ?? null,
      scheduledAt: request.scheduledAt?.toISOString() ?? null,
      city: request.city,
      overdueHours,
      // المنجَز لا يتأخّر — تأخّرُه انقضى بإنجازه. والحدُّ حدُّ العدّاد.
      overdue:
        open && request.dueAt !== null && request.dueAt.getTime() <= overdueBoundary(now).getTime(),
      providerName: request.provider?.nameAr ?? null,
      customer: request.user.name ?? request.user.phone.slice(-4),
      listingRef: request.listing?.ref ?? null,
      customerId: request.user.id,
      providerId: request.provider?.id ?? null,
    };
  });

  /**
   * **الترتيب يقول ما يقوله اللون** (معيار A6): المتجاوز أوّلًا وأشدّه
   * تجاوزًا أعلاه، ثم المفتوح بحسب قرب مهلته، ثم المنجَز تاريخًا.
   *
   * والترتيب بـ`dueAt` وحده — وهو ما كان — يرفع طلبًا مُنجَزًا مهلته
   * قديمة فوق طلبٍ متجاوزٍ اليوم، فيصير الصفّ الأوّل أهدأ ما في الجدول.
   */
  mapped.sort((a, b) => rank(a) - rank(b) || key(a) - key(b));

  return mapped;
}

function rank(row: ServiceRequestRow): number {
  if (row.overdue) return 0;
  return (OPEN_STATUSES as readonly string[]).includes(row.status) ? 1 : 2;
}

function key(row: ServiceRequestRow): number {
  // المتجاوز: الأشدّ أوّلًا · المفتوح: الأقرب مهلةً أوّلًا · المنجَز: الأحدث أوّلًا
  if (row.overdue) return -(row.overdueHours ?? 0);
  if (rank(row) === 1) return row.dueAt === null ? Number.MAX_SAFE_INTEGER : Date.parse(row.dueAt);
  return -Date.parse(row.createdAt);
}

export type ServiceRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
  /**
   * ═══ الرسم الإداريّ — منفصلٌ عن `price` عمدًا ═══
   *
   * `price` قد يكون صرفًا نيابةً عن العميل (رسم حكوميّ أو أجر مقدّم
   * خدمة). ودمج هامشنا فيه يُسقط وصف «الصرف» عن المبلغ كلّه فتُستحقّ
   * الضريبة على كامله. `src/lib/domain/fees.ts`.
   */
  adminFeeEnabled: boolean;
  adminFee: string;
  /** `FIXED` ريالًا، و`PERCENT` نسبةً من سعر المزوّد — قرار المالك ٢٠٢٦-١٠-١٤ */
  adminFeeMode: 'FIXED' | 'PERCENT';
  category: string;
  active: boolean;
  slaHours: number | null;
  isAutomated: boolean;
  providerName: string | null;
  placements: string[];
  sort: number;
  /** طلبات مفتوحة بالسعر القديم — تُظهر أثر أيّ تغيير. */
  openRequests: number;
  /** كل الطلبات على هذه الخدمة — عمود «الطلبات» في A7. */
  totalRequests: number;
  /** مجموع ما دُفع فعلًا — **محسوب من الطلبات المنجَزة لا مخزَّنًا**. */
  revenue: string;
};

export async function listServicesForAdmin(): Promise<ServiceRow[]> {
  const [rows, open, all, earned] = await Promise.all([
    db.service.findMany({
      orderBy: [{ sort: 'asc' }, { category: 'asc' }],
      select: {
        id: true, key: true, nameAr: true, nameEn: true, descAr: true, descEn: true,
        price: true, adminFeeEnabled: true, adminFee: true, adminFeeMode: true,
        category: true, active: true, slaHours: true, isAutomated: true,
        placements: true, sort: true,
        provider: { select: { nameAr: true } },
      },
    }),
    db.serviceRequest.groupBy({
      by: ['serviceId'],
      where: { status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    }),
    db.serviceRequest.groupBy({ by: ['serviceId'], _count: { _all: true } }),
    /**
     * الإيراد **مجموعٌ من الطلبات المنجَزة** لا عمودًا في `Service` —
     * وهي القاعدة نفسها التي تحكم المحفظة: كل رقم ماليّ يُحسب من قيوده.
     * وعمودٌ مخزَّن كان سيكذب أوّل مرّة يُلغى فيها طلب.
     */
    db.serviceRequest.groupBy({
      by: ['serviceId'],
      where: { status: 'DONE' },
      _sum: { amount: true },
    }),
  ]);

  return rows.map((service) => {
    return {
      key: service.key,
      nameAr: service.nameAr,
      nameEn: service.nameEn,
      descAr: service.descAr,
      descEn: service.descEn,
      price: service.price.toString(),
      adminFeeEnabled: service.adminFeeEnabled,
      adminFee: service.adminFee.toString(),
      adminFeeMode: service.adminFeeMode,
      category: service.category,
      active: service.active,
      slaHours: service.slaHours,
      isAutomated: service.isAutomated,
      providerName: service.provider?.nameAr ?? null,
      placements: service.placements,
      sort: service.sort,
      openRequests: open.find((row) => row.serviceId === service.id)?._count._all ?? 0,
      totalRequests: all.find((row) => row.serviceId === service.id)?._count._all ?? 0,
      revenue: (
        earned.find((row) => row.serviceId === service.id)?._sum.amount ?? new Prisma.Decimal(0)
      ).toString(),
    };
  });
}

export type PriceChangeResult =
  | { ok: true; price: string; untouchedRequests: number }
  | { ok: false; reason: 'NOT_FOUND' | 'PRICE_INVALID' };

/**
 * ═══ معيار A7 ═══ **تغيير السعر لا يمسّ القائم.**
 *
 * الحماية بنيوية لا سلوكية: `ServiceRequest.amount` عمود مستقلّ يُملأ
 * وقت الإنشاء، ولا استعلام يقرأ السعر من `Service` بعدها. فلا حاجة إلى
 * انضباطٍ يتذكّره كاتب الاستعلام التالي.
 *
 * والعدد المُعاد ليس زينة: المحرّر يرى كم طلبًا يبقى بالسعر القديم قبل
 * أن يضغط، فيعرف أثر ما يفعله لا نتيجته وحدها.
 */
export async function changeServicePrice(
  admin: AdminUser,
  key: string,
  price: number,
  ip: string | null,
  now: Date = new Date(),
): Promise<PriceChangeResult> {
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: 'PRICE_INVALID' };

  const before = await db.service.findUnique({ where: { key } });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  const openRequests = await db.serviceRequest.count({
    where: { serviceId: before.id, status: { in: [...OPEN_STATUSES] } },
  });

  // السعر نفسه ليس تغييرًا — ولا يُكتب قيدًا
  if (before.price.equals(price)) {
    return { ok: true, price: before.price.toString(), untouchedRequests: openRequests };
  }

  const after = await db.service.update({
    where: { key },
    data: { price: new Prisma.Decimal(price) },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Service',
      entityId: key,
      action: 'service.price_changed',
      before: { price: before.price.toString() },
      after: { price: after.price.toString(), untouchedRequests: openRequests },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, price: after.price.toString(), untouchedRequests: openRequests };
}

export type ServiceCreate = {
  key: string;
  category: 'PRE_PURCHASE' | 'POST_PURCHASE' | 'SELLER';
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: number;
  slaHours: number | null;
  placements: string[];
  /**
   * **الرسم الإداريّ يُكتب عند الإنشاء لا بعده.** كانت الشاشة تعرض
   * حقله في لوح «خدمة جديدة» ثم يسقط في الطريق: المشغّل يضع ٢٠٠ ريالًا
   * ويقرأ «أُنشئت» ويكون المحفوظ صفرًا — وهو رسمٌ لنا تجب عليه الضريبة،
   * فسقوطه يُسقط ضريبته معه.
   */
  adminFeeEnabled: boolean;
  adminFee: number;
  adminFeeMode: 'FIXED' | 'PERCENT';
};

/**
 * خدمة جديدة — **مخفيّة حتى تُنشر**.
 *
 * الخدمة تُنشأ ناقصةً بطبعها: بلا مزوّد ولا صورة ولا مدن. وإظهارها
 * لحظةَ الإنشاء يضعها في دليل الخدمات أمام العملاء قبل أن يكملها أحد.
 */
export async function createService(
  admin: AdminUser,
  input: ServiceCreate,
  ip: string | null,
  now = new Date(),
): Promise<{
  ok: true;
  key: string;
} | { ok: false; reason: 'KEY_TAKEN' | 'PRICE_INVALID' | 'FEE_PCT_RANGE' }> {
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, reason: 'PRICE_INVALID' };
  /**
   * **ونسبةٌ فوق المئة ليست رسمًا بل مصادرة.** الحدّ في الخادم لا في
   * الشاشة — حارسٌ في العميل ليس حارسًا.
   */
  if (input.adminFeeMode === 'PERCENT' && input.adminFee > 100) {
    return { ok: false, reason: 'FEE_PCT_RANGE' };
  }
  if ((await db.service.count({ where: { key: input.key } })) > 0) {
    return { ok: false, reason: 'KEY_TAKEN' };
  }

  const last = await db.service.findFirst({ orderBy: { sort: 'desc' }, select: { sort: true } });

  const service = await db.service.create({
    data: {
      key: input.key,
      category: input.category,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      descAr: input.descAr,
      descEn: input.descEn,
      price: new Prisma.Decimal(input.price),
      slaHours: input.slaHours,
      placements: input.placements,
      adminFeeEnabled: input.adminFeeEnabled,
      adminFee: new Prisma.Decimal(input.adminFee),
      adminFeeMode: input.adminFeeMode,
      sort: (last?.sort ?? 0) + 1,
      active: false,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Service',
      entityId: service.key,
      action: 'service.created',
      before: {},
      after: { key: service.key, price: service.price.toString(), active: false },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, key: service.key };
}

export type ServiceEdit = {
  nameAr?: string;
  nameEn?: string;
  descAr?: string;
  descEn?: string;
  slaHours?: number | null;
  placements?: string[];
  /**
   * **وما تشمله الخدمة يُحرَّر** — كان يُزرع ويُقرأ ولا يُكتب، فبندٌ
   * يُضاف إلى ما يراه المشتري قبل الدفع كان يحتاج نشرًا.
   */
  includesAr?: string[];
  includesEn?: string[];
  /** صنفُ من يؤدّيها — وبه يُجمع طابورُ مدينة المركبة. */
  providerType?: ProviderType | null;
  /** المزوّدُ المفضَّل — واحدٌ لا طابور، و`null` يتركها للصنف. */
  providerId?: string | null;
  /** `FIXED` ريالًا و`PERCENT` نسبةً — وكان يُختار عند الإنشاء وحده. */
  adminFeeMode?: ServiceFeeMode;
  /** مجموعةُ العرض — وكانت تُختار عند الإنشاء وحده كذلك. */
  category?: ServiceCategory;
};

/**
 * تحرير ما ليس سعرًا — والسعر معزول في دالته وحده عمدًا.
 *
 * تغييرُ الاسم لا أثر ماليّ له، وتغيير السعر له. وجمعهما في دالة واحدة
 * يجعل «صحّحتُ خطأً إملائيًّا» و«رفعتُ السعر مئة ريال» سطرًا واحدًا في
 * سجلّ التدقيق.
 */
export async function editService(
  admin: AdminUser,
  key: string,
  edit: ServiceEdit,
  ip: string | null,
  now = new Date(),
): Promise<{ ok: boolean }> {
  const before = await db.service.findUnique({ where: { key } });
  if (before === null) return { ok: false };

  /**
   * **لا قيد لِما لم يتغيّر.** حفظُ اللوح يرسل كل الحقول ولو لم يُمَسّ
   * منها شيء، وقيدٌ قبله كبعده يملأ سجلّ التدقيق بسطور لا تقول شيئًا —
   * فيصير السجلّ الذي يُقرأ عند التحقيق أطولَ ممّا يُقرأ.
   */
  const changed = Object.entries(edit).some(([field, value]) => {
    const old = (before as unknown as Record<string, unknown>)[field];
    return Array.isArray(value) || Array.isArray(old)
      ? JSON.stringify(value) !== JSON.stringify(old)
      : value !== old;
  });
  if (!changed) return { ok: true };

  const after = await db.service.update({ where: { key }, data: edit });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Service',
      entityId: key,
      action: 'service.edited',
      /**
       * **والقيدُ يُشتقّ من الحقول المُرسَلة** لا من قائمةٍ مكتوبةٍ بيد:
       * حقلٌ يُضاف إلى `ServiceEdit` ولا يُضاف هنا يُعدَّل بلا أثرٍ في
       * سجلّ التدقيق — وهو السجلّ الذي يُقرأ عند التحقيق.
       */
      before: Object.fromEntries(
        Object.keys(edit).map((field) => [
          field,
          (before as unknown as Record<string, unknown>)[field] ?? null,
        ]),
      ),
      after: Object.fromEntries(
        Object.keys(edit).map((field) => [
          field,
          (after as unknown as Record<string, unknown>)[field] ?? null,
        ]),
      ),
      ip,
      createdAt: now,
    },
  });
  return { ok: true };
}

/**
 * إعادة الترتيب — **بتبادل موضعين لا بإعادة ترقيم الكل**.
 *
 * الترتيب يحكم ظهور الخدمات في دليل الخدمات، وإعادة ترقيم الجدول كلّه
 * عند كل نقلة تكتب صفوفًا لم تتحرّك وتملأ سجلّ التدقيق بضجيج.
 */
export async function moveService(
  admin: AdminUser,
  key: string,
  direction: 'up' | 'down',
  ip: string | null,
  now = new Date(),
): Promise<{ ok: boolean }> {
  const service = await db.service.findUnique({ where: { key } });
  if (service === null) return { ok: false };

  const neighbour = await db.service.findFirst({
    where:
      direction === 'up'
        ? { OR: [{ sort: { lt: service.sort } }, { sort: service.sort, key: { lt: key } }] }
        : { OR: [{ sort: { gt: service.sort } }, { sort: service.sort, key: { gt: key } }] },
    orderBy: direction === 'up' ? [{ sort: 'desc' }, { key: 'desc' }] : [{ sort: 'asc' }, { key: 'asc' }],
  });
  // الطرف لا يتحرّك — وهذا ليس خطأً يستحقّ رسالة
  if (neighbour === null) return { ok: true };

  await db.$transaction([
    db.service.update({ where: { key }, data: { sort: neighbour.sort } }),
    db.service.update({ where: { key: neighbour.key }, data: { sort: service.sort } }),
    db.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: 'admin',
        entity: 'Service',
        entityId: key,
        action: 'service.reordered',
        before: { sort: service.sort },
        after: { sort: neighbour.sort, swappedWith: neighbour.key },
        ip,
        createdAt: now,
      },
    }),
  ]);
  return { ok: true };
}

/** إخفاء خدمة يمنع طلبات جديدة ولا يمسّ القائم — كسائر الإخفاء في اللوحة. */
export async function setServiceActive(
  admin: AdminUser,
  key: string,
  active: boolean,
  ip: string | null,
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const before = await db.service.findUnique({ where: { key } });
  if (before === null) return { ok: false };

  await db.service.update({ where: { key }, data: { active } });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Service',
      entityId: key,
      action: active ? 'service.activated' : 'service.deactivated',
      before: { active: before.active },
      after: { active },
      ip,
      createdAt: now,
    },
  });
  return { ok: true };
}


export type AdminFeeResult =
  | { ok: true; enabled: boolean; adminFee: string; untouchedRequests: number }
  | { ok: false; reason: 'NOT_FOUND' | 'FEE_INVALID' };

/**
 * ═══ الرسم الإداريّ للخدمة ═══
 *
 * قابل للتفعيل والتعطيل بحقلين لا بقيمةٍ صفرية: «معطَّل» و«صفر» ليسا
 * سواءً — الأوّل قرارٌ يُستأنف، والثاني رقمٌ سارٍ. وتعطيلُه يُبقي قيمته
 * فيعود المشغّل إليها بلا إعادة إدخال.
 *
 * **ولا يمسّ القائم** — كـ`changeServicePrice` تمامًا: `ServiceRequest.adminFee`
 * لقطةٌ وقت الإنشاء، والعدد المُعاد يُري المحرّر ما بقي على حاله.
 */
export async function changeServiceAdminFee(
  admin: AdminUser,
  key: string,
  input: { enabled: boolean; adminFee: number },
  ip: string | null,
  now: Date = new Date(),
): Promise<AdminFeeResult> {
  if (!Number.isFinite(input.adminFee) || input.adminFee < 0) {
    return { ok: false, reason: 'FEE_INVALID' };
  }

  const before = await db.service.findUnique({ where: { key } });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  const openRequests = await db.serviceRequest.count({
    where: { serviceId: before.id, status: { in: [...OPEN_STATUSES] } },
  });

  const unchanged =
    before.adminFeeEnabled === input.enabled && before.adminFee.equals(input.adminFee);
  if (unchanged) {
    return {
      ok: true,
      enabled: before.adminFeeEnabled,
      adminFee: before.adminFee.toString(),
      untouchedRequests: openRequests,
    };
  }

  const after = await db.service.update({
    where: { key },
    data: { adminFeeEnabled: input.enabled, adminFee: new Prisma.Decimal(input.adminFee) },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Service',
      entityId: key,
      action: 'service.admin_fee_changed',
      before: { enabled: before.adminFeeEnabled, adminFee: before.adminFee.toString() },
      after: {
        enabled: after.adminFeeEnabled,
        adminFee: after.adminFee.toString(),
        untouchedRequests: openRequests,
      },
      ip,
      createdAt: now,
    },
  });

  return {
    ok: true,
    enabled: after.adminFeeEnabled,
    adminFee: after.adminFee.toString(),
    untouchedRequests: openRequests,
  };
}

export type ServiceDetail = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  price: string;
  adminFeeEnabled: boolean;
  adminFee: string;
  adminFeeMode: 'FIXED' | 'PERCENT';
  category: string;
  active: boolean;
  slaHours: number | null;
  isAutomated: boolean;
  placements: string[];
  sort: number;
  /**
   * ما تشمله الخدمة — **بنودٌ تُعرض للمشتري قبل زرّ الدفع**، ولم يكن
   * في المنتج كلِّه ما يكتبها: تزرعها البذرة ويقرؤها الموقع، فمن أراد
   * تعديل بندٍ واحد احتاج نشرًا.
   */
  includesAr: string[];
  includesEn: string[];
  /**
   * صنفُ من يؤدّيها — وبه يُجمع طابورُ المدينة (قرار المالك: الفحص
   * يذهب لفاحصي مدينة المركبة). و`providerId` مزوّدٌ مفضَّل واحد لا
   * طابور، فغيابُ الصنف يترك الإسناد بلا قاعدة.
   */
  providerType: string | null;
  provider: { id: string; nameAr: string } | null;
  /** عدّاداتٌ محسوبة — لا أعمدةٌ مخزَّنة تكذب أوّل إلغاء. */
  totalRequests: number;
  openRequests: number;
  doneRequests: number;
  revenue: string;
  /** آخر الطلبات على هذه الخدمة. */
  recent: {
    id: string;
    ref: string;
    status: ServiceRequestStatus;
    amount: string;
    createdAt: string;
    providerName: string | null;
  }[];
};

/** سقفُ ما يُعرض من الطلبات — والعدّادُ يقول العددَ كلَّه. */
export const SERVICE_RECENT = 10;

/**
 * ═══ خدمةٌ واحدة — وثلاثةُ حقولٍ لا يبلغها أحد ═══
 *
 * الجدولُ يعرض السعرَ والرسمَ والظهور، **ولا موضعَ فيه لِما تشمله
 * الخدمة**: مصفوفةٌ يقرؤها المشتري قبل أن يدفع، تزرعها البذرة ولا
 * تعدّلها شاشة. ومثلُها `providerType` — القاعدةُ التي يُبنى عليها
 * طابورُ المدينة.
 */
export async function serviceDetail(key: string): Promise<ServiceDetail | null> {
  const service = await db.service.findUnique({
    where: { key },
    include: { provider: { select: { id: true, nameAr: true } } },
  });
  if (service === null) return null;

  const [counts, earned, recent] = await Promise.all([
    db.serviceRequest.groupBy({
      by: ['status'],
      where: { serviceId: service.id },
      _count: { _all: true },
    }),
    db.serviceRequest.aggregate({
      where: { serviceId: service.id, status: 'DONE' },
      _sum: { amount: true },
    }),
    db.serviceRequest.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: 'desc' },
      take: SERVICE_RECENT,
      select: {
        id: true, ref: true, status: true, amount: true, createdAt: true,
        provider: { select: { nameAr: true } },
      },
    }),
  ]);

  const countOf = (predicate: (status: ServiceRequestStatus) => boolean): number =>
    counts.reduce((sum, row) => (predicate(row.status) ? sum + (row._count._all ?? 0) : sum), 0);

  return {
    id: service.id,
    key: service.key,
    nameAr: service.nameAr,
    nameEn: service.nameEn,
    descAr: service.descAr,
    descEn: service.descEn,
    price: service.price.toString(),
    adminFeeEnabled: service.adminFeeEnabled,
    adminFee: service.adminFee.toString(),
    adminFeeMode: service.adminFeeMode,
    category: service.category,
    active: service.active,
    slaHours: service.slaHours,
    isAutomated: service.isAutomated,
    placements: service.placements,
    sort: service.sort,
    includesAr: service.includesAr,
    includesEn: service.includesEn,
    providerType: service.providerType,
    provider: service.provider,
    totalRequests: countOf(() => true),
    openRequests: countOf((status) => (OPEN_STATUSES as readonly string[]).includes(status)),
    doneRequests: countOf((status) => status === 'DONE'),
    revenue: (earned._sum.amount ?? new Prisma.Decimal(0)).toString(),
    recent: recent.map((row) => ({
      id: row.id,
      ref: row.ref,
      status: row.status,
      amount: row.amount.toString(),
      createdAt: row.createdAt.toISOString(),
      providerName: row.provider?.nameAr ?? null,
    })),
  };
}

/**
 * ═══ أثرُ طابور الخدمات — بطاقاتُ A6 الثلاث ═══
 *
 * الترميز يضع فوق الجدول: إيرادُ الخدمات · متوسطُ زمن التنفيذ ·
 * التزامُ المزوّدين · تقييمُ الخدمة · تجاوزت المهلة. والمبنيُّ كان
 * الأخيرةَ وحدها ومعها عدّادات.
 *
 * **والتقييمُ لا مصدر له** — لا حقلَ في `ServiceProvider` ولا شيء
 * يسأل عميلًا عن رأيه (سؤالٌ معلَّق). فيُعرض ما يُقاس.
 */
export type ServiceOpsStats = {
  /**
   * إيرادُ الخدمات في المدى — **بالقاعدة التي تقرأها لوحةُ المالية**.
   *
   * المنصّةُ هي المورِّد، فكاملُ القيمة إيرادُها وسعرُ المزوّد تكلفةُ
   * بيع. ورقمان لمالٍ واحد في شاشتين هو ما تمنعه قاعدةٌ واحدة.
   */
  revenue: string;
  /**
   * وسيطُ زمن التنفيذ بالساعات — **وسيطٌ لا متوسّط**.
   *
   * طلبٌ واحد تعثّر أسبوعًا يجرّ متوسّطَ عشرين طلبًا أُنجزت في ساعات،
   * فيقول الرقمُ عن المزوّدين ما لا يلقاه أحد. والوسيطُ يصف ما يلقاه
   * أكثرُ من يطلب.
   *
   * و`null` حين لا منجَزَ له لحظةُ إنجاز: العمودُ جديد، والصفوفُ
   * السابقة لا تُفبرَك لها لحظة.
   */
  turnaroundHours: number | null;
  /** عددُ ما دخل الوسيط — فالصفرُ يُصدَّق بعد إثبات أنّ هناك ما يُقاس. */
  turnaroundSample: number;
  /**
   * التزامُ المزوّدين: ما أُنجز في مهلته من كلّ ما له مهلةٌ وأُنجز.
   *
   * **ومقامُه المنجَزُ ذو المهلة** لا كلُّ الطلبات: طلبٌ ما زال
   * مفتوحًا لم يُخلف وعدًا بعد، وعدُّه في المقام يخفض الالتزام كلّما
   * امتلأ الطابور.
   */
  slaPct: number | null;
  slaSample: number;
};

/**
 * ═══ إيرادُ الخدمات — قاعدةٌ واحدة يقرؤها الموضعان ═══
 *
 * لوحةُ المالية (A3) تجمع `amount` للمنجَز: **المنصّةُ هي المورِّد**
 * (`supplierIsPlatform: true` في القاعدة الضريبية)، فكاملُ القيمة
 * إيرادُها وسعرُ المزوّد تكلفةُ بيع.
 *
 * وكتبتُ هنا أوّلًا جمعَ `adminFee` — **قاعدةً ثانية**: فتقول A6 صفرًا
 * (ولا رسمَ مفعَّل على خدمةٍ واحدة) وتقول A3 رقمًا حقيقيًّا، **ورقمان
 * لمالٍ واحد في شاشتين**. فالقاعدة تُكتب مرّة ويقرؤها الاثنان — كما
 * فعلت `adRevenue` حين احتاجتها A30 والمالية معًا.
 */
export async function serviceRevenueByService(
  from: Date,
  to: Date,
): Promise<{ serviceId: string; amount: string }[]> {
  const rows = await db.serviceRequest.groupBy({
    by: ['serviceId'],
    where: { createdAt: { gte: from, lt: to }, status: 'DONE' },
    _sum: { amount: true },
  });
  return rows.map((row) => ({
    serviceId: row.serviceId,
    amount: (row._sum.amount ?? 0).toString(),
  }));
}

export async function serviceOpsStats(
  from: Date,
  to: Date,
): Promise<ServiceOpsStats> {
  const [revenue, done] = await Promise.all([
    serviceRevenueByService(from, to),
    db.serviceRequest.findMany({
      where: { status: 'DONE', completedAt: { not: null } },
      select: { createdAt: true, completedAt: true, dueAt: true },
    }),
  ]);

  const hours = done
    .map((row) => ((row.completedAt?.getTime() ?? 0) - row.createdAt.getTime()) / 3_600_000)
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);

  /** الوسطى — والأدنى من الوسطَيْن عند الزوجيّ، كما في وسيط السعر. */
  const middle = hours.length === 0 ? null : hours[Math.floor((hours.length - 1) / 2)] ?? null;

  const withDue = done.filter((row) => row.dueAt !== null);
  const onTime = withDue.filter(
    (row) => (row.completedAt?.getTime() ?? 0) <= (row.dueAt?.getTime() ?? 0),
  ).length;

  return {
    revenue: revenue
      .reduce((total, row) => total + Number(row.amount), 0)
      .toString(),
    turnaroundHours: middle === null ? null : Math.round(middle * 10) / 10,
    turnaroundSample: hours.length,
    slaPct: withDue.length === 0 ? null : Math.round((onTime / withDue.length) * 100),
    slaSample: withDue.length,
  };
}

/**
 * ═══ إسنادُ طلبٍ إلى مزوّد — من اللوحة ═══
 *
 * ترميزُ A6 عنوانُه «تنفيذ وإسناد لمزوّد»، وفي جدوله «أسنِد» لكلّ صفّ
 * و«إسناد جماعي» في ترويسته. **ولم يكن في اللوحة إسنادٌ إطلاقًا**:
 * الطابورُ بطاقاتٌ للقراءة، والمزوّدُ وحده يلتقط الطلب من طابوره هو.
 *
 * فطلبٌ لا يلتقطه أحد يبقى «بلا مزوّد» حتى تنقضي مهلتُه، والمشغّلُ
 * يراه ولا يملك شيئًا. وهو شكلُ «طابورٌ بلا باب» المسجَّل.
 *
 * ═══ والأهليّةُ قاعدةُ طابور المزوّد نفسُها ═══
 *
 * نوعُ المزوّد يطابق نوعَ الخدمة، ومدينتُه تغطّي مدينةَ الطلب (أو لا
 * مدنَ له فيغطّي الكلّ). ونسخةٌ ثانية منها تجعل اللوحة تُسنِد ما لا
 * يراه المزوّد في طابوره.
 */
export type AssignFailure =
  | 'NOT_FOUND'
  | 'NOT_ASSIGNABLE'
  | 'ALREADY_ASSIGNED'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_INACTIVE'
  | 'WRONG_TYPE'
  | 'CITY_NOT_COVERED';

export type AssignResult =
  | { ok: true; ref: string }
  | { ok: false; ref: string; reason: AssignFailure };

export async function assignServiceRequest(
  admin: AdminUser,
  ref: string,
  providerId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<AssignResult> {
  const request = await db.serviceRequest.findUnique({
    where: { ref },
    select: {
      id: true, ref: true, status: true, providerId: true, city: true, userId: true,
      service: { select: { providerType: true, nameAr: true } },
    },
  });
  if (request === null) return { ok: false, ref, reason: 'NOT_FOUND' };

  /** **والمُسنَدُ لا يُسنَد ثانيةً من هنا** — نقلُ طلبٍ قائم قرارٌ آخر. */
  if (request.providerId !== null) return { ok: false, ref, reason: 'ALREADY_ASSIGNED' };
  if (request.status !== 'NEW') return { ok: false, ref, reason: 'NOT_ASSIGNABLE' };

  const provider = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, cities: true, active: true, nameAr: true },
  });
  if (provider === null) return { ok: false, ref, reason: 'PROVIDER_NOT_FOUND' };
  if (!provider.active) return { ok: false, ref, reason: 'PROVIDER_INACTIVE' };
  if (provider.type !== request.service.providerType) {
    return { ok: false, ref, reason: 'WRONG_TYPE' };
  }
  if (
    provider.cities.length > 0
    && request.city !== null
    && !provider.cities.includes(request.city)
  ) {
    return { ok: false, ref, reason: 'CITY_NOT_COVERED' };
  }

  /**
   * **والإسنادُ يقع مرّةً** — `providerId: null` في الشرط، فإسنادان
   * متزامنان يُنتجان فائزًا واحدًا والثاني يقرأ صفرَ صفوف.
   */
  const { count } = await db.serviceRequest.updateMany({
    where: { id: request.id, providerId: null, status: 'NEW' },
    data: { providerId, status: 'ASSIGNED' },
  });
  if (count === 0) return { ok: false, ref, reason: 'ALREADY_ASSIGNED' };

  await db.auditLog.create({
    data: {
      actorId: admin.id, actorType: 'admin', entity: 'ServiceRequest', entityId: request.ref,
      action: 'service_request.assign',
      after: { providerId, providerName: provider.nameAr },
      ip, createdAt: now,
    },
  });

  /** **ومن طلب الخدمة يُخبَر** — إسنادٌ صامت يُبقيه ينتظر بلا خبر. */
  const { notifyServiceStep } = await import('./service-lifecycle');
  await notifyServiceStep(request.ref, request.userId, 'ASSIGNED', request.service.nameAr);

  return { ok: true, ref: request.ref };
}

/**
 * ═══ الإسنادُ الجماعي — استدعاءٌ مفرد لكلّ طلب ═══
 *
 * **ولا `updateMany` واحدة على القائمة.** القاعدة المكتوبة في هذا
 * المستودع: دالّةٌ تمرّ على مجموعةٍ تلمس عملًا لا تكتب جملةً — والكتابةُ
 * استدعاءٌ مفرد صريح لكلّ عنصر. فجملةٌ واحدة تُسنِد مئةَ طلبٍ بخطأ سطر،
 * **وتتخطّى الأهليّة**: مدينةٌ لا يغطّيها المزوّد ونوعٌ لا يؤدّيه.
 *
 * وفشلُ واحدٍ لا يوقف الباقين، والتقرير يقول **أيُّها لم يُسنَد ولماذا**
 * — لا «أُسنِد ٧ من ١٠» بلا اسم.
 */
export async function bulkAssignServiceRequests(
  admin: AdminUser,
  refs: readonly string[],
  providerId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<{ assigned: string[]; failed: { ref: string; reason: AssignFailure }[] }> {
  const assigned: string[] = [];
  const failed: { ref: string; reason: AssignFailure }[] = [];

  for (const ref of refs) {
    const result = await assignServiceRequest(admin, ref, providerId, ip, now);
    if (result.ok) assigned.push(result.ref);
    else failed.push({ ref: result.ref, reason: result.reason });
  }

  return { assigned, failed };
}

/**
 * ═══ الإسنادُ الآليّ — أفضلُ مرشّحٍ لكلّ طلب على حدة ═══
 *
 * **ولكلِّ طلبٍ مرشّحُه**: مدينتُه غيرُ مدينة جاره، فمزوّدٌ واحد
 * للدفعة كلِّها يردّ نصفَها بـ«لا يغطّي المدينة». فيُسأل المحرّكُ لكلّ
 * صفّ، ويُسنَد إلى أوّل الترتيب.
 *
 * **ويمرّ بالمفرد لا بـ`updateMany`** (قاعدةٌ مسجَّلة): فالتحقّقُ
 * واحد، و`AuditLog` يُكتب لكلّ طلب، وفشلُ واحدٍ لا يوقف الباقين.
 *
 * **وما لا مرشّحَ له يُقال بسببه** — فمشغّلٌ يقرأ «تعذّر» لا يعرف
 * أيُفعّل مزوّدًا أم يوسّع تغطيةً أم ينتظر انقضاء إيقاف.
 */
export async function autoAssignServiceRequests(
  admin: AdminUser,
  refs: readonly string[],
  ip: string | null,
  now: Date = new Date(),
): Promise<{ assigned: string[]; failed: { ref: string; reason: AssignFailure }[] }> {
  const assigned: string[] = [];
  const failed: { ref: string; reason: AssignFailure }[] = [];

  for (const ref of refs) {
    const list = await candidatesFor(ref, now);
    if (list === null) {
      failed.push({ ref, reason: 'NOT_FOUND' });
      continue;
    }

    const best = list.candidates.find((candidate) => candidate.eligible);
    if (best === undefined) {
      /** **والسببُ أدقُّ من «لا أحد»**: أهو لا مزوّدَ أصلًا أم كلُّهم موقوفون؟ */
      const blocked = list.candidates[0]?.blockedBy ?? null;
      failed.push({
        ref,
        reason:
          blocked === 'SLA_SUSPENDED'
            ? 'PROVIDER_INACTIVE'
            : blocked === 'CITY_NOT_COVERED'
              ? 'CITY_NOT_COVERED'
              : 'PROVIDER_NOT_FOUND',
      });
      continue;
    }

    const result = await assignServiceRequest(admin, ref, best.providerId, ip, now);
    if (result.ok) assigned.push(result.ref);
    else failed.push({ ref: result.ref, reason: result.reason });
  }

  return { assigned, failed };
}
