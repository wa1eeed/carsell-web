import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { applyStep } from '@/lib/domain/provider-queue';
import { makeCompletable } from './helpers/completable';

/**
 * ═══ ومن دفع يُخطَر بما وقع ═══
 *
 * `applyStep` كانت تكتب الحال وتسكت: من دفع ثمن فحصٍ لا يعلم أن
 * مركزًا استلمه، ولا أنه أُنجز، ولا أنه تعذّر — **فيعود إلى الشاشة
 * يسأل، أو لا يعود**. وقالبُ `service.completed` كان معلَنًا صامتًا
 * بحجّة أن «لا شيء في المنتج يُنهي طلب خدمة» — وقد صار يُنهيه.
 */

const made: string[] = [];

afterEach(async () => {
  if (made.length > 0) {
    await db.notification.deleteMany({ where: { entityId: { in: made } } });
    await db.serviceRequest.deleteMany({ where: { ref: { in: made } } });
    made.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

/** طلبٌ مدفوعٌ في طابور الفاحصين، بحالٍ نختاره. */
async function queued(status: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS'): Promise<{
  ref: string;
  providerId: string;
  requesterId: string;
}> {
  const provider = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'INSPECTION', active: true, accountStatus: { in: ['ACTIVE', 'SEMI_ACTIVE'] } },
    select: { id: true, cities: true },
  });
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'INSPECTION', active: true },
    select: { id: true },
  });
  const city = provider.cities[0] ?? 'الرياض';
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', city },
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    select: { id: true },
  });

  const ref = `SRV-NOTE-${String(Date.now()).slice(-9)}`;
  made.push(ref);
  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: buyer.id,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status,
      amount: 450,
      city,
      ...(status === 'NEW' ? {} : { providerId: provider.id }),
    },
  });

  return { ref, providerId: provider.id, requesterId: buyer.id };
}

async function bells(ref: string): Promise<{ key: string; userId: string; priority: string }[]> {
  const rows = await db.notification.findMany({
    where: { entityType: 'ServiceRequest', entityId: ref },
    select: { templateKey: true, userId: true, priority: true },
  });
  return rows.map((row) => ({ key: row.templateKey, userId: row.userId, priority: row.priority }));
}

describe('إخطارُ الطالب بخطوات مزوّده', () => {
  it('القبول يُخطِر من دفع — لا المزوّد ولا صاحب المركبة', async () => {
    const made = await queued('NEW');
    const result = await applyStep({
      ref: made.ref,
      providerId: made.providerId,
      step: 'accept',
      reason: null,
    });
    expect(result.ok).toBe(true);

    const sent = await bells(made.ref);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toBe('service.assigned');
    expect(sent[0]?.userId).toBe(made.requesterId);
  });

  it('والإنجاز يُخطِره — والقالب كان معلَنًا صامتًا بحجّةٍ بطلت', async () => {
    const made = await queued('IN_PROGRESS');
    /** والإنجاز صار يشترط إثباتَه — والباب واحدٌ للطقم كلِّه */
    await makeCompletable(made.ref);
    const result = await applyStep({
      ref: made.ref,
      providerId: made.providerId,
      step: 'complete',
      reason: null,
    });
    expect(result.ok).toBe(true);

    const sent = await bells(made.ref);
    expect(sent.map((row) => row.key)).toEqual(['service.completed']);
    expect(sent[0]?.priority).toBe('high');
  });

  /** **والفشل حرج**: مالٌ دُفع وخدمةٌ لم تقع. */
  it('والتعذّر يُخطِره بأولوية حرجة', async () => {
    const made = await queued('IN_PROGRESS');
    const result = await applyStep({
      ref: made.ref,
      providerId: made.providerId,
      step: 'fail',
      reason: 'تعذّر الوصول إلى المركبة بعد محاولتين متفق عليهما',
    });
    expect(result.ok).toBe(true);

    const sent = await bells(made.ref);
    expect(sent.map((row) => row.key)).toEqual(['service.failed']);
    expect(sent[0]?.priority).toBe('critical');
  });

  /**
   * **وبدءُ العمل لا يُخطَر به** — لا يغيّر شيئًا ممّا يستطيعه الطالب،
   * والإخطارُ الذي لا يُفضي إلى فعلٍ ولا توقّعٍ جديد ضجيج. قرارٌ
   * مكتوب لا إغفال.
   */
  it('وبدءُ العمل بلا إخطار — عمدًا', async () => {
    const made = await queued('ASSIGNED');
    const result = await applyStep({
      ref: made.ref,
      providerId: made.providerId,
      step: 'start',
      reason: null,
    });
    expect(result.ok).toBe(true);
    expect(await bells(made.ref)).toHaveLength(0);
  });

  /** **وخطوةٌ مرفوضة لا تُخطِر** — فلا يُقرأ رفضٌ إنجازًا. */
  it('وخطوةٌ لا تقبلها الحال لا تكتب إشعارًا', async () => {
    const made = await queued('NEW');
    const result = await applyStep({
      ref: made.ref,
      providerId: made.providerId,
      step: 'complete',
      reason: null,
    });
    expect(result.ok).toBe(false);
    expect(await bells(made.ref)).toHaveLength(0);
  });
});
