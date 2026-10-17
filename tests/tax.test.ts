import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { computeOrderAmounts } from '@/lib/domain/order-amounts';
import { db } from '@/lib/db';
import {
  DEFAULT_VAT_PCT,
  buildQrTlv,
  cancelInvoice,
  computeTax,
  issueInvoice,
  matchRule,
  netOfVat,
  parseQrTlv,
  vatIncluded,
} from '@/lib/domain/tax';

afterAll(async () => {
  await db.$disconnect();
});

/**
 * **علامةٌ يملكها هذا الملف وحده.**
 *
 * والحكم عليها لا على عدّادٍ عامّ: `taxInvoice.count()` بلا شرط أسقط
 * الاختبار حين أنشأتُ فاتورةً بيدي أثناء المشي بالنقر — فحَكَم بما لا
 * يقيسه.
 */
const TAX_TAG = `عميل-اختبار-${String(Date.now()).slice(-9)}`;

const BASE = {
  supplierName: 'CarSell',
  // ولا يصلح `orderId`: مفتاحٌ أجنبيّ حقيقيّ، وقيمةٌ مخترعة تكسر الإنشاء
  customerName: TAX_TAG,
  description: 'commission',
  suppliedAt: new Date('2026-08-01T00:00:00Z'),
};

async function cleanInvoices() {
  await db.creditNote.deleteMany({});
  await db.taxInvoiceLine.deleteMany({});
  await db.taxInvoice.deleteMany({});
}

describe('═══ معيار ٣٥ ═══ لا فاتورة بلا قاعدة', () => {
  it('غياب القاعدة يوقف الإصدار — ولا يفترض معالجةً افتراضية', async () => {
    // بائع فرد ← مشترٍ فرد على مركبة: القاعدة موجودة لكنّها معطّلة (تنتظر المذكرة)
    const result = await issueInvoice({
      ...BASE,
      sellerType: 'INDIVIDUAL', buyerType: 'INDIVIDUAL', supplyType: 'VEHICLE',
      amount: '142850.00',
    });

    expect(result.ok).toBe(false);
    /**
     * **والسبب يفرّق بين الغياب والتعطيل.**
     *
     * كان هذا الفحص يثبّت `NO_MATCHING_RULE` وتعليقه فوقه يقول إن
     * القاعدة **موجودة ومعطّلة** — فكان يحرس صياغةً تُرسل المشغّل
     * ليكتب قاعدةً قائمة، ثم تتزاحم قاعدتان على الحالة نفسها.
     * والفعلان مختلفان: «اكتب قاعدة» و«أقِرّ ما عندك».
     */
    if (!result.ok) expect(result.reason).toBe('RULE_AWAITING_APPROVAL');

    /**
     * **ولا صفّ كُتب — للطلب المعنيّ.**
     *
     * كان عدّادًا عامًّا (`taxInvoice.count()`)، فأسقطته فاتورةٌ أنشأتُها
     * بيدي أثناء المشي بالنقر على `/admin/tax`. والعدّاد العامّ يحكم
     * بما لا يقيسه: يكفي صفٌّ من أي مصدرٍ ليقول إن الإصدار وقع.
     */
    expect(await db.taxInvoice.count({ where: { customerName: TAX_TAG } })).toBe(0);
  });

  it('والقواعد المعطّلة لا تُطابَق أصلًا', async () => {
    const rule = await matchRule({
      sellerType: 'INDIVIDUAL', buyerType: 'INDIVIDUAL', supplyType: 'VEHICLE',
    });
    expect(rule).toBeNull();
  });

  it('والعمولة تُطابِق — فهي توريدنا مهما كان البائع', async () => {
    const rule = await matchRule({
      sellerType: 'INDIVIDUAL', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
    });
    expect(rule?.taxableBase).toBe('FEE_ONLY');
    expect(rule?.invoiceIssuer).toBe('PLATFORM');
    expect(rule?.supplierIsPlatform).toBe(true);
  });

  it('والمطابقة بالأدقّ نطاقًا — لا بترتيب الإدراج', async () => {
    // صفٌّ عامّ للعمولة وآخر محدَّد بالبائع: الأدقّ يفوز
    const specific = await matchRule({
      sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
    });
    expect(specific?.sellerType).toBe('DEALER_VAT');

    // وبائعٌ لا صفّ خاصّ له يقع على العامّ
    const general = await matchRule({
      sellerType: 'DEALER_NO_VAT', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
    });
    expect(general?.sellerType).toBeNull();
  });
});

describe('═══ معيار ٣٥ ═══ اللقطة لا تتغيّر بتعديل القاعدة', () => {
  it('تعديل النسبة بعد الإصدار لا يمسّ ما صدر', async () => {
    await cleanInvoices();
    const issued = await issueInvoice({
      ...BASE,
      sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
      amount: '1150.00',
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error('لم تصدر');

    const before = await db.taxInvoice.findUniqueOrThrow({ where: { id: issued.invoiceId } });
    expect(before.ruleRatePct?.toString()).toBe('15');
    expect(before.taxTotal.toString()).toBe('150');

    // ═══ تُعدَّل القاعدة نفسها ═══
    const rule = await db.taxRule.findUniqueOrThrow({ where: { id: before.ruleId } });
    await db.taxRule.update({ where: { id: rule.id }, data: { ratePct: 20 } });

    const after = await db.taxInvoice.findUniqueOrThrow({ where: { id: issued.invoiceId } });
    // **الوثيقة لا تتغيّر بأثر رجعي** — أهمّ قاعدة في القسم كله
    expect(after.ruleRatePct?.toString()).toBe('15');
    expect(after.taxTotal.toString()).toBe('150');
    expect(after.total.toString()).toBe('1150');

    await db.taxRule.update({ where: { id: rule.id }, data: { ratePct: rule.ratePct } });
    await cleanInvoices();
  });
});

describe('═══ معيار ٣٥ ═══ التسلسل متّصل، والإلغاء بإشعار دائن', () => {
  it('التسلسل يزيد واحدًا بلا فجوة', async () => {
    await cleanInvoices();
    const numbers: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const issued = await issueInvoice({
        ...BASE,
        sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
        amount: '115.00',
      });
      if (issued.ok) numbers.push(issued.sequence);
    }
    expect(numbers).toEqual([1, 2, 3]);
    await cleanInvoices();
  });

  it('الإلغاء بإشعار دائن — والأصل يبقى ولا يُحذف', async () => {
    await cleanInvoices();
    const issued = await issueInvoice({
      ...BASE,
      sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'COMMISSION',
      amount: '1150.00',
    });
    if (!issued.ok) throw new Error('لم تصدر');

    const short = await cancelInvoice(issued.invoiceId, 'خطأ', 'admin-1');
    expect(short.ok).toBe(false);

    const cancelled = await cancelInvoice(issued.invoiceId, 'أُلغيت الصفقة بطلب المشتري', 'admin-1');
    expect(cancelled.ok).toBe(true);

    // ═══ الأصل باقٍ ومعلَّم، لا محذوف ═══
    const original = await db.taxInvoice.findUniqueOrThrow({ where: { id: issued.invoiceId } });
    expect(original.status).toBe('CANCELLED');
    expect(original.sequence).toBe(1);

    const note = await db.creditNote.findFirstOrThrow({ where: { invoiceId: issued.invoiceId } });
    expect(note.amount.toString()).toBe('1150');
    expect(note.taxAmount.toString()).toBe('150');

    // ولا إلغاء مرّتين
    expect((await cancelInvoice(issued.invoiceId, 'محاولة ثانية للإلغاء', 'admin-1')).ok).toBe(false);

    await cleanInvoices();
  });
});

describe('═══ معيار ٣٥ ═══ الهامش لا يُطبَّق بلا اعتماد', () => {
  it('قاعدة الهامش تُرفض للتاجر غير المعتمد', async () => {
    const rule = await db.taxRule.findFirstOrThrow({ where: { taxableBase: 'MARGIN' } });
    await db.taxRule.update({ where: { id: rule.id }, data: { active: true } });
    // نعطّل قاعدة القيمة الكاملة كي تُطابَق قاعدة الهامش
    const full = await db.taxRule.findFirstOrThrow({
      where: { taxableBase: 'FULL_VALUE', sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL' },
    });
    await db.taxRule.update({ where: { id: full.id }, data: { active: false } });

    const denied = await issueInvoice({
      ...BASE,
      sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'VEHICLE',
      amount: '100000.00', marginAmount: '10000.00',
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('MARGIN_NOT_APPROVED');

    // ومع الاعتماد يمرّ، والضريبة على الهامش لا على القيمة
    const allowed = await issueInvoice({
      ...BASE,
      sellerType: 'DEALER_VAT', buyerType: 'INDIVIDUAL', supplyType: 'VEHICLE',
      amount: '100000.00', marginAmount: '11500.00', marginApproved: true,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      // ١١٬٥٠٠ × ١٥/١١٥ = ١٬٥٠٠ — لا ١٣٬٠٤٣ على القيمة الكاملة
      expect(allowed.amounts.taxTotal).toBe('1500');
    }

    await db.taxRule.update({ where: { id: rule.id }, data: { active: false } });
    await db.taxRule.update({ where: { id: full.id }, data: { active: true } });
    await cleanInvoices();
  });
});

describe('الحساب — الضريبة مضمَّنة لا مضافة', () => {
  it('١١٥٠ تحمل ١٥٠ لا ١٧٢٫٥', () => {
    expect(vatIncluded(1150).toString()).toBe('150');
    expect(netOfVat(1150).toString()).toBe('1000');
    expect(DEFAULT_VAT_PCT).toBe(15);
  });

  it('وخارج النطاق صفرٌ معلن لا إغفال حساب', () => {
    const out = computeTax('OUT_OF_SCOPE', '100000', null);
    expect(out.taxTotal).toBe('0');
    expect(out.total).toBe('100000');
    expect(out.subtotal).toBe('100000');
  });

  it('والهامش يُحسب على الهامش وحده', () => {
    const margin = computeTax('MARGIN', '100000', 15, '11500');
    expect(margin.taxTotal).toBe('1500');
    // والإجمالي يبقى قيمة الصفقة
    expect(margin.total).toBe('100000');
  });
});

describe('رمز QR بترميز TLV', () => {
  it('الحقول الخمسة تُقرأ كما كُتبت', () => {
    const tlv = buildQrTlv({
      sellerName: 'كارسِل',
      vatNumber: '300000000000003',
      timestamp: new Date('2026-08-01T10:00:00.000Z'),
      total: '1150.00',
      taxTotal: '150.00',
    });
    const parsed = parseQrTlv(tlv);
    expect(parsed[1]).toBe('كارسِل');
    expect(parsed[2]).toBe('300000000000003');
    expect(parsed[4]).toBe('1150.00');
    expect(parsed[5]).toBe('150.00');
  });

  it('والطول بالبايتات لا بالمحارف — والاسم العربي حرفُه بايتان', () => {
    // «كارسِل» ستّة محارف واثنا عشر بايتًا
    const tlv = buildQrTlv({
      sellerName: 'كارسِل', vatNumber: '3', timestamp: new Date(0), total: '1', taxTotal: '0',
    });
    const buffer = Buffer.from(tlv, 'base64');
    expect(buffer[0]).toBe(1);
    expect(buffer[1]).toBe(Buffer.from('كارسِل', 'utf8').length);
    // ولو عُدّ محارفَ لانكسر القراءة
    expect(parseQrTlv(tlv)[1]).toBe('كارسِل');
  });
});

describe('═══ الغياب والتعطيل ليسا سواءً ═══', () => {
  /**
   * توريدٌ لا قاعدة له **ولا صفّ معطَّل يطابقه** — فالجواب «اكتب قاعدة»
   * لا «أقِرّ ما عندك». والتفريق هو ما يجعل بلاغ الحجب قابلًا للتنفيذ.
   */
  it('توريدٌ بلا أي صفّ يطابقه يردّ NO_MATCHING_RULE', async () => {
    const supply = 'ADMIN_FEE' as const;

    // نعطّل كل صفوف هذا التوريد مؤقّتًا، ثم نحذفها من المطابقة بتاريخٍ سابق
    const rows = await db.taxRule.findMany({ where: { supplyType: supply }, select: { id: true } });
    const future = new Date('2099-01-01T00:00:00Z');
    await db.taxRule.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { activeFrom: future, active: false },
    });

    try {
      const result = await issueInvoice({
        ...BASE,
        sellerType: 'INDIVIDUAL', buyerType: 'INDIVIDUAL', supplyType: supply,
        amount: '100.00',
      });
      expect(result.ok).toBe(false);
      // لا صفّ يطابق — لا مفعَّلًا ولا معطَّلًا — فالسبب غيابٌ لا انتظار
      if (!result.ok) expect(result.reason).toBe('NO_MATCHING_RULE');
    } finally {
      // الاختبار يعيد ما غيّره — وإلّا أسقط جيرانه في التشغيل التالي
      await db.taxRule.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { activeFrom: new Date('2026-01-01T00:00:00Z'), active: true },
      });
    }
  });
});

/**
 * ═══ نسبةُ ضريبة توريداتنا تُضبط وتُعطَّل من الشاشة ═══
 *
 * طلبُ المالك (٢٠٢٦-١٠-١٧): «نضبط احتساب ضريبتها كتعطيلٍ أو تفعيلٍ
 * للضريبة وتحديد نسبة الضريبة».
 *
 * **والشاشةُ كانت موجودةً ولا تصل المال**: `/admin/tax` تعدّل
 * `ratePct` و`active` لقاعدة `COMMISSION`، و`computeOrderAmounts`
 * تقرأ `PlatformSetting.vatPct` — رقمًا آخر لا تلمسه تلك الشاشة.
 * وقِيس: ضُبطت القاعدة صفرًا فبقي الطلب يحسب ٣٢٦٫٠٩.
 *
 * **والاختبارُ يُعيد ما غيّره**: القاعدةُ مرجعيّةٌ مشتركة، وتركُها
 * معطَّلةً يُسقط جيرانها في التشغيل التالي.
 */
describe('ضريبةُ العمولة تُضبط من قاعدتها', () => {
  const WHERE = { supplyType: 'COMMISSION' as const, sellerType: null };
  let before: { ratePct: Prisma.Decimal | null; active: boolean } | null = null;

  beforeAll(async () => {
    before = await db.taxRule.findFirst({ where: WHERE, select: { ratePct: true, active: true } });
  });

  afterAll(async () => {
    if (before !== null) {
      await db.taxRule.updateMany({
        where: WHERE,
        data: { ratePct: before.ratePct, active: before.active },
      });
    }
  });

  const vat = async (): Promise<string> =>
    (await computeOrderAmounts(db, 100_000)).vatAmount.toString();

  it('تعطيلُ القاعدة يُصفّر ضريبةَ الطلب', async () => {
    await db.taxRule.updateMany({ where: WHERE, data: { active: true, ratePct: 15 } });
    expect(await vat()).toBe('326.09');

    /** **وهذا هو «التعطيل» الذي طلبه** — لا سقوطَ إلى افتراضيٍّ يُبطله */
    await db.taxRule.updateMany({ where: WHERE, data: { active: false } });
    expect(await vat()).toBe('0');
  });

  it('وتبديلُ النسبة يصل المال', async () => {
    await db.taxRule.updateMany({ where: WHERE, data: { active: true, ratePct: 5 } });
    expect(await vat()).toBe('119.05');

    await db.taxRule.updateMany({ where: WHERE, data: { ratePct: 15 } });
    expect(await vat()).toBe('326.09');
  });
});
