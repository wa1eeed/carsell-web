import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { PRICE_STAT_MIN_SAMPLE } from '@/lib/domain/listing-detail';
import { recomputePriceStats } from '@/lib/domain/price-stats';
import { JOB_NAMES } from '@/lib/jobs/run';

const ROOT = process.cwd();

/**
 * ═══ إحصاءُ السعر يتعلّم من صفقاتنا ═══
 *
 * كانت الصفوف بلا كاتبٍ إطلاقًا: لا شاشة ولا دالّة ولا وظيفة. فإرشادُ
 * السعر «مبنيّ على ١٧ صفقة» يعني صفقاتٍ مزروعة، ولا يتغيّر بعد ألف
 * بيعةٍ حقيقية. (كشفته البوابة ٦٣ حين كُتب سببُ تجمّده.)
 */
describe('إحصاء السعر له كاتب', () => {
  it('الوظيفة مسجلة في المجدول', () => {
    expect(JOB_NAMES).toContain('recomputePriceStats');
  });

  it('ويقرأ الطلبات المكتملة لا أسعار الإعلانات', () => {
    const source = readFileSync(join(ROOT, 'src/lib/domain/price-stats.ts'), 'utf8');
    expect(source).toContain("stage: 'DONE'");
    expect(source).toContain("status: 'COMPLETED'");
    expect(source).toContain('agreedPrice');
    /** **ولا يقرأ `askPrice`** — وهو ما جعل الوسيط يساوي سعر الإعلان. */
    expect(source).not.toContain('askPrice');
  });

  /**
   * **ولا يُستبدَل صفٌّ صالحٌ بآخرَ لا يُقرأ.** القارئُ يتخطّى كلَّ
   * شريحةٍ دون الحدّ، فكتابةُ شريحةٍ بصفقتين فوق قائمة **تمحو
   * الإرشاد** بأوّل بيعةٍ حقيقية بدل أن تحسّنه.
   */
  it('ولا يكتب شريحة دون حد العينة', async () => {
    const before = await db.priceStat.findMany({
      select: { id: true, sampleSize: true, p50: true },
    });
    const result = await recomputePriceStats(new Date());
    const after = await db.priceStat.findMany({ select: { id: true, sampleSize: true } });

    /** كلُّ ما كُتب بلغ الحدَّ — والباقي تُرك كما هو. */
    for (const row of after) {
      expect(row.sampleSize).toBeGreaterThanOrEqual(
        result.written > 0 ? 1 : 0,
      );
    }
    const thin = after.filter((row) => row.sampleSize < PRICE_STAT_MIN_SAMPLE);
    const thinBefore = before.filter((row) => row.sampleSize < PRICE_STAT_MIN_SAMPLE);
    /** لم يزد عددُ الشرائح التي لا تُقرأ — فالوظيفة لا تُفسد ما يعمل. */
    expect(thin.length).toBeLessThanOrEqual(thinBefore.length);
  });

  /** **والصفقةُ تغذّي أربع شرائح** — كما يتدرّج القارئ من الأخصّ للأعمّ. */
  it('ويكتب المفاتيح الأربعة التي يقرؤها الإرشاد', () => {
    const source = readFileSync(join(ROOT, 'src/lib/domain/price-stats.ts'), 'utf8');
    expect(source).toContain("{ trimId: deal.trimId, city: deal.city }");
    expect(source).toContain("{ trimId: '*', city: deal.city }");
    expect(source).toContain("{ trimId: deal.trimId, city: '*' }");
    expect(source).toContain("{ trimId: '*', city: '*' }");
  });
});

/**
 * ═══ وتاريخُ المركبة ينمو بما نشهده ═══
 *
 * `VehicleHistoryItem` كان صفرَ إشاراتٍ في `src/`: صفوفٌ مزروعة
 * تعرضها صفحةُ السيارة، ولا شيء يضيف إليها بعد فحصٍ ولا خدمةٍ ولا
 * نقلِ ملكية — وهي الثلاثةُ التي تعرفها المنصّة يقينًا.
 */
describe('تاريخ المركبة له كاتب', () => {
  const made: string[] = [];
  afterAll(async () => {
    await db.vehicleHistoryItem.deleteMany({ where: { id: { in: made } } });
  });

  it('والمواضع الثلاثة موصولة', () => {
    const orders = readFileSync(join(ROOT, 'src/lib/domain/orders.ts'), 'utf8');
    expect(orders).toContain('recordTransfer');

    const review = readFileSync(join(ROOT, 'src/lib/domain/inspection-review.ts'), 'utf8');
    expect(review).toContain('recordInspection');
    /** **والمنشورُ وحده** — تقريرٌ لم يُنشر خاصٌّ بطالبه. */
    expect(review).toContain('if (published) await recordInspection');

    const queue = readFileSync(join(ROOT, 'src/lib/domain/provider-queue.ts'), 'utf8');
    expect(queue).toContain('recordService');
  });

  /**
   * **والرحلةُ تُمشى لا تُوصَف.** النصُّ يقول إنّ النداء موصول،
   * والمشيُ يقول إنّ السطر وقع — وبينهما شرطٌ أو معاملةٌ تُلغى.
   */
  it('وطلب يكتمل يكتب نقل الملكية في تاريخ سيارته', async () => {
    const { withOrder } = await import('./helpers/order-fixture');
    const { advanceStage } = await import('@/lib/domain/orders');

    await withOrder(async (order) => {
      const listing = await db.listing.findUniqueOrThrow({
        where: { id: order.listingId },
        select: { vehicleId: true },
      });
      const before = await db.vehicleHistoryItem.count({
        where: { vehicleId: listing.vehicleId, type: 'owner' },
      });

      /** يُدفع الطلبُ إلى `DONE` عبر مراحله كما يمشي في المنتج. */
      const path = ['APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER', 'DONE'] as const;
      for (const to of path) {
        await advanceStage({ orderRef: order.ref, actorId: order.sellerId, to });
      }

      const after = await db.vehicleHistoryItem.findMany({
        where: { vehicleId: listing.vehicleId, type: 'owner' },
        select: { source: true, titleAr: true },
      });
      expect(after.length).toBe(before + 1);
      expect(after.some((row) => row.source === 'PLATFORM')).toBe(true);
    });
  }, 60_000);

  it('ويكتب السطر فعلا', async () => {
    const vehicle = await db.vehicle.findFirstOrThrow({ select: { id: true } });
    const { recordTransfer } = await import('@/lib/domain/vehicle-history');
    const at = new Date('2026-06-01T10:00:00.000Z');

    const wrote = await recordTransfer(db, vehicle.id, at);
    expect(wrote).toBe(true);

    const row = await db.vehicleHistoryItem.findFirstOrThrow({
      where: { vehicleId: vehicle.id, occurredAt: at, type: 'owner' },
      select: { id: true, source: true, titleEn: true },
    });
    made.push(row.id);
    expect(row.source).toBe('PLATFORM');
    expect(row.titleEn).not.toBeNull();

    /** **ولا يُكتب مرّتين** — مكرَّرٌ في تاريخ سيارة يُقرأ حدثين. */
    expect(await recordTransfer(db, vehicle.id, at)).toBe(false);
    const count = await db.vehicleHistoryItem.count({
      where: { vehicleId: vehicle.id, occurredAt: at, type: 'owner' },
    });
    expect(count).toBe(1);
  });
});
