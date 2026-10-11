import type { AdminUser } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { MAX_BANNERS_PER_SCREEN, type ServedAd } from './ad-rules';

export type { ServedAd };

/**
 * ═══ الإعلان المموّل — من الإنشاء إلى النقرة ═══
 *
 * `AdSlot` مزروعةٌ بسبع مساحات وأسعارها، و`AdCampaign` معرَّفٌ
 * بميزانيته وظهوره ونقراته، و`admin-finance` **يجمع منه إيرادًا** —
 * ولا شيء يكتب حملةً، ولا مسار يعرض إعلانًا لمستخدم. فبندُ إيرادٍ
 * كاملٌ لا يمكن أن يوجد.
 *
 * وهو الصنف نفسه الحادي عشر: قيمةٌ في المخطّط بلا كاتب. والجديد أنّ
 * **الأدمن يراها مجدولةً في شاشتها** — جدولٌ فارغ يُقرأ «لا حملات
 * الآن» لا «لا سبيل إلى حملة».
 *
 * ═══ والنقرة مالٌ ═══
 *
 * `search_inline` تُسعَّر `cpc` — فالنقرة بندُ فاتورة. ولذلك تمرّ
 * بمسارٍ يَعُدّ ثمّ يُحوّل، ولا يُعطى الرابط للمتصفّح مباشرةً.
 */

export type AdContext = {
  city?: string | null;
  brandId?: string | null;
};

function targetingOf(value: Prisma.JsonValue | null): AdContext {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  return {
    city: typeof row.city === 'string' && row.city !== '' ? row.city : null,
    brandId: typeof row.brandId === 'string' && row.brandId !== '' ? row.brandId : null,
  };
}

/**
 * **الاستهداف يُضيِّق ولا يُوسِّع.** حملةٌ بلا استهداف تُعرض للكلّ،
 * وحملةٌ مستهدِفةٌ للرياض لا تُعرض في جدة — **ولا تُعرض حين لا نعرف
 * المدينة**: عرضُها حينئذٍ بيعُ استهدافٍ لم يقع.
 */
function matches(targeting: AdContext, context: AdContext): boolean {
  if (targeting.city != null && targeting.city !== context.city) return false;
  if (targeting.brandId != null && targeting.brandId !== context.brandId) return false;
  return true;
}

/**
 * الحملات الصالحة لمساحةٍ الآن — **وأكثرها أولويةً أوّلًا**.
 *
 * والعدد محدودٌ بـ`MAX_BANNERS_PER_SCREEN`: ثابتٌ تقرؤه شاشة الأدمن
 * وتَعِد به، فقراءتُه هنا تجعل الوعد يقع.
 */
export async function adsFor(
  slotKey: string,
  context: AdContext = {},
  now: Date = new Date(),
  limit: number = MAX_BANNERS_PER_SCREEN,
): Promise<ServedAd[]> {
  const slot = await db.adSlot.findUnique({ where: { key: slotKey } });
  if (slot === null || !slot.active) return [];

  const rows = await db.adCampaign.findMany({
    where: {
      slotKey,
      status: 'live',
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: [{ priority: 'desc' }, { startsAt: 'asc' }],
    take: 20,
  });

  return rows
    .filter((row) => matches(targetingOf(row.targeting), context))
    .slice(0, Math.max(0, Math.min(limit, slot.maxPerSession)))
    .map((row) => ({
      id: row.id,
      advertiserName: row.advertiserName,
      creativeUrl: row.creativeUrl,
      clickPath: `/api/v1/ads/${row.id}/click`,
    }));
}

export type CampaignInput = {
  advertiserName: string;
  slotKey: string;
  creativeUrl: string;
  targetUrl: string;
  startsAt: Date;
  endsAt: Date;
  budget: string;
  priority?: number;
  city?: string | null;
  brandId?: string | null;
};

export type CampaignResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | 'SLOT_NOT_FOUND'
        | 'SLOT_INACTIVE'
        | 'BAD_WINDOW'
        | 'BAD_BUDGET'
        | 'BAD_URL'
        | 'NO_ADVERTISER';
    };

/**
 * **والرابط يُفحص عند الإنشاء لا عند النقر.** مسارُ النقر يُحوّل إلى
 * `targetUrl` كما هو، فقبولُ `javascript:` أو مسارٍ نسبيّ هنا يجعل
 * لوحةَ الأدمن بابًا لتحويلٍ مفتوح. والفحص مرّةً عند الكتابة أصدق من
 * فحصٍ في كل نقرة — وأسرع.
 */
function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function createCampaign(
  admin: AdminUser,
  input: CampaignInput,
  now: Date = new Date(),
): Promise<CampaignResult> {
  const advertiser = input.advertiserName.trim();
  if (advertiser === '') return { ok: false, reason: 'NO_ADVERTISER' };
  if (!httpUrl(input.creativeUrl) || !httpUrl(input.targetUrl)) {
    return { ok: false, reason: 'BAD_URL' };
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    return { ok: false, reason: 'BAD_WINDOW' };
  }

  const budget = Number(input.budget);
  if (!Number.isFinite(budget) || budget <= 0) return { ok: false, reason: 'BAD_BUDGET' };

  const slot = await db.adSlot.findUnique({ where: { key: input.slotKey } });
  if (slot === null) return { ok: false, reason: 'SLOT_NOT_FOUND' };
  if (!slot.active) return { ok: false, reason: 'SLOT_INACTIVE' };

  /**
   * **والحالة تُشتقّ من النافذة لا تُؤخَذ من المُدخِل.** حملةٌ تبدأ
   * غدًا وحالتُها `live` تُعرض اليوم في شاشة «نشطة» ولا تُعرض لأحد —
   * ومن أنشأها يقرأ أنها تعمل.
   */
  const live = input.startsAt.getTime() <= now.getTime();

  const created = await db.adCampaign.create({
    data: {
      advertiserName: advertiser,
      slotKey: input.slotKey,
      creativeUrl: input.creativeUrl,
      targetUrl: input.targetUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      budget: input.budget,
      priority: input.priority ?? 0,
      status: live ? 'live' : 'scheduled',
      ...(input.city == null && input.brandId == null
        ? {}
        : {
            targeting: {
              ...(input.city == null ? {} : { city: input.city }),
              ...(input.brandId == null ? {} : { brandId: input.brandId }),
            },
          }),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'AdCampaign',
      entityId: created.id,
      action: 'ad.campaign.created',
      before: {},
      after: { advertiser, slot: input.slotKey, budget: input.budget },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true, id: created.id };
}

export type PauseResult = { ok: boolean };

/** إيقافٌ واستئناف — والمنتهية لا تُستأنف، فنافذتُها مضت. */
export async function setCampaignPaused(
  admin: AdminUser,
  id: string,
  paused: boolean,
  now: Date = new Date(),
): Promise<PauseResult> {
  const row = await db.adCampaign.findUnique({ where: { id } });
  if (row === null) return { ok: false };
  if (row.endsAt.getTime() < now.getTime()) return { ok: false };

  const next = paused
    ? 'paused'
    : row.startsAt.getTime() <= now.getTime()
      ? 'live'
      : 'scheduled';

  await db.adCampaign.update({ where: { id }, data: { status: next } });
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'AdCampaign',
      entityId: id,
      action: paused ? 'ad.campaign.paused' : 'ad.campaign.resumed',
      before: { status: row.status },
      after: { status: next },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true };
}

/**
 * ظهورٌ ونقرة — **عدّادان لا يسقطان الطلب**.
 *
 * فشلُ عدّادٍ لا يمنع التحويل: من نقر يريد الوجهة، وخسارةُ عدّةٍ
 * واحدة أهون من صفحة خطأ على نقرة إعلان.
 */
export async function recordImpression(id: string): Promise<void> {
  await db.adCampaign
    .update({ where: { id }, data: { impressions: { increment: 1 } } })
    .catch(() => undefined);
}

export async function recordClick(id: string): Promise<string | null> {
  const row = await db.adCampaign.findUnique({ where: { id }, select: { targetUrl: true } });
  if (row === null) return null;

  await db.adCampaign
    .update({ where: { id }, data: { clicks: { increment: 1 } } })
    .catch(() => undefined);

  // فُحص عند الإنشاء — ويُفحص ثانيةً لأن الصفّ قد يسبق الفحص
  return httpUrl(row.targetUrl) ? row.targetUrl : null;
}
