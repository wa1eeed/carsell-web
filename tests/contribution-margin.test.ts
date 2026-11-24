import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { indicators, monthKey } from '@/lib/domain/admin-finance';

/**
 * ═══ هامشُ المساهمة (A3) ═══
 *
 * ما يبقى من العميل بعد تكلفته المباشرة وتكلفة جلبه. **ويسبق الربحَ**:
 * لا يحمل رواتبَ ولا بنيةً تحتية — فسالبُه يعني أنّنا ندفع ليشتري
 * العميل، وذلك خبرٌ قبل أن يظهر في أيّ ربح.
 *
 * وترميز `A3` يرسمه ولم يكن له مصدر: التكلفةُ المباشرة ليست في ملخّص
 * المال، فتُقرأ من الدفتر — **ورسومُ البوّابة ليست منها**، حسابُها
 * «عبور» بنصّه.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: made } } });
  await db.$disconnect();
});

const month = monthKey(new Date());

/**
 * **والقيدُ يُكتب بطرفيه.** معاملةٌ لا تتوازن ليست مزدوجة، وسبعةُ
 * اختباراتٍ جارة تفحص التوازن — فيُقابَل كلُّ مدينٍ بدائن.
 */
async function postCost(account: 'PROVIDER_COST' | 'GOODWILL_EXPENSE', amount: number, refund = false) {
  const txnId = `test-margin-${String(Date.now())}-${String(made.length)}`;
  made.push(txnId);
  await db.ledgerEntry.createMany({
    data: [
      { txnId, account, direction: refund ? 'CREDIT' : 'DEBIT', amount, event: 'test.margin' },
      {
        txnId,
        account: 'PLATFORM_CASH',
        direction: refund ? 'DEBIT' : 'CREDIT',
        amount,
        event: 'test.margin',
      },
    ],
  });
}

describe('هامشُ المساهمة', () => {
  it('ينقص بتكلفةٍ مباشرة، ويرتدّ بردّها', async () => {
    const before = await indicators(month);
    expect(before.contributionMargin, 'لا مشترين في القاعدة').not.toBeNull();

    const start = Number(before.contributionMargin);
    const perCustomerBefore = Number(before.directCostPerCustomer);

    await postCost('PROVIDER_COST', 1000);
    const after = await indicators(month);
    expect(Number(after.contributionMargin)).toBeLessThan(start);
    expect(Number(after.directCostPerCustomer)).toBeGreaterThan(perCustomerBefore);

    /**
     * **والمصروفُ مدينٌ ناقص دائن.** أخذُ المدين وحده يحسب المردودَ
     * تكلفةً — فيبقى الهامشُ منخفضًا بعد أن رُدّ المال.
     */
    await postCost('PROVIDER_COST', 1000, true);
    const refunded = await indicators(month);
    expect(Number(refunded.contributionMargin)).toBeCloseTo(start, 2);
    expect(Number(refunded.directCostPerCustomer)).toBeCloseTo(perCustomerBefore, 2);
  });

  it('ورسومُ البوّابة لا تُحسب تكلفةً — حسابُها عبور', async () => {
    const before = await indicators(month);

    const txnId = `test-margin-gw-${String(Date.now())}`;
    made.push(txnId);
    await db.ledgerEntry.createMany({
      data: [
        { txnId, account: 'GATEWAY_FEES_CLEARING', direction: 'DEBIT', amount: 5000, event: 'test.margin' },
        { txnId, account: 'PLATFORM_CASH', direction: 'CREDIT', amount: 5000, event: 'test.margin' },
      ],
    });

    const after = await indicators(month);
    expect(after.directCostPerCustomer).toBe(before.directCostPerCustomer);
    expect(after.contributionMargin).toBe(before.contributionMargin);
  });
});
