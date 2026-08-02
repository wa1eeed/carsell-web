import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';

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
  /** ساعات التأخّر عن المهلة — سالبٌ يعني أنها لم تحن بعد. */
  overdueHours: number | null;
  /** **بارز** (معيار A6): المهلة فاتت والطلب لم يُنجَز. */
  overdue: boolean;
  providerName: string | null;
  customer: string;
  listingRef: string | null;
};

const OPEN_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS'] as const;

const REQUEST_SELECT = {
  ref: true, status: true, amount: true, createdAt: true, dueAt: true,
  service: { select: { key: true, nameAr: true } },
  provider: { select: { nameAr: true } },
  user: { select: { name: true, phone: true } },
  listing: { select: { ref: true } },
} as const;

/** سقف المنجَز وحده — والمفتوح لا سقف له. */
const CLOSED_HISTORY = 200;

export async function listServiceRequests(
  filters: { onlyOverdue?: boolean } = {},
  now: Date = new Date(),
): Promise<ServiceRequestRow[]> {
  /**
   * استعلامان لا واحد: **المفتوح لا يُقتطَع.**
   *
   * طلبٌ مفتوح منذ ستّة أشهر هو أحوج ما يكون إلى الظهور، و`take` على
   * جدول واحد كان سيُسقطه لأنه ليس ضمن الأحدث. أمّا المنجَز فتاريخٌ
   * يُقرأ أحدثه.
   */
  const [openRows, closedRows] = await Promise.all([
    db.serviceRequest.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      select: REQUEST_SELECT,
    }),
    db.serviceRequest.findMany({
      where: { status: { notIn: [...OPEN_STATUSES] } },
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
      overdueHours,
      // المنجَز لا يتأخّر — تأخّرُه انقضى بإنجازه
      overdue: open && overdueHours !== null && overdueHours > 0,
      providerName: request.provider?.nameAr ?? null,
      customer: request.user.name ?? request.user.phone.slice(-4),
      listingRef: request.listing?.ref ?? null,
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

  return filters.onlyOverdue === true ? mapped.filter((row) => row.overdue) : mapped;
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
        price: true, category: true, active: true, slaHours: true, isAutomated: true,
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
): Promise<{ ok: true; key: string } | { ok: false; reason: 'KEY_TAKEN' | 'PRICE_INVALID' }> {
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, reason: 'PRICE_INVALID' };
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
      before: {
        nameAr: before.nameAr, nameEn: before.nameEn,
        descAr: before.descAr, descEn: before.descEn,
        slaHours: before.slaHours, placements: before.placements,
      },
      after: {
        nameAr: after.nameAr, nameEn: after.nameEn,
        descAr: after.descAr, descEn: after.descEn,
        slaHours: after.slaHours, placements: after.placements,
      },
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
