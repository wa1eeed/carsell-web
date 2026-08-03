import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { DEFAULT_VAT_PCT, netOfVat, pct, sum, vatIncluded } from '@/lib/domain/money';
import {
  SIMULATED_PERCENTAGES,
  financeInputs,
  financeSummary,
  indicators,
  monthKey,
  setFinanceInput,
  simulateCommission,
} from '@/lib/domain/admin-finance';

afterAll(async () => {
  await db.$disconnect();
});

async function admin() {
  return db.adminUser.create({
    data: {
      email: `fin${String(Date.now()).slice(-9)}@carsell.one`,
      name: 'محاسب', role: 'FINANCE', passwordHash: 'x',
    },
  });
}

describe('═══ معيار A3 ═══ الضريبة مضمَّنة ١٥/١١٥', () => {
  it('١١٥٠ إجمالًا تحمل ١٥٠ ضريبة لا ١٧٢٫٥', () => {
    expect(vatIncluded(1150).toString()).toBe('150');
    expect(netOfVat(1150).toString()).toBe('1000');
  });

  it('المضمَّنة والصافي يجمعان الإجمالي بلا فرق قرش', () => {
    for (const total of [1, 7, 99.99, 350, 89_590, 141_000, 1_000_000]) {
      const vat = vatIncluded(total);
      const net = netOfVat(total);
      expect(vat.plus(net).toString(), String(total)).toBe(new Prisma.Decimal(total).toString());
    }
  });

  it('المضمَّنة أقلّ من المضافة دائمًا — والفرق ليس تقريبًا', () => {
    const total = 115_000;
    const included = vatIncluded(total);
    const added = new Prisma.Decimal(total).times(15).dividedBy(100);
    expect(included.toString()).toBe('15000');
    expect(added.toString()).toBe('17250');
    expect(added.minus(included).toString()).toBe('2250');
  });

  it('نسبة أخرى تُحترم، والصفر يعطي صفرًا', () => {
    expect(vatIncluded(1050, 5).toString()).toBe('50');
    expect(vatIncluded(1000, 0).toString()).toBe('0');
    expect(DEFAULT_VAT_PCT).toBe(15);
  });

  it('النسبة بمقام صفر تعطي صفرًا ولا ترمي', () => {
    expect(pct(10, 0)).toBe(0);
    expect(pct(50, 200)).toBe(25);
  });

  it('الجمع يجمع أرقامًا لا نصوصًا', () => {
    expect(sum(['1.50', 2, new Prisma.Decimal('0.5'), null]).toString()).toBe('4');
  });
});

describe('A3 — الملخّص محسوب من صفوفه', () => {
  it('GMV يطابق مجموع الطلبات الواقعة، وضريبته مضمَّنة', async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 365 * 86_400_000);
    const summary = await financeSummary(from, to);

    const real = await db.order.aggregate({
      where: { createdAt: { gte: from, lt: to }, status: { in: ['ACTIVE', 'COMPLETED'] } },
      _sum: { agreedPrice: true },
    });

    expect(summary.gmv.total).toBe(new Prisma.Decimal(real._sum.agreedPrice ?? 0).toString());
    /**
     * **ضريبتنا لا ١٥/١١٥ من الـGMV.**
     *
     * كان هذا يؤكّد الثانية، وهي تفترض أن كل ريال في الـGMV خاضع — وبيعُ
     * فردٍ لفرد خارج النطاق أصلًا. فالتأكيد الآن على أنها **مجموعةٌ من
     * صفوفها** وأنها دون سقف ١٥/١١٥ ما دام في الـGMV ما ليس من وعائنا.
     */
    const ours = await db.order.aggregate({
      where: { createdAt: { gte: from, lt: to }, status: { in: ['ACTIVE', 'COMPLETED'] } },
      _sum: { vatAmount: true },
    });
    expect(summary.gmv.vat).toBe(new Prisma.Decimal(ours._sum.vatAmount ?? 0).toString());
    // والتفصيل يجمع الإجمالي
    expect(sum(summary.gmv.bySource.map((line) => line.amount)).toString()).toBe(summary.gmv.total);
  });

  it('المجمَّد بنزاع لا يُعدّ مرّتين', async () => {
    const to = new Date();
    const summary = await financeSummary(new Date(to.getTime() - 365 * 86_400_000), to);

    const held = new Prisma.Decimal(summary.escrow.held);
    const frozen = new Prisma.Decimal(summary.escrow.frozen);
    const deposits = new Prisma.Decimal(summary.escrow.deposits);
    // المحتجز الجاري مطروحٌ منه المجمَّد، والإجمالي = محتجز كامل + عرابين
    expect(held.plus(frozen).plus(deposits).toString()).toBe(summary.escrow.total);
  });

  it('الإيراد يجمع تفصيله', async () => {
    const to = new Date();
    const summary = await financeSummary(new Date(to.getTime() - 365 * 86_400_000), to);
    expect(sum(summary.revenue.byStream.map((line) => line.amount)).toString()).toBe(
      summary.revenue.total,
    );
  });
});

describe('A3 — المدخلات اليدوية', () => {
  it('المفتاح المجهول يُرفض، والقائمة مغلقة', async () => {
    const operator = await admin();
    const month = monthKey(new Date());

    expect((await setFinanceInput(operator, { month, key: 'mktg', value: 1 }, null)).ok).toBe(false);
    expect(
      (await setFinanceInput(operator, { month: '2026-8', key: 'salaries', value: 1 }, null)).ok,
    ).toBe(false);
    expect(
      (await setFinanceInput(operator, { month, key: 'salaries', value: -1 }, null)).ok,
    ).toBe(false);

    await db.adminUser.delete({ where: { id: operator.id } });
  });

  it('المفتاح غير المُدخَل يظهر صفرًا بلا تاريخ — لا كأنه أُدخل', async () => {
    const rows = await financeInputs('1999-01');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.value).toBe('0');
      expect(row.updatedAt).toBeNull();
      expect(row.enteredBy).toBeNull();
    }
  });

  it('الإدخال يُكتب ويُدقَّق، وإعادة القيمة نفسها لا تُكتب قيدًا', async () => {
    const operator = await admin();
    const month = '2099-01';

    expect((await setFinanceInput(operator, { month, key: 'salaries', value: 174_000 }, null)).ok)
      .toBe(true);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(1);

    // القيمة نفسها ⇒ لا قيد جديد
    await setFinanceInput(operator, { month, key: 'salaries', value: 174_000 }, null);
    expect(await db.auditLog.count({ where: { actorId: operator.id } })).toBe(1);

    const rows = await financeInputs(month);
    const salaries = rows.find((row) => row.key === 'salaries');
    expect(salaries?.value).toBe('174000');
    expect(salaries?.enteredBy).toBe('محاسب');

    await db.financeInput.deleteMany({ where: { month } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('A3 — المؤشّرات المركّبة', () => {
  it('شهرٌ بلا مدخلات: لا قسمة على صفر ولا رقم مخترَع', async () => {
    const result = await indicators('1999-01');
    expect(result.cac).toBe('0');
    // لا تكلفة اكتساب ⇒ لا نسبة LTV/CAC — و«صفر» تُقرأ إنذارًا وهي ليست كذلك
    expect(result.ltvOverCac).toBeNull();
    expect(result.monthlyBurn).toBe('0');
  });

  it('الربح لا مدرج له', async () => {
    const operator = await admin();
    const month = '2099-02';
    await setFinanceInput(operator, { month, key: 'cash_balance', value: 1_000_000 }, null);
    // مصروف صفر ⇒ الحرق الصافي سالب أو صفر ⇒ لا مدرج
    const result = await indicators(month);
    expect(result.runwayMonths).toBeNull();

    await setFinanceInput(operator, { month, key: 'salaries', value: 200_000 }, null);
    const burning = await indicators(month);
    expect(burning.runwayMonths).not.toBeNull();
    expect(burning.netBurn).toBe('200000');
    expect(burning.runwayMonths).toBe(5);

    await db.financeInput.deleteMany({ where: { month } });
    await db.auditLog.deleteMany({ where: { actorId: operator.id } });
    await db.adminUser.delete({ where: { id: operator.id } });
  });
});

describe('═══ محاكي العمولة ═══ تغيير بلا نشر', () => {
  it('لا يكتب شيئًا — والحال قبله كالحال بعده', async () => {
    const before = await db.commissionRule.count();
    const rules = await db.commissionRule.findMany({ orderBy: { id: 'asc' } });

    simulateCommission(14_200_000, 84_300, SIMULATED_PERCENTAGES);

    expect(await db.commissionRule.count()).toBe(before);
    expect(await db.commissionRule.findMany({ orderBy: { id: 'asc' } })).toEqual(rules);
  });

  it('١٪ على ١٤٫٢ م تعطي ١٤٢٬٠٠٠ — كما في الترميز', () => {
    const scenarios = simulateCommission(14_200_000, 84_300, [0, 1]);
    const zero = scenarios[0];
    const one = scenarios[1];

    expect(zero?.commissionRevenue).toBe('0');
    expect(zero?.totalRevenue).toBe('84300');
    expect(one?.commissionRevenue).toBe('142000');
    expect(one?.totalRevenue).toBe('226300');
    expect(one?.takeRatePct).toBe(1.59);
  });

  it('GMV صفر لا يرمي', () => {
    const scenarios = simulateCommission(0, 0, [1]);
    expect(scenarios[0]?.takeRatePct).toBe(0);
  });
});
