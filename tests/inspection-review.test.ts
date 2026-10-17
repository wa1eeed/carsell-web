import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { draftView, ensureDraft, saveDraftResult } from '@/lib/domain/inspection-draft';
import {
  approveInspection,
  returnInspection,
  submitInspection,
} from '@/lib/domain/inspection-review';
import type { AdminUser, ServiceProvider } from '@/generated/prisma/client';

/**
 * ═══ الرحلةُ تُمشى إلى آخرها لا إلى أوّل نجاح ═══
 *
 * تُملأ المسودّة، وتُرسَل فتُجمَّد، وتُعاد بملاحظة، وتُرسَل ثانيةً،
 * وتُعتمد فيخرج التقرير — ويُفحص نشرُه بقرار المالك ٤ لا بقرار المراجع.
 */

let inspector: ServiceProvider;
let admin: AdminUser;
const refs: string[] = [];

beforeAll(async () => {
  inspector = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'INSPECTION' },
    orderBy: { id: 'asc' },
  });
  admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
});

afterEach(async () => {
  if (refs.length === 0) return;
  const rows = await db.serviceRequest.findMany({
    where: { ref: { in: refs } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  /** **وأثرٌ جديد يُضاف إلى الاستعادة** — صار الاعتمادُ يُصدر تقريرًا. */
  await db.inspectionReport.deleteMany({ where: { serviceRequestId: { in: ids } } });
  await db.inspectionDraft.deleteMany({ where: { serviceRequestId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { entity: 'InspectionDraft' } });
  await db.serviceRequest.deleteMany({ where: { id: { in: ids } } });
  refs.length = 0;
});

/** يُنشئ طلبًا — و`byOwner` يحدّد أيُّ القرارين ينطبق على النشر. */
async function request(byOwner: boolean): Promise<string> {
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'INSPECTION' },
    select: { id: true },
  });
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const vehicle = await db.vehicle.findUniqueOrThrow({
    where: { id: listing.vehicleId },
    select: { ownerId: true },
  });
  const other = await db.user.findFirstOrThrow({
    where: { id: { not: vehicle.ownerId }, role: 'USER' },
    select: { id: true },
  });

  const ref = `SRV-R-${String(Date.now()).slice(-9)}${String(refs.length)}`;
  refs.push(ref);
  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: byOwner ? vehicle.ownerId : other.id,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status: 'IN_PROGRESS',
      providerId: inspector.id,
      amount: 575,
      adminFee: 50,
      vatAmount: 75,
      city: 'الرياض',
    },
  });
  return ref;
}

/** يملأ البنود كلَّها — و`faults` يجعل أوّلَ بندٍ حرجٍ عطلًا. */
async function fill(ref: string, options: { criticalFails?: boolean } = {}): Promise<void> {
  await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
  const view = await draftView(ref, inspector.id);
  if (view === null) throw new Error('لا مسودّة');

  for (const category of view.categories) {
    for (const item of category.items) {
      const fail = options.criticalFails === true && item.isCritical;
      await saveDraftResult({
        ref,
        providerId: inspector.id,
        itemId: item.id,
        state: fail ? 'MAJOR' : 'PASS',
        value: null,
        note: fail ? 'آثارُ لحامٍ ظاهرة' : null,
      });
    }
  }
}

describe('الإرسالُ لا يقع قبل الاكتمال', () => {
  it('مسودّةٌ ناقصة تُردّ بعدد ما بقي', async () => {
    const ref = await request(true);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });

    const result = await submitInspection({ ref, providerId: inspector.id });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INCOMPLETE');
      /** **والناقصُ بعدده** — «غير مكتمل» لا تقول للفاحص أين يعود. */
      expect(result.missing).toBe(210);
    }
  });

  it('والمكتملةُ تُرسَل وتُجمَّد لقطةً', async () => {
    const ref = await request(true);
    await fill(ref);

    const result = await submitInspection({ ref, providerId: inspector.id });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBe(100);

    const draft = await db.inspectionDraft.findFirstOrThrow({
      where: { serviceRequest: { ref } },
      select: { status: true, frozenScore: true, frozenSections: true },
    });
    expect(draft.status).toBe('SUBMITTED');
    expect(draft.frozenScore).toBe(100);
    expect(draft.frozenSections).not.toBeNull();
  });

  it('والمُرسَلةُ لا يعدّلها الفاحص', async () => {
    const ref = await request(true);
    await fill(ref);
    await submitInspection({ ref, providerId: inspector.id });

    const view = await draftView(ref, inspector.id);
    expect(view?.editable).toBe(false);
  });
});

describe('والمراجعةُ تُعيد أو تعتمد', () => {
  it('الإعادةُ تحتاج ملاحظةً وتُرجعها للفاحص', async () => {
    const ref = await request(true);
    await fill(ref);
    await submitInspection({ ref, providerId: inspector.id });
    const draft = await db.inspectionDraft.findFirstOrThrow({
      where: { serviceRequest: { ref } },
      select: { id: true },
    });

    const bare = await returnInspection({
      draftId: draft.id, adminId: admin.id, note: 'قصير', ip: null,
    });
    expect(bare.ok).toBe(false);

    const sent = await returnInspection({
      draftId: draft.id, adminId: admin.id,
      note: 'صورةُ المحرّك غير واضحة — أعِد تصويرها',
      ip: null,
    });
    expect(sent.ok).toBe(true);

    const view = await draftView(ref, inspector.id);
    expect(view?.editable).toBe(true);
    expect(view?.returnNote).toContain('صورةُ المحرّك');
  });

  it('والاعتمادُ يُصدر تقريرًا بمرجعه ودرجته', async () => {
    const ref = await request(true);
    await fill(ref);
    await submitInspection({ ref, providerId: inspector.id });
    const draft = await db.inspectionDraft.findFirstOrThrow({
      where: { serviceRequest: { ref } },
      select: { id: true },
    });

    const result = await approveInspection({ draftId: draft.id, adminId: admin.id, ip: null });
    expect(result.ok).toBe(true);

    const report = await db.inspectionReport.findFirstOrThrow({
      where: { serviceRequest: { ref } },
      select: { ref: true, score: true, publishedAt: true, inspectorName: true },
    });
    expect(report.ref.startsWith('INS-')).toBe(true);
    expect(report.score).toBe(100);
    expect(report.inspectorName).toBe(inspector.nameAr);
  });

  /**
   * **والنشرُ قرار المالك ٤ لا قرار المراجع**: تقريرُ البائع عامٌّ على
   * الإعلان، وتقريرُ المشتري خاصٌّ به حتى يشاركه.
   */
  it('وتقريرُ صاحب المركبة يُنشر، وتقريرُ غيره لا', async () => {
    const mine = await request(true);
    await fill(mine);
    await submitInspection({ ref: mine, providerId: inspector.id });
    const a = await db.inspectionDraft.findFirstOrThrow({
      where: { serviceRequest: { ref: mine } }, select: { id: true },
    });
    await approveInspection({ draftId: a.id, adminId: admin.id, ip: null });

    const theirs = await request(false);
    await fill(theirs);
    await submitInspection({ ref: theirs, providerId: inspector.id });
    const b = await db.inspectionDraft.findFirstOrThrow({
      where: { serviceRequest: { ref: theirs } }, select: { id: true },
    });
    await approveInspection({ draftId: b.id, adminId: admin.id, ip: null });

    const owner = await db.inspectionReport.findFirstOrThrow({
      where: { serviceRequest: { ref: mine } }, select: { publishedAt: true },
    });
    const buyer = await db.inspectionReport.findFirstOrThrow({
      where: { serviceRequest: { ref: theirs } }, select: { publishedAt: true },
    });
    expect(owner.publishedAt).not.toBeNull();
    expect(buyer.publishedAt).toBeNull();
  });

  /** **والبندُ الحرج يَسِم ويَسقف** — وتُحفظ وسمتُه في اللقطة. */
  it('وعطلٌ حرج يُسقف التقدير ويُوسَم', async () => {
    const ref = await request(true);
    await fill(ref, { criticalFails: true });

    const result = await submitInspection({ ref, providerId: inspector.id });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flagged).toBe(true);
      expect(result.grade).toBe('FAIR');
      /** والدرجةُ تبقى عالية — فمئتان وثلاثةُ بنودٍ سليمة حقيقةٌ تُقال. */
      expect(result.score).toBeGreaterThan(80);
    }
  });
});
