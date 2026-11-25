import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { InvoiceStatus, SupplyType } from '@/generated/prisma/enums';

/**
 * ═══ مالُ المعرض — `D7` الفواتير و`D8` التسويات ═══
 *
 * **وكلاهما قراءةٌ لما يكتبه النظام، لا حسابٌ ثانٍ له.** الفاتورة
 * يُصدرها `issueInvoice` عند التسوية بلقطةِ قاعدتها، والدفتر يُكتب من
 * `postEntries` وحدها — فشاشةٌ تجمع بيدها تُنتج رقمًا ثالثًا لا يطابق
 * الوثيقة ولا القيد.
 */

function scope(dealerId: string, branchId: string | null) {
  return { dealerId, ...(branchId === null ? {} : { branchId }) };
}

/** مِصفاةُ فواتير هذا المعرض — على طلباتِ مركباته وفرعِه. */
function invoicesOf(dealerId: string, branchId: string | null): Prisma.TaxInvoiceWhereInput {
  return { order: { listing: { vehicle: scope(dealerId, branchId) } } };
}

/**
 * شرائحُ `D7`.
 *
 * **و«اشتراك» ليست هنا، بسببٍ معلَن**: الترميزُ يرسمها، **ولا فاتورةَ
 * اشتراكٍ في المنتج** — لا `SupplyType.SUBSCRIPTION` ولا كاتب. وأصلُ
 * ذلك أنّ الباقات كلَّها بصفرٍ اليوم (`Plan.price = 0`)، فلا مبلغَ
 * يُفوتَر. ويومَ يُسعَّر الاشتراك تلزم فاتورتُه بضريبتها — وشريحةٌ
 * تُشحن اليوم تبقى صفرًا إلى الأبد تُقرأ عطلًا.
 */
export type InvoiceBucket = 'ALL' | 'SALES' | 'COMMISSION';

export const INVOICE_BUCKETS: readonly InvoiceBucket[] = ['ALL', 'SALES', 'COMMISSION'];

const BUCKET_SUPPLY: Record<InvoiceBucket, SupplyType | null> = {
  ALL: null,
  SALES: 'VEHICLE',
  COMMISSION: 'COMMISSION',
};

export type DealerInvoice = {
  number: string;
  supply: SupplyType;
  /** المركبةُ التي عنها الفاتورة — و`null` لفاتورةٍ بلا طلب. */
  vehicle: string | null;
  orderRef: string | null;
  customerName: string;
  subtotal: string;
  tax: string;
  total: string;
  status: InvoiceStatus;
  issuedAt: string;
};

export type DealerInvoiceTotals = {
  count: number;
  /** إجمالي المبيعات — فواتيرُ المركبات وحدها. */
  sales: string;
  /** ضريبةُ القيمة المضافة على ما باعه. */
  salesVat: string;
  /** عمولةُ المنصّة عليه — فواتيرُ العمولة. */
  commission: string;
  /** ما لم يبلغ هيئةَ الزكاة بعد. */
  unreported: number;
};

export const DEALER_INVOICE_CAP = 200;

export async function dealerInvoices(
  dealerId: string,
  branchId: string | null,
  bucket: InvoiceBucket = 'ALL',
): Promise<DealerInvoice[]> {
  const supply = BUCKET_SUPPLY[bucket];
  const rows = await db.taxInvoice.findMany({
    where: {
      ...invoicesOf(dealerId, branchId),
      ...(supply === null ? {} : { ruleSupplyType: supply }),
    },
    orderBy: { issuedAt: 'desc' },
    take: DEALER_INVOICE_CAP,
    select: {
      number: true, ruleSupplyType: true, customerName: true,
      subtotal: true, taxTotal: true, total: true, status: true, issuedAt: true,
      /**
       * **والبيانُ لا يُؤخذ من سطر الفاتورة.** وصفُه إنجليزيٌّ يكتبه
       * `issueSettlementDocuments` (`'vehicle'` · `'platform
       * commission'`) — فالشاشةُ العربية كانت تطبع «vehicle» خامًا.
       * والبيانُ هنا **نوعُ التوريد بالعربية والمركبةُ معه**، وهو ما
       * يرسمه الترميز: «بيع لاندكروزر ٢٠٢٤».
       */
      order: {
        select: {
          ref: true,
          listing: {
            select: {
              vehicle: {
                select: {
                  year: true,
                  brand: { select: { nameAr: true } },
                  model: { select: { nameAr: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    number: row.number,
    supply: row.ruleSupplyType,
    vehicle:
      row.order === null
        ? null
        : `${row.order.listing.vehicle.brand.nameAr} ${row.order.listing.vehicle.model.nameAr} ${String(row.order.listing.vehicle.year)}`,
    orderRef: row.order?.ref ?? null,
    customerName: row.customerName,
    subtotal: row.subtotal.toFixed(2),
    tax: row.taxTotal.toFixed(2),
    total: row.total.toFixed(2),
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
  }));
}

export async function dealerInvoiceBuckets(
  dealerId: string,
  branchId: string | null,
): Promise<Record<InvoiceBucket, number>> {
  const counts = await Promise.all(
    INVOICE_BUCKETS.map((bucket) => {
      const supply = BUCKET_SUPPLY[bucket];
      return db.taxInvoice.count({
        where: {
          ...invoicesOf(dealerId, branchId),
          ...(supply === null ? {} : { ruleSupplyType: supply }),
        },
      });
    }),
  );
  return Object.fromEntries(
    INVOICE_BUCKETS.map((bucket, index) => [bucket, counts[index] ?? 0]),
  ) as Record<InvoiceBucket, number>;
}

export async function dealerInvoiceTotals(
  dealerId: string,
  branchId: string | null,
): Promise<DealerInvoiceTotals> {
  const where = invoicesOf(dealerId, branchId);

  const [sales, commission, count, unreported] = await Promise.all([
    db.taxInvoice.aggregate({
      where: { ...where, ruleSupplyType: 'VEHICLE' },
      _sum: { total: true, taxTotal: true },
    }),
    db.taxInvoice.aggregate({
      where: { ...where, ruleSupplyType: 'COMMISSION' },
      _sum: { total: true },
    }),
    db.taxInvoice.count({ where }),
    /**
     * **وما لم يُبلَّغ يُعدّ بالحالة لا بغياب التاريخ**: `reportedAt`
     * فارغٌ في المُصدَرة حديثًا وفي الفاشلة معًا، و`CANCELLED` ليست
     * منتظِرةً للإبلاغ أصلًا.
     */
    db.taxInvoice.count({ where: { ...where, status: { in: ['ISSUED', 'REPORT_FAILED'] } } }),
  ]);

  const zero = new Prisma.Decimal(0);
  return {
    count,
    sales: (sales._sum.total ?? zero).toFixed(2),
    salesVat: (sales._sum.taxTotal ?? zero).toFixed(2),
    commission: (commission._sum.total ?? zero).toFixed(2),
    unreported,
  };
}

/**
 * ═══ `D8` — ما دخل وما خرج ═══
 *
 * **والرصيدُ ثلاثةٌ لا رقمٌ واحد**: محتجزٌ · جاهزٌ · حُوِّل. والأوّلان
 * من `deskMoney` بحارس `canSettle` نفسِه، والثالثُ **من الدفتر** —
 * `payout.sent` هو ما خرج فعلًا، لا ما كان ينبغي أن يخرج.
 */
export type DealerBalance = {
  held: string;
  heldCount: number;
  ready: string;
  readyCount: number;
  /** حُوِّل هذا الشهر — من قيود `payout.sent`. */
  paidThisMonth: string;
  payoutCount: number;
  /** آيبان المعرض مقنَّعًا — و`null` حين لا آيبان. */
  ibanMasked: string | null;
};

export async function dealerBalance(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<DealerBalance> {
  const [{ deskMoney }, { ibanMasked }] = await Promise.all([
    import('./dealer-desk'),
    import('./iban'),
  ]);

  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const orderIds = await db.order
    .findMany({ where: { listing: { vehicle: scope(dealerId, branchId) } }, select: { id: true } })
    .then((rows) => rows.map((row) => row.id));

  const [money, dealer, payouts] = await Promise.all([
    deskMoney(dealerId, branchId),
    /** **والآيبان آيبانُ صاحب المعرض** — إليه يُحوَّل، فهو ما يُعرض. */
    db.user.findFirst({
      where: { dealerId, dealerRole: 'OWNER' },
      select: { id: true, iban: true },
    }),
    db.ledgerEntry.aggregate({
      where: {
        account: 'SELLER_PAYABLE',
        direction: 'DEBIT',
        event: 'payout.sent',
        orderId: { in: orderIds },
        createdAt: { gte: month },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    held: money.held,
    heldCount: money.heldCount,
    ready: money.ready,
    readyCount: money.readyCount,
    paidThisMonth: (payouts._sum?.amount ?? new Prisma.Decimal(0)).toFixed(2),
    payoutCount: typeof payouts._count === 'number' ? payouts._count : 0,
    ibanMasked: dealer === null ? null : ibanMasked(dealer.iban),
  };
}

export type DealerLedgerKind = 'SETTLEMENT' | 'ESCROW_HELD' | 'REFUND' | 'PARTIAL_REFUND';

export type DealerLedgerRow = {
  at: string;
  kind: DealerLedgerKind;
  subject: string;
  orderRef: string;
  amount: string;
  commission: string;
  vat: string | null;
  /** الصافي — و`null` حين لم يُحسم بعد (محتجز). */
  net: string | null;
};

export const DEALER_LEDGER_CAP = 100;

/**
 * سجلُّ حركة المال على طلبات المعرض.
 *
 * **وصفوفُه من الطلب لا من الدفتر الخام**: قيدُ الدفتر مزدوجٌ بطرفين،
 * وعرضُه كما هو يُنتج سطرين لحدثٍ واحد يحتار فيهما من يقرأ. والطلبُ
 * يحمل لقطتَه — عمولته وضريبتَها — فالسطر يقول ما وقع عليه هو.
 */
export async function dealerLedger(
  dealerId: string,
  branchId: string | null,
): Promise<DealerLedgerRow[]> {
  const { netToSeller } = await import('./money');

  const orders = await db.order.findMany({
    where: {
      listing: { vehicle: scope(dealerId, branchId) },
      escrow: { isNot: null },
    },
    orderBy: { createdAt: 'desc' },
    take: DEALER_LEDGER_CAP,
    select: {
      ref: true, agreedPrice: true, settlementAmount: true,
      sellerCommission: true, sellerVat: true, createdAt: true,
      escrow: { select: { status: true, releasedAt: true, heldAt: true } },
      settlement: { select: { gatewayFee: true, issuedAt: true } },
      listing: {
        select: {
          vehicle: {
            select: {
              year: true,
              brand: { select: { nameAr: true } },
              model: { select: { nameAr: true } },
            },
          },
        },
      },
    },
  });

  return orders.map((order) => {
    const vehicle = `${order.listing.vehicle.brand.nameAr} ${order.listing.vehicle.model.nameAr} ${String(order.listing.vehicle.year)}`;
    /**
     * **والردُّ الجزئيّ ليس ردًّا.** «رد للمشتري» عن صفقةٍ بقي للبائع
     * فيها أكثرُها يقرؤها صاحبُها خسارةً كاملة.
     */
    const status = order.escrow?.status;
    const released = status === 'RELEASED';
    const net = netToSeller({ ...order, gatewayFee: order.settlement?.gatewayFee ?? null });

    return {
      at: (order.settlement?.issuedAt ?? order.escrow?.releasedAt ?? order.escrow?.heldAt ?? order.createdAt).toISOString(),
      kind: released
        ? ('SETTLEMENT' as const)
        : status === 'REFUNDED'
          ? ('REFUND' as const)
          : status === 'PARTIAL_REFUND'
            ? ('PARTIAL_REFUND' as const)
            : ('ESCROW_HELD' as const),
      subject: vehicle,
      orderRef: order.ref,
      amount: (order.settlementAmount ?? order.agreedPrice).toFixed(2),
      commission: order.sellerCommission.toFixed(2),
      vat: order.sellerVat.isZero() ? null : order.sellerVat.toFixed(2),
      /** **والمحتجزُ بلا صافٍ**: رقمٌ تحت «الصافي» يُقرأ مالًا وصل. */
      net: released ? net.toFixed(2) : null,
    };
  });
}
