import type { ProviderType } from '@/generated/prisma/enums';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { normalizeSaudiPhone } from './phone';
import { SLA_BREACHES_BEFORE_SUSPENSION } from './provider-rules';

/**
 * ═══ A28 — مزوّدو الخدمات والتمويل ═══
 *
 * `ServiceProvider` مزروعٌ بكل ما تحتاجه الشاشة — النوع والعمولة
 * والالتزام والمدن — **ولا شاشة تقرؤه**. فمزوّدٌ يتأخّر لا يُرى تأخّره،
 * ومزوّدٌ يُراد إيقافه لا باب لإيقافه.
 *
 * ═══ وتجاوز الالتزام يُقاس لا يُلاحَظ ═══
 *
 * `ServiceRequest.dueAt` مكتوبٌ في كل طلب، ولا شيء يقارنه بالزمن. فيمرّ
 * التأخّر بلا أثر: العميل ينتظر، والمزوّد لا يُنبَّه، والإسناد الآليّ
 * يواصل إعطاءه طلبات.
 *
 * ═══ والتعطيل يمنع الإسناد الجديد ولا يمسّ الجاري ═══
 *
 * التصميم يكتبها حرفيًّا. وإسقاطُ طلبٍ جارٍ عن مزوّدٍ عُطّل يترك عميلًا
 * دفع بلا من ينفّذ — والعقوبة على المزوّد لا على العميل.
 */

export type ProviderRow = {
  id: string;
  nameAr: string;
  /** يُقرأ في استمارة التعديل — ولا تُفتح استمارةٌ بحقلٍ لا تعرف قيمته. */
  nameEn: string;
  contactPhone: string | null;
  contactEmail: string | null;
  type: ProviderType;
  commissionPct: string | null;
  slaHours: number | null;
  cities: string[];
  active: boolean;
  /** طلباتٌ لم تُغلق بعد — وهي «الحِمل القائم» في قاعدة الإسناد */
  openRequests: number;
  /** طلباتٌ تجاوزت `dueAt` ولم تُغلق */
  breached: number;
  servicesLinked: number;
};

export type ProviderStats = {
  active: number;
  cities: number;
  assignedThisMonth: number;
  breached: number;
  servicesLinked: number;
  breachesBeforeSuspension: number;
};

/** حالاتٌ يُعدّ الطلب فيها مفتوحًا — وما بعدها لا يُنتظر فيه المزوّد. */
const OPEN_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS'] as const;

export async function providerList(now: Date = new Date()): Promise<ProviderRow[]> {
  const providers = await db.serviceProvider.findMany({
    orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
    include: { _count: { select: { services: true } } },
  });

  if (providers.length === 0) return [];

  const [open, breached] = await Promise.all([
    db.serviceRequest.groupBy({
      by: ['providerId'],
      where: { providerId: { not: null }, status: { in: [...OPEN_STATUSES] } },
      _count: true,
    }),
    /**
     * **التجاوز من `dueAt` والزمن معًا** — لا من راية.
     *
     * والحالة المخزَّنة وحدها لا تكفي متى كان لها وقت: طلبٌ حالتُه
     * `IN_PROGRESS` ومهلتُه انقضت أمس متأخّرٌ ولو لم يمرّ عليه شيء.
     */
    db.serviceRequest.groupBy({
      by: ['providerId'],
      where: {
        providerId: { not: null },
        status: { in: [...OPEN_STATUSES] },
        dueAt: { lt: now },
      },
      _count: true,
    }),
  ]);

  return providers.map((provider) => ({
    id: provider.id,
    nameAr: provider.nameAr,
    nameEn: provider.nameEn,
    contactPhone: provider.contactPhone,
    contactEmail: provider.contactEmail,
    type: provider.type,
    commissionPct: provider.commissionPct?.toFixed(2) ?? null,
    slaHours: provider.slaHours,
    cities: provider.cities,
    active: provider.active,
    openRequests: open.find((row) => row.providerId === provider.id)?._count ?? 0,
    breached: breached.find((row) => row.providerId === provider.id)?._count ?? 0,
    servicesLinked: provider._count.services,
  }));
}

export async function providerStats(now: Date = new Date()): Promise<ProviderStats> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [providers, assigned, breached, services] = await Promise.all([
    db.serviceProvider.findMany({ select: { active: true, cities: true } }),
    db.serviceRequest.count({
      where: { providerId: { not: null }, createdAt: { gte: monthStart } },
    }),
    db.serviceRequest.count({
      where: {
        providerId: { not: null },
        status: { in: [...OPEN_STATUSES] },
        dueAt: { lt: now },
      },
    }),
    db.service.count({ where: { providerId: { not: null } } }),
  ]);

  const active = providers.filter((provider) => provider.active);

  return {
    active: active.length,
    // المدن التي يغطيها المفعّلون — والمعطّل لا يغطّي شيئًا
    cities: new Set(active.flatMap((provider) => provider.cities)).size,
    assignedThisMonth: assigned,
    breached,
    servicesLinked: services,
    breachesBeforeSuspension: SLA_BREACHES_BEFORE_SUSPENSION,
  };
}

export type ProviderToggleResult =
  | { ok: true; active: boolean; openRequests: number }
  | { ok: false; reason: 'PROVIDER_NOT_FOUND' };

/**
 * تفعيل مزوّد أو تعطيله.
 *
 * **والتعطيل يمنع الإسناد الجديد ولا يمسّ الجاري.** وعدد الطلبات
 * القائمة يُعاد كي تقوله الشاشة لمن عطّل: مزوّدٌ عليه سبعة طلبات
 * جارية سيُكملها، ولن يستلم ثامنًا.
 */
export async function toggleProvider(
  input: { providerId: string; active: boolean; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ProviderToggleResult> {
  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { id: true, nameAr: true, active: true },
  });
  if (provider === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  await db.serviceProvider.update({
    where: { id: provider.id },
    data: { active: input.active },
  });

  const openRequests = await db.serviceRequest.count({
    where: { providerId: provider.id, status: { in: [...OPEN_STATUSES] } },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: provider.id,
      action: input.active ? 'provider.enabled' : 'provider.disabled',
      before: { active: provider.active },
      after: { active: input.active, nameAr: provider.nameAr, openRequests },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, active: input.active, openRequests };
}

/**
 * ═══ المزوّد يُنشأ ويُعدَّل — لا يُزرَع وحده ═══
 *
 * `ServiceProvider` كان **لا يكتبه إلا الزرع**: الشاشة تعرض وتُعطّل
 * وتُفعّل، ولا باب لإضافة شركة فحصٍ جديدة ولا لتصحيح رقم هاتفٍ تغيّر.
 * وطابورُ الخدمات يُسنِد إلى مزوّد — فنموُّ الخدمات كان موقوفًا على
 * كتابةٍ يدويّة في القاعدة.
 *
 * **والتحقّق يعيد مفاتيح لا جُملًا** (البوابة ١٧): الصياغة في الشاشة.
 */
export type ProviderDraft = {
  nameAr: string;
  nameEn: string;
  type: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  /** نسبةٌ مئوية نصًّا — `Decimal` في القاعدة، ولا `Float` للمال. */
  commissionPct?: string | null;
  /**
   * **والساعاتُ تصل نصًّا كذلك.** الحقل نصٌّ في الاستمارة، وتحويلُه عند
   * الحافّة يجعل «ساعتان» تصير `NaN` فيردّ المسار خطأً عامًّا — والمدى
   * يُفحص هنا مع إخوته فيعود الجواب كاملًا مرّة.
   */
  slaHours?: string | null;
  cities?: readonly string[];
};

/** الفراغُ غيابٌ لا قيمة — وقرارُه هنا لا في كل مسارٍ يستدعي. */
function clean(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
}

export type ProviderSaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; reason: 'PROVIDER_NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

const PROVIDER_TYPES: readonly string[] = [
  'INSPECTION', 'SHIPPING', 'INSURANCE', 'DETAILING', 'PHOTOGRAPHY', 'FINANCE', 'OTHER',
];

/** سنةٌ بالساعات — التزامٌ أطول منها خطأُ إدخالٍ لا سياسة. */
const MAX_SLA_HOURS = 8_760;

function validate(draft: ProviderDraft): Record<string, string> {
  const fields: Record<string, string> = {};

  if (clean(draft.nameAr) === null) fields.nameAr = 'REQUIRED';
  if (clean(draft.nameEn) === null) fields.nameEn = 'REQUIRED';
  if (!PROVIDER_TYPES.includes(draft.type)) fields.type = 'INVALID';

  const pctText = clean(draft.commissionPct);
  if (pctText !== null) {
    const pct = Number(pctText);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) fields.commissionPct = 'RANGE';
  }

  const slaText = clean(draft.slaHours);
  if (slaText !== null) {
    const hours = Number(slaText);
    if (!Number.isInteger(hours) || hours < 0 || hours > MAX_SLA_HOURS) fields.slaHours = 'RANGE';
  }

  /**
   * **والهاتف يُطبَّع لا يُرفض.** من يلصق «+966 50 123 4567» لم يخطئ،
   * ومن يمنع اللصق يصنع الخطأ الذي يظنّ أنه يمنعه.
   */
  const phone = clean(draft.contactPhone);
  if (phone !== null && normalizeSaudiPhone(phone) === null) fields.contactPhone = 'INVALID';

  const email = clean(draft.contactEmail);
  if (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.contactEmail = 'INVALID';

  return fields;
}

/**
 * إنشاءُ مزوّدٍ أو تعديلُه — ومعرّفٌ غائب يعني إنشاءً.
 *
 * **ولا يُمَسُّ `active` من هنا.** التفعيل والتعطيل قرارٌ له أثرُه على
 * الإسناد الجاري، و`toggleProvider` تقوله وتقول كم طلبًا سيُكمله
 * المزوّد. ودمجُهما يجعل حفظَ رقم هاتفٍ يُعطّل شركةً بالسهو.
 */
export async function saveProvider(
  input: {
    providerId: string | null;
    draft: ProviderDraft;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<ProviderSaveResult> {
  const fields = validate(input.draft);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const phone = clean(input.draft.contactPhone);
  const pct = clean(input.draft.commissionPct);
  const sla = clean(input.draft.slaHours);

  const data = {
    nameAr: input.draft.nameAr.trim(),
    nameEn: input.draft.nameEn.trim(),
    type: input.draft.type as ProviderType,
    contactPhone: phone === null ? null : normalizeSaudiPhone(phone),
    contactEmail: clean(input.draft.contactEmail),
    commissionPct: pct === null ? null : new Prisma.Decimal(pct),
    slaHours: sla === null ? null : Number(sla),
    // مدينةٌ فارغة ليست مدينة، والتكرار يُفسد عدّاد «المدن المغطّاة»
    cities: [
      ...new Set((input.draft.cities ?? []).map((city) => city.trim()).filter((city) => city !== '')),
    ],
  };

  if (input.providerId === null) {
    const created = await db.serviceProvider.create({ data, select: { id: true } });
    await writeAudit(created.id, 'provider.created', null, data, input, now);
    return { ok: true, id: created.id, created: true };
  }

  const before = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: {
      nameAr: true, nameEn: true, type: true, contactPhone: true,
      contactEmail: true, commissionPct: true, slaHours: true, cities: true,
    },
  });
  if (before === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  await db.serviceProvider.update({ where: { id: input.providerId }, data });
  await writeAudit(
    input.providerId,
    'provider.updated',
    { ...before, commissionPct: before.commissionPct?.toString() ?? null },
    data,
    input,
    now,
  );
  return { ok: true, id: input.providerId, created: false };
}

async function writeAudit(
  providerId: string,
  action: string,
  before: unknown,
  data: { commissionPct: Prisma.Decimal | null },
  input: { adminId: string; ip: string | null },
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: providerId,
      action,
      before: before as Prisma.InputJsonValue,
      // **والقيمة العشرية تُسجَّل نصًّا** — `Decimal` في JSON يفقد دقّته
      after: { ...data, commissionPct: data.commissionPct?.toString() ?? null },
      ip: input.ip,
      createdAt: now,
    },
  });
}

export type BreachedRequest = {
  ref: string;
  providerName: string;
  serviceName: string;
  /** كم ساعةً تجاوزت المهلة — وهي ما يُقاس عليه الإسقاط */
  overdueHours: number;
};

/** الطلبات المتجاوزة — **بأسمائها**، فمن يقرأ «٣ تجاوزات» يرى أيّها. */
export async function breachedRequests(now: Date = new Date()): Promise<BreachedRequest[]> {
  const rows = await db.serviceRequest.findMany({
    where: {
      providerId: { not: null },
      status: { in: [...OPEN_STATUSES] },
      dueAt: { lt: now },
    },
    orderBy: { dueAt: 'asc' },
    take: 50,
    include: {
      provider: { select: { nameAr: true } },
      service: { select: { nameAr: true } },
    },
  });

  return rows.map((row) => ({
    ref: row.ref,
    providerName: row.provider?.nameAr ?? '—',
    serviceName: row.service.nameAr,
    overdueHours:
      row.dueAt === null ? 0 : Math.floor((now.getTime() - row.dueAt.getTime()) / 3_600_000),
  }));
}
