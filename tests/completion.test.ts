import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { PaymentStatus, ProviderType } from '@/generated/prisma/enums';
import {
  COMPLETION_FIELDS,
  completionFormFor,
  visibleFieldsOf,
} from '@/lib/domain/completion-schema';
import { checkCompletion } from '@/lib/domain/completion-validate';
import {
  completionComplete,
  completionFormView,
  completionOf,
  saveCompletion,
} from '@/lib/domain/service-completion';
import { applyStep, providerRequestView } from '@/lib/domain/provider-queue';
import {
  COMPLETION_FIELD,
  COMPLETION_OPTION,
  SERVICE_DONE_BY_TYPE,
} from '@/lib/labels/completion';
import { PAYMENT_STATE } from '@/lib/labels/services';

/**
 * ═══ حقولُ الإنجاز لكل صنف — طلبُ المالك ٢٠٢٦-١٠-١٧ ═══
 *
 * «وإذا كان المزوّد نقل ملكيّة هناك حقول تناسبه لتنفيذ الطلب **وهكذا
 * لباقي المزوّدين**».
 *
 * وما كان قبلها: ستّةُ أصناف تُنهي الطلب **بلا حقلٍ واحد**، و
 * `form: 'INSPECTION'` مكتوبٌ في الجدول **ولا يُفرَض**.
 */

const NOW = new Date('2026-10-17T12:00:00.000Z');

const made: string[] = [];

afterEach(async () => {
  if (made.length > 0) {
    /** والحقولُ تُحذف بالتعاقب (`onDelete: Cascade`) فلا يبقى صفٌّ يتيم */
    await db.serviceRequest.deleteMany({ where: { ref: { in: made } } });
    made.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

describe('المخطّط', () => {
  /**
   * **ومفتاحٌ بلا اسمٍ يُعرض خامًا**: «trackingNo» في شاشةٍ عربية.
   * والبوابة ١٧ تمنع النصّ العربيّ في النطاق، فالاسم في `labels/` —
   * وهذا يفحص أنّ القائمتين لم تتباعدا.
   */
  it('لكل حقلٍ اسمٌ عربيّ', () => {
    const missing: string[] = [];
    for (const type of Object.values(ProviderType)) {
      for (const field of COMPLETION_FIELDS[type]) {
        if (COMPLETION_FIELD[field.key] === undefined) missing.push(`${type}.${field.key}`);
        for (const option of field.options ?? []) {
          if (COMPLETION_OPTION[option] === undefined) missing.push(`${type}.${field.key}=${option}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * **ونوعُ النموذج يُشتقّ لا يُكتب**: الفحصُ له شاشتُه، وكلُّ صنفٍ له
   * حقولٌ يُطلب مخطّطُه. وصنفٌ بلا حقولٍ ولا شاشة يُنهي بلا إثبات —
   * وهو ما كان.
   */
  it('وكلُّ صنفٍ يُنهي بنموذج', () => {
    const formless = Object.values(ProviderType).filter(
      (type) => completionFormFor(type) === null,
    );
    expect(formless).toEqual([]);
    expect(completionFormFor('INSPECTION')).toBe('INSPECTION');
    expect(completionFormFor('TRANSFER')).toBe('FIELDS');
  });

  /** والحقلُ المشروط يظهر بالقيمة لا بالصنف */
  it('ومبلغُ التمويل لا يُطلب على رفض', () => {
    const onApproval = visibleFieldsOf('FINANCE', { decision: 'APPROVED' }).map((f) => f.key);
    const onRejection = visibleFieldsOf('FINANCE', { decision: 'REJECTED' }).map((f) => f.key);
    expect(onApproval).toContain('approvedAmount');
    expect(onApproval).not.toContain('rejectionReason');
    expect(onRejection).toContain('rejectionReason');
    expect(onRejection).not.toContain('approvedAmount');
  });
});

describe('الصياغة', () => {
  /**
   * **ومفتاحٌ بلا اسمٍ يُعرض خامًا، واسمٌ بلا مفتاحٍ يحرس لا شيء.**
   * كتبتُ `REFUNDED` والتعدادُ يقول `RETURNED` — فحالُ ردٍّ تُعرض
   * «RETURNED» في شاشةِ مالٍ عربية، وسطرٌ ميّت يوهم أنها مغطّاة.
   */
  it('ولكل حالِ دفعةٍ اسمٌ — ولا اسمَ زائد', () => {
    expect(Object.keys(PAYMENT_STATE).sort()).toEqual(Object.values(PaymentStatus).sort());
  });

  /**
   * **و«اكتمل» تُقال بصنفها**: `SERVICE_REQUEST_NEXT.DONE` كان «التقرير
   * جاهز» لكل صنف — فناقلٌ أوصل مركبةً يقول لصاحبها إنّ تقريرًا جاهز.
   */
  it('ولكل صنفٍ معنى إنجازه', () => {
    const missing = Object.values(ProviderType).filter(
      (type) => SERVICE_DONE_BY_TYPE[type] === undefined,
    );
    expect(missing).toEqual([]);
  });
});

describe('التحقّق', () => {
  it('المطلوبُ يُطلب، وكلُّ العطب يُعاد مرّةً واحدة', () => {
    const result = checkCompletion('SHIPPING', {}, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    /** **ولا يُتوقَّف عند أوّل خطأ** — وإلّا فستُّ رحلاتٍ لعملٍ واحد */
    expect(result.issues.map((issue) => issue.key).sort()).toEqual(
      ['carrier', 'deliveredAt', 'pickedUpAt', 'receivedBy', 'trackingNo'].sort(),
    );
    expect(new Set(result.issues.map((issue) => issue.code))).toEqual(new Set(['REQUIRED']));
  });

  /**
   * **والحقلُ يقبل كل صيغة لصق ويطبّعها** — ومن يمنع اللصق يظنّ أنه
   * يمنع الخطأ وهو يصنعه. و`toLatinDigits` تملك القاعدة.
   */
  it('والأرقام العربية-الهندية وفواصلُها تُطبَّع', () => {
    const result = checkCompletion(
      'PHOTOGRAPHY',
      { shotCount: '٤٢', albumUrl: 'https://cdn.example.com/a/42' },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.get('shotCount')).toEqual({ kind: 'NUMBER', number: '42' });
  });

  it('والمالُ بفاصلةٍ ملصوقة يُقبل، والسالبُ يُرفض', () => {
    const good = checkCompletion(
      'TRANSFER',
      {
        transferNo: 'TRF-99100',
        plateNo: 'ABC 1234',
        transferredAt: '2026-10-10',
        newOwnerName: 'فهد العتيبي',
        transferFees: '1,250.50',
      },
      NOW,
    );
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.values.get('transferFees')).toEqual({ kind: 'NUMBER', number: '1250.50' });
    }

    const bad = checkCompletion(
      'TRANSFER',
      {
        transferNo: 'TRF-99100',
        plateNo: 'ABC 1234',
        transferredAt: '2026-10-10',
        newOwnerName: 'فهد العتيبي',
        transferFees: '-20',
      },
      NOW,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues).toEqual([{ key: 'transferFees', code: 'NEGATIVE' }]);
  });

  /**
   * **و«تاريخ التسليم: غدًا» على طلبٍ يُنهيه المزوّد الآن كذبٌ** لا خطأ
   * تنسيق — والعميلُ يقرؤه إثباتًا.
   */
  it('وتاريخُ تسليمٍ لم يأتِ بعد يُرفض', () => {
    const result = checkCompletion(
      'SHIPPING',
      {
        carrier: 'ناقل للشحن',
        trackingNo: 'NQL-5512',
        pickedUpAt: '2026-10-14',
        deliveredAt: '2026-11-20',
        receivedBy: 'سعد القحطاني',
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual([{ key: 'deliveredAt', code: 'FUTURE_DATE' }]);
  });

  /** ولا يُسلَّم قبل أن يُستلَم */
  it('وتسليمٌ يسبق الاستلام يُرفض', () => {
    const result = checkCompletion(
      'SHIPPING',
      {
        carrier: 'ناقل للشحن',
        trackingNo: 'NQL-5512',
        pickedUpAt: '2026-10-14',
        deliveredAt: '2026-10-11',
        receivedBy: 'سعد القحطاني',
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual([{ key: 'deliveredAt', code: 'BEFORE_OTHER' }]);
  });

  /** وسريانٌ ينتهي قبل أن يبدأ ليس وثيقةً */
  it('ونهايةُ سريانٍ قبل بدايته تُرفض', () => {
    const result = checkCompletion(
      'INSURANCE',
      {
        insurer: 'تأمين الراجحي',
        policyNo: 'POL-77120',
        coverage: 'COMPREHENSIVE',
        startsAt: '2026-12-01',
        endsAt: '2026-11-01',
        premium: '2400',
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('BEFORE_OTHER');
    }
  });

  it('وخيارٌ ليس من القائمة يُرفض', () => {
    const result = checkCompletion(
      'INSURANCE',
      {
        insurer: 'تأمين الراجحي',
        policyNo: 'POL-77120',
        coverage: 'GOLD',
        startsAt: '2026-10-20',
        endsAt: '2027-10-20',
        premium: '2400',
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual([{ key: 'coverage', code: 'NOT_AN_OPTION' }]);
  });
});

/** طلبُ نقلٍ مدفوعٌ قيد التنفيذ — يُصنع ويُزال بعده */
async function shipping(): Promise<{ ref: string; providerId: string; id: string }> {
  const provider = await db.serviceProvider.findFirstOrThrow({
    where: { type: 'SHIPPING', active: true },
    select: { id: true, cities: true },
  });
  const service = await db.service.findFirstOrThrow({
    where: { providerType: 'SHIPPING', active: true },
    select: { id: true },
  });
  const city = provider.cities[0] ?? 'الرياض';
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED' },
    select: { id: true, vehicleId: true, sellerId: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: listing.sellerId }, role: 'USER' },
    select: { id: true },
  });

  const ref = `SRV-TEST-C${String(Date.now()).slice(-8)}`;
  const row = await db.serviceRequest.create({
    data: {
      ref,
      serviceId: service.id,
      userId: buyer.id,
      listingId: listing.id,
      vehicleId: listing.vehicleId,
      providerId: provider.id,
      status: 'IN_PROGRESS',
      amount: 900,
      city,
      dueAt: new Date(NOW.getTime() + 86_400_000),
    },
    select: { id: true },
  });
  made.push(ref);
  return { ref, providerId: provider.id, id: row.id };
}

const DELIVERED = {
  carrier: 'ناقل للشحن',
  trackingNo: 'NQL-5512',
  pickedUpAt: '2026-10-14',
  deliveredAt: '2026-10-16',
  receivedBy: 'سعد القحطاني',
  odometerKm: '١٢٠٤٠٠',
};

describe('الحفظ والإنهاء', () => {
  it('النموذجُ يُفتح بحقول صنفه', async () => {
    const seat = await shipping();
    const view = await completionFormView(seat.ref, seat.providerId, NOW);
    expect(view?.type).toBe('SHIPPING');
    expect(view?.fields.map((field) => field.key)).toEqual(
      COMPLETION_FIELDS.SHIPPING.map((field) => field.key),
    );
    expect(view?.locked).toBe(false);
  });

  /**
   * ═══ **والحارس هو هذا** ═══
   *
   * نداءٌ مباشر على `/step` بـ`complete` كان يُنهي الطلب بلا إثبات —
   * فيُعترف بالإيراد وتخرج الفاتورة ويُقبض المال. وحارسٌ في الشاشة
   * ليس حارسًا.
   */
  it('ولا يُنهى طلبٌ بلا إثبات ولو نُوديت الخطوة مباشرةً', async () => {
    const seat = await shipping();
    expect(
      await applyStep(
        { ref: seat.ref, providerId: seat.providerId, step: 'complete', reason: null },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'FORM_INCOMPLETE' });

    const after = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: seat.ref },
      select: { status: true },
    });
    expect(after.status).toBe('IN_PROGRESS');
  });

  it('وبعد الحفظ يُنهى، ويُقرأ الإثبات بترتيب المخطّط', async () => {
    const seat = await shipping();
    expect(await saveCompletion({ ...seat, values: DELIVERED }, NOW)).toEqual({ ok: true });
    expect(await completionComplete(seat.id, 'SHIPPING', NOW)).toBe(true);

    expect(
      await applyStep(
        { ref: seat.ref, providerId: seat.providerId, step: 'complete', reason: null },
        NOW,
      ),
    ).toEqual({ ok: true, status: 'DONE' });

    const record = await completionOf(seat.id);
    expect(record?.type).toBe('SHIPPING');
    /** بترتيب المخطّط لا بترتيب الإدراج — فشاشتان تقرآن ترتيبًا واحدًا */
    expect(record?.values.map((value) => value.key)).toEqual([
      'carrier',
      'trackingNo',
      'pickedUpAt',
      'deliveredAt',
      'receivedBy',
      'odometerKm',
    ]);
    /** والعدّادُ رقمٌ في عموده لا نصًّا — فلا يصير «١٢٠٤٠٠» و«120400» قيمتين */
    expect(record?.values.find((value) => value.key === 'odometerKm')?.number).toBe('120400');
  });

  /** **ولا يُعدَّل إثباتٌ بعد قبوله** — ولا يُنهى طلبٌ مرّتين */
  it('والمُنجَزُ مقفل', async () => {
    const seat = await shipping();
    await saveCompletion({ ...seat, values: DELIVERED }, NOW);
    await applyStep(
      { ref: seat.ref, providerId: seat.providerId, step: 'complete', reason: null },
      NOW,
    );
    const view = await completionFormView(seat.ref, seat.providerId, NOW);
    expect(view?.locked).toBe(true);
    expect(await saveCompletion({ ...seat, values: DELIVERED }, NOW)).toEqual({
      ok: false,
      reason: 'LOCKED',
    });
  });

  /**
   * **والحقلُ الذي أُفرِغ يُحذف لا يُترك.** حفظٌ ثانٍ بأقلّ يترك
   * القديم — فيُقرأ إثباتٌ يقول «رُفض» و«المبلغ المعتمد ٨٠٬٠٠٠».
   */
  it('والحفظُ الثاني يمحو ما لم يُعَد', async () => {
    const seat = await shipping();
    await saveCompletion({ ...seat, values: DELIVERED }, NOW);
    const { odometerKm: _dropped, ...without } = DELIVERED;
    expect(await saveCompletion({ ...seat, values: without }, NOW)).toEqual({ ok: true });

    const record = await completionOf(seat.id);
    expect(record?.values.some((value) => value.key === 'odometerKm')).toBe(false);
  });

  /**
   * **ونموذجُ الصنف الآخر تحويلٌ لا بابٌ مسدود.** طلبُ فحصٍ نموذجُه
   * `/inspection` و`/complete` ليس له — ويُدلّ على بابه. والشاشتان
   * تقرآن `completionFormFor` نفسَها، فهذا يفحص أنّ الدلالة ممكنة:
   * العرضُ يحمل الصنف، والصنفُ يقول أيَّ نموذج.
   */
  it('ويُعرف نموذجُ الطلب من عرضه فيُدلّ عليه', async () => {
    const seat = await shipping();
    const view = await providerRequestView(seat.ref, seat.providerId, NOW);
    expect(view?.mine).toBe(true);
    expect(view?.type).toBe('SHIPPING');
    expect(completionFormFor(view?.type ?? 'OTHER')).toBe('FIELDS');
    /** وطلبُ الفحص لا يفتح نموذج الحقول — فيُحوَّل إلى شاشته */
    expect(await completionFormView(seat.ref, seat.providerId, NOW)).not.toBeNull();
  });

  it('ومزوّدٌ آخر لا يفتح النموذج ولا يحفظ فيه', async () => {
    const seat = await shipping();
    const other = await db.serviceProvider.findFirstOrThrow({
      where: { id: { not: seat.providerId }, active: true },
      select: { id: true },
    });
    expect(await completionFormView(seat.ref, other.id, NOW)).toBeNull();
    expect(await saveCompletion({ ref: seat.ref, providerId: other.id, values: DELIVERED }, NOW))
      .toEqual({ ok: false, reason: 'NO_FORM' });
  });
});
