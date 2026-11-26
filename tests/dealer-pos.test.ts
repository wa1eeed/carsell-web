import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { sellAtCounter, validatePosSale } from '@/lib/domain/dealer-pos';

/**
 * ═══ `D14` — بيعةُ الصالة ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: POS يتعامل مع عملاء الصالة **ويستعرض المخزونَ
 * نفسَه**. وأخطرُ ما فيها أن تُباع السيارةُ مرّتين — في الصالة وعلى
 * كارز — فالخروجُ من السوق جزءٌ من المعاملة لا أثرٌ بعدها.
 */

const made: { invoices: string[]; listings: { id: string; status: string }[] } = {
  invoices: [],
  listings: [],
};

afterAll(async () => {
  if (made.invoices.length > 0) {
    await db.taxInvoiceLine.deleteMany({ where: { invoiceId: { in: made.invoices } } });
    await db.taxInvoice.deleteMany({ where: { id: { in: made.invoices } } });
  }
  /** **وما غيّره الاختبار يُعاد** — وإلّا أسقط جيرانَه في التشغيل التالي. */
  for (const row of made.listings) {
    await db.listing.update({
      where: { id: row.id },
      data: { status: row.status as 'PUBLISHED', closedAt: null, closeReason: null },
    });
  }
  await db.auditLog.deleteMany({ where: { action: 'dealer.pos.sale' } });
});

describe('validatePosSale', () => {
  const base = {
    vehicleId: 'x',
    price: 90_000,
    buyerName: 'عميل الصالة',
    buyerPhone: null,
    buyerVatNo: null,
    method: 'CASH' as const,
    note: null,
  };

  it('يرفض سعرا صفرا واسما ناقصا', () => {
    expect(validatePosSale({ ...base, price: 0 }).price).toBe('INVALID');
    expect(validatePosSale({ ...base, buyerName: 'أ' }).buyerName).toBe('REQUIRED');
    expect(validatePosSale(base)).toEqual({});
  });

  /**
   * **والرقمُ الضريبيّ بفاحصه القائم** — يفرّق «خمسةَ عشرَ رقمًا» عن
   * «يبدأ بـ٣ وينتهي بـ٣»، ومن أدخل أربعةَ عشرَ لا تنفعه رسالةُ النمط.
   */
  it('ويفرق سبب رفض الرقم الضريبي', () => {
    expect(validatePosSale({ ...base, buyerVatNo: '31234567890123' }).buyerVatNo).toBe('LENGTH');
    expect(validatePosSale({ ...base, buyerVatNo: '112345678901234' }).buyerVatNo).toBe('PATTERN');
    expect(validatePosSale({ ...base, buyerVatNo: '300000000000003' })).toEqual({});
  });
});

describe('sellAtCounter', () => {
  it('يصدر فاتورة ويخرج المركبة من السوق بسببها الحقيقي', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' }, vatNumber: { not: null } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;

    /** مركبةٌ معروضةٌ الآن — فالفحصُ يقيس الخروجَ من السوق لا الصمت. */
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', vehicle: { dealerId } },
      select: { id: true, status: true, vehicleId: true },
    });
    made.listings.push({ id: listing.id, status: listing.status });

    const result = await sellAtCounter(
      { userId: owner.id, dealerId, branchId: null },
      {
        vehicleId: listing.vehicleId,
        price: 99_500,
        buyerName: 'عميل الصالة',
        buyerPhone: '0555555555',
        buyerVatNo: null,
        method: 'CASH',
        note: null,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    made.invoices.push(result.invoiceId);

    /**
     * **والسعرُ شاملُ الضريبة** — فالإجماليُّ هو ما يدفعه العميل،
     * والأساسُ والضريبةُ يُفصلان منه. والشاشةُ تقول ذلك بعد أن كانت
     * تقول «تحسب عليه».
     */
    const invoice = await db.taxInvoice.findUniqueOrThrow({
      where: { id: result.invoiceId },
      select: { subtotal: true, taxTotal: true, total: true, customerName: true },
    });
    expect(Number(invoice.total)).toBe(99_500);
    expect(Number(invoice.subtotal) + Number(invoice.taxTotal)).toBeCloseTo(99_500, 2);
    /** **ولا ضريبةَ صفرٍ على بائعٍ مسجَّل** — وإلّا كانت الورقةُ ناقصة. */
    expect(Number(invoice.taxTotal)).toBeGreaterThan(0);

    /** **والسيارةُ تخرج من السوق** — وإلّا بيعت مرّتين. */
    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { status: true, closeReason: true },
    });
    expect(after.status).toBe('SOLD');
    /**
     * **وسببُ الخروج يُقال كما وقع.** كان `markListingSold` يكتب
     * `order.completed` دائمًا — فبيعةُ الصالة تُغلق الإعلانَ بسببٍ لا
     * وجود له، ويبحث المراجعُ عن طلبٍ ليس هناك.
     */
    expect(after.closeReason).toBe('dealer.pos.sale');
  });

  /** **ومركبةُ معرضٍ آخر لا تُباع من منضدتك.** */
  it('يرفض مركبة ليست في مخزونه', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const stranger = await db.vehicle.findFirst({
      where: { dealerId: { not: owner.dealerId } },
      select: { id: true },
    });
    if (stranger === null) return;

    const result = await sellAtCounter(
      { userId: owner.id, dealerId: owner.dealerId as string, branchId: null },
      {
        vehicleId: stranger.id,
        price: 50_000,
        buyerName: 'عميل',
        buyerPhone: null,
        buyerVatNo: null,
        method: 'CASH',
        note: null,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('VEHICLE_NOT_FOUND');
  });
});

describe('حدود المنضدة', () => {
  /** **ولا طلبَ سوقٍ يُنشأ** — وإلّا ضُخّم حجمُ المبيعات ونُسبت عمولةٌ لم تُؤخذ. */
  it('لا تنشئ طلبا ولا ضمانا', () => {
    const source = readFileSync('src/lib/domain/dealer-pos.ts', 'utf8');
    expect(source).not.toContain('order.create');
    expect(source).not.toContain('escrow');
  });

  /** **ولا تحسب ضريبةً بنفسها** — القاعدةُ في `tax.ts` وحدها. */
  it('والضريبة من مصدرها', () => {
    const source = readFileSync('src/lib/domain/dealer-pos.ts', 'utf8');
    expect(source).toContain('issueInvoice');
    expect(source).not.toMatch(/0\.15|\* *15/);
  });

  /** **وحارسُ الموديول في الخادم أيضًا** — وإخفاءُ بندٍ اقتراح. */
  it('والمسار يفحص الموديول', () => {
    const route = readFileSync('src/app/api/v1/dealer/pos/route.ts', 'utf8');
    expect(route).toContain('DEALER_MODULE.pos');
    expect(route).toContain('dealerHasModule');
  });
});
