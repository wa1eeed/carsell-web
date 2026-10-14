import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  cityPool,
  decideServiceRequest,
  isPaidStatus,
  lapseServiceConsents,
  requestService,
  resolveSubject,
  sellerContactFor,
} from '@/lib/domain/service-lifecycle';

/**
 * ═══ رحلة الفحص ثلاثية الأطراف ═══
 *
 * قرارات المالك (٢٠٢٦-١٠-١٤): الدافع هو طالب الخدمة بائعًا كان أو
 * مشتريًا؛ وطلبُ المشتري **يمرّ بالبائع**؛ والسداد بعد قبوله؛ وبياناتُ
 * البائع تُكشف للفاحص **بعد** ذلك؛ والطلب يذهب لفاحصي **مدينة السيارة**.
 *
 * وما كان قبلها: الحارس `ownerId === userId` يمنع **الحالة الأكثر
 * وقوعًا** — مشترٍ يفحص سيارةً قبل شرائها، وهي أصل الخدمة.
 */

const made: string[] = [];

afterEach(async () => {
  if (made.length > 0) {
    await db.serviceRequest.deleteMany({ where: { ref: { in: made } } });
    made.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

async function listedCar(): Promise<{ vehicleId: string; sellerId: string; city: string }> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { vehicleId: true, sellerId: true, city: true },
  });
  return { vehicleId: listing.vehicleId, sellerId: listing.sellerId, city: listing.city };
}

async function someoneElse(notId: string): Promise<string> {
  const user = await db.user.findFirstOrThrow({
    where: { id: { not: notId }, role: 'USER' },
    select: { id: true },
  });
  return user.id;
}

describe('من يطلب الفحص', () => {
  /**
   * **وكانت ممنوعة.** `ownerId === userId` يحصر الطلب في صاحب المركبة،
   * فمشترٍ يريد فحص سيارةٍ قبل أن يدفع فيها سبعين ألفًا لا يستطيع.
   */
  it('مشترٍ يطلبه لسيارة معروضة ليست له', async () => {
    const car = await listedCar();
    const buyer = await someoneElse(car.sellerId);

    const resolved = await resolveSubject(car.vehicleId, buyer);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.subject.kind).toBe('LISTED');
  });

  /** ومركبةٌ في جراج غيره بلا إعلان تبقى شأن صاحبها وحده. */
  it('ولا يُطلب لمركبة غير معروضة', async () => {
    const hidden = await db.vehicle.findFirst({
      where: { listings: { none: { status: 'PUBLISHED' } } },
      select: { id: true, ownerId: true },
    });
    if (hidden === null) return;

    const stranger = await someoneElse(hidden.ownerId);
    const resolved = await resolveSubject(hidden.id, stranger);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toBe('NOT_LISTED');
  });

  /** وصاحبُها يطلبه بلا إذنٍ من أحد — لا طرفَ ثانيًا. */
  it('وصاحبها يطلبه لنفسه', async () => {
    const car = await listedCar();
    const resolved = await resolveSubject(car.vehicleId, car.sellerId);
    expect(resolved.ok && resolved.subject.kind).toBe('OWN');
  });
});

describe('الطلب يُنشأ بلا مال', () => {
  /**
   * **ويقول قيمتَه وموعد مطالبته من اللحظة الأولى** — قرار المالك.
   * وكان الحجز يسبق الإنشاء، فطلبٌ يرفضه البائع يترك مالًا محجوزًا
   * على بطاقةٍ لصفقةٍ لم تبدأ.
   */
  it('طلبُ المشتري ينتظر إذن البائع، ويعلن مبلغه وموعد سداده', async () => {
    const car = await listedCar();
    const buyer = await someoneElse(car.sellerId);
    const service = await db.service.findFirstOrThrow({
      where: { active: true, providerType: { not: null } },
      select: { key: true },
    });

    const result = await requestService({
      serviceKey: service.key,
      requesterId: buyer,
      vehicleId: car.vehicleId,
      scheduledAt: null,
    });

    /**
     * **ولا يُتسامَح مع فشلٍ هنا.** كان الجسد يقبل `CITY_NOT_COVERED`
     * ويعود، فمرّ الاختبار **على فرع الرفض** وهو أخضر: الطابور كان
     * صفرًا لأن المزوّدين المزروعين بلا حساب دفع. والشرط يُثبَّت:
     * الزرع يُهيّئ البيئة، ومن لا يهيّئها يسقط هنا لا يمرّ.
     */
    expect(result.ok, 'الزرع لا يُنتج بيئةً تفحص — راجع حسابات المزوّدين').toBe(true);
    if (!result.ok) return;
    made.push(result.ref);

    expect(result.status).toBe('AWAITING_SELLER');
    expect(result.payAt).toBe('AFTER_CONSENT');
    expect(Number(result.total)).toBeGreaterThan(0);
    expect(result.decisionDueAt).not.toBeNull();

    /** ولا دفعة قبل الإذن */
    const row = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: result.ref },
      select: { paymentId: true, sellerId: true, city: true },
    });
    expect(row.paymentId).toBeNull();
    expect(row.sellerId).toBe(car.sellerId);
    /** **والمدينة من الإعلان لا من الطالب** */
    expect(row.city).toBe(car.city);
  });
});

describe('قرار البائع', () => {
  async function pending(): Promise<{ ref: string; sellerId: string } | null> {
    const car = await listedCar();
    const buyer = await someoneElse(car.sellerId);
    const service = await db.service.findFirstOrThrow({
      where: { active: true, providerType: { not: null } },
      select: { key: true },
    });
    const result = await requestService({
      serviceKey: service.key,
      requesterId: buyer,
      vehicleId: car.vehicleId,
      scheduledAt: null,
    });
    /** ويسقط هنا بدل أن يُعيد `null` فتمرّ الاختبارات بلا جسد */
    expect(result.ok, 'تعذّر إنشاء الطلب — الزرع لا يُنتج بيئةً تفحص').toBe(true);
    if (!result.ok) return null;
    made.push(result.ref);
    return { ref: result.ref, sellerId: car.sellerId };
  }

  it('غيرُ البائع لا يقرّر', async () => {
    const seat = await pending();
    if (seat === null) return;
    const stranger = await someoneElse(seat.sellerId);

    expect(
      await decideServiceRequest({
        ref: seat.ref,
        sellerId: stranger,
        accept: true,
        reason: null,
      }),
    ).toEqual({ ok: false, reason: 'NOT_SELLER' });
  });

  /** **ورفضٌ بلا سببٍ يُعيد الطالب إلى الحيرة** — فالسبب شرط. */
  it('والرفض بسببٍ مكتوب', async () => {
    const seat = await pending();
    if (seat === null) return;

    expect(
      await decideServiceRequest({ ref: seat.ref, sellerId: seat.sellerId, accept: false, reason: 'لا' }),
    ).toEqual({ ok: false, reason: 'REASON_REQUIRED' });

    expect(
      await decideServiceRequest({
        ref: seat.ref,
        sellerId: seat.sellerId,
        accept: false,
        reason: 'المركبة محجوزة لمشترٍ آخر هذا الأسبوع.',
      }),
    ).toEqual({ ok: true, status: 'DECLINED' });
  });

  it('والقبول يرفعه إلى انتظار السداد', async () => {
    const seat = await pending();
    if (seat === null) return;

    expect(
      await decideServiceRequest({ ref: seat.ref, sellerId: seat.sellerId, accept: true, reason: null }),
    ).toEqual({ ok: true, status: 'AWAITING_PAYMENT' });
  });

  /**
   * **والمهلة تُفحص بالوقت لا بالحالة وحدها** (البوابة ٤٢): قبولٌ بعد
   * انقضائها يُنشئ التزامًا على طلبٍ مات، والوظيفة الدورية قد لا تمرّ.
   */
  it('ولا يُقبل بعد انقضاء المهلة وإن لم تمرّ الوظيفة', async () => {
    const seat = await pending();
    if (seat === null) return;

    await db.serviceRequest.update({
      where: { ref: seat.ref },
      data: { decisionDueAt: new Date(Date.now() - 1000) },
    });

    expect(
      await decideServiceRequest({ ref: seat.ref, sellerId: seat.sellerId, accept: true, reason: null }),
    ).toEqual({ ok: false, reason: 'WINDOW_LAPSED' });

    /** وانقضاؤها **رفضٌ لا قبول** — والصمت لا يُقرأ موافقةً حين له ثمن */
    expect(await lapseServiceConsents()).toBeGreaterThan(0);
    const after = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: seat.ref },
      select: { status: true },
    });
    expect(after.status).toBe('DECLINED');
  });
});

describe('ما يُكشف للفاحص', () => {
  /**
   * قرار المالك: بيانات البائع تُكشف **بعد** الإذن. والإذن يرفع الطلب
   * إلى «ينتظر السداد» — ولا فاحصَ معنيٌّ به بعد، فالكشف عندئذٍ سابقٌ
   * لأوانه.
   */
  it('لا شيء قبل أن يدخل الطلب طابور الفاحصين', async () => {
    const car = await listedCar();
    const buyer = await someoneElse(car.sellerId);
    const service = await db.service.findFirstOrThrow({
      where: { active: true, providerType: { not: null } },
      select: { key: true },
    });
    const result = await requestService({
      serviceKey: service.key,
      requesterId: buyer,
      vehicleId: car.vehicleId,
      scheduledAt: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.push(result.ref);

    expect(await sellerContactFor(result.ref)).toBeNull();

    await decideServiceRequest({ ref: result.ref, sellerId: car.sellerId, accept: true, reason: null });
    expect(await sellerContactFor(result.ref)).toBeNull();

    /** وبعد السداد يدخل الطابور، فيُكشف ما يحتاجه الفاحص */
    await db.serviceRequest.update({ where: { ref: result.ref }, data: { status: 'NEW' } });
    const contact = await sellerContactFor(result.ref);
    expect(contact).not.toBeNull();
    expect(contact?.phone).toBeTruthy();
    expect(contact?.city).toBe(car.city);
  });

  it('والحالات غير المدفوعة معلومةٌ للشاشات', () => {
    expect(isPaidStatus('AWAITING_SELLER')).toBe(false);
    expect(isPaidStatus('AWAITING_PAYMENT')).toBe(false);
    expect(isPaidStatus('DECLINED')).toBe(false);
    expect(isPaidStatus('NEW')).toBe(true);
    expect(isPaidStatus('DONE')).toBe(true);
  });
});

describe('طابور المدينة', () => {
  /**
   * **ومزوّدٌ بلا حساب دفعٍ مفعَّل لا يدخله**: يُسنَد إليه طلبٌ فيؤدّيه
   * ثمّ لا سبيل إلى دفع مستحقّه — ودَينٌ يُنشأ بلا طريقٍ لسداده.
   */
  it('لا يضمّ مزوّدًا بلا حساب دفع', async () => {
    const pool = await cityPool('INSPECTION', 'الرياض');
    /** **وطابورٌ فارغ يجعل كل فحصٍ تحته بلا معنى** — فالشرط يُثبَّت */
    expect(pool.length, 'لا فاحص في الرياض — البيئة لا تفحص').toBeGreaterThan(0);
    for (const provider of pool) {
      const row = await db.serviceProvider.findUniqueOrThrow({
        where: { id: provider.id },
        select: { accountStatus: true, active: true },
      });
      expect(['ACTIVE', 'SEMI_ACTIVE']).toContain(row.accountStatus);
      expect(row.active).toBe(true);
    }
  });

  it('وبلا صنفٍ لا طابور', async () => {
    expect(await cityPool(null, 'الرياض')).toEqual([]);
  });
});
