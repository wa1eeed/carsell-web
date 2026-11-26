import { Prisma } from '@/generated/prisma/client';
import type { DealerSaleChannel } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ واقعةُ البيع — بابان يكتبان جدولًا واحدًا ═══
 *
 * طلبُ المالك: «نتيجةُ كلّ فرع» و«مبيعاتُ كلّ مندوب». والسؤالان بلا
 * جوابٍ في المخزَّن: بيعةُ المنضدة فاتورةٌ وخروجُ مركبة — ولا صفَّ يقول
 * أيُّ فرعٍ باعها ولا من باعها — وبيعةُ السوق `Order` بلا مندوب.
 *
 * **والكتابةُ من دالّةٍ واحدة لا من كلّ باب**: بابان يكتبان الجدولَ
 * بيدهما يكتبانه بحقلين مختلفين أوّلَ تغيير.
 */
export type SaleFact = {
  dealerId: string;
  branchId: string | null;
  vehicleId: string;
  channel: DealerSaleChannel;
  soldById: string | null;
  price: Prisma.Decimal | string;
  buyerName: string | null;
  /** جوالُ مشتري المنضدة — مفتاحُه في دفتر عملاء المعرض. */
  buyerPhone: string | null;
  invoiceId: string | null;
  orderId: string | null;
};

type Writer = Pick<typeof db, 'dealerSale'>;

/**
 * **ويُحتمل أن تُستدعى مرّتين**: ويبهوكٌ يُعاد، أو ضغطةٌ مكرّرة. فالمفتاحُ
 * الفريدُ لكلّ باب (`orderId` · `invoiceId`) يمنع بيعتين لواقعةٍ واحدة،
 * و`skipDuplicates` يجعل الثانيةَ بلا أثرٍ بدل أن تُسقط المعاملة كلَّها.
 */
export async function recordSale(
  writer: Writer,
  fact: SaleFact,
  now: Date = new Date(),
): Promise<void> {
  await writer.dealerSale.createMany({
    data: [
      {
        dealerId: fact.dealerId,
        branchId: fact.branchId,
        vehicleId: fact.vehicleId,
        channel: fact.channel,
        soldById: fact.soldById,
        price: new Prisma.Decimal(fact.price),
        buyerName: fact.buyerName,
        buyerPhone: fact.buyerPhone,
        invoiceId: fact.invoiceId,
        orderId: fact.orderId,
        soldAt: now,
      },
    ],
    skipDuplicates: true,
  });
}

export type BranchResult = {
  branchId: string | null;
  sales: number;
  revenue: string;
  /** كلفةُ ما بيع — ومن دفترِ المركبة لا من لقطةٍ مجمَّدة. */
  cost: string;
  /** **وكم مركبةً بيعت بلا كلفةٍ مسجَّلة** — فهامشٌ ينقصه نصفُه يُقرأ كاملًا. */
  withoutCost: number;
  expenses: string;
  /**
   * **ورقمٌ لم يُدخَل ليس صفرًا** (قاعدةٌ مسجَّلة): شهرٌ بلا قيدِ مصروفٍ
   * واحد يطبع «٠ ريال» فيُقرأ «لا ننفق شيئًا»، والفرقُ بينه وبين «لم
   * يُسجَّل بعد» هو الفرقُ كلُّه — وأحدُهما إنذار.
   */
  expenseEntries: number;
};

/**
 * ═══ نتيجةُ كلّ فرع ═══
 *
 * **والنتيجةُ ثلاثةُ أرقامٍ لا رقم**: إيرادٌ وكلفةُ ما بيع ومصروفُ الفرع.
 * وإيرادٌ وحده يجعل فرعًا يبيع بالخسارة يبدو أفضلَ من جاره.
 *
 * **وفرعٌ بلا مبيعاتٍ يبقى في الجدول**: قائمةٌ مشتقّةٌ من البيعات تُسقط
 * كلَّ فرعٍ لم يبع — وهو الصفُّ الذي وُضع الجدولُ لأجله. (وهي قاعدةُ
 * «العمودُ الذي يقول ما لم يصل يُبنى من مصدره».)
 */
export async function branchResults(
  dealerId: string,
  from: Date,
  to: Date,
): Promise<BranchResult[]> {
  const [branches, sales, expenses] = await Promise.all([
    db.branch.findMany({
      where: { dealerId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
    db.dealerSale.findMany({
      where: { dealerId, soldAt: { gte: from, lt: to } },
      select: {
        branchId: true,
        price: true,
        vehicle: { select: { costs: { select: { amount: true } } } },
      },
    }),
    db.dealerExpense.groupBy({
      by: ['branchId'],
      where: { dealerId, spentAt: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  /** **والمفتاحُ نصٌّ واحد** — و`null` فرعٌ قائم (بيعةٌ بلا فرعٍ مسجَّل). */
  const key = (branchId: string | null): string => branchId ?? '';
  const rows = new Map<string, BranchResult>();
  for (const branch of branches) {
    rows.set(branch.id, {
      branchId: branch.id,
      sales: 0,
      revenue: '0',
      cost: '0',
      withoutCost: 0,
      expenses: '0',
      expenseEntries: 0,
    });
  }

  const ensure = (branchId: string | null): BranchResult => {
    const existing = rows.get(key(branchId));
    if (existing !== undefined) return existing;
    const fresh: BranchResult = {
      branchId,
      sales: 0,
      revenue: '0',
      cost: '0',
      withoutCost: 0,
      expenses: '0',
      expenseEntries: 0,
    };
    rows.set(key(branchId), fresh);
    return fresh;
  };

  for (const sale of sales) {
    const row = ensure(sale.branchId);
    row.sales += 1;
    row.revenue = new Prisma.Decimal(row.revenue).add(sale.price).toFixed(2);
    const cost = sale.vehicle.costs.reduce(
      (total, line) => total.add(line.amount),
      new Prisma.Decimal(0),
    );
    if (sale.vehicle.costs.length === 0) row.withoutCost += 1;
    row.cost = new Prisma.Decimal(row.cost).add(cost).toFixed(2);
  }

  for (const spend of expenses) {
    const row = ensure(spend.branchId);
    row.expenses = new Prisma.Decimal(row.expenses)
      .add(spend._sum.amount ?? 0)
      .toFixed(2);
    row.expenseEntries += spend._count._all;
  }

  return [...rows.values()];
}

export type SellerResult = {
  userId: string;
  name: string | null;
  sales: number;
  revenue: string;
  /** عروضٌ ردّ عليها في المدّة — ومصدرُها `Offer.respondedById`. */
  replies: number;
};

/**
 * ═══ مبيعاتُ كلّ مندوب ═══
 *
 * **وكلُّ عضوٍ في الجدول ولو لم يبع**: جدولٌ مشتقٌّ من البيعات يُخفي من
 * لم يبع — وهو أوّلُ من يُسأل عنه.
 *
 * **ولا عمولةَ هنا**: أساسُها قاعدةُ عملٍ لم تُقرَّر (نسبةٌ من السعر أم
 * من الهامش أم مبلغٌ للسيارة)، ورقمٌ يُخترع في شاشةٍ يُقرأ حقًّا
 * لصاحبه. والسؤالُ مرفوعٌ في `DESIGN-DECISIONS`.
 */
export async function sellerResults(
  dealerId: string,
  from: Date,
  to: Date,
): Promise<SellerResult[]> {
  const [members, sales, replies] = await Promise.all([
    db.user.findMany({
      where: { dealerId, dealerRole: { in: ['OWNER', 'MANAGER', 'SALES'] } },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.dealerSale.groupBy({
      by: ['soldById'],
      where: { dealerId, soldAt: { gte: from, lt: to }, soldById: { not: null } },
      _count: { _all: true },
      _sum: { price: true },
    }),
    db.offer.groupBy({
      by: ['respondedById'],
      where: {
        respondedAt: { gte: from, lt: to },
        respondedById: { not: null },
        listing: { vehicle: { dealerId } },
      },
      _count: { _all: true },
    }),
  ]);

  const soldBy = new Map(sales.map((row) => [row.soldById, row]));
  const repliedBy = new Map(replies.map((row) => [row.respondedById, row._count._all]));

  return members.map((member) => {
    const sale = soldBy.get(member.id);
    return {
      userId: member.id,
      name: member.name,
      sales: sale?._count._all ?? 0,
      revenue: new Prisma.Decimal(sale?._sum.price ?? 0).toFixed(2),
      replies: repliedBy.get(member.id) ?? 0,
    };
  });
}
