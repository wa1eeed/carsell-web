import type { ProviderType } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
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
