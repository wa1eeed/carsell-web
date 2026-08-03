import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';
import { pct, sum } from './money';
import { DEFAULT_VAT_PCT } from './tax';

/**
 * A3 — المالية.
 *
 * **لا رقم مخزَّن.** كل مبلغ في هذه الشاشة مجموعٌ من صفوفه وقت الطلب:
 * لا عمود «إجمالي المبيعات» ولا ذاكرة مؤقّتة يُقرأ منها. عمودٌ كهذا
 * يكذب أوّل مرّة يُلغى فيها طلب أو يُردّ فيها مبلغ، ثم لا يُكتشف كذبه
 * إلا حين يُقارَن بالبنك.
 *
 * والمدخلات اليدوية (`FinanceInput`) استثناءٌ ظاهرٌ لا حقيقي: هي بيانات
 * لا تملكها المنصّة أصلًا — رواتب ومصروف تسويق ورصيد بنكي — تُدخَل
 * بشهرها ومُدخِلها، وما يُشتقّ منها يُحسب لا يُخزَّن.
 */

/** حالات الطلب التي تُعدّ مبيعًا واقعًا — لا وعدًا به. */
const REALISED_STATUSES = ['ACTIVE', 'COMPLETED'] as const;

/** المفتاح والمبلغ — والتسمية في `src/lib/labels/admin.ts`. */
export type MoneyLine = { key: string; amount: string; serviceName?: string | null };

export type FinanceSummary = {
  from: string;
  to: string;
  vatPct: number;
  /**
   * `vat` هنا **ضريبتنا نحن** لا ضريبةَ السوق: مجموع `Order.vatAmount`،
   * وهو العمولة والرسوم الإدارية. وليس ١٥/١١٥ من الـGMV — فبيعُ فردٍ
   * لفرد خارج النطاق أصلًا، واحتسابُ ضريبةٍ عليه اختراعُ التزام.
   */
  gmv: { total: string; vat: string; net: string; bySource: MoneyLine[] };
  revenue: { total: string; byStream: MoneyLine[] };
  escrow: { held: string; deposits: string; frozen: string; total: string };
  subscriptions: { total: number; byPlan: { key: string; label: string; count: number }[] };
};

/**
 * ملخّص المال في مدى.
 *
 * GMV هو **قيمة البضاعة** لا إيراد المنصّة: ثمن السيارات التي مرّت.
 * وخلطهما هو الخطأ الذي يجعل شركةً تظنّ أنها تربح أربعة عشر مليونًا
 * وهي تربح أربعةً وثمانين ألفًا.
 */
export async function financeSummary(
  from: Date,
  to: Date,
): Promise<FinanceSummary> {
  const platform = await db.platformSetting.findUnique({ where: { id: 'default' } });
  const vatPct = Number(platform?.vatPct ?? DEFAULT_VAT_PCT);
  const window = { gte: from, lt: to };

  const [orders, serviceRevenue, services, campaigns, escrow, deposits, frozen, subs, plans] =
    await Promise.all([
      db.order.groupBy({
        by: ['source'],
        where: { createdAt: window, status: { in: [...REALISED_STATUSES] } },
        _sum: { agreedPrice: true, commissionAmount: true, vatAmount: true },
      }),
      db.serviceRequest.groupBy({
        by: ['serviceId'],
        where: { createdAt: window, status: 'DONE' },
        _sum: { amount: true },
      }),
      db.service.findMany({ select: { id: true, key: true, nameAr: true } }),
      db.adCampaign.aggregate({
        where: { startsAt: window, status: { in: ['running', 'ended'] } },
        _sum: { budget: true },
      }),
      db.escrow.aggregate({ where: { status: 'HELD' }, _sum: { amount: true } }),
      db.deposit.aggregate({ where: { status: 'HELD' }, _sum: { amount: true } }),
      /**
       * المجمَّد بنزاع **يُطرح من المحتجز الجاري** لا يُجمع إليه: هو
       * محتجزٌ أصلًا، وعدّه مرّتين يضخّم النقد الذي يظنّ المستثمر أنه
       * في الحساب.
       */
      db.escrow.aggregate({
        where: { status: 'HELD', order: { status: 'DISPUTED' } },
        _sum: { amount: true },
      }),
      db.subscription.groupBy({
        by: ['planId'],
        where: { status: 'active' },
        _count: { _all: true },
      }),
      db.plan.findMany({ select: { id: true, key: true, nameAr: true } }),
    ]);

  const gmvTotal = sum(orders.map((row) => row._sum.agreedPrice));
  const held = new Prisma.Decimal(escrow._sum.amount ?? 0);
  const frozenAmount = new Prisma.Decimal(frozen._sum.amount ?? 0);
  const depositsHeld = new Prisma.Decimal(deposits._sum.amount ?? 0);

  const serviceLines: MoneyLine[] = serviceRevenue
    .map((row) => {
      const service = services.find((entry) => entry.id === row.serviceId);
      return {
        key: service?.key ?? row.serviceId,
        serviceName: service?.nameAr ?? null,
        amount: new Prisma.Decimal(row._sum.amount ?? 0).toString(),
      };
    })
    .filter((line) => new Prisma.Decimal(line.amount).greaterThan(0));

  const commission = sum(orders.map((row) => row._sum.commissionAmount));
  const adRevenue = new Prisma.Decimal(campaigns._sum.budget ?? 0);

  const revenueStreams: MoneyLine[] = [
    ...serviceLines,
    { key: 'ads', amount: adRevenue.toString() },
    { key: 'commission', amount: commission.toString() },
  ].filter((line) => new Prisma.Decimal(line.amount).greaterThan(0));

  /**
   * **مجموعةٌ من صفوفها** كسائر أرقام هذه الشاشة — و`Order.vatAmount`
   * لقطةٌ تُحسب وقت إنشاء الطلب من توريداتنا وحدها (`fees.ts`).
   */
  const ourVat = sum(orders.map((row) => row._sum.vatAmount));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    vatPct,
    gmv: {
      total: gmvTotal.toString(),
      vat: ourVat.toString(),
      net: gmvTotal.minus(ourVat).toString(),
      bySource: orders
        .map((row) => ({
          key: row.source,
          amount: new Prisma.Decimal(row._sum.agreedPrice ?? 0).toString(),
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    },
    revenue: {
      total: sum(revenueStreams.map((line) => line.amount)).toString(),
      byStream: revenueStreams.sort((a, b) => Number(b.amount) - Number(a.amount)),
    },
    escrow: {
      held: held.minus(frozenAmount).toString(),
      deposits: depositsHeld.toString(),
      frozen: frozenAmount.toString(),
      total: held.plus(depositsHeld).toString(),
    },
    subscriptions: {
      total: subs.reduce((count, row) => count + row._count._all, 0),
      byPlan: subs.map((row) => {
        const plan = plans.find((entry) => entry.id === row.planId);
        return {
          key: plan?.key ?? row.planId,
          label: plan?.nameAr ?? '—',
          count: row._count._all,
        };
      }),
    },
  };
}

/**
 * مفاتيح المدخلات اليدوية — **قائمة مغلقة**.
 *
 * مفتاح حرّ يعني «marketing» و«mktg» و«تسويق» في ثلاثة أشهر، فيصير
 * حساب CAC مجموعًا لبعضها.
 */
export const FINANCE_INPUT_KEYS = [
  { key: 'salaries', inCac: false },
  { key: 'marketing_spend', inCac: true },
  { key: 'referral_incentives', inCac: true },
  { key: 'content_seo', inCac: true },
  { key: 'infra_cost', inCac: false },
  { key: 'other_cost', inCac: false },
  { key: 'cash_balance', inCac: false },
] as const;

const INPUT_KEYS: readonly string[] = FINANCE_INPUT_KEYS.map((entry) => entry.key);

/** `YYYY-MM` — الشهر مفتاحٌ نصّي لأنه وحدة محاسبية لا لحظة زمنية. */
export function monthKey(date: Date): string {
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(month: string): { from: Date; to: Date } {
  const [year, index] = month.split('-').map(Number);
  const from = new Date(Date.UTC(year ?? 1970, (index ?? 1) - 1, 1));
  const to = new Date(Date.UTC(year ?? 1970, index ?? 1, 1));
  return { from, to };
}

export type FinanceInputRow = {
  key: string;
  value: string;
  note: string | null;
  updatedAt: string | null;
  enteredBy: string | null;
};

export async function financeInputs(month: string): Promise<FinanceInputRow[]> {
  const rows = await db.financeInput.findMany({
    where: { month },
    select: {
      key: true, value: true, note: true, updatedAt: true,
      admin: { select: { name: true } },
    },
  });

  // المفتاح غير المُدخَل يظهر صفرًا **مع فراغ تاريخه** — لا كأنه أُدخل صفرًا
  return FINANCE_INPUT_KEYS.map((entry) => {
    const row = rows.find((candidate) => candidate.key === entry.key);
    return {
      key: entry.key,
      value: (row?.value ?? new Prisma.Decimal(0)).toString(),
      note: row?.note ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      enteredBy: row?.admin.name ?? null,
    };
  });
}

export type InputResult = { ok: true } | { ok: false; reason: 'UNKNOWN_KEY' | 'INVALID' };

export async function setFinanceInput(
  admin: AdminUser,
  input: { month: string; key: string; value: number; note?: string },
  ip: string | null,
  now = new Date(),
): Promise<InputResult> {
  if (!INPUT_KEYS.includes(input.key)) return { ok: false, reason: 'UNKNOWN_KEY' };
  if (!/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, reason: 'INVALID' };
  if (!Number.isFinite(input.value) || input.value < 0) return { ok: false, reason: 'INVALID' };

  const before = await db.financeInput.findUnique({
    where: { month_key: { month: input.month, key: input.key } },
  });

  const value = new Prisma.Decimal(input.value);
  if (before !== null && before.value.equals(value) && (before.note ?? '') === (input.note ?? '')) {
    return { ok: true };
  }

  await db.financeInput.upsert({
    where: { month_key: { month: input.month, key: input.key } },
    create: {
      month: input.month,
      key: input.key,
      value,
      note: input.note ?? null,
      enteredBy: admin.id,
    },
    update: { value, note: input.note ?? null, enteredBy: admin.id },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'FinanceInput',
      entityId: `${input.month}:${input.key}`,
      action: 'finance.input_set',
      before: before === null ? {} : { value: before.value.toString(), note: before.note },
      after: { value: value.toString(), note: input.note ?? null },
      ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

export type Indicators = {
  month: string;
  /** تكلفة اكتساب العميل — مصروف الاكتساب ÷ العملاء الجدد في الشهر. */
  cac: string;
  newCustomers: number;
  /** القيمة الدائمة — إيراد المنصّة ÷ العملاء الذين اشتروا، تراكميًا. */
  ltv: string;
  payingCustomers: number;
  /** نسبة الأخذ — إيراد المنصّة من كل ريال بضاعة. */
  takeRatePct: number;
  ltvOverCac: number | null;
  /** أشهر حتى يستردّ العميل تكلفته. */
  paybackMonths: number | null;
  monthlyBurn: string;
  monthlyRevenue: string;
  netBurn: string;
  /** أشهر المدرج — `null` حين لا حرق (الربح لا مدرج له). */
  runwayMonths: number | null;
  cashBalance: string;
};

/**
 * المؤشّرات المركّبة.
 *
 * كلٌّ منها **قسمةٌ بمقام قد يكون صفرًا**: شهرٌ بلا عملاء جدد، ومنصّة
 * بلا إيراد، وشركةٌ تربح فلا مدرج لها. و`null` هنا ليست تهرّبًا: هي
 * الفرق بين «لا نعرف» و«صفر»، والثانية تُقرأ إنذارًا وهي ليست كذلك.
 */
export async function indicators(month: string): Promise<Indicators> {
  const { from, to } = monthBounds(month);

  const [inputs, summary, newCustomers, payingCustomers, lifetimeRevenue] = await Promise.all([
    db.financeInput.findMany({ where: { month } }),
    financeSummary(from, to),
    db.user.count({ where: { createdAt: { gte: from, lt: to } } }),
    db.order
      .findMany({
        where: { status: { in: [...REALISED_STATUSES] } },
        select: { buyerId: true },
        distinct: ['buyerId'],
      })
      .then((rows) => rows.length),
    db.order.aggregate({
      where: { status: { in: [...REALISED_STATUSES] } },
      _sum: { commissionAmount: true },
    }),
  ]);

  const valueOf = (key: string): Prisma.Decimal =>
    new Prisma.Decimal(inputs.find((row) => row.key === key)?.value ?? 0);

  const acquisitionSpend = sum(
    FINANCE_INPUT_KEYS.filter((entry) => entry.inCac).map((entry) => valueOf(entry.key)),
  );
  const monthlyBurn = sum(
    FINANCE_INPUT_KEYS.filter((entry) => entry.key !== 'cash_balance').map((entry) =>
      valueOf(entry.key),
    ),
  );
  const monthlyRevenue = new Prisma.Decimal(summary.revenue.total);
  const netBurn = monthlyBurn.minus(monthlyRevenue);
  const cashBalance = valueOf('cash_balance');

  const cac =
    newCustomers === 0
      ? new Prisma.Decimal(0)
      : acquisitionSpend.dividedBy(newCustomers).toDecimalPlaces(2);

  // القيمة الدائمة تراكمية لا شهرية — العميل يشتري مرّة كل سنوات
  const ltv =
    payingCustomers === 0
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(lifetimeRevenue._sum.commissionAmount ?? 0)
          .plus(summary.revenue.total)
          .dividedBy(payingCustomers)
          .toDecimalPlaces(2);

  const monthlyMarginPerCustomer =
    payingCustomers === 0 ? new Prisma.Decimal(0) : monthlyRevenue.dividedBy(payingCustomers);

  return {
    month,
    cac: cac.toString(),
    newCustomers,
    ltv: ltv.toString(),
    payingCustomers,
    takeRatePct: pct(summary.revenue.total, summary.gmv.total),
    ltvOverCac: cac.isZero() ? null : Number(ltv.dividedBy(cac).toDecimalPlaces(1)),
    paybackMonths: monthlyMarginPerCustomer.isZero()
      ? null
      : Number(cac.dividedBy(monthlyMarginPerCustomer).toDecimalPlaces(1)),
    monthlyBurn: monthlyBurn.toString(),
    monthlyRevenue: monthlyRevenue.toString(),
    netBurn: netBurn.toString(),
    /**
     * الربح لا مدرج له — و«٩٩٩ شهرًا» كذبة أوضح من الفراغ.
     *
     * والكسر **يُحذف نزولًا**: تسعة أشهر وخُمس هي تسعة أشهر من الأمان،
     * وجبرُها إلى عشرة يزيد في عمر المال شهرًا لا وجود له. ثم إن الجمع
     * العربي لا يُصرِّف الكسور: ٩٫٢ تقع في صيغة «other» فتُقرأ «٩ شهر».
     */
    runwayMonths: netBurn.lessThanOrEqualTo(0)
      ? null
      : Math.floor(Number(cashBalance.dividedBy(netBurn))),
    cashBalance: cashBalance.toString(),
  };
}

export type CommissionScenario = {
  pct: number;
  commissionRevenue: string;
  totalRevenue: string;
  takeRatePct: number;
};

/**
 * ═══ محاكي العمولة ═══ **تغيير بلا نشر** (ترميز A3).
 *
 * دالة خالصة لا تكتب شيئًا. وهذا هو معناها كلّه: الرقم الذي يقرّر
 * تفعيل عمولة يجب أن يُرى قبل أن يُفعَّل، لا أن يُجرَّب على السوق.
 */
export function simulateCommission(
  gmv: Prisma.Decimal | number | string,
  currentRevenue: Prisma.Decimal | number | string,
  percentages: readonly number[],
): CommissionScenario[] {
  const volume = new Prisma.Decimal(gmv);
  const base = new Prisma.Decimal(currentRevenue);

  return percentages.map((percentage) => {
    const commission = volume.times(percentage).dividedBy(100).toDecimalPlaces(2);
    const total = base.plus(commission);
    return {
      pct: percentage,
      commissionRevenue: commission.toString(),
      totalRevenue: total.toString(),
      takeRatePct: pct(total, volume),
    };
  });
}

/** نِسَب المحاكاة كما في الترميز — والصفر أوّلها لأنه الحال القائمة. */
export const SIMULATED_PERCENTAGES = [0, 0.5, 1, 1.5, 2] as const;
