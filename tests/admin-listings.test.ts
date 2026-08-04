import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decideReview, reviewQueue, reviewStats } from '@/lib/domain/admin-listings';
import { MIN_REVIEW_NOTE } from '@/lib/domain/review-rules';

/**
 * ═══ A15 — طابور مراجعة الإعلانات ═══
 *
 * قرار ٣٣ يُرشّح آليًّا إلى `PENDING_REVIEW`، **ولم تكن شاشة تقرأ
 * الطابور**: فإعلانٌ رُشّح يقف بلا نهاية، وصاحبه ينتظر شيئًا لن يقع.
 */

const stamp = String(Date.now()).slice(-9);
const TAG = `REV${stamp}`;
const T0 = new Date('2026-08-01T10:00:00Z');
const ADMIN = { adminId: `adm${stamp}`, ip: null, canSuspend: true };

let sellerId: string;
const listingIds: string[] = [];
const vehicleIds: string[] = [];

async function queued(
  key: string,
  reason: 'DUPLICATE_IMAGE' | 'PRICE_OUTLIER' | 'NEW_ACCOUNT_BURST' | 'USER_REPORT',
  minutesAgo = 30,
): Promise<string> {
  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2020,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 80_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  vehicleIds.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `${TAG}-${key}`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
      status: 'PENDING_REVIEW', askPrice: 40_000, city: 'الرياض',
      reviewReason: reason,
      reviewQueuedAt: new Date(T0.getTime() - minutesAgo * 60_000),
    },
  });
  listingIds.push(listing.id);
  return listing.ref;
}

function mine<T extends { ref: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.ref.startsWith(TAG));
}

beforeEach(async () => {
  const seller = await db.user.create({ data: { phone: `+96656${stamp}` } });
  sellerId = seller.id;
});

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { startsWith: TAG } } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  await db.user.deleteMany({ where: { id: sellerId } });
  listingIds.length = 0;
  vehicleIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('reviewQueue — الأقدم أوّلًا', () => {
  it('يرتّب بالانتظار لا بالإضافة', async () => {
    await queued('NEW', 'USER_REPORT', 5);
    await queued('OLD', 'USER_REPORT', 90);

    const rows = mine(await reviewQueue(null, T0));
    expect(rows.map((row) => row.ref)).toEqual([`${TAG}-OLD`, `${TAG}-NEW`]);
    expect(rows[0]?.waitingMinutes).toBe(90);
  });

  it('والتصفية بالسبب تُخرج غيره', async () => {
    await queued('D', 'DUPLICATE_IMAGE');
    await queued('P', 'PRICE_OUTLIER');

    expect(mine(await reviewQueue('PRICE_OUTLIER', T0)).map((r) => r.ref)).toEqual([`${TAG}-P`]);
  });

  /**
   * **الدليل بياناتٌ لا جُملًا** — البوابة ١٧. والشاشة تصوغ «تطابق
   * ٩٤٪»، والنطاق يعطي الرقم والمرجع فقط.
   */
  it('الدليل أرقامٌ ومفاتيح، ولا حرف عربيّ فيه', async () => {
    await queued('N', 'NEW_ACCOUNT_BURST');
    const row = mine(await reviewQueue(null, T0))[0];

    expect(row?.evidence.kind).toBe('NEW_ACCOUNT_BURST');
    expect(JSON.stringify(row?.evidence)).not.toMatch(/[؀-ۿ]/);
  });
});

describe('decideReview — القرارات الثلاثة', () => {
  it('الاعتماد ينشر ويمحو الراية', async () => {
    const ref = await queued('A', 'DUPLICATE_IMAGE');

    const result = await decideReview({ ref, decision: 'APPROVE', note: null, ...ADMIN }, T0);
    expect(result.ok).toBe(true);

    const after = await db.listing.findUniqueOrThrow({ where: { ref } });
    expect(after.status).toBe('PUBLISHED');
    // الراية تُمحى — وإلّا عاد إلى الطابور عند أوّل قراءة
    expect(after.reviewReason).toBeNull();
    expect(mine(await reviewQueue(null, T0))).toEqual([]);
  });

  /**
   * **الإرجاع بلا ملاحظة إرجاعٌ صامت**: يجد البائع عمله مردودًا ولا
   * يعرف ماذا يُصلح، فيعيد نشره كما هو فيعود — ودورةٌ لا تنتهي.
   */
  it('الإرجاع يشترط ملاحظةً ويحفظها للبائع', async () => {
    const ref = await queued('R', 'PRICE_OUTLIER');

    const short = await decideReview(
      { ref, decision: 'RETURN', note: 'لا', ...ADMIN },
      T0,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('NOTE_REQUIRED');
    // ولم يتحرّك: الرفض قبل كل كتابة
    expect((await db.listing.findUniqueOrThrow({ where: { ref } })).status).toBe('PENDING_REVIEW');

    const note = 'ا'.repeat(MIN_REVIEW_NOTE + 5);
    const done = await decideReview({ ref, decision: 'RETURN', note, ...ADMIN }, T0);
    expect(done.ok).toBe(true);

    const after = await db.listing.findUniqueOrThrow({ where: { ref } });
    expect(after.status).toBe('DRAFT');
    expect(after.reviewNote).toBe(note);
    expect(after.reviewedBy).toBe(ADMIN.adminId);
  });

  it('الرفض يوقف الحساب — ولمن يملك الصلاحية وحده', async () => {
    const ref = await queued('X', 'USER_REPORT');
    const note = 'ب'.repeat(MIN_REVIEW_NOTE + 5);

    const denied = await decideReview(
      { ref, decision: 'REJECT', note, ...ADMIN, canSuspend: false },
      T0,
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('SUSPEND_NOT_ALLOWED');

    const allowed = await decideReview({ ref, decision: 'REJECT', note, ...ADMIN }, T0);
    expect(allowed.ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: sellerId } })).status).toBe('SUSPENDED');
  });

  /** مراجعان يفتحان الصفّ نفسه — والثاني يُخبَر أن غيره سبقه. */
  it('القرار مرّتين: الثانية تُردّ لا تُعيد التنفيذ', async () => {
    const ref = await queued('T', 'DUPLICATE_IMAGE');
    await decideReview({ ref, decision: 'APPROVE', note: null, ...ADMIN }, T0);

    const again = await decideReview({ ref, decision: 'APPROVE', note: null, ...ADMIN }, T0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('NOT_IN_QUEUE');
  });

  it('وكل قرار يكتب AuditLog', async () => {
    const ref = await queued('L', 'DUPLICATE_IMAGE');
    await decideReview({ ref, decision: 'APPROVE', note: null, ...ADMIN }, T0);

    const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: ref } });
    expect(entry.action).toBe('listing.review.approve');
    expect(entry.actorType).toBe('admin');
  });
});

describe('reviewStats — عدّادات الشاشة', () => {
  it('الطابور وأقدمه وتوزيعه بالسبب', async () => {
    await queued('S1', 'DUPLICATE_IMAGE', 20);
    await queued('S2', 'DUPLICATE_IMAGE', 70);
    await queued('S3', 'USER_REPORT', 10);

    const stats = await reviewStats(T0);
    expect(stats.queued).toBeGreaterThanOrEqual(3);
    expect(stats.byReason.DUPLICATE_IMAGE).toBeGreaterThanOrEqual(2);
    expect(stats.oldestMinutes).toBeGreaterThanOrEqual(70);
  });
});
