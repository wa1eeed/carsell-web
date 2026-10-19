import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { PRICE_STAT_MIN_SAMPLE } from './listing-detail';

/**
 * ═══ إحصاءُ السعر — وكان بلا كاتبٍ إطلاقًا ═══
 *
 * إرشادُ السعر الذي يقرؤه البائع («مبنيّ على ١٧ صفقة») يُحسب من صفوف
 * `PriceStat`، **ولا شيء كان يكتبها**: لا شاشة، ولا دالّة نطاق، ولا
 * وظيفةٌ في `src/lib/jobs/run.ts` (قِيس ٢٠٢٦-١٠-١٩). فالعددُ يعني
 * صفقاتٍ **مزروعة**، وكان سيعني ذلك بعد ألف بيعةٍ حقيقية.
 *
 * ═══ والمصدرُ صفقاتٌ مكتملة لا أسعارُ طلبنا ═══
 *
 * وهو ما قالته البذرةُ نفسُها يوم كُتبت: «ووسيطُ السوق في الحقيقة من
 * صفقاتٍ مكتملة، لا من أسعار طلبنا». والسببُ مقيس: أكثرُ طرازٍ-سنة له
 * إعلانٌ واحد، **فالوسيطُ يساوي سعرَ ذلك الإعلان بالضبط** وتقول
 * الشاشة «عند متوسّط السوق» لكلّ سيارة — مؤشّرٌ بُني ليقول «أقلّ
 * بسبعة آلاف» فلا يقول شيئًا أبدًا.
 *
 * فالمصدرُ هنا `agreedPrice` لطلباتٍ بلغت `DONE`: ما دُفع فعلًا.
 */

/** الشرائحُ كما يقرؤها `priceStatFor` — عشرةُ آلاف كيلومتر. */
const BUCKET_STEP = 10;

const bucketOf = (mileageKm: number): number =>
  Math.round(mileageKm / 1000 / BUCKET_STEP) * BUCKET_STEP;

/**
 * المئينُ بالاستيفاء الخطّي — **ولا يُقرَّب إلى عضوٍ بعينه**: عيّنةٌ
 * من ثمانيةٍ تجعل `p90` سعرَ أغلى صفقةٍ حرفيًّا، فيُقرأ حدًّا للسوق
 * وهو صفقةٌ واحدة.
 */
function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 1) return sorted[0] ?? 0;
  const at = (sorted.length - 1) * ratio;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  const lowValue = sorted[low] ?? 0;
  if (low === high) return lowValue;
  return lowValue + ((sorted[high] ?? 0) - lowValue) * (at - low);
}

const median = (sorted: readonly number[]): number => percentile(sorted, 0.5);

type Deal = {
  modelId: string;
  trimId: string;
  city: string;
  year: number;
  bucket: number;
  price: number;
  /** أيامُ البيع — من النشر إلى الاكتمال، و`null` لما لم يُنشر. */
  days: number | null;
};

/** المفتاحُ الرباعيّ الذي يتدرّج فيه القارئ — من الأخصّ إلى الأعمّ. */
function keysOf(deal: Deal): { trimId: string; city: string }[] {
  return [
    { trimId: deal.trimId, city: deal.city },
    { trimId: '*', city: deal.city },
    { trimId: deal.trimId, city: '*' },
    { trimId: '*', city: '*' },
  ];
}

export type RecomputeResult = { written: number; skipped: number; deals: number };

export async function recomputePriceStats(now: Date = new Date()): Promise<RecomputeResult> {
  const orders = await db.order.findMany({
    where: { stage: 'DONE', status: 'COMPLETED' },
    select: {
      agreedPrice: true,
      /**
       * **ولحظةُ الاكتمال `stageEnteredAt` لا `createdAt`.** الأوّل
       * يتصفّر عند كل انتقال، فهو في `DONE` وقتُ دخولها — وهو ما
       * يُقاس منه «أيامُ البيع». و`createdAt` وقتُ فتح الطلب.
       */
      stageEnteredAt: true,
      listing: {
        select: {
          city: true,
          publishedAt: true,
          vehicle: {
            select: { modelId: true, trimId: true, year: true, mileageKm: true },
          },
        },
      },
    },
  });

  const deals: Deal[] = orders.map((order) => {
    const published = order.listing.publishedAt;
    return {
      modelId: order.listing.vehicle.modelId,
      trimId: order.listing.vehicle.trimId ?? '*',
      city: order.listing.city,
      year: order.listing.vehicle.year,
      bucket: bucketOf(order.listing.vehicle.mileageKm),
      price: Number(order.agreedPrice),
      days:
        published === null
          ? null
          : Math.max(
              0,
              Math.round((order.stageEnteredAt.getTime() - published.getTime()) / 86_400_000),
            ),
    };
  });

  /** تجميعٌ على المفاتيح الأربعة — فصفقةٌ واحدة تغذّي أربع شرائح. */
  const groups = new Map<string, { deal: Deal; prices: number[]; days: number[] }>();
  for (const deal of deals) {
    for (const key of keysOf(deal)) {
      const id = [deal.modelId, deal.year, key.trimId, deal.bucket, key.city].join('|');
      const group = groups.get(id) ?? { deal: { ...deal, ...key }, prices: [], days: [] };
      group.prices.push(deal.price);
      if (deal.days !== null) group.days.push(deal.days);
      groups.set(id, group);
    }
  }

  let written = 0;
  let skipped = 0;

  for (const group of groups.values()) {
    /**
     * ═══ ولا يُستبدَل صفٌّ صالحٌ بآخرَ لا يُقرأ ═══
     *
     * القارئُ يتخطّى كلَّ شريحةٍ عيّنتُها دون `PRICE_STAT_MIN_SAMPLE`.
     * فلو كُتبت شريحةٌ بصفقتين فوق شريحةٍ قائمة **لاختفى الإرشاد**
     * بأوّل بيعةٍ حقيقية بدل أن يتحسّن — والبائعُ يرى مؤشّرًا يعمل
     * اليوم ولا يعمل غدًا بلا سبب يراه.
     */
    if (group.prices.length < PRICE_STAT_MIN_SAMPLE) {
      skipped += 1;
      continue;
    }

    const prices = [...group.prices].sort((a, b) => a - b);
    const days = [...group.days].sort((a, b) => a - b);
    const money = (ratio: number): Prisma.Decimal =>
      new Prisma.Decimal(percentile(prices, ratio).toFixed(2));

    const where = {
      modelId_year_trimId_mileageBucket_city: {
        modelId: group.deal.modelId,
        year: group.deal.year,
        trimId: group.deal.trimId,
        mileageBucket: group.deal.bucket,
        city: group.deal.city,
      },
    };
    const values = {
      p10: money(0.1),
      p25: money(0.25),
      p50: money(0.5),
      p75: money(0.75),
      p90: money(0.9),
      sampleSize: prices.length,
      daysToSellMedian: days.length === 0 ? null : Math.round(median(days)),
      computedAt: now,
    };

    await db.priceStat.upsert({
      where,
      update: values,
      create: { ...where.modelId_year_trimId_mileageBucket_city, ...values },
    });
    written += 1;
  }

  return { written, skipped, deals: deals.length };
}
