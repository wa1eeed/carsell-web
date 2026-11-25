import { Prisma } from '@/generated/prisma/client';
import type { VehicleCostKind } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ دفترُ كلفة المركبة — قلبُ محاسبة المعرض ═══
 *
 * دورةُ المال في معرضٍ للسيارات: يشتري بسعر، ثمّ ينفق على المركبة
 * (نقلٌ وفحصٌ وصيانةٌ وتلميعٌ وجمارك)، ثمّ يبيع — **والفرقُ هامشُه،
 * والضريبةُ عليه لا على السعر**.
 *
 * و`TaxableBase.MARGIN` و`computeTax` مبنيّتان منذ المرحلة الأولى،
 * و`taxFor` تردّ `MARGIN_AMOUNT_MISSING` — **لأنّ المُدخَل غيرُ
 * موجود**: لا حقلَ لسعر الشراء في `Vehicle` إطلاقًا. فهذا الملفّ هو
 * ذاك المُدخَل.
 */

/** أصنافُ الكلفة — وسعرُ الشراء واحدٌ فيها لا جدولٌ آخر. */
export type CostKind = VehicleCostKind;

export type CostFailure =
  /** سعرُ شراءٍ ثانٍ لمركبةٍ لها واحد — والفهرسُ الجزئيّ يمنعه في القاعدة. */
  | 'PURCHASE_EXISTS'
  | 'AMOUNT_INVALID'
  | 'VEHICLE_NOT_FOUND';

/**
 * ═══ والكلفةُ موجبةٌ دائمًا ═══
 *
 * سطرٌ سالب «يصحّح» سطرًا سابقًا يجعل الدفترَ يُقرأ بالجمع والطرح معًا،
 * **والهامشُ يصير قابلًا للتلاعب بسطرٍ واحد**. والخطأُ يُصحَّح بحذف
 * سطره وكتابةِ الصحيح — فيبقى الدفتر جمعًا خالصًا.
 */
function valid(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000;
}

export async function recordCost(
  input: {
    vehicleId: string;
    kind: CostKind;
    amount: number;
    note?: string | null;
    incurredAt?: Date;
    recordedById: string;
  },
  now: Date = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; reason: CostFailure }> {
  if (!valid(input.amount)) return { ok: false, reason: 'AMOUNT_INVALID' };

  const vehicle = await db.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true },
  });
  if (vehicle === null) return { ok: false, reason: 'VEHICLE_NOT_FOUND' };

  /**
   * **والشراءُ واحد.** سطرا شراءٍ يضاعفان الكلفة فيُنتجان هامشًا
   * سالبًا تُحسب عليه ضريبة. والفحصُ هنا يقول السبب، **والفهرسُ
   * الجزئيّ في القاعدة يمنع ما يفلت منه** — فحارسٌ في مدخلٍ واحد
   * ليس حارسًا، وهذه قاعدةٌ مكتوبة في هذا المستودع.
   */
  if (input.kind === 'PURCHASE') {
    const existing = await db.vehicleCost.findFirst({
      where: { vehicleId: input.vehicleId, kind: 'PURCHASE' },
      select: { id: true },
    });
    if (existing !== null) return { ok: false, reason: 'PURCHASE_EXISTS' };
  }

  const row = await db.vehicleCost.create({
    data: {
      vehicleId: input.vehicleId,
      kind: input.kind,
      amount: new Prisma.Decimal(input.amount),
      note: input.note ?? null,
      incurredAt: input.incurredAt ?? now,
      recordedById: input.recordedById,
      createdAt: now,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export type CostBook = {
  /** سعرُ الشراء — و`null` لمركبةٍ لم يُسجَّل شراؤها بعد. */
  purchase: string | null;
  /** ما أُنفق بعد الشراء — نقلٌ وفحصٌ وصيانةٌ وغيرها. */
  addOns: string;
  /** الشراءُ وما بعده — وهو ما يُطرح من سعر البيع. */
  total: string;
  lines: { id: string; kind: CostKind; amount: string; note: string | null; at: string }[];
};

/**
 * دفترُ مركبةٍ واحدة.
 *
 * **ويُعاد `null` للشراء لا صفر**: صفرٌ يعني «اشتُريت بلا ثمن» وهو
 * ما لا يقع، و`null` تعني «لم يُسجَّل بعد» — والفرقُ بينهما هو الفرقُ
 * بين هامشٍ يساوي السعرَ كلَّه وهامشٍ **لا يُحسب**.
 */
export async function costBook(vehicleId: string): Promise<CostBook> {
  const rows = await db.vehicleCost.findMany({
    where: { vehicleId },
    orderBy: { incurredAt: 'asc' },
    select: { id: true, kind: true, amount: true, note: true, incurredAt: true },
  });

  let purchase: Prisma.Decimal | null = null;
  let addOns = new Prisma.Decimal(0);
  for (const row of rows) {
    if (row.kind === 'PURCHASE') purchase = row.amount;
    else addOns = addOns.add(row.amount);
  }

  return {
    purchase: purchase === null ? null : purchase.toFixed(2),
    addOns: addOns.toFixed(2),
    total: (purchase ?? new Prisma.Decimal(0)).add(addOns).toFixed(2),
    lines: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: row.amount.toFixed(2),
      note: row.note,
      at: row.incurredAt.toISOString(),
    })),
  };
}

/**
 * ═══ الهامشُ — وهو ما تُحسب عليه الضريبة ═══
 *
 * **و`null` ليست صفرًا.** مركبةٌ بلا سعرِ شراءٍ مسجَّل لا هامشَ لها —
 * ولا يُقال «هامشُها السعرُ كلُّه». و`taxFor` ترفض القاعدةَ الهامشية
 * حينئذٍ بـ`MARGIN_AMOUNT_MISSING`، فلا تخرج فاتورةٌ بصفرِ ضريبة على
 * بيعةٍ تستحقّها.
 *
 * **والهامشُ السالب يُقال صفرًا للضريبة لا سالبًا**: بيعٌ بخسارة لا
 * يُنتج ضريبةً مستردّة — والخسارةُ تبقى في التقارير بإشارتها.
 */
export async function vehicleMargin(
  vehicleId: string,
  salePrice: number,
): Promise<{ margin: number; taxable: number; cost: string } | null> {
  const book = await costBook(vehicleId);
  if (book.purchase === null) return null;

  const cost = Number(book.total);
  const margin = salePrice - cost;
  return { margin, taxable: Math.max(0, margin), cost: book.total };
}
