import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { providerRequestView, revealRequestPhone } from '@/lib/domain/provider-queue';

/**
 * ═══ رقمُ العميل يُكشف بطلبٍ ويُسجَّل ═══
 *
 * لوحةُ المزوّد كانت تعرض رقمَي العميل وصاحب المركبة **كاملين عند
 * فتحها**، ولا سطر يقول من نظر فيهما. والمزوّدُ هويةٌ ثالثة — مركزُ
 * فحصٍ خارجيّ بحسابه — فيرى رقمَي شخصين لم يتعاملا معه بعد.
 *
 * ومعيار A18 يُلزم بسجلٍّ لكل كشف هوية في الأدمن. وهذا أخفّ: الرقم
 * أداةُ عملٍ يحتاجها المزوّد ليُحدّد موعدًا، فيُكشف بنقرةٍ بلا سبب —
 * **والنقرةُ هي القصد، والسجلّ هو الحساب**.
 */

const made: { requests: string[]; users: string[] } = { requests: [], users: [] };

async function paidRequest(): Promise<{ ref: string; providerId: string }> {
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

  const ref = `SRV-C-${String(Date.now()).slice(-9)}`;
  made.requests.push(ref);
  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: buyer.id,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status: 'ASSIGNED',
      providerId: provider.id,
      amount: 575,
      adminFee: 50,
      vatAmount: 75,
      city,
    },
  });

  return { ref, providerId: provider.id };
}

afterEach(async () => {
  if (made.requests.length > 0) {
    await db.auditLog.deleteMany({
      where: { entity: 'ServiceRequest', entityId: { in: made.requests } },
    });
    await db.serviceRequest.deleteMany({ where: { ref: { in: made.requests } } });
  }
  made.requests = [];
  made.users = [];
});

describe('كشفُ رقم العميل للمزوّد', () => {
  it('اللوحة تعرض الخانات الأربع لا الرقم', async () => {
    const { ref, providerId } = await paidRequest();

    const view = await providerRequestView(ref, providerId);
    expect(view).not.toBeNull();
    /** **وما لا يُجلَب لا يتسرّب** — ولا رقم في حمولة الصفحة أصلًا. */
    expect(view?.requester.phoneTail.length).toBe(4);
    expect(JSON.stringify(view)).not.toContain('+9665');
  });

  it('والكشف يُعيد الرقم ويكتب سطرًا في التدقيق', async () => {
    const { ref, providerId } = await paidRequest();

    const result = await revealRequestPhone({
      ref,
      party: 'requester',
      providerId,
      providerUserId: 'provider-user-test',
      ip: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.phone.startsWith('+')).toBe(true);

    const log = await db.auditLog.findFirstOrThrow({
      where: { entity: 'ServiceRequest', entityId: ref },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.action).toBe('contact.revealed.requester');
    expect(log.actorType).toBe('provider');
    /** **والرقم لا يُنسخ إلى السجلّ** — وإلّا صار السجلّ هو التسريب. */
    expect(JSON.stringify(log.after)).not.toContain('+9665');
  });

  /**
   * **ولا بابَ خلفيًّا.** لولا الفحص لقُرئت أرقام كل العملاء بمرجعٍ
   * مخمَّن من أيّ حساب مزوّد.
   */
  it('ولا يكشفه مزوّدٌ لا شأن له بالطلب', async () => {
    const { ref } = await paidRequest();

    const stranger = await db.serviceProvider.findFirstOrThrow({
      where: { type: { not: 'INSPECTION' } },
      select: { id: true },
    });

    const result = await revealRequestPhone({
      ref,
      party: 'requester',
      providerId: stranger.id,
      providerUserId: 'provider-user-test',
      ip: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_YOURS');

    /** ولا يُكتب سجلٌّ لكشفٍ لم يقع. */
    expect(
      await db.auditLog.count({ where: { entity: 'ServiceRequest', entityId: ref } }),
    ).toBe(0);
  });
});
