import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { installmentSchedule } from './money';
import { RIYADH_OFFSET_HOURS } from './viewing-rules';
import type { InstallmentMethod, InstallmentStatus } from '@/generated/prisma/enums';

/**
 * ═══ `D15` — التقسيط وإدارةُ الأقساط ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦. وهي أكبرُ فجوةٍ أمام المنافسين: ثلاثةٌ
 * يبيعونها باسمها، والرابعُ يقول صراحةً إنّه ليس نظامَ تقسيط.
 *
 * **وهذا عقدُ المعرض مع مشتريه لا تمويلُ بنك**: لا قرارَ ائتمانٍ ولا
 * فحصَ ملاءة — نسجّل اتّفاقًا عقده المعرضُ ونتابع ما يُحصَّل منه.
 *
 * ═══ والجدولُ يُكتب صفوفًا لا يُحسب عند العرض ═══
 *
 * جدولٌ يُحسب في كلّ قراءة يتبدّل بتبدّل القاعدة، **وعقدٌ وُقّع لا
 * يتبدّل**. فآجالُه صفوفٌ تُكتب مرّةً عند الإنشاء، ويبقى الحسابُ
 * للمجاميع لا للالتزام.
 */

export type CreatePlanInput = {
  vehicleId: string;
  invoiceId: string | null;
  buyerName: string;
  buyerPhone: string | null;
  buyerVatNo: string | null;
  totalPrice: number;
  downPayment: number;
  months: number;
  /** أوّلُ استحقاق — وما بعده شهريًّا منه. */
  startsOn: Date;
  note: string | null;
};

export type CreatePlanResult =
  | { ok: true; planId: string; monthly: string }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

/** أطولُ أجلٍ يُقبل — وستّون شهرًا خمسُ سنوات، وما فوقها ليس تقسيطَ معرض. */
export const MAX_MONTHS = 60;

export function validatePlan(input: CreatePlanInput): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!(input.totalPrice > 0)) fields.totalPrice = 'INVALID';
  /** **والدفعةُ الأولى صفرٌ حالٌ لا نقص** — ومن ساوى السعرَ لا تقسيطَ له. */
  if (input.downPayment < 0) fields.downPayment = 'INVALID';
  else if (input.downPayment >= input.totalPrice) fields.downPayment = 'COVERS_ALL';
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_MONTHS) {
    fields.months = 'INVALID';
  }
  if (Number.isNaN(input.startsOn.getTime())) fields.startsOn = 'INVALID';
  if (input.buyerName.trim().length < 2) fields.buyerName = 'REQUIRED';
  return fields;
}

/**
 * **والاستحقاقُ يقع في اليوم نفسِه من كلّ شهر** — ومن بدأ في ٣١ يناير
 * لا استحقاقَ له في ٣١ فبراير: يقع في آخر الشهر. وإضافةُ ثلاثين يومًا
 * تُزحزح التاريخَ عن يومه فيصير الأجلُ الثانيَ عشرَ في شهرٍ آخر.
 */
export function dueDates(startsOn: Date, months: number): Date[] {
  const day = startsOn.getUTCDate();
  return Array.from({ length: months }, (_, index) => {
    const base = new Date(
      Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth() + index, 1, 12),
    );
    const last = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    return new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(day, last), 12) -
        RIYADH_OFFSET_HOURS * 3_600_000,
    );
  });
}

/**
 * ═══ والتأخّرُ بالتقويم لا بالساعة ═══
 *
 * `dueOn <= now` تجعل قسطَ **اليوم** متأخّرًا منذ أوّل الصباح — وقسطٌ
 * يستحقّ اليوم ليس متأخّرًا حتى ينقضي يومُه. فالمقارنةُ بأيّام الرياض:
 * متأخّرٌ ما كان يومُه **قبل** اليوم. (وكشفَته الشاشةُ على عقدٍ بدأ
 * اليوم: «متأخر» على قسطٍ لم يحن مساؤه.)
 */
function riyadhDay(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

function isOverdue(dueOn: Date, settledAt: Date | null, now: Date): boolean {
  return settledAt === null && riyadhDay(dueOn) < riyadhDay(now);
}

export async function createInstallmentPlan(
  actor: { userId: string; dealerId: string; branchId: string | null },
  input: CreatePlanInput,
  now: Date = new Date(),
): Promise<CreatePlanResult> {
  const fields = validatePlan(input);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const financed = new Prisma.Decimal(input.totalPrice).sub(input.downPayment);
  const amounts = installmentSchedule(financed, input.months);
  const dates = dueDates(input.startsOn, input.months);

  const plan = await db.$transaction(async (tx) => {
    const created = await tx.installmentPlan.create({
      data: {
        dealerId: actor.dealerId,
        branchId: actor.branchId,
        vehicleId: input.vehicleId,
        invoiceId: input.invoiceId,
        buyerName: input.buyerName.trim(),
        buyerPhone: input.buyerPhone,
        buyerVatNo: input.buyerVatNo,
        totalPrice: new Prisma.Decimal(input.totalPrice),
        downPayment: new Prisma.Decimal(input.downPayment),
        months: input.months,
        startsOn: input.startsOn,
        note: input.note,
        createdById: actor.userId,
        createdAt: now,
      },
      select: { id: true },
    });

    await tx.installmentDue.createMany({
      data: amounts.map((amount, index) => ({
        planId: created.id,
        sequence: index + 1,
        dueOn: dates[index] as Date,
        amount,
      })),
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        actorType: 'user',
        entity: 'InstallmentPlan',
        entityId: created.id,
        action: 'dealer.installment.created',
        before: {},
        after: {
          total: new Prisma.Decimal(input.totalPrice).toFixed(2),
          down: new Prisma.Decimal(input.downPayment).toFixed(2),
          months: input.months,
          buyer: input.buyerName.trim(),
        },
        ip: null,
        createdAt: now,
      },
    });

    return created;
  });

  return {
    ok: true,
    planId: plan.id,
    monthly: (amounts[0] ?? new Prisma.Decimal(0)).toFixed(2),
  };
}

export type ReceiptResult =
  | { ok: true; settled: boolean }
  | { ok: false; reason: 'PLAN_NOT_FOUND' | 'DUE_NOT_FOUND' | 'INVALID' | 'OVERPAID' };

/**
 * ═══ سندُ قبضٍ مخصَّصٌ على قسطٍ بعينه ═══
 *
 * أكثرُ ميزةٍ تكرّرت في المنصّات الأربع. **ومبلغٌ يُسجَّل بلا قسطٍ
 * يحمله** يجعل «المدفوع والباقي» رقمين لا يُعرف من أين جاءا — فلا
 * يستطيع المعرضُ أن يقول لعميله أيُّ شهرٍ بقي عليه.
 *
 * **ولا يُقبل ما يتجاوز القسط**: من دفع أكثرَ يُخصَّص الزائدُ على
 * القسط التالي بسندٍ ثانٍ — ومبلغٌ يفيض عن قسطٍ ويبقى فيه يجعل مجموعَ
 * الأقساط أكبرَ من المموَّل.
 */
export async function recordReceipt(
  actor: { userId: string; dealerId: string },
  input: {
    planId: string;
    dueId: string;
    amount: number;
    method: InstallmentMethod;
    receivedAt: Date;
    note: string | null;
  },
  now: Date = new Date(),
): Promise<ReceiptResult> {
  if (!(input.amount > 0)) return { ok: false, reason: 'INVALID' };

  const plan = await db.installmentPlan.findFirst({
    where: { id: input.planId, dealerId: actor.dealerId },
    select: { id: true, months: true },
  });
  if (plan === null) return { ok: false, reason: 'PLAN_NOT_FOUND' };

  const due = await db.installmentDue.findFirst({
    where: { id: input.dueId, planId: plan.id },
    select: { id: true, amount: true, paidAmount: true },
  });
  if (due === null) return { ok: false, reason: 'DUE_NOT_FOUND' };

  const paid = new Prisma.Decimal(due.paidAmount).add(input.amount);
  if (paid.greaterThan(due.amount)) return { ok: false, reason: 'OVERPAID' };

  const settledNow = paid.equals(due.amount);

  const settled = await db.$transaction(async (tx) => {
    await tx.installmentReceipt.create({
      data: {
        planId: plan.id,
        dueId: due.id,
        amount: new Prisma.Decimal(input.amount),
        method: input.method,
        receivedAt: input.receivedAt,
        note: input.note,
        recordedById: actor.userId,
        createdAt: now,
      },
    });

    await tx.installmentDue.update({
      where: { id: due.id },
      data: { paidAmount: paid, ...(settledNow ? { settledAt: now } : {}) },
    });

    /**
     * **والعقدُ يُقفل حين يُقفل آخرُ قسط** — ولا يُترك `ACTIVE` فيبقى
     * في طابور المتأخّرين بعد أن سُدِّد.
     */
    const open = await tx.installmentDue.count({
      where: { planId: plan.id, settledAt: null },
    });
    if (open === 0) {
      await tx.installmentPlan.update({
        where: { id: plan.id },
        data: { status: 'SETTLED', settledAt: now },
      });
      return true;
    }
    return false;
  });

  return { ok: true, settled };
}

export type PlanRow = {
  id: string;
  buyerName: string;
  buyerPhone: string | null;
  vehicle: string;
  totalPrice: string;
  downPayment: string;
  months: number;
  status: InstallmentStatus;
  /** المُحصَّل من الأقساط — والدفعةُ الأولى خارجَه، فهي ليست قسطًا. */
  collected: string;
  remaining: string;
  /** عددُ الأقساط المستحقّة ولم تُسدَّد — وهو ما يُفتح عليه الطابور. */
  overdueCount: number;
  overdueAmount: string;
  /** أقربُ استحقاقٍ قادم — و`null` حين لا يبقى شيء. */
  nextDueOn: string | null;
};

export async function dealerPlans(
  dealerId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<PlanRow[]> {
  const plans = await db.installmentPlan.findMany({
    where: { dealerId, ...(branchId === null ? {} : { branchId }) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, buyerName: true, buyerPhone: true, totalPrice: true,
      downPayment: true, months: true, status: true,
      vehicle: { select: { brandName: true, modelName: true, trimName: true, year: true } },
      dues: { select: { amount: true, paidAmount: true, dueOn: true, settledAt: true } },
    },
  });

  return plans.map((plan) => {
    const collected = plan.dues.reduce(
      (sum, due) => sum.add(due.paidAmount),
      new Prisma.Decimal(0),
    );
    const financed = plan.dues.reduce((sum, due) => sum.add(due.amount), new Prisma.Decimal(0));
    /**
     * **والمتأخّرُ ما حلّ أجلُه ولم يُسدَّد** — لا ما بقي: قسطُ الشهر
     * القادم ليس تأخّرًا، وعدُّه معه يجعل كلَّ عقدٍ متعثّرًا يومَ وُقّع.
     */
    const overdue = plan.dues.filter((due) => isOverdue(due.dueOn, due.settledAt, now));

    const upcoming = plan.dues
      .filter((due) => due.settledAt === null)
      .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())[0];

    return {
      id: plan.id,
      buyerName: plan.buyerName,
      buyerPhone: plan.buyerPhone,
      vehicle: [plan.vehicle.brandName, plan.vehicle.modelName, plan.vehicle.trimName]
        .filter((part) => part !== null && part !== '')
        .join(' ')
        .concat(` ${String(plan.vehicle.year)}`),
      totalPrice: plan.totalPrice.toFixed(2),
      downPayment: plan.downPayment.toFixed(2),
      months: plan.months,
      status: plan.status,
      collected: collected.toFixed(2),
      remaining: financed.sub(collected).toFixed(2),
      overdueCount: overdue.length,
      overdueAmount: overdue
        .reduce((sum, due) => sum.add(due.amount).sub(due.paidAmount), new Prisma.Decimal(0))
        .toFixed(2),
      nextDueOn: upcoming?.dueOn.toISOString() ?? null,
    };
  });
}

export type PlanDetail = {
  id: string;
  buyerName: string;
  buyerPhone: string | null;
  vehicle: string;
  totalPrice: string;
  downPayment: string;
  months: number;
  status: InstallmentStatus;
  note: string | null;
  invoiceNumber: string | null;
  dues: {
    id: string;
    sequence: number;
    dueOn: string;
    amount: string;
    paidAmount: string;
    settled: boolean;
    /** حلّ أجلُه ولم يُسدَّد — لا ما بقي. */
    overdue: boolean;
  }[];
  /**
   * ═══ وسنداتُ القبض تُقرأ ═══
   *
   * **وكانت تُكتب ولا يقرؤها شيء** — أمسكتها البوابةُ ٦٤ في يومها.
   * وسندٌ لا يُقرأ يجعل «المدفوع» رقمًا بلا أثرٍ يشرحه: من قبض، ومتى،
   * وبأيّ طريقة. وأوّلُ سؤالٍ يسأله عميلٌ متنازِع هو «متى دفعتُ؟».
   */
  receipts: {
    id: string;
    amount: string;
    method: InstallmentMethod;
    receivedAt: string;
    dueSequence: number | null;
    note: string | null;
    recordedBy: string | null;
  }[];
};

export async function planDetail(
  dealerId: string,
  planId: string,
  now: Date = new Date(),
): Promise<PlanDetail | null> {
  const plan = await db.installmentPlan.findFirst({
    where: { id: planId, dealerId },
    select: {
      id: true, buyerName: true, buyerPhone: true, totalPrice: true,
      downPayment: true, months: true, status: true, note: true,
      invoice: { select: { number: true } },
      vehicle: { select: { brandName: true, modelName: true, trimName: true, year: true } },
      dues: {
        orderBy: { sequence: 'asc' },
        select: { id: true, sequence: true, dueOn: true, amount: true, paidAmount: true, settledAt: true },
      },
      receipts: {
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true, amount: true, method: true, receivedAt: true, note: true,
          due: { select: { sequence: true } },
          recordedBy: { select: { name: true } },
        },
      },
    },
  });
  if (plan === null) return null;

  return {
    id: plan.id,
    buyerName: plan.buyerName,
    buyerPhone: plan.buyerPhone,
    vehicle: [plan.vehicle.brandName, plan.vehicle.modelName, plan.vehicle.trimName]
      .filter((part) => part !== null && part !== '')
      .join(' ')
      .concat(` ${String(plan.vehicle.year)}`),
    totalPrice: plan.totalPrice.toFixed(2),
    downPayment: plan.downPayment.toFixed(2),
    months: plan.months,
    status: plan.status,
    note: plan.note,
    invoiceNumber: plan.invoice?.number ?? null,
    dues: plan.dues.map((due) => ({
      id: due.id,
      sequence: due.sequence,
      dueOn: due.dueOn.toISOString(),
      amount: due.amount.toFixed(2),
      paidAmount: due.paidAmount.toFixed(2),
      settled: due.settledAt !== null,
      overdue: isOverdue(due.dueOn, due.settledAt, now),
    })),
    receipts: plan.receipts.map((receipt) => ({
      id: receipt.id,
      amount: receipt.amount.toFixed(2),
      method: receipt.method,
      receivedAt: receipt.receivedAt.toISOString(),
      dueSequence: receipt.due?.sequence ?? null,
      note: receipt.note,
      recordedBy: receipt.recordedBy.name,
    })),
  };
}
