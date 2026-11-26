import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  addDealerExpense,
  currentMonth,
  dealerExpenses,
  removeDealerExpense,
  validateExpense,
} from '@/lib/domain/dealer-expenses';

/**
 * ═══ `D13` — مصروفُ المعرض ═══
 *
 * **والحدُّ الفاصل هو جوهرُ الجدول**: `VehicleCost` ما يلتصق بمركبة
 * فيدخل هامشَها، وهذا ما لا يلتصق بواحدة فيدخل نتيجةَ المعرض. وخلطُهما
 * يُفسد الرقمين.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.dealerExpense.deleteMany({ where: { id: { in: made } } });
});

async function owner() {
  const row = await db.user.findFirstOrThrow({
    where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
    select: { id: true, dealerId: true },
  });
  return { userId: row.id, dealerId: row.dealerId as string };
}

describe('validateExpense', () => {
  const base = { kind: 'RENT' as const, amount: 1000, branchId: null, note: null };
  const now = new Date('2026-11-26T09:00:00.000Z');

  it('يرفض صفرا وسالبا — وصفر ليس مصروفا', () => {
    expect(validateExpense({ ...base, amount: 0, spentAt: now }, now).amount).toBe('INVALID');
    expect(validateExpense({ ...base, amount: -5, spentAt: now }, now).amount).toBe('INVALID');
  });

  /** **ولا يُسجَّل مصروفُ غد** — فيُفسد مجموعَ شهرٍ لم يأتِ. */
  it('يرفض تاريخا في المستقبل', () => {
    const future = new Date(now.getTime() + 10 * 86_400_000);
    expect(validateExpense({ ...base, spentAt: future }, now).spentAt).toBe('FUTURE');
    expect(validateExpense({ ...base, spentAt: now }, now)).toEqual({});
  });
});

describe('دفتر المصروف', () => {
  it('يجمع الشهر ويرتب الأصناف بالأكبر — ويقول حين لا إدخال', async () => {
    const actor = await owner();
    const month = currentMonth();

    /** **وشهرٌ لم يُدخَل فيه شيء يقول ذلك** — لا «٠ ريال». */
    const before = await dealerExpenses(actor.dealerId, null, month);
    expect(before.summary.monthEntered).toBe(before.rows.length > 0);

    const rent = await addDealerExpense(actor, {
      kind: 'RENT',
      amount: 45_000,
      spentAt: new Date(),
      branchId: null,
      note: 'إيجار الاختبار',
    });
    const salaries = await addDealerExpense(actor, {
      kind: 'SALARIES',
      amount: 88_000,
      spentAt: new Date(),
      branchId: null,
      note: null,
    });
    expect(rent.ok && salaries.ok).toBe(true);
    if (rent.ok) made.push(rent.id);
    if (salaries.ok) made.push(salaries.id);

    const after = await dealerExpenses(actor.dealerId, null, month);
    expect(after.summary.monthEntered).toBe(true);
    /** **والأكبرُ أوّلًا** — فالقرارُ على الأكبر لا على ترتيب الإدخال. */
    expect(after.summary.byKind[0]?.kind).toBe('SALARIES');
    expect(Number(after.summary.monthTotal) - Number(before.summary.monthTotal)).toBe(133_000);
    /** واليومُ منها — فكلاهما أُدخل اليوم. */
    expect(Number(after.summary.todayTotal)).toBeGreaterThanOrEqual(133_000);
  });

  /** **ودفترٌ لا يُصحَّح يُهجَر** — ومعرّفُ معرضٍ آخر لا يمحو صفَّ جاره. */
  it('يحذف صفه ولا يحذف صف معرض آخر', async () => {
    const actor = await owner();
    const added = await addDealerExpense(actor, {
      kind: 'OTHER',
      amount: 10,
      spentAt: new Date(),
      branchId: null,
      note: null,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(await removeDealerExpense({ dealerId: 'someone-else' }, added.id)).toBe(false);
    expect(await removeDealerExpense({ dealerId: actor.dealerId }, added.id)).toBe(true);
  });

  /** **والفرعُ فرعُه** — ومصروفٌ يُسنَد لفرع جارٍ يُفسد نتيجتَه. */
  it('يرفض فرعا ليس من فروع المعرض', async () => {
    const actor = await owner();
    const stranger = await db.branch.findFirst({
      where: { dealerId: { not: actor.dealerId } },
      select: { id: true },
    });
    if (stranger === null) return;
    const result = await addDealerExpense(actor, {
      kind: 'RENT',
      amount: 100,
      spentAt: new Date(),
      branchId: stranger.id,
      note: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('BRANCH_NOT_YOURS');
  });
});
