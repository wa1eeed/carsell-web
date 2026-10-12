import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  auctionTimeline,
  dealerTimeline,
  offerTimeline,
  reportTimeline,
  userTimeline,
} from '@/lib/domain/admin-entity-timelines';
import { orderTimeline } from '@/lib/domain/admin-order-timeline';
import { TIMELINE_LABEL } from '@/lib/labels/timeline';

/**
 * ═══ خطوطُ الزمن ═══
 *
 * تحرس ثلاثًا: **الترتيب** (الأقدم أوّلًا في كلِّها، فالقصّة تُقرأ من
 * بدايتها)، و**الصياغة** (كلُّ مفتاحٍ يُنتجه خطٌّ له تسمية — وإلّا
 * عُرض خامًا في جملةٍ عربية)، و**الخصوصية** (لا هويّة مزايد).
 */

const stamp = String(Date.now()).slice(-9);
const T0 = new Date('2026-03-01T08:00:00Z');

let buyerId: string;
let sellerId: string;
let listingId: string;
const listingRef = `TLN${stamp}`;
let vehicleId: string;
let offerId: string;

beforeAll(async () => {
  const [buyer, seller] = await Promise.all([
    db.user.create({ data: { phone: `+9665401${stamp}`, name: 'مشترٍ الخطّ' } }),
    db.user.create({ data: { phone: `+9665402${stamp}`, name: 'بائع الخطّ' } }),
  ]);
  buyerId = buyer.id;
  sellerId = seller.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId,
      brandId: model.brandId,
      modelId: model.id,
      brandName: model.brand.nameAr,
      modelName: model.nameAr,
      year: 2021,
      bodyType: 'SEDAN',
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      drivetrain: 'FWD',
      seats: 5,
      mileageKm: 55_000,
      colorExterior: 'أسود',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'جدة',
      entryMode: 'MANUAL',
    },
    select: { id: true },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: listingRef,
      vehicleId,
      sellerId,
      type: 'NEGOTIATION',
      status: 'PUBLISHED',
      askPrice: 75_000,
      negotiable: true,
      city: 'جدة',
      publishedAt: T0,
    },
    select: { id: true },
  });
  listingId = listing.id;

  const offer = await db.offer.create({
    data: {
      listingId,
      buyerId,
      amount: 70_000,
      status: 'PENDING',
      autoRejected: false,
      expiresAt: new Date(T0.getTime() + 48 * 3600 * 1000),
      createdAt: new Date(T0.getTime() + 3600 * 1000),
    },
    select: { id: true },
  });
  offerId = offer.id;
});

afterAll(async () => {
  await db.offer.deleteMany({ where: { listingId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  await db.$disconnect();
});

describe('خطوطُ الزمن', () => {
  it('كلُّها الأقدم أوّلًا', async () => {
    const lines = await Promise.all([
      userTimeline(sellerId),
      userTimeline(buyerId),
      offerTimeline(offerId),
    ]);

    for (const events of lines) {
      const times = events.map((event) => event.at);
      expect([...times].sort((a, b) => a.localeCompare(b))).toEqual(times);
    }
  });

  it('خطُّ العميل يدمج حسابَه وإعلاناتِه وعروضَه', async () => {
    const seller = await userTimeline(sellerId);
    const buyer = await userTimeline(buyerId);

    expect(seller.some((event) => event.kind === 'user.joined')).toBe(true);
    expect(seller.some((event) => event.kind === 'listing.published')).toBe(true);
    expect(buyer.some((event) => event.kind === 'offer.PENDING')).toBe(true);
  });

  it('خطُّ العرض يحمل سلسلة التفاوض كلَّها', async () => {
    await db.offer.create({
      data: {
        listingId,
        buyerId,
        amount: 72_000,
        status: 'COUNTERED',
        autoRejected: false,
        expiresAt: new Date(T0.getTime() + 72 * 3600 * 1000),
        createdAt: new Date(T0.getTime() + 7200 * 1000),
      },
    });

    const events = await offerTimeline(offerId);
    /* المقابلُ عرضٌ آخر لا حقلٌ في الأوّل — فالسلسلة تُقرأ من عروض الإعلان */
    expect(events.filter((event) => event.kind.startsWith('offer.')).length).toBeGreaterThanOrEqual(2);
  });

  it('ولا يُكشف مزايدٌ في خطّ المزاد', async () => {
    const auction = await db.auction.findFirst({ select: { listing: { select: { ref: true } } } });
    if (auction === null) return;

    const events = await auctionTimeline(auction.listing.ref);
    const bids = events.filter((event) => event.kind === 'auction.bid');
    /* القاعدة ٨ — ولا في اللوحة */
    expect(bids.every((event) => event.actor === null)).toBe(true);
  });

  it('وكلُّ مفتاحٍ يُنتجه خطٌّ له تسمية', async () => {
    const auction = await db.auction.findFirst({ select: { listing: { select: { ref: true } } } });
    const order = await db.order.findFirst({ select: { ref: true } });
    const dealer = await db.dealer.findFirst({ select: { id: true } });
    const report = await db.report.findFirst({ select: { ref: true } });

    const batches = await Promise.all([
      userTimeline(sellerId),
      userTimeline(buyerId),
      offerTimeline(offerId),
      auction === null ? [] : auctionTimeline(auction.listing.ref),
      order === null ? [] : orderTimeline(order.ref),
      dealer === null ? [] : dealerTimeline(dealer.id),
      report === null ? [] : reportTimeline(report.ref),
    ]);

    /**
     * **وأثرُ الأدمن يُستثنى**: مفاتيحه من `AuditLog` وتسميتُها في
     * `AUDIT_ACTION_LABEL`، والخام منها مقصودٌ — سجلٌّ يُقرأ في تحقيق
     * وغموضُه أسوأ من قبحه.
     */
    const produced = new Set(
      batches
        .flat()
        .filter((event) => event.actor !== 'admin')
        .map((event) => event.kind),
    );

    const unlabelled = [...produced].filter((key) => TIMELINE_LABEL[key] === undefined);
    expect(unlabelled).toEqual([]);
  });

  it('ولا شيء لما لا وجود له', async () => {
    expect(await userTimeline('لا-وجود-له')).toEqual([]);
    expect(await offerTimeline('لا-وجود-له')).toEqual([]);
    expect(await reportTimeline('لا-وجود-له')).toEqual([]);
  });
});
