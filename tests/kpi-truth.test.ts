import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { growthKpis } from '@/lib/domain/admin-kpis';

/**
 * ═══ كلُّ مؤشّرٍ يُقابَل بحسابٍ مستقلّ ═══
 *
 * لوحة القيادة تُعرض على مستثمر، ورقمٌ فيها خطأ أسوأ من غيابه. و
 * `growthKpis` تجمع ستّةَ عشرَ مؤشّرًا من خمسة جداول — ولا شيء كان
 * يقول إنّ ما تعرضه هو ما في القاعدة.
 *
 * **والحساب هنا من جهةٍ أخرى**: `count` و`aggregate` مباشرةً على
 * الجداول، لا إعادةُ نداءٍ للدالّة نفسها. فاتّفاقُهما يقول شيئًا،
 * واختلافُهما يُسمّي المؤشّر.
 *
 * وقد وقع فعلًا: إعلانان بحالة `SOLD` بلا طلبٍ كانا يضخّمان «نسبة
 * البيع من المعروض» ببيعتين لم تقعا — ولا أحد يسأل عن مقام نسبة.
 */

afterAll(async () => {
  await db.$disconnect();
});

const REALISED = ['ACTIVE', 'COMPLETED'] as const;
const DAY = 86_400_000;

/** مدًى واسعٌ يغطّي البذرة كلّها — فالمقارنة على بياناتٍ لا على فراغ. */
const to = new Date();
const from = new Date(to.getTime() - 365 * DAY);

describe('═══ المؤشّرات تقول ما في القاعدة ═══', () => {
  it('حجم المبيعات والطلبات ومتوسّط الطلب متّسقة', async () => {
    const { kpis } = await growthKpis(from, to);

    const orders = await db.order.findMany({
      where: { createdAt: { gte: from, lt: to }, status: { in: [...REALISED] } },
      select: { totalAmount: true, commissionAmount: true },
    });

    const gmv = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const commission = orders.reduce((sum, o) => sum + Number(o.commissionAmount), 0);

    expect(kpis.orders.value).toBe(orders.length);
    expect(Math.round(kpis.gmv.value)).toBe(Math.round(gmv));

    /** **ومتوسّطٌ لا يساوي القسمة ليس متوسّطًا.** */
    if (orders.length > 0) {
      expect(Math.round(kpis.aov.value)).toBe(Math.round(gmv / orders.length));
      expect(kpis.aov.unknown).toBe(false);
    } else {
      expect(kpis.aov.unknown).toBe(true);
    }

    /** نسبة الأخذ = العمولة ÷ المبيعات — وبلا مبيعاتٍ «لا نعرف» لا صفر. */
    if (gmv > 0) {
      expect(kpis.takeRate.value).toBeCloseTo(commission / gmv, 6);
    } else {
      expect(kpis.takeRate.unknown).toBe(true);
    }
  });

  it('نسبة البيع من المعروض مقامُها المنشور وبسطُها المباع — وكلاهما في المدى', async () => {
    const { kpis } = await growthKpis(from, to);

    const published = await db.listing.count({ where: { publishedAt: { gte: from, lt: to } } });
    const sold = await db.listing.count({
      where: { status: 'SOLD', closedAt: { gte: from, lt: to } },
    });

    expect(kpis.newListings.value).toBe(published);
    if (published > 0) {
      expect(kpis.sellThrough.value).toBeCloseTo(sold / published, 6);
      /** **ولا تتجاوز الواحد**: بسطٌ أكبر من مقامه يعني بيعةً بلا معروض. */
      expect(kpis.sellThrough.value).toBeLessThanOrEqual(1);
    }
  });

  it('المشترون النشطون متمايزون لا مجموع طلبات', async () => {
    const { kpis } = await growthKpis(from, to);

    const rows = await db.order.findMany({
      where: { createdAt: { gte: from, lt: to }, status: { in: [...REALISED] } },
      select: { buyerId: true },
    });

    expect(kpis.activeBuyers.value).toBe(new Set(rows.map((r) => r.buyerId)).size);
    /** ولا يتجاوزون عدد الطلبات — مشترٍ واحد قد يطلب مرّتين، لا العكس. */
    expect(kpis.activeBuyers.value).toBeLessThanOrEqual(kpis.orders.value);
  });

  it('النسب كلّها بين صفرٍ وواحد، والمجهول لا يُعرض صفرًا', async () => {
    const { kpis } = await growthKpis(from, to);
    const RATIOS = ['takeRate', 'repeatRate', 'return90', 'offerToOrder', 'sellThrough'] as const;

    for (const key of RATIOS) {
      const kpi = kpis[key];
      if (kpi.unknown) {
        /** «لا نعرف» تُعرض «—»، والقيمة تحتها لا تُقرأ. */
        continue;
      }
      expect(kpi.value, key).toBeGreaterThanOrEqual(0);
      expect(kpi.value, key).toBeLessThanOrEqual(1);
    }
  });

  it('قمع الرحلة لا يخترع ما ليس في القاعدة', async () => {
    const { funnel } = await growthKpis(from, to);
    const by = new Map(funnel.map((step) => [step.key, step.count]));

    const customers = await db.user.count({ where: { createdAt: { gte: from, lt: to } } });
    const listings = await db.listing.count({ where: { publishedAt: { gte: from, lt: to } } });
    const offers = await db.offer.count({ where: { createdAt: { gte: from, lt: to } } });
    const bids = await db.bid.count({ where: { createdAt: { gte: from, lt: to } } });

    expect(by.get('customers')).toBe(customers);
    expect(by.get('listings')).toBe(listings);
    expect(by.get('offers')).toBe(offers + bids);
  });

  it('المدى السابق يُقاس بطولٍ مساوٍ — وإلّا كانت المقارنة كذبًا', async () => {
    /**
     * «+١٠٠٪» تُقرأ تضاعفًا. فإن كان المدى السابق أقصر فالارتفاع
     * من طول المدى لا من نموّ — **ورقمٌ يُعرض للمستثمر**.
     */
    const span = 30 * DAY;
    const now = new Date();
    const current = new Date(now.getTime() - span);
    const { kpis } = await growthKpis(current, now);

    const before = await db.order.count({
      where: {
        createdAt: { gte: new Date(current.getTime() - span), lt: current },
        status: { in: [...REALISED] },
      },
    });

    expect(kpis.orders.previous).toBe(before);
  });
});
