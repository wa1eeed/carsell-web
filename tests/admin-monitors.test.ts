import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  auctionCounts,
  auctionMonitor,
  listingCounts,
  offerCounts,
  offerMonitor,
} from '@/lib/domain/admin-monitors';

/**
 * ═══ شاشات المراقبة — A16 · A22 · A23 · A27 ═══
 *
 * ما يُحرَس هنا ليس العرض بل **الفرز**: مزادٌ حالتُه `LIVE` وقد انقضى
 * وقتُه ليس جاريًا، وعرضٌ `PENDING` فاتت مهلتُه ليس نشطًا. والوظيفة
 * الدورية تمرّ كل خمس دقائق — فبين مرورين تعرض شاشةٌ تقرأ الحالة
 * وحدها **عددًا يكذب**.
 *
 * وهو الصنف نفسه الذي وقع في صفحة المزاد العامّة: «مباشر» وعدّاد وزرّ
 * مفعَّل، والخادم يردّ «انتهى المزاد».
 */

const stamp = String(Date.now()).slice(-9);
const NOW = new Date('2026-08-04T12:00:00Z');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const ahead = (ms: number): Date => new Date(NOW.getTime() + ms);

let sellerId: string;
let buyerId: string;
let listingId: string;
let vehicleId: string;
let auctionId: string | null = null;

beforeEach(async () => {
  const [seller, buyer] = await Promise.all([
    db.user.create({ data: { phone: `+96661${stamp}` } }),
    db.user.create({ data: { phone: `+96662${stamp}` } }),
  ]);
  sellerId = seller.id;
  buyerId = buyer.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2022,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 30_000, colorExterior: 'أحمر', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `MON${stamp}`, vehicleId: vehicle.id, sellerId, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: 100_000, city: 'الرياض', publishedAt: ago(86_400_000),
    },
  });
  listingId = listing.id;
});

afterEach(async () => {
  if (auctionId !== null) {
    await db.bid.deleteMany({ where: { auctionId } });
    await db.auction.deleteMany({ where: { id: auctionId } });
    auctionId = null;
  }
  await db.offer.deleteMany({ where: { listingId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('auctionMonitor — الحالة والوقت معًا', () => {
  /**
   * **مزادٌ `LIVE` انقضى وقتُه ليس جاريًا.** والوظيفة تمرّ كل خمس
   * دقائق، فعدُّه في «جارية» يجعل الشاشة تقول ما يردّ الخادم بنقيضه.
   */
  it('المنتهي وقتُه لا يُعدّ جاريًا وإن بقيت حالته LIVE', async () => {
    const auction = await db.auction.create({
      data: {
        listingId, status: 'LIVE',
        startsAt: ago(7_200_000), endsAt: ago(600_000),
        startPrice: 50_000, reservePrice: 90_000, bidIncrement: 500, depositAmount: 2_000,
      },
    });
    auctionId = auction.id;

    const live = await auctionMonitor('live', NOW);
    expect(live.map((row) => row.listingRef)).not.toContain(`MON${stamp}`);

    const counts = await auctionCounts(NOW);
    const all = await auctionMonitor(null, NOW);
    const mine = all.find((row) => row.listingRef === `MON${stamp}`);
    // ويُعرض في «الكل» بعدّادٍ سالب — لا يُخفى
    expect(mine?.secondsLeft).toBeLessThan(0);
    expect(counts.live).toBeGreaterThanOrEqual(0);
  });

  it('والاحتياطي لا يخرج — يخرج بلوغُه', async () => {
    const auction = await db.auction.create({
      data: {
        listingId, status: 'LIVE',
        startsAt: ago(3_600_000), endsAt: ahead(3_600_000),
        startPrice: 50_000, reservePrice: 90_000, bidIncrement: 500, depositAmount: 2_000,
      },
    });
    auctionId = auction.id;
    await db.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount: 60_000 } });

    const row = (await auctionMonitor('live', NOW)).find((r) => r.listingRef === `MON${stamp}`);
    expect(row?.reserveMet).toBe(false);
    expect(JSON.stringify(row)).not.toContain('90000');
  });

  /** تسع عشرة مزايدة من ثلاثة أشخاص سوقٌ ضيّق، ومن تسعة عشر سوقٌ حيّ. */
  it('ويعدّ المزايدين لا المزايدات', async () => {
    const auction = await db.auction.create({
      data: {
        listingId, status: 'LIVE',
        startsAt: ago(3_600_000), endsAt: ahead(3_600_000),
        startPrice: 50_000, reservePrice: 200_000, bidIncrement: 500, depositAmount: 2_000,
      },
    });
    auctionId = auction.id;
    // ثلاث مزايدات من مزايدٍ واحد
    for (const amount of [60_000, 61_000, 62_000]) {
      await db.bid.create({ data: { auctionId: auction.id, bidderId: buyerId, amount } });
    }

    const row = (await auctionMonitor('live', NOW)).find((r) => r.listingRef === `MON${stamp}`);
    expect(row?.bidCount).toBe(3);
    expect(row?.bidderCount).toBe(1);
  });
});

describe('offerMonitor — النشط ليس الحالة وحدها', () => {
  it('عرضٌ PENDING فاتت مهلته لا يُعدّ نشطًا', async () => {
    await db.offer.create({
      data: {
        listingId, buyerId, amount: 80_000, status: 'PENDING',
        createdAt: ago(172_800_000), expiresAt: ago(3_600_000),
      },
    });

    const active = await offerMonitor('active', NOW);
    expect(active.filter((row) => row.listingRef === `MON${stamp}`)).toEqual([]);

    // ويُعرض في «الكل» موسومًا بانقضاء مهلته — لا يُخفى
    const all = await offerMonitor(null, NOW);
    expect(all.find((row) => row.listingRef === `MON${stamp}`)?.lapsed).toBe(true);
  });

  it('والقائم يُعدّ', async () => {
    await db.offer.create({
      data: {
        listingId, buyerId, amount: 80_000, status: 'PENDING',
        createdAt: ago(3_600_000), expiresAt: ahead(86_400_000),
      },
    });

    const active = await offerMonitor('active', NOW);
    expect(active.map((row) => row.listingRef)).toContain(`MON${stamp}`);
  });

  it('ونسبة القبول من العروض التي نظر فيها البائع', async () => {
    const counts = await offerCounts(NOW);
    expect(counts.acceptancePct).toBeGreaterThanOrEqual(0);
    expect(counts.acceptancePct).toBeLessThanOrEqual(100);
  });
});

describe('listingCounts', () => {
  it('يجمع الحالات ويحسب نصيب النشط', async () => {
    const counts = await listingCounts();
    expect(counts.total).toBeGreaterThanOrEqual(1);
    expect(counts.activeSharePct).toBeGreaterThanOrEqual(0);
    expect(counts.activeSharePct).toBeLessThanOrEqual(100);
  });
});
