import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { activityCounts, activityStream } from '@/lib/domain/admin-activity';
import { listingTimeline } from '@/lib/domain/admin-listing-timeline';

/**
 * ═══ مجرى النشاط ═══
 *
 * يحرس ثلاثًا: **الدمج** (كلُّ مصدرٍ يصل المجرى)، و**الترتيب**
 * (الأحدث أوّلًا)، و**الرفض التلقائيّ** — وكان فرعًا ميّتًا: `REJECTED`
 * ومعها رايةٌ، لا حالةٌ اسمها `AUTO_REJECTED` في التعداد.
 */

const stamp = String(Date.now()).slice(-9);

let buyerId: string;
let sellerId: string;
let listingId: string;
let listingRef: string;
let vehicleId: string;

beforeAll(async () => {
  const [buyer, seller] = await Promise.all([
    db.user.create({ data: { phone: `+9665301${stamp}`, name: 'مشترٍ النشاط' } }),
    db.user.create({ data: { phone: `+9665302${stamp}`, name: 'بائع النشاط' } }),
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
      year: 2022,
      bodyType: 'SEDAN',
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      drivetrain: 'FWD',
      seats: 5,
      mileageKm: 40_000,
      colorExterior: 'أبيض',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'الرياض',
      entryMode: 'MANUAL',
    },
    select: { id: true },
  });
  vehicleId = vehicle.id;

  listingRef = `ACT${stamp}`;
  const listing = await db.listing.create({
    data: {
      ref: listingRef,
      vehicleId,
      sellerId,
      type: 'NEGOTIATION',
      askPrice: 90_000,
      city: 'الرياض',
      status: 'PUBLISHED',
      negotiable: true,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  listingId = listing.id;

  const later = new Date(Date.now() + 48 * 3600 * 1000);
  await db.offer.createMany({
    data: [
      { listingId, buyerId, amount: 70_000, status: 'REJECTED', autoRejected: true, expiresAt: later },
      { listingId, buyerId, amount: 88_000, status: 'PENDING', autoRejected: false, expiresAt: later },
    ],
  });
});

afterAll(async () => {
  /* ما يصنعه الاختبار يحذفه — والإشعارات تتبع المستخدم بـCascade */
  await db.offer.deleteMany({ where: { listingId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  await db.$disconnect();
});

describe('مجرى النشاط', () => {
  it('يدمج المصادر ويرتّب الأحدث أوّلًا', async () => {
    const events = await activityStream({ limit: 200 });

    expect(events.length).toBeGreaterThan(0);

    const times = events.map((event) => event.at);
    expect([...times].sort((a, b) => b.localeCompare(a))).toEqual(times);

    /* إعلانُنا وعروضُه كلاهما في المجرى — فالدمج يقع لا نوعٌ واحد */
    expect(events.some((event) => event.kind === 'listing' && event.subject === listingRef)).toBe(true);
    expect(events.some((event) => event.kind === 'offer' && event.subject === listingRef)).toBe(true);
  });

  it('يميّز الرفض التلقائيّ عن رفض البائع', async () => {
    const events = await activityStream({ kind: 'offer', limit: 200 });
    const ours = events.filter((event) => event.subject === listingRef);

    /*
      **`OfferStatus` ليس فيها `AUTO_REJECTED`** — بل `REJECTED` ورايةٌ.
      فمفتاحٌ مبنيٌّ من الحالة وحدها لا يُنتجه أبدًا، والتسمية «رُفض
      تلقائيًّا — دون الحدّ» تبقى بلا كاتب.
    */
    expect(ours.some((event) => event.key === 'offer.AUTO_REJECTED')).toBe(true);
    expect(ours.some((event) => event.key === 'offer.PENDING')).toBe(true);
  });

  it('وخطّ زمن الإعلان يميّزه كذلك', async () => {
    const events = await listingTimeline(listingRef);
    expect(events.some((event) => event.kind === 'offer.AUTO_REJECTED')).toBe(true);
  });

  it('يضيّق على نوعٍ واحد', async () => {
    const offers = await activityStream({ kind: 'offer', limit: 50 });
    expect(offers.every((event) => event.kind === 'offer')).toBe(true);
  });

  it('والمؤشّر زمنٌ — فالصفحة التالية أقدم', async () => {
    const first = await activityStream({ limit: 5 });
    expect(first.length).toBe(5);

    const next = await activityStream({ limit: 5, before: new Date(first[4]!.at) });
    for (const event of next) {
      expect(event.at.localeCompare(first[4]!.at)).toBeLessThan(0);
    }
  });

  it('والعدّ من القاعدة لا من الصفحة المقصوصة', async () => {
    const counts = await activityCounts(new Date(Date.now() - 24 * 3600 * 1000));

    /* صفحةٌ حدُّها خمسة لا تجعل العدّ خمسة */
    const page = await activityStream({ limit: 5 });
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

    expect(page.length).toBe(5);
    expect(total).toBeGreaterThanOrEqual(page.length);
    expect(counts.offer).toBeGreaterThan(0);
  });

  it('والمرجع يُعرض ولا يُكشف مزايدٌ', async () => {
    const bids = await activityStream({ kind: 'auction', limit: 20 });
    /* القاعدة ٨: هويّة المزايد لا تُكشف — ولا في اللوحة */
    expect(bids.every((event) => event.actor === null)).toBe(true);
  });
});
