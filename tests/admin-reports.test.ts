import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decideReport, reportQueue, reportStats } from '@/lib/domain/admin-reports';
import { MIN_REPORT_NOTE } from '@/lib/domain/report-rules';
import { fileReport } from '@/lib/domain/offer-inbox';

/**
 * ═══ A17 — طابور البلاغات ═══
 *
 * البلاغ يُنشأ منذ بُنيت شاشة الإبلاغ، **ولم تكن شاشة تقرؤه**: فمن
 * أبلغ عن احتيالٍ يجد صمتًا، وقرار ٣٣ يَعِد بمراجعةٍ بشرية لا يقوم
 * بها أحد ما لم يرَ أحدٌ الطابور.
 */

const stamp = String(Date.now()).slice(-9);
const T0 = new Date('2026-08-02T12:00:00Z');
const ADMIN = { adminId: `adm${stamp}`, ip: null };

let sellerId: string;
let reporterId: string;
let listingId: string;
let vehicleId: string;
const reportRefs: string[] = [];

beforeEach(async () => {
  const [seller, reporter] = await Promise.all([
    db.user.create({ data: { phone: `+96657${stamp}` } }),
    db.user.create({ data: { phone: `+96658${stamp}` } }),
  ]);
  sellerId = seller.id;
  reporterId = reporter.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2019,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 90_000, colorExterior: 'بنّي', spec: 'SAUDI',
      condition: 'USED', city: 'جدة', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `RPTL${stamp}`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
      status: 'PUBLISHED', askPrice: 30_000, city: 'جدة', publishedAt: T0,
    },
  });
  listingId = listing.id;
});

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { in: reportRefs } } });
  await db.report.deleteMany({ where: { targetId: { in: [listingId] } } });
  await db.report.deleteMany({ where: { reporterId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, reporterId] } } });
  reportRefs.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

async function report(): Promise<string> {
  const result = await fileReport(
    { reporterId, targetType: 'listing', targetId: listingId, reason: 'fraud', details: 'قياس' },
    T0,
  );
  if (!result.ok) throw new Error(`لم يُنشأ البلاغ: ${result.reason}`);
  reportRefs.push(result.ref);
  return result.ref;
}

describe('reportQueue — الطابور', () => {
  it('البلاغ الجديد يظهر بمرجعه وهدفه', async () => {
    const ref = await report();
    const row = (await reportQueue('open', T0)).find((r) => r.ref === ref);

    expect(row).toBeDefined();
    expect(row?.reason).toBe('fraud');
    expect(row?.targetTitle).not.toBeNull();
    // المرجع يُقتبَس في مكالمة — والمعرّف الداخليّ لا
    expect(ref).toMatch(/^RPT-\d{4}-\d{4}$/);
  });

  /**
   * قرار ٥: نقرةٌ واحدة تُزيل إعلان منافس أرخص من أي إعلان مدفوع.
   * فالعدد هو ما يُقرَّر عليه لا البلاغ المفرد.
   */
  it('ويقول كم بلاغًا على الهدف نفسه', async () => {
    const ref = await report();
    const row = (await reportQueue('open', T0)).find((r) => r.ref === ref);
    expect(row?.siblingCount).toBeGreaterThanOrEqual(1);
  });
});

describe('decideReport — الحسم', () => {
  it('الإحالة تُدخل الإعلان طابور المراجعة', async () => {
    const ref = await report();

    const result = await decideReport({ ref, action: 'REVIEW_LISTING', note: null, ...ADMIN }, T0);
    expect(result.ok).toBe(true);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('PENDING_REVIEW');
    expect(listing.reviewReason).toBe('USER_REPORT');
    // ولحظة الدخول مكتوبة — وبدونها لا يُقاس انتظار صاحبه
    expect(listing.reviewQueuedAt).not.toBeNull();
  });

  /** بلاغٌ يُصرف بلا سبب مكتوب يُعاد فتحه بعد شهر ولا أحد يذكر لماذا. */
  it('صرْف النظر يشترط ملاحظة', async () => {
    const ref = await report();

    const short = await decideReport({ ref, action: 'DISMISS', note: 'لا', ...ADMIN }, T0);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('NOTE_REQUIRED');

    const done = await decideReport(
      { ref, action: 'DISMISS', note: 'ن'.repeat(MIN_REPORT_NOTE + 3), ...ADMIN },
      T0,
    );
    expect(done.ok && done.status).toBe('dismissed');
  });

  it('والمحسوم لا يُحسم مرّتين', async () => {
    const ref = await report();
    const note = 'ن'.repeat(MIN_REPORT_NOTE + 3);
    await decideReport({ ref, action: 'DISMISS', note, ...ADMIN }, T0);

    const again = await decideReport({ ref, action: 'DISMISS', note, ...ADMIN }, T0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_CLOSED');
  });

  it('وكل حسم يكتب AuditLog', async () => {
    const ref = await report();
    await decideReport({ ref, action: 'REVIEW_LISTING', note: null, ...ADMIN }, T0);

    const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: ref } });
    expect(entry.action).toBe('report.review_listing');
    expect(entry.entity).toBe('Report');
  });
});

describe('reportStats', () => {
  it('يعدّ المفتوح ويقول أقدمه', async () => {
    await report();
    const stats = await reportStats(T0);

    expect(stats.open).toBeGreaterThanOrEqual(1);
    expect(stats.byReason.some((row) => row.reason === 'fraud')).toBe(true);
  });
});
