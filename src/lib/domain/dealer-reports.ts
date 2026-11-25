import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { OrderSource } from '@/generated/prisma/enums';

/**
 * ═══ تقاريرُ المعرض — `D11` ═══
 *
 * **وما يُقاس هو ما يُسجَّل.** يرسم الترميزُ ثلاث لوحات، ولنا بياناتُ
 * اثنتين ونصف:
 *
 * · **المبيعات حسب الماركة** — من الطلبات المكتملة، كاملة.
 * · **مصدر الطلب** — الترميزُ يريد **السطح** الذي جاء منه (نتائج
 *   البحث · صفحة المعرض · الرئيسية)، **ولا إسنادَ لذلك في المنتج**:
 *   لا مُحيلَ يُخزَّن ولا حملةَ تُنسب. والمخزَّن `OrderSource` —
 *   **الآليّة** لا السطح (مباشر · عرض · مزاد · شراء فوري). فيُعرض ما
 *   نملكه باسمه الصحيح، ولا يُخترع سطحٌ من آليّة.
 * · **قمع التحويل** — أربع مراحل لا خمس: «مشاهدة الإعلان» و«فتح
 *   التفاصيل» حدثٌ واحد عندنا (`Listing.viewCount`)، وفصلُهما يحتاج
 *   تتبّعًا لم يُبنَ. **ومرحلةٌ مخترَعة تُنتج تسرّبًا وهميًّا** يُرسل
 *   صاحبَه يصلح ما ليس معطوبًا.
 */
function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

export type BrandSales = {
  brand: string;
  deals: number;
  /** مجموعُ ما بيع — بالهللات. */
  total: string;
};

export type SourceShare = { source: OrderSource; orders: number };

export type Funnel = {
  views: number;
  engaged: number;
  orders: number;
  completed: number;
};

export async function dealerReports(
  dealerId: string,
  branchId: string | null,
): Promise<{ brands: BrandSales[]; sources: SourceShare[]; funnel: Funnel }> {
  const mine = { listing: { vehicle: scope(dealerId, branchId) } };

  const [completed, allOrders, listings, offers, bids] = await Promise.all([
    db.order.findMany({
      where: { ...mine, status: 'COMPLETED' },
      select: {
        agreedPrice: true, settlementAmount: true,
        listing: { select: { vehicle: { select: { brand: { select: { nameAr: true } } } } } },
      },
    }),
    db.order.groupBy({ by: ['source'], where: mine, _count: { _all: true } }),
    db.listing.findMany({
      where: { vehicle: scope(dealerId, branchId) },
      select: { id: true, viewCount: true },
    }),
    db.offer.count({ where: mine }),
    db.bid.count({ where: { auction: { listing: { vehicle: scope(dealerId, branchId) } } } }),
  ]);

  const byBrand = new Map<string, { deals: number; total: Prisma.Decimal }>();
  for (const order of completed) {
    const brand = order.listing.vehicle.brand.nameAr;
    const found = byBrand.get(brand) ?? { deals: 0, total: new Prisma.Decimal(0) };
    found.deals += 1;
    found.total = found.total.plus(order.settlementAmount ?? order.agreedPrice);
    byBrand.set(brand, found);
  }

  const brands = [...byBrand.entries()]
    .map(([brand, value]) => ({ brand, deals: value.deals, total: value.total.toFixed(2) }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  const orders = allOrders.reduce((sum, row) => sum + row._count._all, 0);

  return {
    brands,
    sources: allOrders
      .map((row) => ({ source: row.source, orders: row._count._all }))
      .sort((a, b) => b.orders - a.orders),
    funnel: {
      views: listings.reduce((sum, listing) => sum + listing.viewCount, 0),
      /** **والتفاعلُ عرضٌ أو مزايدة** — كلاهما خطوةٌ واحدة في القمع. */
      engaged: offers + bids,
      orders,
      completed: completed.length,
    },
  };
}
