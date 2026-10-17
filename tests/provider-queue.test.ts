import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { applyStep, providerQueue, providerRequestView, stepsFor } from '@/lib/domain/provider-queue';
import { ProviderType } from '@/generated/prisma/enums';

/**
 * ═══ لوحة المزوّدين الموحَّدة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): لوحةٌ **واحدة** مهما كان صنف الخدمة —
 * الفاحص اليوم، ومزوّدُ نقل الملكية لاحقًا بالطريقة نفسها. والفرق في
 * صفحة التفاصيل: كرت معلوماتٍ ثابت، وقسمٌ متغيّر بأزرار الأكشن.
 *
 * وما كان قبلها: `ServiceRequestStatus` بلا كاتبٍ واحد بعد `NEW` —
 * فمن دفع ثمن فحصٍ يبقى طلبُه في الطابور أبدًا.
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

/** طلبٌ مدفوعٌ في طابور الفاحصين — يُصنع ويُزال بعده. */
async function queued(city = 'الرياض'): Promise<{ ref: string; providerId: string }> {
  const provider = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'INSPECTION', active: true },
    select: { id: true },
  });
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'INSPECTION', active: true },
    select: { id: true },
  });
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', city },
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    select: { id: true },
  });

  const ref = `SRV-TEST-${String(Date.now()).slice(-9)}`;
  await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: buyer.id,
      sellerId: listing.sellerId,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      status: 'NEW',
      amount: 500,
      city,
      dueAt: new Date(Date.now() + 86_400_000),
    },
  });
  made.push(ref);
  return { ref, providerId: provider.id };
}

describe('خطواتُ الصنف', () => {
  /**
   * **ومن الحال الحالية وحدها**: زرٌّ يُعرض على حالٍ لا يقبله يردّ ٤٠٩
   * بعد الضغط — وهو أسوأ من غيابه.
   */
  it('لكل حالٍ ما يليها لا أكثر', () => {
    expect(stepsFor('INSPECTION', 'NEW').map((s) => s.key)).toEqual(['accept']);
    expect(stepsFor('INSPECTION', 'ASSIGNED').map((s) => s.key)).toEqual(['start']);
    /** **والتعذّر خطوةٌ من كل حالٍ عاملة** — وإلّا بقي الطلب عالقًا أو أُنهي كذبًا */
    expect(stepsFor('INSPECTION', 'IN_PROGRESS').map((s) => s.key)).toEqual(['complete', 'fail']);
    expect(stepsFor('INSPECTION', 'DONE')).toEqual([]);
  });

  /**
   * والفرقُ بين الأصناف في النموذج لا في الرحلة — وهو ما قصده المالك.
   *
   * **وهذا الاختبار كان يثبّت العطب**: كتب `expect(shipping?.form)
   * .toBeNull()` — أي أنّ الناقل يُنهي **بلا حقلٍ واحد**، وهو بعينه ما
   * طلب المالك إصلاحه («وهكذا لباقي المزوّدين»). فلمّا صُحّح الكود
   * سقط الاختبار، والسؤال أيُّهما كان خاطئًا: الاختبار.
   */
  it('والفرق في النموذج لا في المسار', () => {
    const inspection = stepsFor('INSPECTION', 'IN_PROGRESS').find((s) => s.key === 'complete');
    const shipping = stepsFor('SHIPPING', 'IN_PROGRESS').find((s) => s.key === 'complete');
    /** للفحص شاشتُه (بنودٌ وصورٌ ومخطّط)، ولما عداه مخطّطُ حقول */
    expect(inspection?.form).toBe('INSPECTION');
    expect(shipping?.form).toBe('FIELDS');
    /** والرحلةُ واحدة: `IN_PROGRESS → DONE` للصنفين */
    expect(inspection?.to).toBe(shipping?.to);
  });

  /**
   * **وصنفٌ جديد في التعداد يأخذ خطواته تلقائيًّا.** كان الجدول سبعةَ
   * أسطرٍ متوأمة، فصنفٌ يُضاف ولا يُضاف هناك يخرج **بلا خطواتٍ
   * أصلًا** — طابورٌ يستلم طلبًا ولا زرَّ فيه.
   */
  it('وكلُّ صنفٍ في التعداد له خطواته', () => {
    for (const type of Object.values(ProviderType)) {
      expect(stepsFor(type, 'NEW').map((s) => s.key)).toEqual(['accept']);
      expect(stepsFor(type, 'IN_PROGRESS').map((s) => s.key)).toEqual(['complete', 'fail']);
    }
  });
});

describe('ما يصل المزوّد', () => {
  it('يرى المعروضَ على صنفه في مدينته', async () => {
    const seat = await queued();
    const rows = await providerQueue(seat.providerId);
    expect(rows.some((row) => row.ref === seat.ref)).toBe(true);
  });

  /**
   * **والمدفوعُ وحده عملٌ.** طلبٌ ينتظر إذنًا أو سدادًا ليس عملًا بعد،
   * وعرضُه يجعل الفاحص يخرج إلى موعدٍ لم يُدفع ثمنُه.
   */
  it('ولا يرى ما لم يُدفع', async () => {
    const seat = await queued();
    await db.serviceRequest.update({
      where: { ref: seat.ref },
      data: { status: 'AWAITING_PAYMENT' },
    });

    expect((await providerQueue(seat.providerId)).some((row) => row.ref === seat.ref)).toBe(false);
    expect(await providerRequestView(seat.ref, seat.providerId)).toBeNull();
  });

  /** ومزوّدٌ من صنفٍ آخر لا شأن له — و٤٠٤ لا ٤٠٣. */
  it('ولا يراه مزوّدٌ من صنفٍ آخر', async () => {
    const seat = await queued();
    const other = await db.serviceProvider.findFirstOrThrow({
      where: { type: { not: 'INSPECTION' } },
      select: { id: true },
    });
    expect(await providerRequestView(seat.ref, other.id)).toBeNull();
  });
});

describe('المهلة', () => {
  /**
   * **والمنتهي فات موعدُه ليس متأخّرًا** — لا أحد ينتظره. قِيس على
   * الشاشة بعد إنهاء طلبِ نقل ملكية: «مكتمل» و«تجاوز المهلة» في سطرٍ
   * واحد، وسمان متناقضان.
   */
  it('وطلبٌ أُنجز لا يحمل شارة التأخّر', async () => {
    const seat = await queued();
    const late = new Date(Date.now() + 86_400_000 * 2);

    await applyStep({ ...seat, step: 'accept', reason: null }, late);
    expect((await providerRequestView(seat.ref, seat.providerId, late))?.overdue).toBe(true);

    await db.serviceRequest.update({ where: { ref: seat.ref }, data: { status: 'DONE' } });
    expect((await providerRequestView(seat.ref, seat.providerId, late))?.overdue).toBe(false);
  });
});

describe('تطبيق الخطوة', () => {
  /**
   * **والحارس في الخادم.** الشاشة تعرض ما تقبله الحال، ونداءٌ مباشر
   * يُنهي طلبًا لم يبدأ — فشرطٌ تفرضه الشاشة وحدها اقتراحٌ لا حارس.
   */
  it('خطوةٌ لا تقبلها الحال تُرفض ولو نُوديت مباشرةً', async () => {
    const seat = await queued();
    expect(
      await applyStep({ ref: seat.ref, providerId: seat.providerId, step: 'complete', reason: null }),
    ).toEqual({ ok: false, reason: 'STEP_NOT_ALLOWED' });
  });

  /**
   * **وهذا الاختبار كان يثبّت العطب الأكبر**: كان يفحص أنّ طلبَ فحصٍ
   * يُنتهى بـ`complete` **بلا تقريرٍ قطّ** ويردّ `DONE` — وتحته
   * `recordServiceEarned` و`issueServiceInvoice` و`captureServicePayment`
   * تمرّ كلُّها، **فيُقبض ثمنُ فحصٍ لا وجود له** والعميل يقرأ «اكتمل».
   *
   * و`form: 'INSPECTION'` كان مكتوبًا في الجدول منذ بُني ولا يُفرَض.
   */
  it('والرحلة تمضي قبولًا فبدءًا — ويقف الإنهاء على النموذج', async () => {
    const seat = await queued();
    expect(await applyStep({ ...seat, step: 'accept', reason: null })).toEqual({
      ok: true,
      status: 'ASSIGNED',
    });
    expect(await applyStep({ ...seat, step: 'start', reason: null })).toEqual({
      ok: true,
      status: 'IN_PROGRESS',
    });
    /** **ولا يُنهى فحصٌ بلا تقرير** — والاسمُ يقول ما ينقص */
    expect(await applyStep({ ...seat, step: 'complete', reason: null })).toEqual({
      ok: false,
      reason: 'FORM_INCOMPLETE',
    });
    /** والتعذّرُ باقٍ: مخرجٌ لمن لم يستطع، ولا يحتاج نموذجًا */
    expect(
      await applyStep({ ...seat, step: 'fail', reason: 'المركبة لم تكن في الموقع المتّفق عليه.' }),
    ).toEqual({ ok: true, status: 'FAILED' });
  });

  /**
   * **ولا يقبله اثنان.** `providerId: null` في شرط التحديث يجعل قبولَين
   * متزامنين يُنتج فائزًا واحدًا — والثاني يقرأ صفرَ صفوفٍ متأثّرة
   * فيعرف أن غيره سبقه.
   */
  it('والقبول يقع مرّةً واحدة', async () => {
    const seat = await queued();
    const rival = await db.serviceProvider.findFirst({
      where: { type: 'INSPECTION', id: { not: seat.providerId } },
      select: { id: true },
    });

    expect(await applyStep({ ...seat, step: 'accept', reason: null })).toEqual({
      ok: true,
      status: 'ASSIGNED',
    });
    /** وثانيةً من المزوّد نفسه لا تُعيد الإسناد */
    expect(await applyStep({ ...seat, step: 'accept', reason: null })).toEqual({
      ok: false,
      reason: 'STEP_NOT_ALLOWED',
    });

    if (rival !== null) {
      /** وغيرُه لم يعد يراه أصلًا */
      expect(await providerRequestView(seat.ref, rival.id)).toBeNull();
    }
  });

  /** **و«تعذّر» بلا سببٍ لا يُصلحها أحد** — فالسبب شرط. */
  it('والتعذّر بسببٍ مكتوب', async () => {
    const seat = await queued();
    await applyStep({ ...seat, step: 'accept', reason: null });
    await applyStep({ ...seat, step: 'start', reason: null });

    expect(await applyStep({ ...seat, step: 'fail', reason: 'لا' })).toEqual({
      ok: false,
      reason: 'REASON_REQUIRED',
    });
    expect(
      await applyStep({ ...seat, step: 'fail', reason: 'حضرتُ الموعد ولم أجد المركبة.' }),
    ).toEqual({ ok: true, status: 'FAILED' });
  });
});
