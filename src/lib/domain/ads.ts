import type { AdminUser } from '@/generated/prisma/client';
import type { AdCampaignStatus } from '@/generated/prisma/enums';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { MAX_BANNERS_PER_SCREEN, type ServedAd } from './ad-rules';
import { HOME_SLOTS } from './ad-session';

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
      status: 'LIVE',
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
      status: live ? 'LIVE' : 'SCHEDULED',
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

  const next: AdCampaignStatus = paused
    ? 'PAUSED'
    : row.startsAt.getTime() <= now.getTime()
      ? 'LIVE'
      : 'SCHEDULED';

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

/**
 * أمساحةُ هذه الحملة من مساحات الرئيسية؟ — فسقفُ الجلسة لها وحدها.
 *
 * ويُقرأ من الصفّ لا من قائمةٍ في المسار: المسارُ يعرف معرّف الحملة
 * وحده، وسقفٌ يُحسب بغير مساحتها يُسكت بطاقةَ مموّلٍ في النتائج بيعت
 * بشروطٍ أخرى.
 */
export async function isHomeCampaign(id: string): Promise<boolean> {
  const row = await db.adCampaign.findUnique({ where: { id }, select: { slotKey: true } });
  return row !== null && HOME_SLOTS.includes(row.slotKey);
}

/**
 * ═══ أتعرض الرئيسيةُ إعلانًا؟ — **يُقاس ولا يُكتب** ═══
 *
 * كان `HOME_ADS_SERVED` ثابتًا بيد، وبطاقةُ A30 تقرؤه فتقول «ولا
 * إعلان في الرئيسية بعد» — **والرئيسيةُ تعرض اثنين**: `home_banner`
 * و`brand_featured` مبنيّان ويُصيَّران، والحملاتُ حيّة. فالثابت تقادم
 * يوم بُني السطح ولم يُقلَب معه.
 *
 * وعلاجُه ألّا تكون هناك نسخة: السؤال استعلامٌ عن حملةٍ حيّة على
 * مساحةٍ مفعَّلة من مساحات الرئيسية. **فما يحتاج حراسةً يُبنى
 * محروسًا.**
 */
export async function homeAdsServed(now: Date = new Date()): Promise<boolean> {
  const live = await db.adCampaign.count({
    where: {
      slotKey: { in: [...HOME_SLOTS] },
      status: 'LIVE',
      startsAt: { lte: now },
      endsAt: { gte: now },
      slot: { active: true },
    },
  });
  return live > 0;
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

/* ─────────────── إيرادُ المساحات وإشغالها — A30 ─────────────── */

/**
 * ═══ إيرادُ الإعلانات — قاعدةٌ واحدة يقرؤها الموضعان ═══
 *
 * كانت لوحةُ المالية تجمعه بترشيحٍ على `status in ('running','ended')`
 * — **ولا كاتبَ لـ`running` في المنتج كلِّه**، فكانت تقرأ صفرًا مهما
 * بيعت مساحة. وبطاقةُ A30 كانت ستضيف قاعدةً ثانية، والقاعدتان
 * تتباعدان أوّلَ تغيير.
 *
 * ═══ والاعتراف عند بدء الحملة ═══
 *
 * هو ما كانت تفعله لوحةُ المالية، ويبقى: الميزانيةُ كلُّها في الشهر
 * الذي بدأت فيه. **وهو ليس توزيعًا بالاستحقاق على أيام الحملة** —
 * حملةٌ تبدأ في ٢٨ نوفمبر لثلاثين يومًا تُحسب نوفمبرَ كلَّها.
 * والسؤال مطروحٌ على المالك في `docs/OPEN-QUESTIONS.md`؛ وحين يُجاب
 * يُغيَّر هنا وحده فيتبعه الموضعان.
 *
 * والمُلغاة تخرج — ولا حالَ للإلغاء بعد، فالترشيح يُعلن ما يستثنيه
 * بدل أن يسكت عنه.
 */
export async function adRevenue(from: Date, to: Date): Promise<Prisma.Decimal> {
  const total = await db.adCampaign.aggregate({
    where: {
      startsAt: { gte: from, lt: to },
      status: { in: ['LIVE', 'ENDED', 'PAUSED'] },
    },
    _sum: { budget: true },
  });
  return new Prisma.Decimal(total._sum.budget ?? 0);
}

export type AdOccupancy = {
  /** أيامُ مساحةٍ مبيعة في النافذة */
  soldSlotDays: number;
  /** أيامُ المساحات المفعّلة كلُّها في النافذة */
  totalSlotDays: number;
  measured: boolean;
};

/**
 * ═══ الإشغال — مبيعٌ من متاح، لا عددُ حملات ═══
 *
 * «٧٨٪ · ٢٢٪ متاح» في الترميز. والمقام **المساحات المفعّلة وحدها**:
 * مساحةٌ معطَّلة لا تُباع، فعدُّها في المتاح يجعل التعطيل يخفض
 * الإشغال — وهو يرفعه.
 *
 * **واليومُ يُعدّ مرّةً ولو باعته حملتان.** الإشغال مساحةٌ مشغولة لا
 * مجموعُ ما بيع عليها، وجمعُ الحملات يُخرج نسبةً فوق المئة.
 */
export async function adOccupancy(from: Date, to: Date): Promise<AdOccupancy> {
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));

  const [slots, campaigns] = await Promise.all([
    db.adSlot.findMany({ where: { active: true }, select: { key: true } }),
    db.adCampaign.findMany({
      where: {
        status: { in: ['LIVE', 'ENDED', 'SCHEDULED'] },
        startsAt: { lt: to },
        endsAt: { gte: from },
      },
      select: { slotKey: true, startsAt: true, endsAt: true },
    }),
  ]);

  const active = new Set(slots.map((row) => row.key));
  const totalSlotDays = active.size * days;
  if (totalSlotDays === 0) return { soldSlotDays: 0, totalSlotDays: 0, measured: false };

  /** يومٌ لكل مساحة مرّةً واحدة — `slotKey\u0000dayIndex`. */
  const sold = new Set<string>();
  for (const row of campaigns) {
    if (!active.has(row.slotKey)) continue;
    const start = Math.max(row.startsAt.getTime(), from.getTime());
    const end = Math.min(row.endsAt.getTime(), to.getTime() - 1);
    for (let at = start; at <= end; at += DAY) {
      sold.add(`${row.slotKey}\u0000${String(Math.floor((at - from.getTime()) / DAY))}`);
    }
  }

  return { soldSlotDays: sold.size, totalSlotDays, measured: true };
}

/* ─────────────── إنشاء مساحة — «أضف مساحة» في A30 ─────────────── */

export type SlotInput = {
  key: string;
  nameAr: string;
  sizeLabel: string;
  placement: string;
  pricingModel: string;
  basePrice: string;
  maxPerSession: number;
};

export type SlotResult =
  | { ok: true; key: string }
  | {
      ok: false;
      reason: 'BAD_KEY' | 'KEY_TAKEN' | 'NO_NAME' | 'BAD_PRICING' | 'BAD_PRICE' | 'BAD_CAP';
    };

/** نماذجُ التسعير التي يفهمها الجدول — والخامس لا عمودَ له. */
export const PRICING_MODELS = ['day', 'week', 'month', 'cpm', 'cpc'] as const;

/**
 * ═══ مساحةٌ جديدة — وكان الجدول سبعًا إلى الأبد ═══
 *
 * `AdSlot` رايتُها تُقلب من الجدول **ولا يُنشئها شيء**: مساحةٌ جديدة
 * تحتاج صفًّا في القاعدة بيد، و«أضف مساحة» في الترميز بلا باب.
 *
 * **والمفتاح لاتينيٌّ ولا يتغيّر**: يُكتب في الشيفرة حين يُقرأ سطحٌ
 * جديد (`adsFor('home_banner')`)، فمفتاحٌ عربيٌّ أو فيه مسافة يُكسر
 * في الاستدعاء، وتغييرُه بعد البيع يُيتّم حملاته.
 */
export async function createSlot(
  admin: AdminUser,
  input: SlotInput,
  now: Date = new Date(),
): Promise<SlotResult> {
  const key = input.key.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(key)) return { ok: false, reason: 'BAD_KEY' };
  if (input.nameAr.trim() === '') return { ok: false, reason: 'NO_NAME' };
  if (!PRICING_MODELS.includes(input.pricingModel as (typeof PRICING_MODELS)[number])) {
    return { ok: false, reason: 'BAD_PRICING' };
  }

  const price = Number(input.basePrice);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'BAD_PRICE' };
  if (!Number.isInteger(input.maxPerSession) || input.maxPerSession < 1) {
    return { ok: false, reason: 'BAD_CAP' };
  }

  const taken = await db.adSlot.findUnique({ where: { key }, select: { key: true } });
  if (taken !== null) return { ok: false, reason: 'KEY_TAKEN' };

  /**
   * **وتُنشأ معطَّلة.** مساحةٌ تولد مفعَّلةً تدخل مقامَ الإشغال فورًا
   * فتخفضه بلا أن تُباع، وتُعرض في اختيار الحملة قبل أن يُكتب لها
   * سطحٌ يقرؤها. فالتفعيل ضغطةٌ ثانية واعية.
   */
  await db.adSlot.create({
    data: {
      key,
      nameAr: input.nameAr.trim(),
      width: 0,
      height: 0,
      sizeLabel: input.sizeLabel.trim(),
      placement: input.placement.trim(),
      pricingModel: input.pricingModel,
      basePrice: new Prisma.Decimal(input.basePrice),
      maxPerSession: input.maxPerSession,
      active: false,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'AdSlot',
      entityId: key,
      action: 'ad.slot.created',
      before: {},
      after: { nameAr: input.nameAr.trim(), pricingModel: input.pricingModel, basePrice: input.basePrice },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true, key };
}
