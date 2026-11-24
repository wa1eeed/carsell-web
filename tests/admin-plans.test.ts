import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  adSlots,
  adStats,
  entitlementList,
  planList,
  planStats,
  simulateCommission,
  toggleAdSlot,
  updatePlan,
} from '@/lib/domain/admin-plans';
import { ADS_SERVED } from '@/lib/domain/ad-rules';
import { HOME_SESSION_AD_CAP, HOME_SLOTS } from '@/lib/domain/ad-session';
import { adsFor } from '@/lib/domain/ads';

/**
 * ═══ A29 · A30 — الباقات والعمولة · ومساحات الإعلانات ═══
 *
 * نموذجان مزروعان منذ اليوم الأول ولا شاشة تقرؤهما. وما يُفحص هنا
 * ثلاثة: أن قيمة الخاصّية تُحفظ **بنوعها**، وأن المحاكي يقول ما يكتبه
 * الطلب، وأن السقف قاعدةٌ واحدة لا مجموع.
 */

const stamp = String(Date.now()).slice(-9);
const ADMIN = { adminId: `adm${stamp}`, ip: null };
const T0 = new Date('2026-08-04T10:00:00Z');

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: ADMIN.adminId } });
});

describe('A29 — الباقات', () => {
  it('تُقرأ الباقات بقيَم خصائصها وأنواعها', async () => {
    const plans = await planList();
    expect(plans.length).toBeGreaterThan(0);

    const free = plans.find((plan) => plan.key === 'free');
    expect(free).toBeDefined();
    expect(free?.entitlements.find((row) => row.key === 'can_auction')?.type).toBe('bool');
  });

  it('العدّادات تُحسب من القاعدة لا من ثابت', async () => {
    const [stats, plans, entitlements] = await Promise.all([
      planStats(),
      planList(),
      entitlementList(),
    ]);

    expect(stats.plans).toBe(plans.length);
    expect(stats.entitlements).toBe(entitlements.length);
  });

  /**
   * **القيمة تُفحص بنوعها.** قيمةٌ لا تطابق نوعها تُخزَّن نصًّا يقرؤه
   * الكود فيسقط عند أوّل عميل — لا عند من كتبها.
   */
  it('ترفض قيمةً لا تطابق نوع خاصّيتها', async () => {
    const plan = await db.plan.findFirstOrThrow({ where: { key: 'free' } });

    const bool = await updatePlan(
      { planId: plan.id, price: 0, visible: true, entitlements: { can_auction: 'ربما' }, ...ADMIN },
      T0,
    );
    expect(bool).toEqual({ ok: false, reason: 'BAD_VALUE' });

    const percent = await updatePlan(
      { planId: plan.id, price: 0, visible: true, entitlements: { commission_pct: '150' }, ...ADMIN },
      T0,
    );
    expect(percent).toEqual({ ok: false, reason: 'BAD_VALUE' });

    // ‏−١ = بلا حدّ، وهي السالبة الوحيدة المقبولة
    const unlimited = await updatePlan(
      {
        planId: plan.id,
        price: 0,
        visible: true,
        entitlements: { max_active_listings: '-1' },
        ...ADMIN,
      },
      T0,
    );
    expect(unlimited).toEqual({ ok: true });

    const negative = await updatePlan(
      {
        planId: plan.id,
        price: 0,
        visible: true,
        entitlements: { max_active_listings: '-5' },
        ...ADMIN,
      },
      T0,
    );
    expect(negative).toEqual({ ok: false, reason: 'BAD_VALUE' });
  });

  /**
   * **ولا تُخترع خاصّية من الشاشة.** كل مفتاح بابٌ يفتحه الكود باسمه،
   * ومفتاحٌ مخترع يبقى قيمةً لا يقرؤها أحد — فيظنّ من ضبطه أنه فعل.
   */
  it('ترفض مفتاحًا لا يعرفه الكود', async () => {
    const plan = await db.plan.findFirstOrThrow({ where: { key: 'free' } });

    const result = await updatePlan(
      { planId: plan.id, price: 0, visible: true, entitlements: { free_ferrari: 'true' }, ...ADMIN },
      T0,
    );

    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_ENTITLEMENT' });
  });

  it('تكتب قيمة الخاصّية وتُقيّد الأثر', async () => {
    const plan = await db.plan.findFirstOrThrow({ where: { key: 'dealer' } });
    const before = await db.planEntitlement.findUniqueOrThrow({
      where: { planId_entitlementKey: { planId: plan.id, entitlementKey: 'team_seats' } },
    });

    const result = await updatePlan(
      { planId: plan.id, price: 0, visible: true, entitlements: { team_seats: '7' }, ...ADMIN },
      T0,
    );
    expect(result).toEqual({ ok: true });

    const after = await db.planEntitlement.findUniqueOrThrow({
      where: { planId_entitlementKey: { planId: plan.id, entitlementKey: 'team_seats' } },
    });
    expect(after.value).toBe('7');

    const audit = await db.auditLog.findFirst({
      where: { actorId: ADMIN.adminId, entity: 'Plan', action: 'plan.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    // **الاختبار يعيد ما غيّره** — وإلّا سقط جارُه في التشغيل التالي
    await db.planEntitlement.update({
      where: { planId_entitlementKey: { planId: plan.id, entitlementKey: 'team_seats' } },
      data: { value: before.value },
    });
  });
});

describe('A29 — محاكي العمولة', () => {
  /**
   * الرقم من التصميم حرفيًّا: ١٤٥٬٠٠٠ بنسبة ١٫٥٪ = ٢٬١٧٥. ولو انفصل
   * المحاكي عن `commissionFrom` لبقي هذا صحيحًا وحده وانحرف الطلب.
   */
  it('يقول ما يكتبه الطلب — ٢٬١٧٥ على ١٤٥٬٠٠٠ بـ١٫٥٪', () => {
    expect(
      simulateCommission({ price: 145_000, pct: 1.5, fixedFee: 0, minFee: 500, maxFee: 5000 }),
    ).toBe('2175.00');
  });

  it('يحترم الحدّين', () => {
    const rule = { pct: 1.5, fixedFee: 0, minFee: 500, maxFee: 5000 };
    expect(simulateCommission({ ...rule, price: 10_000 })).toBe('500.00');
    expect(simulateCommission({ ...rule, price: 900_000 })).toBe('5000.00');
  });

  it('بلا حدّين يبقى النسبة والثابت', () => {
    expect(
      simulateCommission({ price: 100_000, pct: 2, fixedFee: 250, minFee: null, maxFee: null }),
    ).toBe('2250.00');
  });
});

describe('A30 — مساحات الإعلانات', () => {
  it('المساحات تُقرأ بموضعها ومقاسها المقروء', async () => {
    const slots = await adSlots(T0);
    expect(slots.length).toBeGreaterThan(0);

    // كل مساحة تُباع لمعلن — فبلا موضعٍ مكتوب تُباع بلا وصف
    for (const slot of slots) {
      expect(slot.placement).not.toBe('');
      expect(slot.sizeLabel).not.toBe('');
    }
  });

  /**
   * **السقف قاعدةٌ لا مجموع.** جُمعت `maxPerSession` أوّلًا فقالت «٩»
   * والتصميم يقول «٤» — ومجموعُ سقوفٍ لكلٍّ معناه ليس سقفًا لجلسة.
   */
  it('السقف في الجلسة ثابتٌ واحد يقرؤه الخادم والشاشة', async () => {
    const stats = await adStats(T0);
    expect(stats.sessionCap).toBe(HOME_SESSION_AD_CAP);
  });

  /**
   * ═══ والتنبيه فعل فعله ═══
   *
   * كان يفحص `served === false` ليسقط يوم يُبنى مسار العرض — **وقد
   * سقط** في المهمّة ١٢٢ حين صارت `search_inline` تُقرأ في نتائج
   * البحث. وهو الفرق بين اختبارٍ يحرس عطلًا واختبارٍ يحرس **نصًّا
   * مرحليًّا**: الأوّل يُصحَّح، والثاني أدّى غرضه فيُنقل إلى الحدّ
   * الدائم.
   *
   * فالفحص الآن على **التطابق** لا على القيمة: الشاشة تقرأ
   * `stats.served` وتصوغ به نصّها، فلا يبقى سطرٌ يقول «لا يُعرض
   * إعلان» بعد أن صار يُعرض — ولا عكسُه.
   */
  it('ما تقوله الشاشة عن العرض هو الثابت نفسه', async () => {
    const stats = await adStats(T0);
    expect(stats.served).toBe(ADS_SERVED);
  });

  /**
   * ═══ و«أتعرض الرئيسيةُ إعلانًا؟» يُقاس لا يُكتب ═══
   *
   * كان هنا `expect(stats.homeServed).toBe(HOME_ADS_SERVED)` — فحصُ
   * رايةٍ بيد براية، **يمرّ وهي تكذب**. وقد كذبت: قالت `false`
   * والرئيسيةُ تعرض `home_banner` و`brand_featured`، فقرأ المشغّل في
   * A30 «ولا إعلان في الرئيسية بعد».
   *
   * والفحصُ الآن على الواقع، **ويُعبَر الحدُّ في الاتّجاهين**: بحملةٍ
   * حيّة على مساحة رئيسية، وبلا واحدة.
   */
  it('والرئيسيةُ تُقال عارضةً حين تكون لها حملةٌ حيّة — لا بثابت', async () => {
    const live = await db.adCampaign.findFirst({
      where: {
        slotKey: { in: [...HOME_SLOTS] },
        status: 'LIVE',
        startsAt: { lte: T0 },
        endsAt: { gte: T0 },
        slot: { active: true },
      },
      select: { id: true, status: true },
    });

    if (live === null) {
      expect((await adStats(T0)).homeServed).toBe(false);
      return;
    }

    expect((await adStats(T0)).homeServed).toBe(true);

    /** ويُعبَر الحدُّ: بلا حملةٍ حيّة تُقال الرئيسيةُ غيرَ عارضة. */
    await db.adCampaign.update({ where: { id: live.id }, data: { status: 'PAUSED' } });
    try {
      const others = await db.adCampaign.count({
        where: {
          slotKey: { in: [...HOME_SLOTS] },
          status: 'LIVE',
          startsAt: { lte: T0 },
          endsAt: { gte: T0 },
          slot: { active: true },
        },
      });
      if (others === 0) expect((await adStats(T0)).homeServed).toBe(false);
    } finally {
      await db.adCampaign.update({ where: { id: live.id }, data: { status: live.status } });
    }
  });

  it('ومسار العرض قائمٌ متى قالت إنه قائم', async () => {
    /**
     * **ولا تُقلب الراية وحدها.** `ADS_SERVED = true` وشاشةٌ لا
     * تطلب إعلانًا تجعل لوحة الأدمن تَعِد بعرضٍ لا يقع — وهو الوعد
     * المُخلَف نفسه مقلوبًا.
     */
    if (!ADS_SERVED) return;
    const served = await adsFor('search_inline', {}, T0, 1);
    expect(Array.isArray(served)).toBe(true);
  });

  it('التعطيل يُنقص المفعّلة ولا يمسّ الحملات', async () => {
    const slot = await db.adSlot.findFirstOrThrow({ where: { active: true } });
    const campaignsBefore = await db.adCampaign.count({ where: { slotKey: slot.key } });
    const activeBefore = (await adStats(T0)).activeSlots;

    const off = await toggleAdSlot({ key: slot.key, active: false, ...ADMIN }, T0);
    expect(off).toEqual({ ok: true, active: false });
    expect((await adStats(T0)).activeSlots).toBe(activeBefore - 1);
    expect(await db.adCampaign.count({ where: { slotKey: slot.key } })).toBe(campaignsBefore);

    const on = await toggleAdSlot({ key: slot.key, active: true, ...ADMIN }, T0);
    expect(on).toEqual({ ok: true, active: true });
    expect((await adStats(T0)).activeSlots).toBe(activeBefore);
  });

  it('مساحة لا وجود لها تُردّ لا تُنشأ', async () => {
    const result = await toggleAdSlot({ key: `no_such_${stamp}`, active: false, ...ADMIN }, T0);
    expect(result).toEqual({ ok: false, reason: 'SLOT_NOT_FOUND' });
    expect(await db.adSlot.findUnique({ where: { key: `no_such_${stamp}` } })).toBeNull();
  });
});
