import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type {
  BuyerType,
  InvoiceIssuer,
  SellerType,
  SupplyType,
  TaxableBase,
} from '@/generated/prisma/enums';

/**
 * محرّك الضريبة والفوترة — A21.
 *
 * **هذا الملف وحده يحسب الضريبة.** والبوابة ١٦ تمنع نسبةً مكتوبة في
 * غيره، والبوابة ١٧ تمنع أي نصّ عربي هنا.
 *
 * ولماذا محرّكٌ لا فرعٌ في الكود: تعديل ضريبة القيمة المضافة قد يجعل
 * المنصّة «موِردًا مفترضًا»، فتُستحقّ الضريبة على كامل قيمة المركبة لا
 * على العمولة — الفرق بين ١٥٠ و١٥٬٠٠٠ في صفقة واحدة. والتصنيف ينتظر
 * مذكرة ضريبية، فالمعالجة صفوفٌ يديرها الأدمن.
 *
 * و`vat.ts` مدموجٌ هنا: النسبة تُقرأ من `TaxRule` لا من ثابت، وبقاؤها
 * في ملفين كان سيجعل لها مصدرين.
 */

/** النسبة الافتراضية — تبقى للعمولة والخدمات حتى تُستبدل بصفٍّ. */
export const DEFAULT_VAT_PCT = 15;

/**
 * ═══ قرار ١٧ ═══ **الضريبة مضمَّنة لا مضافة.**
 *
 * السعر المعروض شاملٌ للضريبة، فحصّتها منه `total × r/(100+r)` لا
 * `total × r/100`. والفرق ليس تقريبًا: على ١١٥٬٠٠٠ ريال، المضمَّنة
 * ١٥٬٠٠٠ والمضافة ١٧٬٢٥٠ — ألفان ومئتان وخمسون ريالًا تُدفع من جيب
 * أحدهم.
 */
export function vatIncluded(
  total: Prisma.Decimal | number | string,
  ratePct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  const amount = new Prisma.Decimal(total);
  const rate = new Prisma.Decimal(ratePct);
  if (rate.isZero()) return new Prisma.Decimal(0);
  return amount.times(rate).dividedBy(rate.plus(100)).toDecimalPlaces(2);
}

/** الصافي قبل الضريبة — ومجموعه مع `vatIncluded` الإجماليُّ بلا فرق قرش. */
export function netOfVat(
  total: Prisma.Decimal | number | string,
  ratePct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  return new Prisma.Decimal(total).minus(vatIncluded(total, ratePct));
}

export type RuleQuery = {
  sellerType: SellerType;
  buyerType: BuyerType;
  supplyType: SupplyType;
};

export type MatchedRule = {
  id: string;
  sellerType: SellerType | null;
  buyerType: BuyerType | null;
  supplyType: SupplyType;
  taxableBase: TaxableBase;
  ratePct: Prisma.Decimal | null;
  invoiceIssuer: InvoiceIssuer;
  supplierIsPlatform: boolean;
};

/**
 * المطابقة **بالأدقّ نطاقًا**: الصفّ الذي يحدّد البائع والمشتري معًا
 * يسبق الذي يحدّد أحدهما، وذاك يسبق العامّ.
 *
 * والترتيب صريح لا معتمد على ترتيب الإدراج: صفٌّ أُضيف اليوم لا يجب أن
 * يزيح صفًّا أدقّ منه أُضيف أمس.
 */
function specificity(rule: MatchedRule): number {
  return (rule.sellerType === null ? 0 : 2) + (rule.buyerType === null ? 0 : 1);
}

export async function matchRule(
  query: RuleQuery,
  at: Date = new Date(),
): Promise<MatchedRule | null> {
  const rows = await db.taxRule.findMany({
    where: {
      supplyType: query.supplyType,
      active: true,
      activeFrom: { lte: at },
      OR: [{ activeTo: null }, { activeTo: { gt: at } }],
      AND: [
        { OR: [{ sellerType: null }, { sellerType: query.sellerType }] },
        { OR: [{ buyerType: null }, { buyerType: query.buyerType }] },
      ],
    },
  });

  if (rows.length === 0) return null;
  const candidates: MatchedRule[] = rows.map((row) => ({
    id: row.id,
    sellerType: row.sellerType,
    buyerType: row.buyerType,
    supplyType: row.supplyType,
    taxableBase: row.taxableBase,
    ratePct: row.ratePct,
    invoiceIssuer: row.invoiceIssuer,
    supplierIsPlatform: row.supplierIsPlatform,
  }));

  return candidates.sort((a, b) => specificity(b) - specificity(a))[0] ?? null;
}

export type TaxAmounts = { subtotal: string; taxTotal: string; total: string };

/**
 * الحساب على **وعاء القاعدة** لا على المبلغ دائمًا.
 *
 * و`OUT_OF_SCOPE` صفرٌ لا إغفال: خارج النطاق يعني ضريبةً صفرًا معلنة،
 * لا غياب حساب.
 */
export function computeTax(
  base: TaxableBase,
  amount: Prisma.Decimal | number | string,
  ratePct: Prisma.Decimal | number | string | null,
  marginAmount?: Prisma.Decimal | number | string,
): TaxAmounts {
  const gross = new Prisma.Decimal(amount);

  if (base === 'OUT_OF_SCOPE' || ratePct === null) {
    return { subtotal: gross.toString(), taxTotal: '0', total: gross.toString() };
  }

  const taxed =
    base === 'MARGIN'
      ? new Prisma.Decimal(marginAmount ?? 0)
      : gross;

  const tax = vatIncluded(taxed, ratePct);
  return {
    subtotal: gross.minus(tax).toString(),
    taxTotal: tax.toString(),
    total: gross.toString(),
  };
}

export type IssueFailure =
  | 'NO_MATCHING_RULE'
  | 'MARGIN_NOT_APPROVED'
  | 'ALREADY_ISSUED';

export type IssueInput = {
  orderId?: string;
  sellerType: SellerType;
  buyerType: BuyerType;
  supplyType: SupplyType;
  amount: string;
  marginAmount?: string;
  /** اعتماد الهيئة على التاجر — **لا يُفترض أبدًا**. */
  dealerMarginApproved?: boolean;
  supplierName: string;
  supplierVatNo?: string | null;
  supplierAddress?: string | null;
  customerName: string;
  customerVatNo?: string | null;
  description: string;
  suppliedAt: Date;
};

export type IssueResult =
  | { ok: true; invoiceId: string; number: string; sequence: number; amounts: TaxAmounts }
  | { ok: false; reason: IssueFailure };

/**
 * إصدار فاتورة ضريبية.
 *
 * **لا قيمة افتراضية عند غياب قاعدة**: الإصدار يتوقّف ويسجّل السبب،
 * ولا يفترض «وسيط» ولا «مورد». وافتراضٌ هنا يعني وثيقةً قانونية بُنيت
 * على تخمين.
 *
 * **والقاعدة تُنسَخ لقطةً كاملة**: تعديلها لاحقًا لا يغيّر ما صدر.
 */
export async function issueInvoice(
  input: IssueInput,
  now: Date = new Date(),
): Promise<IssueResult> {
  const rule = await matchRule(
    { sellerType: input.sellerType, buyerType: input.buyerType, supplyType: input.supplyType },
    now,
  );
  if (rule === null) return { ok: false, reason: 'NO_MATCHING_RULE' };

  /**
   * **هامش الربح لا يُطبَّق بلا اعتماد.** القاعدة قد تقول `MARGIN`،
   * لكنها تصف تاجرًا معتمدًا — وتطبيقها على غيره احتسابٌ ناقص للضريبة.
   */
  if (rule.taxableBase === 'MARGIN' && input.dealerMarginApproved !== true) {
    return { ok: false, reason: 'MARGIN_NOT_APPROVED' };
  }

  const amounts = computeTax(rule.taxableBase, input.amount, rule.ratePct, input.marginAmount);

  return db.$transaction(async (tx) => {
    /**
     * التسلسل **متّصل بلا فجوات**: يُقرأ الأعلى ويُزاد واحدًا داخل
     * المعاملة. ولا حذف فاتورة أبدًا، فالفجوة لا تنشأ إلا بخطأ.
     */
    const last = await tx.taxInvoice.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const number = `INV-${String(now.getUTCFullYear())}-${String(sequence).padStart(6, '0')}`;
    const uuid = randomUUID();

    const invoice = await tx.taxInvoice.create({
      data: {
        sequence,
        number,
        uuid,
        orderId: input.orderId ?? null,
        // ═══ لقطة القاعدة — لا مرجعها وحده ═══
        ruleId: rule.id,
        ruleSellerType: rule.sellerType,
        ruleBuyerType: rule.buyerType,
        ruleSupplyType: rule.supplyType,
        ruleTaxableBase: rule.taxableBase,
        ruleRatePct: rule.ratePct,
        ruleInvoiceIssuer: rule.invoiceIssuer,
        supplierName: input.supplierName,
        supplierVatNo: input.supplierVatNo ?? null,
        supplierAddress: input.supplierAddress ?? null,
        customerName: input.customerName,
        customerVatNo: input.customerVatNo ?? null,
        issuedAt: now,
        suppliedAt: input.suppliedAt,
        subtotal: new Prisma.Decimal(amounts.subtotal),
        taxTotal: new Prisma.Decimal(amounts.taxTotal),
        total: new Prisma.Decimal(amounts.total),
        qrTlv: buildQrTlv({
          sellerName: input.supplierName,
          vatNumber: input.supplierVatNo ?? '',
          timestamp: now,
          total: amounts.total,
          taxTotal: amounts.taxTotal,
        }),
        status: 'ISSUED',
      },
    });

    await tx.taxInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        description: input.description,
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(amounts.total),
        subtotal: new Prisma.Decimal(amounts.subtotal),
        taxAmount: new Prisma.Decimal(amounts.taxTotal),
        total: new Prisma.Decimal(amounts.total),
      },
    });

    await tx.taxInvoice.update({
      where: { id: invoice.id },
      data: { invoiceHash: hashInvoice(invoice.id, number, amounts.total) },
    });

    return { ok: true, invoiceId: invoice.id, number, sequence, amounts };
  });
}

export type CancelResult =
  | { ok: true; creditNoteId: string; number: string }
  | { ok: false; reason: 'INVOICE_NOT_FOUND' | 'ALREADY_CANCELLED' | 'REASON_REQUIRED' };

/**
 * الإلغاء **بإشعار دائن لا بحذف**.
 *
 * الفاتورة وثيقة، وحذفها يكسر التسلسل ويترك فجوةً لا تُفسَّر. والإشعار
 * يشير إلى الأصل فيبقى المساران مقروءين معًا.
 */
export async function cancelInvoice(
  invoiceId: string,
  reason: string,
  issuedBy: string,
  now: Date = new Date(),
): Promise<CancelResult> {
  if (reason.trim().length < 5) return { ok: false, reason: 'REASON_REQUIRED' };

  const invoice = await db.taxInvoice.findUnique({ where: { id: invoiceId } });
  if (invoice === null) return { ok: false, reason: 'INVOICE_NOT_FOUND' };
  if (invoice.status === 'CANCELLED') return { ok: false, reason: 'ALREADY_CANCELLED' };

  return db.$transaction(async (tx) => {
    const last = await tx.creditNote.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const number = `CRN-${String(now.getUTCFullYear())}-${String(sequence).padStart(6, '0')}`;

    const note = await tx.creditNote.create({
      data: {
        sequence,
        number,
        uuid: randomUUID(),
        invoiceId,
        reason: reason.trim(),
        amount: invoice.total,
        taxAmount: invoice.taxTotal,
        issuedAt: now,
        issuedBy,
      },
    });

    // الأصل يبقى — ويُعلَّم لا يُمحى
    await tx.taxInvoice.update({ where: { id: invoiceId }, data: { status: 'CANCELLED' } });

    return { ok: true, creditNoteId: note.id, number };
  });
}

/**
 * QR بترميز TLV ثم Base64 — الحقول الخمسة التي تشترطها «فاتورة».
 *
 * والطول بالبايتات لا بالمحارف: الاسم العربي حرفُه بايتان في UTF-8،
 * وعدُّه محارفَ يُنتج رمزًا لا يُقرأ.
 */
export function buildQrTlv(input: {
  sellerName: string;
  vatNumber: string;
  timestamp: Date;
  total: string;
  taxTotal: string;
}): string {
  const fields: [number, string][] = [
    [1, input.sellerName],
    [2, input.vatNumber],
    [3, input.timestamp.toISOString()],
    [4, input.total],
    [5, input.taxTotal],
  ];

  const parts = fields.map(([tag, value]) => {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
  });

  return Buffer.concat(parts).toString('base64');
}

function hashInvoice(id: string, number: string, total: string): string {
  return createHash('sha256').update(`${id}|${number}|${total}`).digest('hex');
}

/** يقرأ حقول TLV — للاختبار وللتحقّق من رمزٍ مطبوع. */
export function parseQrTlv(base64: string): Record<number, string> {
  const buffer = Buffer.from(base64, 'base64');
  const out: Record<number, string> = {};
  let at = 0;
  while (at + 2 <= buffer.length) {
    const tag = buffer[at];
    const length = buffer[at + 1];
    if (tag === undefined || length === undefined) break;
    out[tag] = buffer.subarray(at + 2, at + 2 + length).toString('utf8');
    at += 2 + length;
  }
  return out;
}
