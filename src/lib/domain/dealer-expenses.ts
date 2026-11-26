import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { DealerExpenseKind } from '@/generated/prisma/enums';
import { RIYADH_OFFSET_HOURS } from './viewing-rules';

/**
 * ═══ `D13` — مصروفُ المعرض ═══
 *
 * «تابع مصروفات المعرض اليومية والشهرية» تبيعه Plugin-soft باسمه،
 * و Optivize يربط المصروفَ بالسيارة وحدها — **فالإيجارُ والرواتب لا
 * موضعَ لهما عنده**. وعندنا `VehicleCost` يغطّي ما يلتصق بسيارة، ولا
 * شيء يغطّي ما لا يلتصق بواحدة.
 *
 * ═══ والحدُّ الفاصل هو جوهرُ الأمر ═══
 *
 * ما يُنسب إلى مركبةٍ بعينها يذهب إلى `VehicleCost` فيدخل **هامشَها**.
 * وما لا يُنسب — إيجارٌ ورواتبُ وتسويق — يذهب هنا فيدخل **نتيجةَ
 * المعرض** ولا يمسّ هامشَ سيارة. وخلطُهما يُفسد الرقمين: مصروفٌ عامّ
 * على سيارةٍ يجعل هامشَها كاذبًا، وكلفةُ سيارةٍ في العامّ تُخرجها من
 * حسابها.
 *
 * **ولا يمسّ `LedgerEntry`**: ذاك دفترُ المنصّة، وهذا دفترُ المعرض عن
 * نفسه — ومن جمعهما خلط مالَين لا يلتقيان.
 */

export type ExpenseRow = {
  id: string;
  kind: DealerExpenseKind;
  amount: string;
  note: string | null;
  spentAt: string;
  branchName: string | null;
  recordedBy: string | null;
};

export type ExpenseSummary = {
  /** مجموعُ الشهر المطلوب. */
  monthTotal: string;
  /** مجموعُ اليوم — وهو ما يُراجَع في آخر الدوام. */
  todayTotal: string;
  /** **وشهرٌ لم يُدخَل فيه شيء يقول ذلك** — لا «٠ ريال». */
  monthEntered: boolean;
  /** الأصنافُ مرتّبةً بالأكبر — فالقرارُ على الأكبر لا على القائمة. */
  byKind: { kind: DealerExpenseKind; amount: string }[];
  /** ونتيجةُ كلّ فرع تحتاج نصيبَه — و`null` للمصروف العامّ. */
  byBranch: { branchId: string | null; branchName: string | null; amount: string }[];
};

/** حدودُ شهرٍ بتوقيت الرياض — فمصروفُ آخرِ ليلةٍ يقع في شهره. */
function monthRange(month: string): { gte: Date; lt: Date } {
  const [year, index] = month.split('-').map(Number);
  const offset = RIYADH_OFFSET_HOURS * 3_600_000;
  const start = Date.UTC(year as number, (index as number) - 1, 1) - offset;
  const end = Date.UTC(year as number, index as number, 1) - offset;
  return { gte: new Date(start), lt: new Date(end) };
}

export function currentMonth(now: Date = new Date()): string {
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_HOURS * 3_600_000);
  return `${String(riyadh.getUTCFullYear())}-${String(riyadh.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type AddExpenseInput = {
  kind: DealerExpenseKind;
  amount: number;
  spentAt: Date;
  branchId: string | null;
  note: string | null;
};

export type AddExpenseResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> }
  | { ok: false; reason: 'BRANCH_NOT_YOURS' };

export function validateExpense(input: AddExpenseInput, now: Date = new Date()): Record<string, string> {
  const fields: Record<string, string> = {};
  /** **وصفرٌ ليس مصروفًا** — ومن أدخله يقول شيئًا لا يُقال بالمال. */
  if (!(input.amount > 0)) fields.amount = 'INVALID';
  if (Number.isNaN(input.spentAt.getTime())) fields.spentAt = 'INVALID';
  /**
   * **ولا يُسجَّل مصروفُ غد.** تاريخٌ في المستقبل يدخل شهرًا لم يأتِ
   * فيُفسد مجموعَه، ومن أخطأ في السنة يكتشفه بعد شهر.
   */
  else if (input.spentAt.getTime() > now.getTime() + 86_400_000) fields.spentAt = 'FUTURE';
  return fields;
}

export async function addDealerExpense(
  actor: { userId: string; dealerId: string },
  input: AddExpenseInput,
  now: Date = new Date(),
): Promise<AddExpenseResult> {
  const fields = validateExpense(input, now);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  if (input.branchId !== null) {
    const branch = await db.branch.findFirst({
      where: { id: input.branchId, dealerId: actor.dealerId },
      select: { id: true },
    });
    if (branch === null) return { ok: false, reason: 'BRANCH_NOT_YOURS' };
  }

  const created = await db.dealerExpense.create({
    data: {
      dealerId: actor.dealerId,
      branchId: input.branchId,
      kind: input.kind,
      amount: new Prisma.Decimal(input.amount),
      note: input.note === null || input.note.trim() === '' ? null : input.note.trim(),
      spentAt: input.spentAt,
      recordedById: actor.userId,
      createdAt: now,
    },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

export async function removeDealerExpense(
  actor: { dealerId: string },
  id: string,
): Promise<boolean> {
  /** **ويُحذف بمعرضه** — فمعرّفٌ من معرضٍ آخر لا يمحو صفَّ جاره. */
  const gone = await db.dealerExpense.deleteMany({
    where: { id, dealerId: actor.dealerId },
  });
  return gone.count > 0;
}

export async function dealerExpenses(
  dealerId: string,
  branchId: string | null,
  month: string,
  now: Date = new Date(),
): Promise<{ rows: ExpenseRow[]; summary: ExpenseSummary }> {
  const range = monthRange(month);
  const scope = {
    dealerId,
    /**
     * **وبائعُ الفرع يرى فرعَه والعامّ**: مصروفُ المعرض كلِّه يخصّه
     * أيضًا — وإخفاؤه يجعل مجموعَه ينقص بلا سبب يراه.
     */
    ...(branchId === null ? {} : { OR: [{ branchId }, { branchId: null }] }),
  };

  const [rows, inMonth] = await Promise.all([
    db.dealerExpense.findMany({
      where: { ...scope, spentAt: range },
      orderBy: { spentAt: 'desc' },
      take: 200,
      select: {
        id: true, kind: true, amount: true, note: true, spentAt: true,
        branch: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    db.dealerExpense.findMany({
      where: { ...scope, spentAt: range },
      select: { kind: true, amount: true, spentAt: true, branchId: true, branch: { select: { name: true } } },
    }),
  ]);

  const monthTotal = inMonth.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));

  /** واليومُ بتوقيت الرياض — لا بتوقيت الخادم. */
  const today = currentDay(now);
  const todayTotal = inMonth
    .filter((row) => currentDay(row.spentAt) === today)
    .reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));

  const kinds = new Map<DealerExpenseKind, Prisma.Decimal>();
  for (const row of inMonth) {
    kinds.set(row.kind, (kinds.get(row.kind) ?? new Prisma.Decimal(0)).add(row.amount));
  }

  const branches = new Map<string, { name: string | null; amount: Prisma.Decimal }>();
  for (const row of inMonth) {
    const key = row.branchId ?? '';
    const entry = branches.get(key) ?? { name: row.branch?.name ?? null, amount: new Prisma.Decimal(0) };
    entry.amount = entry.amount.add(row.amount);
    branches.set(key, entry);
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: row.amount.toFixed(2),
      note: row.note,
      spentAt: row.spentAt.toISOString(),
      branchName: row.branch?.name ?? null,
      recordedBy: row.recordedBy.name,
    })),
    summary: {
      monthTotal: monthTotal.toFixed(2),
      todayTotal: todayTotal.toFixed(2),
      /** **والفراغُ يقول سببَه** — لا «٠ ريال» على شهرٍ لم يُدخَل. */
      monthEntered: inMonth.length > 0,
      byKind: [...kinds.entries()]
        .map(([kind, amount]) => ({ kind, amount: amount.toFixed(2) }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
      byBranch: [...branches.entries()]
        .map(([key, entry]) => ({
          branchId: key === '' ? null : key,
          branchName: entry.name,
          amount: entry.amount.toFixed(2),
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    },
  };
}

function currentDay(at: Date): string {
  const riyadh = new Date(at.getTime() + RIYADH_OFFSET_HOURS * 3_600_000);
  return riyadh.toISOString().slice(0, 10);
}
