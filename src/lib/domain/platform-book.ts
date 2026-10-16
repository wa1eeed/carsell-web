import { Prisma } from '@/generated/prisma/client';
import type { LedgerAccount } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { accountBalance, unbalancedTransactions } from './ledger';

/**
 * ═══ دفتر المنصّة — من الدفتر لا بالتجميع ═══
 *
 * شاشة المالية تُجمّع الطلبات عند كل فتح، فتقول «كم» ولا تقول «لماذا
 * تغيّر». وهذا يقرأ **دفتر الأستاذ**: الأرصدة نتيجةُ قيودٍ محفوظة، وكل
 * رقمٍ فيها له أثرٌ يُتتبَّع.
 *
 * ═══ وثلاثة أرقام تُقرأ قبل غيرها ═══
 *
 * · **الإيراد** — عمولتنا ورسومنا. لا قيمة المركبات.
 * · **الضريبة المستحقّة** — دَينٌ للهيئة، ولو لم نحتفظ بريال.
 * · **ما لدى المزوّد** — التزامٌ تجاه بائعين ومشترين، لا مالٌ لنا.
 *
 * ═══ والاختلال يُعرض في الصدارة ═══
 *
 * `unbalanced` يجب أن يكون صفرًا دائمًا. وعرضُه في أسفل الشاشة يجعله
 * رقمًا يُتأمَّل؛ وفي صدارتها يجعله حدثًا يُعالَج — وهو الفرق نفسه بين
 * مطابقةٍ تُقرأ وأخرى تُنفَّذ.
 */

export type BookBalance = { account: LedgerAccount; amount: string };

export type PlatformBook = {
  /** إيرادنا — العمولة والرسوم الإدارية ورسوم المعالجة */
  revenue: string;
  /** ضريبة توريداتنا — دَينٌ قائم للهيئة */
  vatPayable: string;
  /** ما يحتفظ به المزوّد باسم صفقاتنا */
  atProvider: string;
  /** ما قُبض ولم يُستحقّ بعد */
  buyerAdvance: string;
  /** حقوق البائعين القائمة */
  sellerPayable: string;
  /** رسوم البوابة ورسوم النقل الحكومية — عبورٌ لا إيراد */
  clearing: { gateway: string; government: string };
  balances: BookBalance[];
  /** عدد القيود ولحظة آخرها — فيُعرف أحيٌّ الدفتر أم توقّف */
  entryCount: number;
  lastEntryAt: string | null;
  /** **يجب أن يكون فارغًا** — وامتلاؤه يعني كاتبًا يتجاوز `postEntries` */
  unbalanced: { txnId: string; debit: string; credit: string }[];
};

const ACCOUNTS: readonly LedgerAccount[] = [
  'ESCROW_AT_PROVIDER',
  'BUYER_ADVANCE',
  'SELLER_PAYABLE',
  'PLATFORM_REVENUE',
  'VAT_PAYABLE',
  'GATEWAY_FEES_CLEARING',
  'GOVT_FEES_CLEARING',
  'PLATFORM_CASH',
];

const str = (value: Prisma.Decimal): string => value.toFixed(2);

export async function platformBook(until?: Date): Promise<PlatformBook> {
  const scope = until === undefined ? {} : { until };

  const [amounts, unbalanced, count, last] = await Promise.all([
    Promise.all(ACCOUNTS.map((account) => accountBalance(account, scope))),
    unbalancedTransactions(),
    db.ledgerEntry.count(),
    db.ledgerEntry.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  const by = new Map<LedgerAccount, Prisma.Decimal>();
  ACCOUNTS.forEach((account, index) => by.set(account, amounts[index] ?? new Prisma.Decimal(0)));
  const at = (account: LedgerAccount): string => str(by.get(account) ?? new Prisma.Decimal(0));

  return {
    revenue: at('PLATFORM_REVENUE'),
    vatPayable: at('VAT_PAYABLE'),
    atProvider: at('ESCROW_AT_PROVIDER'),
    buyerAdvance: at('BUYER_ADVANCE'),
    sellerPayable: at('SELLER_PAYABLE'),
    clearing: { gateway: at('GATEWAY_FEES_CLEARING'), government: at('GOVT_FEES_CLEARING') },
    balances: ACCOUNTS.map((account) => ({ account, amount: at(account) })),
    entryCount: count,
    lastEntryAt: last?.createdAt.toISOString() ?? null,
    unbalanced,
  };
}

export type LedgerRow = {
  txnId: string;
  event: string;
  account: LedgerAccount;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  orderRef: string | null;
  /**
   * ═══ وما يخصّ الخدمة مرجعُه في `note` ═══
   *
   * عمود «الطلب» يُشتقّ من `orderId`، و`LedgerEntry` الخاصّ بالخدمة
   * لا يحمله — مرجعُه في `note`. فكان كلُّ قيد خدمةٍ يُعرض بـ«—»:
   * مَن يقرأ ٥١٧٫٥٠ في الدفتر **لا يعرف أيّ خدمةٍ هي**، وهو أوّل ما
   * يُسأل عنه في أيّ مراجعة.
   *
   * ولا يُخمَّن بالشكل: النصّ يُقابَل بـ`ServiceRequest.ref` فعلًا —
   * فملاحظةُ التحويل (`payout … · bankRef`) لا تُعرض مرجعًا.
   */
  subjectRef: string | null;
  subjectHref: string | null;
  createdAt: string;
};

/**
 * آخر القيود — **مرتّبةً بالمعاملة لا بالقيد المفرد**.
 *
 * وقيدٌ معروضٌ وحده لا يُفهم: المدين بلا دائنه نصفُ جملة. فتُقرأ
 * المعاملات الأحدث ثم تُعرض قيودها مجتمعةً.
 */
export async function recentEntries(limit = 60): Promise<LedgerRow[]> {
  const recent = await db.ledgerEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    distinct: ['txnId'],
    select: { txnId: true },
  });
  if (recent.length === 0) return [];

  const rows = await db.ledgerEntry.findMany({
    where: { txnId: { in: recent.map((row) => row.txnId) } },
    orderBy: [{ createdAt: 'desc' }, { direction: 'asc' }],
  });

  const orderIds = [...new Set(rows.map((row) => row.orderId).filter((id) => id !== null))];
  const orders = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, ref: true },
  });

  /** والملاحظة تُقابَل بمرجعٍ قائم — فما لم يكن مرجعًا لا يُعرض مرجعًا. */
  const notes = [...new Set(rows.map((row) => row.note).filter((note) => note !== null))];
  const services =
    notes.length === 0
      ? []
      : await db.serviceRequest.findMany({
          where: { ref: { in: notes } },
          select: { ref: true },
        });
  const serviceRefs = new Set(services.map((row) => row.ref));

  return rows.map((row) => {
    const orderRef = orders.find((order) => order.id === row.orderId)?.ref ?? null;
    const serviceRef = row.note !== null && serviceRefs.has(row.note) ? row.note : null;

    return {
      txnId: row.txnId,
      event: row.event,
      account: row.account,
      direction: row.direction,
      amount: row.amount.toFixed(2),
      orderRef,
      subjectRef: orderRef ?? serviceRef,
      subjectHref:
        orderRef !== null
          ? `/admin/orders/${encodeURIComponent(orderRef)}`
          : serviceRef !== null
            ? `/admin/service-requests/${encodeURIComponent(serviceRef)}`
            : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
