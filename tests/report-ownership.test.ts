import { readFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { findReportByListingRef, publishOnIssue } from '@/lib/domain/inspection';

/**
 * ═══ الدافع يملك التقرير — قرار المالك ٤ ═══
 *
 * > «تقرير البائع عامٌّ على الإعلان، وتقرير المشتري خاصٌّ به حتى
 * > يشاركه أو يشتريه البائع. والنشر يُضاف لاحقًا، والمنشور لا يُسترجَع.»
 *
 * وكان `findReportByListingRef` يُعيد **أيَّ** تقريرٍ على المركبة لكل
 * زائر: فمشترٍ دفع ليعرف حال سيارةٍ قبل شرائها ينشر ما اشتراه للبائع
 * ولمنافسيه. ولا خصوصيةَ لمن دفع، ولا سببَ لأحدٍ أن يدفع بعدها.
 */

const made: string[] = [];

afterEach(async () => {
  if (made.length > 0) {
    await db.inspectionReport.deleteMany({ where: { ref: { in: made } } });
    await db.serviceRequest.deleteMany({ where: { ref: { in: made } } });
    made.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

/** تقريرٌ على إعلانٍ منشور، بطالبٍ نختاره وحالِ نشرٍ نختاره. */
async function report(options: { byOwner: boolean; published: boolean }): Promise<{
  listingRef: string;
  requesterId: string;
  ownerId: string;
  reportRef: string;
}> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, ref: true, vehicleId: true, sellerId: true },
  });
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'INSPECTION' },
    select: { id: true },
  });
  const other = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    select: { id: true },
  });

  const requesterId = options.byOwner ? listing.sellerId : other.id;
  const ref = `SRV-OWN-${String(Date.now()).slice(-9)}`;
  made.push(ref);

  const request = await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: requesterId,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status: 'DONE',
      amount: 450,
    },
    select: { id: true },
  });

  await db.inspectionReport.create({
    data: {
      ref,
      serviceRequestId: request.id,
      vehicleId: listing.vehicleId,
      score: 80,
      inspectorName: 'م. اختبار',
      inspectedAt: new Date(),
      publishedAt: options.published ? new Date() : null,
      sections: [],
      paintMap: {},
    },
  });

  return { listingRef: listing.ref, requesterId, ownerId: listing.sellerId, reportRef: ref };
}

describe('من يرى تقرير الإعلان', () => {
  it('تقريرٌ خاصٌّ لا يراه الزائر — ولا البائع', async () => {
    const made = await report({ byOwner: false, published: false });

    const anonymous = await findReportByListingRef(made.listingRef, null);
    expect(anonymous?.ref).not.toBe(made.reportRef);

    /** **ولا صاحبُ المركبة**: دفعَه غيرُه، وملكيّةُ السيارة ليست ملكيّةَ التقرير. */
    const seller = await findReportByListingRef(made.listingRef, made.ownerId);
    expect(seller?.ref).not.toBe(made.reportRef);
  });

  it('ويراه دافعُه', async () => {
    const made = await report({ byOwner: false, published: false });
    const payer = await findReportByListingRef(made.listingRef, made.requesterId);
    expect(payer?.ref).toBe(made.reportRef);
  });

  it('والمنشورُ يراه كل زائر', async () => {
    const made = await report({ byOwner: true, published: true });
    const anonymous = await findReportByListingRef(made.listingRef, null);
    expect(anonymous?.ref).toBe(made.reportRef);
  });

  /**
   * **والأقربُ أوّلًا.** على مركبةٍ لها تقريرٌ منشورٌ وآخرُ خاصٌّ
   * بزائرها، يرى الزائر **تقريرَه هو** — فهو ما دفع ثمنه، وما اشتراه
   * أحدث من المعروض.
   */
  it('ومن له تقريرُه يرى تقريرَه لا تقرير غيره', async () => {
    const published = await report({ byOwner: true, published: true });
    const privateOne = await report({ byOwner: false, published: false });
    expect(privateOne.listingRef).toBe(published.listingRef);

    const payer = await findReportByListingRef(privateOne.listingRef, privateOne.requesterId);
    expect(payer?.ref).toBe(privateOne.reportRef);
  });
});

describe('قاعدةُ النشر عند الإصدار', () => {
  it('تقرير مالك المركبة يُنشر، وتقرير غيره لا', () => {
    expect(publishOnIssue('u1', 'u1')).toBe(true);
    expect(publishOnIssue('u2', 'u1')).toBe(false);
  });
});

/**
 * ═══ والزرع يحمل الحالَين ═══
 *
 * فما لا يُزرع لا يُرى: الحالُ الخاصّ لم يكن في الزرع قطّ، ولهذا بقي
 * الشرط غائبًا من الاستعلام بلا أن يكشفه أحد.
 */
describe('زرعُ تقريرٍ خاصّ', () => {
  it('البذرة تكتب تقريرًا بطالبٍ ليس مالك المركبة', () => {
    const seed = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
    expect(seed).toContain('INS-2026-41900');
    expect(seed).toContain('publishedAt: null');
  });
});
