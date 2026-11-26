import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { resolveEntitlements, sellingAllowance } from '@/lib/domain/entitlements';

/**
 * ═══ باقةُ المعرض تصل أعضاءه ═══
 *
 * قِيس ٢٠٢٦-١١-٢٦: `Subscription` يحمل `dealerId` وفهرسًا له، و
 * `resolveEntitlements` كانت تستعلم بـ`userId` وحده — **فاشتراكُ المعرض
 * لا يصل المحرّكَ أبدًا**. وأثرُه أنّ `sellingAllowance` تُستدعى
 * بالعضو الناشر، فمعرضٌ باقتُه تُجيز المزاد يُردّ لأنّ بائعًا — لا
 * مالكًا — ضغط النشر.
 */

const made: { subscriptions: string[]; plans: string[] } = {
  subscriptions: [],
  plans: [],
};

afterAll(async () => {
  if (made.subscriptions.length > 0) {
    await db.subscription.deleteMany({ where: { id: { in: made.subscriptions } } });
  }
  if (made.plans.length > 0) await db.plan.deleteMany({ where: { id: { in: made.plans } } });
});

describe('اشتراك المعرض في محرك الاستحقاقات', () => {
  it('باقة المعرض تحكم عضوا بلا اشتراك شخصي', async () => {
    const member = await db.user.findFirstOrThrow({
      where: { dealerRole: { not: null }, dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = member.dealerId as string;

    /** **والافتراضيّ أوّلًا** — وإلّا لم نعرف أالمنعُ من الباقة أم من سواها. */
    const before = await sellingAllowance({ userId: member.id, dealerId });
    expect(before.types.AUCTION).toBe(true);

    const plan = await db.plan.create({
      data: {
        key: `test-no-auction-${String(Date.now()).slice(-8)}`,
        nameAr: 'باقة اختبار بلا مزاد',
        nameEn: 'Test plan without auctions',
        price: 0,
      },
      select: { id: true },
    });
    made.plans.push(plan.id);

    /** و`PlanEntitlement` مفتاحُه مركَّبٌ من الباقة والخاصّية — فيُحذف بحذفها. */
    await db.planEntitlement.create({
      data: { planId: plan.id, entitlementKey: 'can_auction', value: 'false' },
    });

    const subscription = await db.subscription.create({
      data: {
        dealerId,
        planId: plan.id,
        startsAt: new Date(Date.now() - 86_400_000),
        status: 'active',
      },
      select: { id: true },
    });
    made.subscriptions.push(subscription.id);

    /**
     * **والمعرضُ يغلب الشخص** — وهو الترتيبُ المعلَن: افتراضيٌّ ثمّ
     * باقةُ الشخص ثمّ باقةُ المعرض ثمّ التجاوز. والعضوُ هنا له اشتراكٌ
     * شخصيٌّ مزروع، فالفحصُ يقيس الغلبة لا الفراغ.
     */
    const personal = await db.subscription.findFirst({
      where: { userId: member.id, status: 'active' },
      include: { plan: { include: { entitlements: true } } },
    });
    const personalAllowsAuction =
      personal === null ||
      (personal.plan.entitlements.find((row) => row.entitlementKey === 'can_auction')?.value ??
        'true') !== 'false';
    /** ولو كانت باقتُه الشخصية تمنع المزاد أصلًا لما ميّز الفحصُ شيئًا. */
    expect(personalAllowsAuction).toBe(true);

    const after = await sellingAllowance({ userId: member.id, dealerId });
    expect(after.types.AUCTION).toBe(false);
    /** ولا تمسّ الباقةُ ما لم تمنحه. */
    expect(after.types.DIRECT).toBe(true);

    /** **وبلا تمرير المعرض يبقى الافتراضيّ** — فالسياقُ يُمرَّر لا يُستنتَج. */
    const withoutDealer = await resolveEntitlements({ userId: member.id });
    expect(withoutDealer['can_auction']).toBe(true);
  });
});
