import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  draftView,
  ensureDraft,
  saveDraftHeader,
  saveDraftPanel,
  saveDraftResult,
} from '@/lib/domain/inspection-draft';
import type { ServiceProvider } from '@/generated/prisma/client';

/**
 * ═══ الحراسةُ في الخادم لا في القائمة ═══
 *
 * المواصفة تُلزم بذلك صراحةً، والقاعدةُ عندنا مكتوبة: **حارسٌ في
 * العميل ليس حارسًا**. فهذه تقيس الثلاثة — النوع، والملكيّة، وحالَ
 * المسودّة — ولا تكتفي بأنّ القائمة تُخفي الزرّ.
 */

let inspector: ServiceProvider;
let stranger: ServiceProvider;
const refs: string[] = [];

beforeAll(async () => {
  inspector = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'INSPECTION' },
    orderBy: { id: 'asc' },
  });
  stranger = await db.serviceProvider.findFirstOrThrow({
    where: { type: { not: 'INSPECTION' } },
    orderBy: { id: 'asc' },
  });
});

afterEach(async () => {
  if (refs.length === 0) return;
  const rows = await db.serviceRequest.findMany({
    where: { ref: { in: refs } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  /** **وما يُكتب بالمسودّة يُحذف بها** — والأبناءُ بالسلسلة. */
  await db.inspectionDraft.deleteMany({ where: { serviceRequestId: { in: ids } } });
  await db.serviceRequest.deleteMany({ where: { id: { in: ids } } });
  refs.length = 0;
});

async function paidRequest(providerId: string | null): Promise<string> {
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'INSPECTION' },
    select: { id: true },
  });
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    select: { id: true },
  });

  const ref = `SRV-I-${String(Date.now()).slice(-9)}${String(refs.length)}`;
  refs.push(ref);
  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: buyer.id,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status: 'IN_PROGRESS',
      providerId,
      amount: 575,
      adminFee: 50,
      vatAmount: 75,
      city: 'الرياض',
    },
  });
  return ref;
}

describe('من يفتح مسودّةَ الفحص', () => {
  it('الفاحصُ يفتحها، وتُنشأ مرّةً واحدة', async () => {
    const ref = await paidRequest(inspector.id);

    const first = await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    expect(first.ok).toBe(true);

    const second = await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.draftId).toBe(first.draftId);
  });

  /** **ومزوّدٌ ليس فاحصًا لا يراها** — ولو أُسند إليه الطلب بخطأ إداريّ. */
  it('ومزوّدٌ من نوعٍ آخر يُمنع بـ NOT_INSPECTOR', async () => {
    const ref = await paidRequest(stranger.id);
    const gate = await ensureDraft({ ref, providerId: stranger.id, providerUserId: null });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('NOT_INSPECTOR');
  });

  /** **ولا بابَ خلفيًّا** — مرجعٌ مخمَّن لا يفتح طلبَ فاحصٍ آخر. */
  it('وفاحصٌ لا شأن له بالطلب يُمنع بـ NOT_YOURS', async () => {
    const ref = await paidRequest(null);
    const gate = await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('NOT_YOURS');
  });

  it('والمُرسَلةُ لا يعدّلها الفاحص', async () => {
    const ref = await paidRequest(inspector.id);
    const gate = await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    if (!gate.ok) throw new Error(gate.reason);

    await db.inspectionDraft.update({
      where: { id: gate.draftId },
      data: { status: 'SUBMITTED' },
    });

    const again = await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('NOT_EDITABLE');
  });
});

describe('والمسودّةُ تُعرض ببنود القالب لا بالأجوبة', () => {
  it('البنودُ كلُّها تظهر قبل أن يُجاب واحد', async () => {
    const ref = await paidRequest(inspector.id);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });

    const view = await draftView(ref, inspector.id);
    expect(view).not.toBeNull();
    expect(view?.total).toBe(210);
    expect(view?.answered).toBe(0);
    expect(view?.categories.length).toBe(6);
    /** وبندٌ لم يُجَب يظهر بحالٍ فارغة — وإلّا لم يعرف الفاحصُ ما بقي. */
    expect(view?.categories[0]?.items[0]?.state).toBeNull();
  });

  it('والجوابُ يرفع العدّاد ويظهر في العرض', async () => {
    const ref = await paidRequest(inspector.id);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    const before = await draftView(ref, inspector.id);
    const item = before?.categories[0]?.items[0];
    if (item === undefined) throw new Error('لا بنود');

    const saved = await saveDraftResult({
      ref,
      providerId: inspector.id,
      itemId: item.id,
      state: 'PASS',
      value: null,
      note: null,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.answered).toBe(1);

    const after = await draftView(ref, inspector.id);
    expect(after?.categories[0]?.items[0]?.state).toBe('PASS');
    expect(after?.categories[0]?.answered).toBe(1);
  });

  /**
   * **والملاحظةُ إلزاميّةٌ مع الملاحظة والعطل** (المواصفة): «فيه شيء»
   * بلا بيانٍ تقريرٌ لا يُصلحه قارئُه بعد شهر.
   */
  it('و«ملاحظة» بلا نصٍّ تُرفض', async () => {
    const ref = await paidRequest(inspector.id);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });
    const view = await draftView(ref, inspector.id);
    const item = view?.categories[0]?.items[0];
    if (item === undefined) throw new Error('لا بنود');

    const bare = await saveDraftResult({
      ref,
      providerId: inspector.id,
      itemId: item.id,
      state: 'MINOR',
      value: null,
      note: '   ',
    });
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.reason).toBe('NOTE_REQUIRED');

    const withNote = await saveDraftResult({
      ref,
      providerId: inspector.id,
      itemId: item.id,
      state: 'MINOR',
      value: null,
      note: 'تسريبٌ خفيف من جلدة الصمامات',
    });
    expect(withNote.ok).toBe(true);
  });

  /** **وبندٌ من قالبٍ آخر لا يُقبل** — المعرّف لا يكفي، والانتماءُ يُفحص. */
  it('وبندٌ لا ينتمي لقالب المسودّة يُرفض', async () => {
    const ref = await paidRequest(inspector.id);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });

    const result = await saveDraftResult({
      ref,
      providerId: inspector.id,
      itemId: 'itm_does_not_exist',
      state: 'PASS',
      value: null,
      note: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('UNKNOWN_ITEM');
  });

  it('والقطعةُ والرأسُ يُحفظان ويُقرآن', async () => {
    const ref = await paidRequest(inspector.id);
    await ensureDraft({ ref, providerId: inspector.id, providerUserId: null });

    expect((await saveDraftPanel({
      ref, providerId: inspector.id, panel: 'hood',
      condition: 'repainted', microns: 180, note: null,
    })).ok).toBe(true);

    expect((await saveDraftHeader({
      ref, providerId: inspector.id, odometerKm: 84_000, summaryAr: 'هيكلٌ سليم',
    })).ok).toBe(true);

    const view = await draftView(ref, inspector.id);
    expect(view?.panels).toHaveLength(1);
    expect(view?.panels[0]?.microns).toBe(180);
    expect(view?.odometerKm).toBe(84_000);
    expect(view?.summaryAr).toBe('هيكلٌ سليم');
  });
});
