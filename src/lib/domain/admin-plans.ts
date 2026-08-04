import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { ADS_SERVED, HOME_SESSION_AD_CAP } from './ad-rules';
import { commissionFrom } from './order-amounts';

/**
 * ═══ A29 · A30 · A31 — الباقات ومساحات الإعلانات والحملات ═══
 *
 * ثلاث شاشاتٍ نماذجُها مزروعة ولا شاشة تقرؤها: `Plan` و`Entitlement`
 * و`AdSlot` و`AdCampaign` موجودة منذ الزرع.
 *
 * ═══ والباقة حزمة قيَمٍ لا منطق ═══
 *
 * عنوان A29 حرفيًّا: «حزمة قيَم للخصائص، لا منطق». والخصائص ثابتة في
 * الشيفرة لأن كلًّا منها بابٌ يفتحه الكود — وباقةٌ تُنشئ خاصّيةً جديدة
 * من الشاشة تُنشئ اسمًا لا يقرؤه أحد.
 *
 * ═══ والتجاوز بسببٍ مكتوب ═══
 *
 * `EntitlementOverride.reason` مطلوبٌ في المخطّط. ومنحُ عميلٍ استثناءً
 * بلا سبب يُقرأ بعد سنةٍ على أنه خطأ — أو أسوأ: على أنه محاباة.
 */

export type PlanRow = {
  id: string;
  key: string;
  nameAr: string;
  price: string;
  billingCycle: string;
  visible: boolean;
  subscriberCount: number;
  /** قيَم الخصائص لهذه الباقة — مفاتيح، والشاشة تصوغها */
  entitlements: { key: string; value: string; type: string }[];
};

export type PlanStats = {
  plans: number;
  entitlements: number;
  overrides: number;
  paidPlans: number;
};

export async function planList(): Promise<PlanRow[]> {
  const plans = await db.plan.findMany({
    orderBy: { price: 'asc' },
    include: {
      entitlements: { include: { entitlement: { select: { type: true } } } },
      _count: { select: { subscriptions: true } },
    },
  });

  return plans.map((plan) => ({
    id: plan.id,
    key: plan.key,
    nameAr: plan.nameAr,
    price: plan.price.toFixed(2),
    billingCycle: plan.billingCycle,
    visible: plan.visible,
    subscriberCount: plan._count.subscriptions,
    entitlements: plan.entitlements.map((row) => ({
      key: row.entitlementKey,
      value: row.value,
      type: row.entitlement.type,
    })),
  }));
}

export async function planStats(): Promise<PlanStats> {
  const [plans, entitlements, overrides, paid] = await Promise.all([
    db.plan.count(),
    db.entitlement.count(),
    db.entitlementOverride.count(),
    db.plan.count({ where: { price: { gt: new Prisma.Decimal(0) } } }),
  ]);

  return { plans, entitlements, overrides, paidPlans: paid };
}

export type OverrideRow = {
  id: string;
  entitlementKey: string;
  value: string;
  reason: string;
  subject: string;
  expiresAt: string | null;
  createdAt: string;
};

/** التجاوزات — **بسببها**، فقارئُها بعد سنةٍ يعرف لماذا مُنحت. */
export async function overrideList(): Promise<OverrideRow[]> {
  const rows = await db.entitlementOverride.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { name: true, phone: true } },
    },
  });

  const dealerIds = rows.map((row) => row.dealerId).filter((id) => id !== null);
  const dealers =
    dealerIds.length === 0
      ? []
      : await db.dealer.findMany({
          where: { id: { in: dealerIds } },
          select: { id: true, nameAr: true },
        });

  return rows.map((row) => ({
    id: row.id,
    entitlementKey: row.entitlementKey,
    value: row.value,
    reason: row.reason,
    subject:
      row.user !== null
        ? (row.user.name ?? row.user.phone)
        : (dealers.find((d) => d.id === row.dealerId)?.nameAr ?? row.dealerId ?? '—'),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** الخصائص كلّها بأنواعها — أعمدة مصفوفة A29. */
export type EntitlementRow = { key: string; type: string; defaultValue: string };

export async function entitlementList(): Promise<EntitlementRow[]> {
  const rows = await db.entitlement.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, type: true, defaultValue: true },
  });
  return rows;
}

export type PlanEditResult =
  | { ok: true }
  | { ok: false; reason: 'PLAN_NOT_FOUND' | 'BAD_PRICE' | 'UNKNOWN_ENTITLEMENT' | 'BAD_VALUE' };

/**
 * تعديل باقة — **السعر والظهور وقيَم خصائصها**.
 *
 * ولا تُنشأ خاصّيةٌ من هنا: كلٌّ منها بابٌ يفتحه الكود باسمه، ومفتاحٌ
 * يُخترع في الشاشة يبقى قيمةً لا يقرؤها أحد — فيظنّ من ضبطه أنه فعل.
 *
 * **والقيمة تُفحص بنوعها**: `bool` تقبل `true|false` وحدهما، و`int`
 * عددًا صحيحًا (أو `-1` بلا حدّ)، و`percent` رقمًا بين صفر ومئة.
 * وقيمةٌ لا تطابق نوعها تُخزَّن نصًّا يقرؤه الكود فيسقط عند أوّل عميل.
 */
export async function updatePlan(
  input: {
    planId: string;
    price: number;
    visible: boolean;
    entitlements: Record<string, string>;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<PlanEditResult> {
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, reason: 'BAD_PRICE' };

  const plan = await db.plan.findUnique({
    where: { id: input.planId },
    include: { entitlements: true },
  });
  if (plan === null) return { ok: false, reason: 'PLAN_NOT_FOUND' };

  const known = await db.entitlement.findMany({ select: { key: true, type: true } });

  for (const [key, value] of Object.entries(input.entitlements)) {
    const entitlement = known.find((row) => row.key === key);
    if (entitlement === undefined) return { ok: false, reason: 'UNKNOWN_ENTITLEMENT' };
    if (!validValue(entitlement.type, value)) return { ok: false, reason: 'BAD_VALUE' };
  }

  const before = {
    price: plan.price.toFixed(2),
    visible: plan.visible,
    entitlements: Object.fromEntries(plan.entitlements.map((e) => [e.entitlementKey, e.value])),
  };

  await db.$transaction(async (tx) => {
    await tx.plan.update({
      where: { id: plan.id },
      data: { price: new Prisma.Decimal(input.price), visible: input.visible },
    });

    for (const [entitlementKey, value] of Object.entries(input.entitlements)) {
      await tx.planEntitlement.upsert({
        where: { planId_entitlementKey: { planId: plan.id, entitlementKey } },
        create: { planId: plan.id, entitlementKey, value },
        update: { value },
      });
    }
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'Plan',
      entityId: plan.id,
      action: 'plan.updated',
      before,
      after: {
        price: input.price.toFixed(2),
        visible: input.visible,
        entitlements: input.entitlements,
      },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

function validValue(type: string, value: string): boolean {
  if (type === 'bool') return value === 'true' || value === 'false';
  if (type === 'percent') {
    const pct = Number(value);
    return Number.isFinite(pct) && pct >= 0 && pct <= 100;
  }
  if (type === 'int') {
    const count = Number(value);
    // ‏−١ = بلا حدّ، وهي القيمة الوحيدة السالبة المقبولة
    return Number.isInteger(count) && (count >= 0 || count === -1);
  }
  return value.length > 0;
}

export type SimulationInput = {
  price: number;
  pct: number;
  fixedFee: number;
  minFee: number | null;
  maxFee: number | null;
};

/**
 * محاكي العمولة — **ولا يكتب شيئًا**.
 *
 * ويستدعي `commissionFrom` نفسها التي يستدعيها إنشاء الطلب: محاكاةٌ
 * تُعيد الحساب بنفسها تُنتج قاعدةً ثانية، فيقول المحاكي رقمًا ويكتب
 * الطلبُ غيره — وأسوأ ما فيه أنه يبدو صحيحًا.
 */
export function simulateCommission(input: SimulationInput): string {
  const value = commissionFrom(
    {
      pct: new Prisma.Decimal(input.pct),
      fixedFee: new Prisma.Decimal(input.fixedFee),
      minFee: input.minFee === null ? null : new Prisma.Decimal(input.minFee),
      maxFee: input.maxFee === null ? null : new Prisma.Decimal(input.maxFee),
    },
    input.price,
  );

  return new Prisma.Decimal(value).toFixed(2);
}

// ═══════════════════════════════════════════════════════════
//  A30 · A31 — مساحات الإعلانات والحملات
// ═══════════════════════════════════════════════════════════

export type AdSlotRow = {
  key: string;
  nameAr: string;
  width: number;
  height: number;
  sizeLabel: string;
  placement: string;
  pricingModel: string;
  basePrice: string;
  maxPerSession: number;
  active: boolean;
  campaignCount: number;
  liveCampaigns: number;
};

export type AdStats = {
  slots: number;
  activeSlots: number;
  /** سقف الإعلانات في جلسة الرئيسية — والثابت في `ad-rules.ts` */
  sessionCap: number;
  liveCampaigns: number;
  /** هل يعرض المنتجُ إعلانًا أصلًا — والجواب اليوم لا */
  served: boolean;
};

export async function adSlots(now: Date = new Date()): Promise<AdSlotRow[]> {
  const slots = await db.adSlot.findMany({
    orderBy: { basePrice: 'desc' },
    include: { _count: { select: { campaigns: true } } },
  });

  const live = await db.adCampaign.groupBy({
    by: ['slotKey'],
    where: { startsAt: { lte: now }, endsAt: { gte: now } },
    _count: true,
  });

  return slots.map((slot) => ({
    key: slot.key,
    nameAr: slot.nameAr,
    width: slot.width,
    height: slot.height,
    sizeLabel: slot.sizeLabel,
    placement: slot.placement,
    pricingModel: slot.pricingModel,
    basePrice: slot.basePrice.toFixed(2),
    maxPerSession: slot.maxPerSession,
    active: slot.active,
    campaignCount: slot._count.campaigns,
    liveCampaigns: live.find((row) => row.slotKey === slot.key)?._count ?? 0,
  }));
}

export async function adStats(now: Date = new Date()): Promise<AdStats> {
  const [slots, active, live] = await Promise.all([
    db.adSlot.count(),
    db.adSlot.count({ where: { active: true } }),
    db.adCampaign.count({ where: { startsAt: { lte: now }, endsAt: { gte: now } } }),
  ]);

  return {
    slots,
    activeSlots: active,
    /**
     * **السقف قاعدةٌ لا مجموع.** جمعتُ `maxPerSession` أوّلًا فقال
     * «٩» والتصميم يقول «٤» — ومجموعُ سقوفٍ لكلٍّ معناه ليس سقفًا
     * لجلسة. والقاعدة ثابتٌ واحد يقرؤه الخادم والشاشة معًا.
     */
    sessionCap: HOME_SESSION_AD_CAP,
    liveCampaigns: live,
    served: ADS_SERVED,
  };
}

export type CampaignRow = {
  id: string;
  advertiserName: string;
  slotKey: string;
  startsAt: string;
  endsAt: string;
  /** جاريةٌ الآن — الحالة من التاريخين لا من راية */
  live: boolean;
  impressions: number;
  clicks: number;
  ctrPct: number;
};

export async function adCampaigns(now: Date = new Date()): Promise<CampaignRow[]> {
  const rows = await db.adCampaign.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });

  return rows.map((row) => {
    const impressions = row.impressions;
    return {
      id: row.id,
      advertiserName: row.advertiserName,
      slotKey: row.slotKey,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      live: row.startsAt <= now && row.endsAt >= now,
      impressions,
      clicks: row.clicks,
      // القسمة على صفر: حملةٌ لم تُعرض بعد — والصفر حالٌ متوقَّعة
      ctrPct: impressions === 0 ? 0 : Math.round((row.clicks / impressions) * 1000) / 10,
    };
  });
}

export type SlotToggleResult =
  | { ok: true; active: boolean }
  | { ok: false; reason: 'SLOT_NOT_FOUND' };

/** تفعيل مساحة أو تعطيلها — والتعطيل يوقف عرضها فورًا. */
export async function toggleAdSlot(
  input: { key: string; active: boolean; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<SlotToggleResult> {
  const slot = await db.adSlot.findUnique({ where: { key: input.key }, select: { active: true } });
  if (slot === null) return { ok: false, reason: 'SLOT_NOT_FOUND' };

  await db.adSlot.update({ where: { key: input.key }, data: { active: input.active } });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'AdSlot',
      entityId: input.key,
      action: input.active ? 'adslot.enabled' : 'adslot.disabled',
      before: { active: slot.active },
      after: { active: input.active },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, active: input.active };
}
