import { db } from '@/lib/db';

/**
 * ═══ مؤشرات النمو — ولكل رقم مصدر ═══
 *
 * لوحة القيادة كانت تجيب «كم» و«ما ينتظرني». وما يسأل عنه مستثمر أو
 * مدير نمو شيء آخر: **هل يعود العميل؟ وكم يساوي؟ وأين يتسرب في
 * الرحلة؟**
 *
 * ═══ وما لا مصدر له لا يُعرض ═══
 *
 * **لا جداول زيارات في المخطط**، فلا زوار فريدون ولا جلسات ولا معدل
 * ارتداد ولا مصادر زيارة. وبطاقة بصفر تُقرأ «لا أحد يزورنا» لا «لا
 * نقيس هذا» — والفرق بينهما قرار استثماري.
 *
 * و`Listing.viewCount` **عداد تراكمي بلا تاريخ**، فمنه إجمالي مشاهدات
 * ولا منه مشاهدات فترة. فما يُقاس بالفترة يُقاس من `createdAt`:
 * الحسابات والإعلانات والعروض والمزايدات والطلبات.
 */

export type KpiKey =
  | 'gmv' | 'orders' | 'aov' | 'takeRate'
  | 'newCustomers' | 'activeBuyers' | 'repeatRate' | 'ordersPerBuyer'
  | 'timeToFirstOrder' | 'return90' | 'buyerLifespan'
  | 'offerToOrder' | 'sellThrough' | 'daysToSell'
  | 'newListings' | 'offers';

export type Kpi = {
  key: KpiKey;
  /** القيمة جاهزة للعرض — والصياغة في الشاشة، والرقم هنا. */
  value: number;
  /** المدى السابق المساوي — `null` حين لا معنى للمقارنة. */
  previous: number | null;
  /** `null` حين لا بسط ولا مقام — ولا تُقرأ صفرًا. */
  unknown: boolean;
};

const DAY = 24 * 3600 * 1000;
const REALISED = ['ACTIVE', 'COMPLETED'] as const;

/** قسمة بمقام قد يكون صفرًا — و«لا نعرف» غير «صفر». */
function ratio(top: number, bottom: number): { value: number; unknown: boolean } {
  if (bottom === 0) return { value: 0, unknown: true };
  return { value: top / bottom, unknown: false };
}

function median(values: readonly number[]): { value: number; unknown: boolean } {
  if (values.length === 0) return { value: 0, unknown: true };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  /**
   * **والوسيط لا المتوسط** في الأزمنة: عميل واحد سجل قبل سنة واشترى
   * اليوم يرفع المتوسط شهورًا ويخفي أن أغلبهم يشترون في أسبوع.
   */
  return {
    value:
      sorted.length % 2 === 0
        ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
        : (sorted[mid] ?? 0),
    unknown: false,
  };
}

type Range = { from: Date; to: Date };

async function window(range: Range) {
  const { from, to } = range;
  const period = { gte: from, lt: to };

  const [newCustomers, newListings, offers, bids, orders, soldListings, publishedListings] =
    await Promise.all([
      db.user.count({ where: { createdAt: period } }),
      db.listing.count({ where: { publishedAt: period } }),
      db.offer.count({ where: { createdAt: period } }),
      db.bid.count({ where: { createdAt: period } }),
      db.order.findMany({
        where: { createdAt: period, status: { in: [...REALISED] } },
        select: {
          buyerId: true,
          totalAmount: true,
          commissionAmount: true,
          createdAt: true,
          source: true,
          listing: { select: { publishedAt: true } },
        },
      }),
      db.listing.count({ where: { status: 'SOLD', closedAt: period } }),
      db.listing.count({ where: { publishedAt: period } }),
    ]);

  const gmv = orders.reduce((total, order) => total + Number(order.totalAmount), 0);
  const commission = orders.reduce((total, order) => total + Number(order.commissionAmount), 0);

  return { newCustomers, newListings, offers, bids, orders, soldListings, publishedListings, gmv, commission };
}

export type KpiSet = {
  kpis: Record<KpiKey, Kpi>;
  /** قمع الرحلة — خطوة فخطوة بعددها في المدى. */
  funnel: { key: string; count: number }[];
};

export async function growthKpis(from: Date, to: Date): Promise<KpiSet> {
  const span = to.getTime() - from.getTime();
  const [now, before] = await Promise.all([
    window({ from, to }),
    window({ from: new Date(from.getTime() - span), to: from }),
  ]);

  /**
   * ═══ التكرار والعودة يُقاسان على التاريخ كله ═══
   *
   * «أيعود المشتري؟» سؤال عن سلوك لا عن فترة: حصره في ثلاثين يومًا
   * يجعل كل مشتر جديد «غير متكرر» بحكم الوقت لا بحكم السلوك.
   */
  const buyers = await db.order.groupBy({
    by: ['buyerId'],
    where: { status: { in: [...REALISED] } },
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });

  const repeat = buyers.filter((row) => row._count._all > 1);
  const repeatRate = ratio(repeat.length, buyers.length);
  const ordersPerBuyer = ratio(
    buyers.reduce((total, row) => total + row._count._all, 0),
    buyers.length,
  );

  /** عمر المشتري النشط — من أول طلب إلى آخره، وللمتكررين وحدهم. */
  const lifespan = median(
    repeat
      .map((row) =>
        row._max.createdAt === null || row._min.createdAt === null
          ? 0
          : (row._max.createdAt.getTime() - row._min.createdAt.getTime()) / DAY,
      )
      .filter((days) => days > 0),
  );

  /**
   * **ونسبة العودة تُسأل عمّن أُتيح له أن يعود.** مشتر اشترى أمس لم
   * تمر عليه تسعون يومًا، فعدّه «لم يعد» يخلط من رفض بمن لم يُسأل.
   */
  const matured = buyers.filter(
    (row) => row._min.createdAt !== null && row._min.createdAt.getTime() < Date.now() - 90 * DAY,
  );
  const returned = matured.filter(
    (row) =>
      row._max.createdAt !== null &&
      row._min.createdAt !== null &&
      row._max.createdAt.getTime() - row._min.createdAt.getTime() <= 90 * DAY &&
      row._count._all > 1,
  );
  const return90 = ratio(returned.length, matured.length);

  /** الوقت حتى أول شراء — من إنشاء الحساب إلى أول طلب. */
  const firstOrders = await db.user.findMany({
    where: { ordersAsBuyer: { some: { status: { in: [...REALISED] } } } },
    select: {
      createdAt: true,
      ordersAsBuyer: {
        where: { status: { in: [...REALISED] } },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  const timeToFirst = median(
    firstOrders
      .map((user) => {
        const first = user.ordersAsBuyer[0]?.createdAt;
        return first === undefined ? -1 : (first.getTime() - user.createdAt.getTime()) / DAY;
      })
      .filter((days) => days >= 0),
  );

  /** وقت البيع — من نشر الإعلان إلى الطلب الذي باعه. */
  const daysToSell = median(
    now.orders
      .map((order) =>
        order.listing.publishedAt === null
          ? -1
          : (order.createdAt.getTime() - order.listing.publishedAt.getTime()) / DAY,
      )
      .filter((days) => days >= 0),
  );

  const aov = ratio(now.gmv, now.orders.length);
  const aovBefore = ratio(before.gmv, before.orders.length);
  const takeRate = ratio(now.commission, now.gmv);
  const takeBefore = ratio(before.commission, before.gmv);
  const offerToOrder = ratio(now.orders.length, now.offers + now.bids);
  const offerToOrderBefore = ratio(before.orders.length, before.offers + before.bids);
  const sellThrough = ratio(now.soldListings, now.publishedListings);
  const sellBefore = ratio(before.soldListings, before.publishedListings);

  const plain = (value: number, previous: number | null): Omit<Kpi, 'key'> => ({
    value,
    previous,
    unknown: false,
  });

  const kpis: Record<KpiKey, Kpi> = {
    gmv: { key: 'gmv', ...plain(now.gmv, before.gmv) },
    orders: { key: 'orders', ...plain(now.orders.length, before.orders.length) },
    aov: { key: 'aov', value: aov.value, previous: aovBefore.unknown ? null : aovBefore.value, unknown: aov.unknown },
    takeRate: { key: 'takeRate', value: takeRate.value, previous: takeBefore.unknown ? null : takeBefore.value, unknown: takeRate.unknown },
    newCustomers: { key: 'newCustomers', ...plain(now.newCustomers, before.newCustomers) },
    newListings: { key: 'newListings', ...plain(now.newListings, before.newListings) },
    offers: { key: 'offers', ...plain(now.offers + now.bids, before.offers + before.bids) },
    activeBuyers: { key: 'activeBuyers', ...plain(new Set(now.orders.map((o) => o.buyerId)).size, new Set(before.orders.map((o) => o.buyerId)).size) },
    repeatRate: { key: 'repeatRate', value: repeatRate.value, previous: null, unknown: repeatRate.unknown },
    ordersPerBuyer: { key: 'ordersPerBuyer', value: ordersPerBuyer.value, previous: null, unknown: ordersPerBuyer.unknown },
    timeToFirstOrder: { key: 'timeToFirstOrder', value: timeToFirst.value, previous: null, unknown: timeToFirst.unknown },
    return90: { key: 'return90', value: return90.value, previous: null, unknown: return90.unknown },
    buyerLifespan: { key: 'buyerLifespan', value: lifespan.value, previous: null, unknown: lifespan.unknown },
    offerToOrder: { key: 'offerToOrder', value: offerToOrder.value, previous: offerToOrderBefore.unknown ? null : offerToOrderBefore.value, unknown: offerToOrder.unknown },
    sellThrough: { key: 'sellThrough', value: sellThrough.value, previous: sellBefore.unknown ? null : sellBefore.value, unknown: sellThrough.unknown },
    daysToSell: { key: 'daysToSell', value: daysToSell.value, previous: null, unknown: daysToSell.unknown },
  };

  return {
    kpis,
    funnel: [
      { key: 'customers', count: now.newCustomers },
      { key: 'listings', count: now.newListings },
      { key: 'offers', count: now.offers + now.bids },
      { key: 'orders', count: now.orders.length },
      { key: 'sold', count: now.soldListings },
    ],
  };
}
