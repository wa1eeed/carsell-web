import { afterEach, afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { Prisma } from '../src/generated/prisma/client';
import { accountBalance, postEntries, unbalancedTransactions } from '../src/lib/domain/ledger';
import {
  recordOrderEarned,
  recordOrderPaid,
  recordRefund,
  recordSellerPayout,
} from '../src/lib/domain/ledger-events';

const ORDER = 'test-ledger-order';
const BUYER = 'test-ledger-buyer';
const SELLER = 'test-ledger-seller';

afterEach(async () => {
  // الاختبار يعيد ما غيّره — وقيدٌ باقٍ يُزيح كل رصيدٍ بعده
  await db.ledgerEntry.deleteMany({ where: { orderId: ORDER } });
  await db.ledgerEntry.deleteMany({ where: { userId: { in: [BUYER, SELLER] } } });
});

afterAll(async () => {
  await db.$disconnect();
});

/**
 * **والحكم على طلبِ الاختبار لا على الدفتر كلّه.** رصيدٌ عامّ يسقط بأيّ
 * قيدٍ تركه غيره — وهو الصنف نفسه الذي أسقط اختبار المهل من قبل.
 */
describe('الدفتر يتوازن أو لا يُكتب', () => {
  /**
   * **التوازن شرطُ كتابةٍ لا فحصٌ لاحق.** ودفترٌ يُكتب فيه غير المتوازن
   * ثم يُراجَع هو دفترٌ لا يُوثق به بين المراجعتين.
   */
  it('معاملة غير متوازنة تُرفض ولا يُكتب نصفها', async () => {
    const result = await postEntries(db, {
      event: 'test.unbalanced',
      orderId: ORDER,
      postings: [
        { account: 'ESCROW_AT_PROVIDER', direction: 'DEBIT', amount: 1000 },
        { account: 'BUYER_ADVANCE', direction: 'CREDIT', amount: 900 },
      ],
    });

    expect(result).toEqual({ ok: false, reason: 'UNBALANCED' });
    expect(await db.ledgerEntry.count({ where: { orderId: ORDER } })).toBe(0);
  });

  it('والمبلغ السالب يُرفض — الاتّجاه حقلٌ مستقلّ لا إشارة', async () => {
    const result = await postEntries(db, {
      event: 'test.negative',
      orderId: ORDER,
      postings: [
        { account: 'ESCROW_AT_PROVIDER', direction: 'DEBIT', amount: -100 },
        { account: 'BUYER_ADVANCE', direction: 'CREDIT', amount: -100 },
      ],
    });

    expect(result).toEqual({ ok: false, reason: 'NEGATIVE_AMOUNT' });
  });
});

describe('صفقة كاملة — ١٬٠٠٠ ريال', () => {
  /**
   * المثال المتّفق عليه: قيمة ١٬٠٠٠ · عمولة ١٠٪ = ١٠٠ · ضريبتها ١٥٪ =
   * ١٥ · رسوم بوابة ٢٠ على البائع ⇒ **صافي البائع ٨٦٥**.
   */
  const money = {
    orderId: ORDER,
    buyerId: BUYER,
    sellerId: SELLER,
    total: 1000,
    commission: 100,
    vat: 15,
    govtFee: 0,
    gatewayFee: 20,
  };

  it('الدفع يحجز ولا يعترف بإيراد', async () => {
    expect((await recordOrderPaid(db, money)).ok).toBe(true);

    expect((await accountBalance('ESCROW_AT_PROVIDER', { orderId: ORDER })).toString()).toBe('1000');
    expect((await accountBalance('BUYER_ADVANCE', { userId: BUYER, orderId: ORDER })).toString()).toBe('1000');
    // **لا إيراد عند القبض** — الخدمة لم تكتمل ونافذة الإرجاع لم تنقضِ
    expect((await accountBalance('PLATFORM_REVENUE', { orderId: ORDER })).toString()).toBe('0');
  });

  it('والاستحقاق يوزّع، وصافي البائع ٨٦٥', async () => {
    await recordOrderPaid(db, money);
    expect((await recordOrderEarned(db, money)).ok).toBe(true);

    expect((await accountBalance('SELLER_PAYABLE', { userId: SELLER, orderId: ORDER })).toString()).toBe('865');
    expect((await accountBalance('PLATFORM_REVENUE', { orderId: ORDER })).toString()).toBe('100');
    expect((await accountBalance('VAT_PAYABLE', { orderId: ORDER })).toString()).toBe('15');
    expect((await accountBalance('GATEWAY_FEES_CLEARING', { orderId: ORDER })).toString()).toBe('20');
    // سلفة المشتري صُفِّرت — قُبض واستُحقّ
    expect((await accountBalance('BUYER_ADVANCE', { userId: BUYER, orderId: ORDER })).toString()).toBe('0');
  });

  it('والتحويل يصفّر حقّ البائع، والأمانة تفرغ بانتهاء الصفقة', async () => {
    await recordOrderPaid(db, money);
    await recordOrderEarned(db, money);
    await recordSellerPayout(db, { orderId: ORDER, sellerId: SELLER, amount: 865 });

    expect((await accountBalance('SELLER_PAYABLE', { userId: SELLER, orderId: ORDER })).toString()).toBe('0');
    // بقي لدى المزوّد نصيبنا ورسم البوابة: ١٠٠ + ١٥ + ٢٠
    expect((await accountBalance('ESCROW_AT_PROVIDER', { orderId: ORDER })).toString()).toBe('135');
  });

  it('وكل معاملة متوازنة — بلا استثناء', async () => {
    await recordOrderPaid(db, money);
    await recordOrderEarned(db, money);
    await recordSellerPayout(db, { orderId: ORDER, sellerId: SELLER, amount: 865 });

    expect(await unbalancedTransactions()).toEqual([]);
  });
});

describe('الردّ يُعكَس ولا يُمحى', () => {
  const money = {
    orderId: ORDER,
    buyerId: BUYER,
    sellerId: SELLER,
    total: 1000,
    commission: 100,
    vat: 15,
    govtFee: 0,
    gatewayFee: 0,
  };

  it('قبل الاستحقاق: من السلفة مباشرةً — لا إيراد يُعكَس', async () => {
    await recordOrderPaid(db, money);
    expect(
      (await recordRefund(db, { orderId: ORDER, buyerId: BUYER, amount: 1000, afterEarning: false }))
        .ok,
    ).toBe(true);

    expect((await accountBalance('BUYER_ADVANCE', { userId: BUYER, orderId: ORDER })).toString()).toBe('0');
    expect((await accountBalance('ESCROW_AT_PROVIDER', { orderId: ORDER })).toString()).toBe('0');
    expect(await unbalancedTransactions()).toEqual([]);
  });

  /**
   * **وبعده يُعكَس ما اعتُرف به** — بقيدٍ عكسيّ لا بتعديل، فيبقى في
   * الدفتر أنه استُحقّ ثم رُدّ، لا أنه لم يقع.
   */
  it('بعد الاستحقاق: تعود العمولة وضريبتها، والباقي من حقّ البائع', async () => {
    await recordOrderPaid(db, money);
    await recordOrderEarned(db, money);
    await recordRefund(db, {
      orderId: ORDER,
      buyerId: BUYER,
      sellerId: SELLER,
      amount: 1000,
      afterEarning: true,
      commission: 100,
      vat: 15,
    });

    expect((await accountBalance('PLATFORM_REVENUE', { orderId: ORDER })).toString()).toBe('0');
    expect((await accountBalance('VAT_PAYABLE', { orderId: ORDER })).toString()).toBe('0');
    expect((await accountBalance('SELLER_PAYABLE', { userId: SELLER, orderId: ORDER })).toString()).toBe('0');
    expect((await accountBalance('ESCROW_AT_PROVIDER', { orderId: ORDER })).toString()).toBe('0');
    expect(await unbalancedTransactions()).toEqual([]);

    // والتاريخ محفوظ: الاستحقاق والردّ كلاهما في الدفتر
    const events = await db.ledgerEntry.findMany({
      where: { orderId: ORDER },
      select: { event: true },
      distinct: ['event'],
    });
    expect(events.map((row) => row.event).sort()).toEqual([
      'order.earned',
      'order.paid',
      'refund.after_earning',
    ]);
  });
});

describe('قيمة المركبة ليست إيرادًا', () => {
  /**
   * **أهمّ قاعدة في الدفتر.** المركبة تعبر من المشتري إلى البائع،
   * والرسم الحكوميّ صرفٌ نيابةً — وإيرادنا العمولة ورسومنا وحدها.
   * وخلطُها يُظهر منصّةً تبيع بمليارات وتخسر.
   */
  it('صفقة ٩٠٬٠٠٠ بعمولة صفر ⇒ إيراد صفر', async () => {
    const money = {
      orderId: ORDER,
      buyerId: BUYER,
      sellerId: SELLER,
      total: 90_350,
      commission: 0,
      vat: 0,
      govtFee: 350,
      gatewayFee: 0,
    };
    await recordOrderPaid(db, money);
    await recordOrderEarned(db, money);

    expect((await accountBalance('PLATFORM_REVENUE', { orderId: ORDER })).toString()).toBe('0');
    // الرسم الحكوميّ في حساب العبور — لا إيراد ولا مصروف
    expect((await accountBalance('GOVT_FEES_CLEARING', { orderId: ORDER })).toString()).toBe('350');
    expect((await accountBalance('SELLER_PAYABLE', { userId: SELLER, orderId: ORDER })).toString()).toBe('90000');
    expect(await unbalancedTransactions()).toEqual([]);
  });
});

describe('والدقّة عشريّة لا عائمة', () => {
  it('ثلث المبلغ لا يترك كسرًا في الدفتر', async () => {
    const result = await postEntries(db, {
      event: 'test.decimal',
      orderId: ORDER,
      postings: [
        { account: 'ESCROW_AT_PROVIDER', direction: 'DEBIT', amount: new Prisma.Decimal('0.10') },
        { account: 'BUYER_ADVANCE', direction: 'CREDIT', amount: new Prisma.Decimal('0.10') },
      ],
    });
    expect(result.ok).toBe(true);
    expect(await unbalancedTransactions()).toEqual([]);
  });
});

describe('دفتر المنصّة يقرأ الدفتر لا يُجمّع', () => {
  /**
   * **الاختلال يُعرض ولا يُخبَّأ.** ودفترٌ فيه معاملة لا تتوازن ليس
   * مزدوجًا — فالشاشة تقوله في صدارتها لا في ذيلها.
   */
  it('يعيد الأرصدة والاختلال معًا', async () => {
    const { platformBook } = await import('../src/lib/domain/platform-book');
    const book = await platformBook();

    expect(book.balances).toHaveLength(8);
    expect(book.unbalanced).toEqual([]);
    // الأرقام نصوصٌ بمنزلتين — لا عائمة تفقد الهللة
    expect(book.revenue).toMatch(/^-?\d+\.\d{2}$/);
    expect(book.vatPayable).toMatch(/^-?\d+\.\d{2}$/);
  });

  it('وإيراد المنصّة لا يشمل قيمة المركبات', async () => {
    const { platformBook } = await import('../src/lib/domain/platform-book');
    const before = await platformBook();

    const money = {
      orderId: ORDER,
      buyerId: BUYER,
      sellerId: SELLER,
      total: 100_000,
      commission: 0,
      vat: 0,
      govtFee: 0,
      gatewayFee: 0,
    };
    await recordOrderPaid(db, money);
    await recordOrderEarned(db, money);

    const after = await platformBook();
    // مئة ألف مرّت، والإيراد لم يتحرّك
    expect(after.revenue).toBe(before.revenue);
    expect(after.unbalanced).toEqual([]);
  });
});
