import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { currentDeadlines } from './deadlines';

/**
 * ═══ سلاسل لوحة القيادة — A2 · A3 ═══
 *
 * **تُحسب من القاعدة لا تُزرع.** ورسمٌ بسلسلةٍ ثابتة يبدو حيًّا وهو
 * ميّت: يتحرّك في التصميم ولا يتحرّك في الإنتاج، ولا شيء يقول ذلك.
 *
 * ═══ والنطاق يعيد أرقامًا ومفاتيح ═══
 *
 * لا صياغة ولا أسماء شهور عربية (البوابة ١٧) — التسمية في الشاشة.
 */

export type DayPoint = { day: string; count: number };

/**
 * حجم الطلبات اليومي — **بصفٍّ لكل يوم حتى الأيّام الفارغة**.
 *
 * تجميعٌ بـ`groupBy` يُسقط الأيّام التي لا طلب فيها، فينكمش المحور
 * ويبدو شهرٌ نصفُه ساكن متّصلَ النشاط. واليوم الفارغ **معلومة**.
 */
export async function dailyOrders(days: number, now: Date = new Date()): Promise<DayPoint[]> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: DayPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    points.push({ day: key, count: counts.get(key) ?? 0 });
  }

  return points;
}

export type MonthPoint = { month: string; gmv: string; revenue: string };

/**
 * ‏GMV والإيراد شهريًّا — **والإيراد عمولتنا لا قيمة المركبات**.
 *
 * وخلطُهما يُنتج رسمًا يقول إننا نكسب أربعة عشر مليونًا شهريًّا.
 */
export async function monthlyGmv(months: number, now: Date = new Date()): Promise<MonthPoint[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start }, stage: { in: ['TRANSFER', 'DONE'] } },
    select: {
      createdAt: true,
      agreedPrice: true,
      settlementAmount: true,
      buyerCommission: true,
      sellerCommission: true,
      transferAdminFee: true,
    },
  });

  const buckets = new Map<string, { gmv: Prisma.Decimal; revenue: Prisma.Decimal }>();
  for (let i = 0; i < months; i += 1) {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.set(month.toISOString().slice(0, 7), {
      gmv: new Prisma.Decimal(0),
      revenue: new Prisma.Decimal(0),
    });
  }

  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket === undefined) continue;

    // القيمة المُسوّاة حين توجد — وتسويةٌ جزئية بعد نزاع تُنقصها
    bucket.gmv = bucket.gmv.plus(order.settlementAmount ?? order.agreedPrice);
    bucket.revenue = bucket.revenue
      .plus(order.buyerCommission)
      .plus(order.sellerCommission)
      .plus(order.transferAdminFee);
  }

  return [...buckets.entries()].map(([month, value]) => ({
    month,
    gmv: value.gmv.toFixed(2),
    revenue: value.revenue.toFixed(2),
  }));
}

export type StageTime = {
  key: string;
  /** الوسيط بالساعات — مقرَّبًا لعشرٍ، وعليه تُحسب الشارة */
  medianHours: number;
  targetHours: number;
  samples: number;
};

/** الوسيط — **لا المتوسّط**: صفقةٌ واحدة تعطّلت شهرًا تُفسد المتوسّط وحدها. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value * 10) / 10;
}

/**
 * أزمنة المراحل مقابل أهدافها.
 *
 * **والهدف من إعدادات المهل لا من رقمٍ مكتوب**: هدفٌ في الشيفرة ومهلةٌ
 * في الإعدادات يتباعدان، فيقول الرسم «ضمن الهدف» والنظام يُلغي الطلب.
 */
export async function stageTimes(now: Date = new Date()): Promise<StageTime[]> {
  const [settings, events] = await Promise.all([
    currentDeadlines(),
    db.orderEvent.findMany({
      where: {
        toStage: { not: null },
        createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
      },
      orderBy: { createdAt: 'asc' },
      select: { orderId: true, toStage: true, createdAt: true },
    }),
  ]);

  /**
   * زمن المرحلة = الفرق بين دخولها ودخول التالية. وطلبٌ ما زال فيها
   * **لا يُحسب**: زمنُه لم ينتهِ بعد، وإدخاله يجعل الوسيط يهبط كلّما
   * دخل طلبٌ جديد.
   */
  const byOrder = new Map<string, { stage: string; at: Date }[]>();
  for (const row of events) {
    if (row.toStage === null) continue;
    const list = byOrder.get(row.orderId) ?? [];
    list.push({ stage: row.toStage, at: row.createdAt });
    byOrder.set(row.orderId, list);
  }

  const durations = new Map<string, number[]>();
  for (const steps of byOrder.values()) {
    for (let i = 0; i < steps.length - 1; i += 1) {
      const from = steps[i];
      const to = steps[i + 1];
      if (from === undefined || to === undefined) continue;
      const hours = (to.at.getTime() - from.at.getTime()) / 3_600_000;
      const list = durations.get(from.stage) ?? [];
      list.push(hours);
      durations.set(from.stage, list);
    }
  }

  /**
   * **ولا يُرسم إلا ما له هدفٌ مضبوط.** التصميم يعرض ستّة صفوف منها
   * «مراجعة الإعلان» و«تنفيذ الفحص» — ولا مهلة مضبوطة لهما، فهدفُهما
   * سيكون رقمًا أخترعه هنا ويناقضه أوّل تغيير في الإعدادات.
   *
   * فالمرسوم أربعة: لكلٍّ مهلةٌ يقرؤها النظام ويُنفّذها.
   */
  const STAGES: readonly { key: string; stage: string; target: number }[] = [
    { key: 'approval', stage: 'REQUEST', target: settings.offerTtlHours },
    { key: 'payment', stage: 'PAYMENT', target: settings.paymentWindowHours },
    { key: 'transfer', stage: 'TRANSFER', target: settings.transferDeadlineDays * 24 },
    { key: 'release', stage: 'DONE', target: settings.settleWindowHours },
  ];

  return STAGES.map((stage) => {
    const values = durations.get(stage.stage) ?? [];
    return {
      key: stage.key,
      medianHours: median(values),
      targetHours: stage.target,
      samples: values.length,
    };
  });
}

export type ContentQuality = {
  uploadedImages: number;
  blurred: number;
  rejected: number;
  duplicates: number;
};

/**
 * جودة المحتوى — والقاعدة عدد الصور المرفوعة، معلَنةً تحت الأشرطة.
 *
 * **ومنذ الإطلاق لا هذا الشهر**: `ListingImage` بلا `createdAt`، وقصرُه
 * على الشهر يحتاج عمودًا جديدًا. وقولُ «هذا الشهر» على رقمٍ تراكميّ
 * كذبٌ في سطرٍ صغير — فالقاعدة تقول ما تقيسه.
 *
 * **والمرفوض `DRAFT` لا `REJECTED`**: لا حالة بهذا الاسم، والإعلان
 * المعاد إلى صاحبه يعود مسودّةً بـ`reviewedAt` مضبوطًا.
 */
export async function contentQuality(now: Date = new Date()): Promise<ContentQuality> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [uploaded, blurred, rejected, duplicates] = await Promise.all([
    db.listingImage.count(),
    db.listingImage.count({ where: { plateBlurred: true } }),
    db.listing.count({ where: { status: 'DRAFT', reviewedAt: { gte: monthStart } } }),
    db.listing.count({
      where: { reviewReason: 'DUPLICATE_IMAGE', reviewQueuedAt: { gte: monthStart } },
    }),
  ]);

  return { uploadedImages: uploaded, blurred, rejected, duplicates };
}

export type AuctionQuality = {
  total: number;
  metReserve: number;
  medianBids: number;
  medianExtensions: number;
  withdrawnAfterWin: number;
};

export async function auctionQuality(): Promise<AuctionQuality> {
  const auctions = await db.auction.findMany({
    where: { status: { in: ['ENDED_MET', 'ENDED_UNMET'] } },
    include: { _count: { select: { bids: true } } },
  });

  if (auctions.length === 0) {
    return { total: 0, metReserve: 0, medianBids: 0, medianExtensions: 0, withdrawnAfterWin: 0 };
  }

  const withdrawn = await db.deposit.count({ where: { status: 'FORFEITED' } });

  return {
    total: auctions.length,
    metReserve: auctions.filter((a) => a.status !== 'ENDED_UNMET').length,
    medianBids: median(auctions.map((a) => a._count.bids)),
    medianExtensions: median(auctions.map((a) => a.extendedCount)),
    withdrawnAfterWin: withdrawn,
  };
}
