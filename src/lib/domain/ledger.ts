import { randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import type { LedgerAccount, LedgerDirection } from '@/generated/prisma/enums';
import { db } from '@/lib/db';

/**
 * ═══ دفتر الأستاذ — دفترٌ لا محفظة ═══
 *
 * **المنصّة لا تحتفظ بأموال الغير.** الأمانة لدى مزوّد مرخَّص، والتقسيم
 * يقع عنده. فهذا الدفتر **لا يمنح رصيدًا يُسحب منه** — يجيب سؤالين
 * لا يجيبهما شيء آخر:
 *
 *   · للبائع: **كم لي، وكم خُصم ولماذا، ومتى يصلني؟**
 *   · لنا: **كم أُيرادنا، وكم علينا ضريبةً، وكم عند المزوّد باسمنا؟**
 *
 * ولولاه لكان الجواب اشتقاقًا من الحالة الراهنة — **والحالة الراهنة
 * نسيت التاريخ**. فسؤال «لماذا صار المستحقّ ٤٧٬٢٠٠ بعد أن كان ٤٨٬٠٠٠؟»
 * لا جواب له إلا دفترٌ يحفظ ما وقع.
 *
 * ═══ ثلاث قواعد تحكم كل قيد ═══
 *
 * **١· يُضاف ولا يُعدَّل ولا يُحذف.** التصحيح بقيدٍ عكسيّ. وصفٌّ يُعدَّل
 * يمحو التاريخ الذي بُني الدفتر لأجله.
 *
 * **٢· كل معاملة تتوازن**: مجموع المدين = مجموع الدائن، بلا استثناء.
 * تُفحص هنا عند الكتابة فتُرفض المعاملة كلها إن اختلّت — ولا تُكتب
 * نصفها.
 *
 * **٣· قيمة المركبة ليست إيرادًا، والرسم الحكوميّ ليس مصروفًا.** الأولى
 * تعبر من المشتري إلى البائع، والثاني صرفٌ نيابةً عن العميل. وإيرادنا
 * هو **العمولة والرسم الإداريّ ورسم المعالجة وحدها** — وهو تمييز
 * `fees.ts` نفسه، يصير هنا مُلزِمًا لا وصفًا.
 */

export type Posting = {
  account: LedgerAccount;
  direction: LedgerDirection;
  /** موجبٌ دائمًا — والاتّجاه يقوله `direction` لا الإشارة */
  amount: Prisma.Decimal | number | string;
  userId?: string | null;
  note?: string | null;
};

export type PostInput = {
  /** ماذا وقع — `order.paid` · `order.released` · `payout.sent` … */
  event: string;
  postings: readonly Posting[];
  orderId?: string | null;
  paymentId?: string | null;
};

export type PostFailure = 'UNBALANCED' | 'EMPTY' | 'NEGATIVE_AMOUNT';
export type PostResult = { ok: true; txnId: string } | { ok: false; reason: PostFailure };

/** يقبل `tx` أو `db` — فيُكتب القيد داخل معاملة الحدث لا بعدها. */
type Writer = Pick<typeof db, 'ledgerEntry'>;

function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * كتابة معاملة متوازنة.
 *
 * **والتوازن شرطُ كتابةٍ لا فحصٌ لاحق**: دفترٌ يُكتب فيه غير المتوازن
 * ثم يُراجَع هو دفترٌ لا يُوثق به بين المراجعتين.
 */
export async function postEntries(
  writer: Writer,
  input: PostInput,
  now: Date = new Date(),
): Promise<PostResult> {
  if (input.postings.length === 0) return { ok: false, reason: 'EMPTY' };

  let debits = new Prisma.Decimal(0);
  let credits = new Prisma.Decimal(0);

  for (const posting of input.postings) {
    const amount = toDecimal(posting.amount);
    // السالب يعني اتّجاهًا مقلوبًا كُتب خطأً — والاتّجاه حقلٌ مستقلّ
    if (amount.isNegative()) return { ok: false, reason: 'NEGATIVE_AMOUNT' };
    if (posting.direction === 'DEBIT') debits = debits.plus(amount);
    else credits = credits.plus(amount);
  }

  if (!debits.equals(credits)) return { ok: false, reason: 'UNBALANCED' };

  const txnId = randomUUID();
  await writer.ledgerEntry.createMany({
    data: input.postings.map((posting) => ({
      txnId,
      account: posting.account,
      direction: posting.direction,
      amount: toDecimal(posting.amount),
      event: input.event,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      userId: posting.userId ?? null,
      note: posting.note ?? null,
      createdAt: now,
    })),
  });

  return { ok: true, txnId };
}

/**
 * ═══ رصيد حساب ═══
 *
 * والإشارة تتبع طبيعة الحساب لا اصطلاحًا واحدًا: حسابات الالتزام
 * (`SELLER_PAYABLE` · `VAT_PAYABLE` · `BUYER_ADVANCE`) رصيدها دائن،
 * فتُحسب `credit − debit` لتخرج موجبةً حين يكون عليك مال.
 */
const CREDIT_NATURED: ReadonlySet<LedgerAccount> = new Set<LedgerAccount>([
  'BUYER_ADVANCE',
  'SELLER_PAYABLE',
  'PLATFORM_REVENUE',
  'VAT_PAYABLE',
  'GATEWAY_FEES_CLEARING',
  'GOVT_FEES_CLEARING',
]);

export async function accountBalance(
  account: LedgerAccount,
  /**
   * و`orderId` ليس ترفًا للاختبار: «كم يحتفظ المزوّد مقابل هذا الطلب؟»
   * سؤالٌ يُطرح في كل نزاع وكل مطابقة — والرصيد العامّ لا يجيبه.
   */
  where: { userId?: string; orderId?: string; until?: Date } = {},
): Promise<Prisma.Decimal> {
  const rows = await db.ledgerEntry.groupBy({
    by: ['direction'],
    where: {
      account,
      ...(where.userId === undefined ? {} : { userId: where.userId }),
      ...(where.orderId === undefined ? {} : { orderId: where.orderId }),
      ...(where.until === undefined ? {} : { createdAt: { lte: where.until } }),
    },
    _sum: { amount: true },
  });

  const debit = rows.find((row) => row.direction === 'DEBIT')?._sum.amount ?? new Prisma.Decimal(0);
  const credit = rows.find((row) => row.direction === 'CREDIT')?._sum.amount ?? new Prisma.Decimal(0);

  return CREDIT_NATURED.has(account) ? credit.minus(debit) : debit.minus(credit);
}

/**
 * ═══ الفحص الذي يكشف الخلل قبل المحاسب ═══
 *
 * يعيد المعاملات غير المتوازنة. ويجب أن يكون فارغًا دائمًا — فإن
 * امتلأ فثمّة كاتبٌ يتجاوز `postEntries`، وهو الشيء الوحيد الذي
 * يُفسد دفترًا مزدوجًا.
 */
export async function unbalancedTransactions(): Promise<
  { txnId: string; debit: string; credit: string }[]
> {
  const rows = await db.ledgerEntry.groupBy({
    by: ['txnId', 'direction'],
    _sum: { amount: true },
  });

  const totals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const row of rows) {
    const current = totals.get(row.txnId) ?? {
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    };
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    if (row.direction === 'DEBIT') current.debit = current.debit.plus(amount);
    else current.credit = current.credit.plus(amount);
    totals.set(row.txnId, current);
  }

  return [...totals.entries()]
    .filter(([, sums]) => !sums.debit.equals(sums.credit))
    .map(([txnId, sums]) => ({
      txnId,
      debit: sums.debit.toString(),
      credit: sums.credit.toString(),
    }));
}
