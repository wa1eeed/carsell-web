import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { ReconciliationStatus } from '@/generated/prisma/enums';
import { resolveForPayment } from '@/lib/payments/resolve';
import { effectiveEnvironment } from './integration-env';
import { sum } from './money';

/**
 * ═══ المطابقة اليومية — دفترُنا مرآة ═══
 *
 * **والمرآة التي لا تُقارَن بالأصل ليست مرآة.** فما لم يُقرأ من البوابة
 * ويُقارَن بما عندنا، فكل ما نعرفه أن دفترنا متّسقٌ مع نفسه.
 *
 * ═══ والفرق حدثٌ يُعالَج لا رقمٌ يُتأمَّل ═══
 *
 * ولذلك يُكتب **جدول المعاملات المختلفة** لا المجاميع: مجموعٌ يقول
 * «ينقص ٤٢٠ ريالًا» يجعل المشغّل يعرف أن ثمّة خطأً ولا يعرف أين، فيُغلق
 * التنبيه بلا معالجة. والقائمة تقول أيّ مرجعٍ اختلف وبكم.
 */

/** فرقٌ في معاملة بعينها — بمرجعها لا بمجموعها. */
export type Mismatch = {
  ref: string;
  /** ما عندنا — `null` حين لا نعرف المعاملة أصلًا */
  ours: string | null;
  /** ما عند البوابة — `null` حين لا تعرفها هي */
  theirs: string | null;
  kind: 'MISSING_HERE' | 'MISSING_THERE' | 'AMOUNT_DIFFERS';
};

export type ReconcileResult = {
  gatewayKey: string;
  date: string;
  status: ReconciliationStatus;
  ourTotal: string;
  gatewayTotal: string | null;
  diff: string;
  mismatches: Mismatch[];
  note: string | null;
};

function dayBounds(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/**
 * مطابقة بوابةٍ ليومٍ واحد.
 *
 * **والقراءة لا تكتب مالًا.** تُقارن وتُسجّل، ولا تُصحّح دفترًا ولا
 * تُحرّك مبلغًا — والتصحيح قرارٌ يتّخذه إنسان بعد أن يرى أيّ معاملةٍ
 * اختلفت.
 */
export async function reconcileGateway(
  gatewayKey: string,
  date: Date,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const { from, to } = dayBounds(date);

  /**
   * دفترنا: ما سُوِّي أو رُدّ في ذلك اليوم على هذه البوابة. والتجميع
   * بـ`gatewayKey` لا بالتوجيه الجاري — يوم التبديل تكون البوابتان
   * مسؤولتين معًا، ولا يصف أيُّ توجيهٍ واحد ذلك اليوم.
   */
  const ours = await db.payment.findMany({
    where: {
      gatewayKey,
      OR: [
        { settledAt: { gte: from, lt: to } },
        { status: { in: ['RETURNED', 'PARTIALLY_RETURNED'] }, createdAt: { gte: from, lt: to } },
      ],
    },
    select: { settleRef: true, holdRef: true, settledAmount: true, amount: true, returnedAmount: true },
  });

  const ourEntries = new Map<string, Prisma.Decimal>();
  for (const payment of ours) {
    const ref = payment.settleRef ?? payment.holdRef;
    if (ref === null) continue;
    const settled = payment.settledAmount ?? payment.amount;
    const returned = payment.returnedAmount ?? new Prisma.Decimal(0);
    ourEntries.set(ref, settled.minus(returned));
  }
  const ourTotal = sum([...ourEntries.values()]);

  const environment = effectiveEnvironment('LIVE');
  const gateway = await resolveForPayment(gatewayKey, environment);
  const settlement = await gateway.settlementFor(from);

  /**
   * **تعذّرت القراءة ⇒ `UNAVAILABLE` لا `MATCHED`.**
   *
   * وبوابةٌ لم تُقرأ لم تُطابَق. واختزالُ الغياب في تطابقٍ يجعل صمت
   * المزوّد يبدو سلامةً — وهو أسوأ ما يمكن أن يقوله تقرير مطابقة.
   */
  if (!settlement.available) {
    return persist({
      gatewayKey,
      date: from,
      status: 'UNAVAILABLE',
      ourTotal,
      gatewayTotal: null,
      diff: new Prisma.Decimal(0),
      mismatches: [],
      note: settlement.reason,
      now,
    });
  }

  const theirEntries = new Map<string, Prisma.Decimal>();
  for (const entry of settlement.entries) {
    const signed =
      entry.kind === 'RETURN' || entry.kind === 'FEE'
        ? new Prisma.Decimal(entry.amount).negated()
        : new Prisma.Decimal(entry.amount);
    theirEntries.set(entry.ref, (theirEntries.get(entry.ref) ?? new Prisma.Decimal(0)).plus(signed));
  }

  const mismatches: Mismatch[] = [];
  for (const [ref, amount] of ourEntries) {
    const theirs = theirEntries.get(ref);
    if (theirs === undefined) {
      mismatches.push({ ref, ours: amount.toString(), theirs: null, kind: 'MISSING_THERE' });
    } else if (!theirs.equals(amount)) {
      mismatches.push({
        ref,
        ours: amount.toString(),
        theirs: theirs.toString(),
        kind: 'AMOUNT_DIFFERS',
      });
    }
  }
  for (const [ref, amount] of theirEntries) {
    if (!ourEntries.has(ref)) {
      mismatches.push({ ref, ours: null, theirs: amount.toString(), kind: 'MISSING_HERE' });
    }
  }

  const gatewayTotal = new Prisma.Decimal(settlement.total);

  /**
   * **التطابق شرطان معًا**: المجموع والقائمة. ومجموعان متساويان مع
   * فرقين متعاكسين تطابقٌ في الحساب وخطأٌ في الدفتر — وهو ما يمرّ من
   * كل مطابقةٍ تقارن المجاميع وحدها.
   */
  const diff = ourTotal.minus(gatewayTotal);
  const matched = diff.isZero() && mismatches.length === 0;

  return persist({
    gatewayKey,
    date: from,
    status: matched ? 'MATCHED' : 'DIFFERS',
    ourTotal,
    gatewayTotal,
    diff,
    mismatches,
    note: null,
    now,
  });
}

async function persist(input: {
  gatewayKey: string;
  date: Date;
  status: ReconciliationStatus;
  ourTotal: Prisma.Decimal;
  gatewayTotal: Prisma.Decimal | null;
  diff: Prisma.Decimal;
  mismatches: Mismatch[];
  note: string | null;
  now: Date;
}): Promise<ReconcileResult> {
  const data = {
    ourTotal: input.ourTotal,
    gatewayTotal: input.gatewayTotal,
    diff: input.diff,
    status: input.status,
    mismatches: input.mismatches as unknown as Prisma.InputJsonValue,
    note: input.note,
    ranAt: input.now,
  };

  // إعادة التشغيل تُحدّث ولا تُكرّر — صفٌّ واحد لكل (بوابة، يوم)
  await db.reconciliationRun.upsert({
    where: { gatewayKey_date: { gatewayKey: input.gatewayKey, date: input.date } },
    update: data,
    create: { gatewayKey: input.gatewayKey, date: input.date, ...data },
  });

  return {
    gatewayKey: input.gatewayKey,
    date: input.date.toISOString().slice(0, 10),
    status: input.status,
    ourTotal: input.ourTotal.toString(),
    gatewayTotal: input.gatewayTotal?.toString() ?? null,
    diff: input.diff.toString(),
    mismatches: input.mismatches,
    note: input.note,
  };
}

/**
 * تشغيل اليوم على كل بوابة مربوطة.
 *
 * **ودالّةٌ تمرّ على مجموعةٍ تلمس مالًا لا تكتب** — وهذه لا تكتب مالًا
 * أصلًا: تقرأ وتقارن وتسجّل تقريرًا. والتصحيح استدعاءٌ مفرد صريح يقرّره
 * إنسان بعد أن يرى القائمة.
 */
export async function reconcileAll(date: Date, now: Date = new Date()): Promise<ReconcileResult[]> {
  const gateways = await db.paymentGateway.findMany({
    where: { status: { not: 'INACTIVE' } },
    select: { key: true },
    orderBy: { key: 'asc' },
  });

  const results: ReconcileResult[] = [];
  for (const gateway of gateways) {
    results.push(await reconcileGateway(gateway.key, date, now));
  }
  return results;
}

export type ReconciliationRow = {
  gatewayKey: string;
  date: string;
  status: ReconciliationStatus;
  ourTotal: string;
  gatewayTotal: string | null;
  diff: string;
  mismatchCount: number;
  note: string | null;
  ranAt: string;
};

export async function listRuns(days = 14): Promise<ReconciliationRow[]> {
  const rows = await db.reconciliationRun.findMany({
    orderBy: [{ date: 'desc' }, { gatewayKey: 'asc' }],
    take: days * 4,
  });

  return rows.map((row) => ({
    gatewayKey: row.gatewayKey,
    date: row.date.toISOString().slice(0, 10),
    status: row.status,
    ourTotal: row.ourTotal.toString(),
    gatewayTotal: row.gatewayTotal?.toString() ?? null,
    diff: row.diff.toString(),
    mismatchCount: Array.isArray(row.mismatches) ? row.mismatches.length : 0,
    note: row.note,
    ranAt: row.ranAt.toISOString(),
  }));
}

/** معاملات يومٍ المختلفة — تُقرأ عند فتح التنبيه لا في القائمة. */
export async function runMismatches(
  gatewayKey: string,
  date: string,
): Promise<Mismatch[]> {
  const row = await db.reconciliationRun.findUnique({
    where: { gatewayKey_date: { gatewayKey, date: new Date(`${date}T00:00:00.000Z`) } },
  });
  if (row === null) return [];
  return Array.isArray(row.mismatches) ? (row.mismatches as unknown as Mismatch[]) : [];
}
