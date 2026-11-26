import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { installmentSchedule, monthlyPayment } from '@/lib/domain/money';
import {
  createInstallmentPlan,
  dealerPlans,
  dueDates,
  recordReceipt,
  validatePlan,
} from '@/lib/domain/installments';

/**
 * ═══ `D15` — التقسيط ═══
 *
 * **وهذا عقدُ المعرض لا تمويلُ بنك**: نسجّل اتّفاقًا ونتابع تحصيلَه.
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.installmentPlan.deleteMany({ where: { id: { in: made } } });
});

describe('جدول الأقساط', () => {
  /**
   * **ومجموعُ الأقساط يساوي المموَّل بالهللة** — وإلّا بقي على العميل
   * ريالٌ لا يعرف من أين جاء، أو سقط ريالٌ لا يعرف المعرضُ أين ذهب.
   */
  it('يجمع المموَّل بالضبط مهما كانت القسمة', () => {
    for (const [financed, months] of [
      [100_000, 7],
      [99_500, 3],
      [1, 12],
      [85_333.33, 11],
      [250_000, 60],
    ] as const) {
      const rows = installmentSchedule(financed, months);
      expect(rows).toHaveLength(months);
      const total = rows.reduce((sum, row) => sum.add(row), new Prisma.Decimal(0));
      expect(total.toFixed(2)).toBe(new Prisma.Decimal(financed).toFixed(2));
    }
  });

  /** **والكسرُ على الأخير** — فلا يُفاجأ العميلُ في أوّل شهر. */
  it('والكسر يحمله القسط الأخير وحده', () => {
    const rows = installmentSchedule(100_000, 7);
    const first = rows[0] as Prisma.Decimal;
    const last = rows.at(-1) as Prisma.Decimal;
    expect(rows.slice(0, -1).every((row) => row.equals(first))).toBe(true);
    expect(last.greaterThan(first)).toBe(true);
    expect(last.sub(first).lessThan(1)).toBe(true);
  });

  /**
   * **ولا يُخلط بالتقدير التسويقيّ**: `monthlyPayment` تُقرَّب إلى أقرب
   * عشرة فلا تُقرأ وعدًا بالهللة — وعقدٌ بها لا يجمع المموَّل.
   */
  it('ويختلف عن تقدير الواجهة قصدا', () => {
    const estimate = monthlyPayment(100_000, 0, 7, 0);
    const exact = (installmentSchedule(100_000, 7)[0] as Prisma.Decimal).toNumber();
    expect(estimate % 10).toBe(0);
    expect(exact).not.toBe(estimate);
  });
});

describe('آجال الاستحقاق', () => {
  /**
   * **والاستحقاقُ في اليوم نفسِه من كلّ شهر** — ومن بدأ في ٣١ يناير
   * يقع ثانيه في آخر فبراير لا في ٣ مارس. وإضافةُ ثلاثين يومًا تُزحزحه.
   */
  it('تتبع يوم الشهر ولا تنزلق', () => {
    const dates = dueDates(new Date('2026-01-31T09:00:00.000Z'), 4);
    const days = dates.map((date) => {
      const riyadh = new Date(date.getTime() + 3 * 3_600_000);
      return `${String(riyadh.getUTCMonth() + 1)}-${String(riyadh.getUTCDate())}`;
    });
    expect(days).toEqual(['1-31', '2-28', '3-31', '4-30']);
  });
});

describe('validatePlan', () => {
  const base = {
    vehicleId: 'v',
    invoiceId: null,
    buyerName: 'عميل التقسيط',
    buyerPhone: null,
    buyerVatNo: null,
    totalPrice: 100_000,
    downPayment: 20_000,
    months: 12,
    startsOn: new Date('2026-12-01T09:00:00.000Z'),
    note: null,
  };

  it('يقبل دفعة أولى صفرا ويرفض ما يغطي السعر', () => {
    expect(validatePlan({ ...base, downPayment: 0 })).toEqual({});
    expect(validatePlan({ ...base, downPayment: 100_000 }).downPayment).toBe('COVERS_ALL');
  });

  it('ويحد الأجل', () => {
    expect(validatePlan({ ...base, months: 0 }).months).toBe('INVALID');
    expect(validatePlan({ ...base, months: 61 }).months).toBe('INVALID');
  });
});

describe('العقد وتحصيله', () => {
  it('ينشئ جدولا مكتوبا، ويخصص السند على قسطه، ويقفل بآخره', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const vehicle = await db.vehicle.findFirstOrThrow({
      where: { dealerId },
      select: { id: true },
    });
    const actor = { userId: owner.id, dealerId, branchId: null };

    const created = await createInstallmentPlan(actor, {
      vehicleId: vehicle.id,
      invoiceId: null,
      buyerName: 'عميل التقسيط',
      buyerPhone: '0555555555',
      buyerVatNo: null,
      totalPrice: 36_000,
      downPayment: 6_000,
      months: 3,
      startsOn: new Date('2026-12-05T09:00:00.000Z'),
      note: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.planId);

    /** **والجدولُ صفوفٌ لا حسابٌ عند العرض** — فعقدٌ وُقّع لا يتبدّل. */
    const dues = await db.installmentDue.findMany({
      where: { planId: created.planId },
      orderBy: { sequence: 'asc' },
      select: { id: true, amount: true, sequence: true },
    });
    expect(dues).toHaveLength(3);
    expect(dues.reduce((sum, due) => sum.add(due.amount), new Prisma.Decimal(0)).toFixed(2)).toBe(
      '30000.00',
    );

    /** **ولا يُقبل ما يتجاوز القسط** — وإلّا جاوز المجموعُ المموَّل. */
    const over = await recordReceipt(actor, {
      planId: created.planId,
      dueId: dues[0]!.id,
      amount: 99_999,
      method: 'CASH',
      receivedAt: new Date(),
      note: null,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('OVERPAID');

    /** وسدادٌ جزئيّ يُقيَّد ولا يُقفل القسط. */
    const partial = await recordReceipt(actor, {
      planId: created.planId,
      dueId: dues[0]!.id,
      amount: 4_000,
      method: 'CASH',
      receivedAt: new Date(),
      note: null,
    });
    expect(partial.ok).toBe(true);
    const afterPartial = await db.installmentDue.findUniqueOrThrow({
      where: { id: dues[0]!.id },
      select: { paidAmount: true, settledAt: true },
    });
    expect(Number(afterPartial.paidAmount)).toBe(4_000);
    expect(afterPartial.settledAt).toBeNull();

    /** وتمامُه يُقفله. */
    await recordReceipt(actor, {
      planId: created.planId,
      dueId: dues[0]!.id,
      amount: 6_000,
      method: 'CASH',
      receivedAt: new Date(),
      note: null,
    });
    const closed = await db.installmentDue.findUniqueOrThrow({
      where: { id: dues[0]!.id },
      select: { settledAt: true },
    });
    expect(closed.settledAt).not.toBeNull();

    /** **والعقدُ يُقفل بآخر قسط** — ولا يبقى في طابور المتأخّرين. */
    for (const due of dues.slice(1)) {
      await recordReceipt(actor, {
        planId: created.planId,
        dueId: due.id,
        amount: Number(due.amount),
        method: 'TRANSFER',
        receivedAt: new Date(),
        note: null,
      });
    }
    const plan = await db.installmentPlan.findUniqueOrThrow({
      where: { id: created.planId },
      select: { status: true, settledAt: true },
    });
    expect(plan.status).toBe('SETTLED');
    expect(plan.settledAt).not.toBeNull();
  });

  /**
   * **والمتأخّرُ ما حلّ أجلُه ولم يُسدَّد** — لا ما بقي. وعدُّ القادم
   * معه يجعل كلَّ عقدٍ متعثّرًا يومَ وُقّع.
   */
  it('والمتأخر ما حل أجله لا ما بقي', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const vehicle = await db.vehicle.findFirstOrThrow({ where: { dealerId }, select: { id: true } });

    const created = await createInstallmentPlan(
      { userId: owner.id, dealerId, branchId: null },
      {
        vehicleId: vehicle.id,
        invoiceId: null,
        buyerName: 'عميل متأخر',
        buyerPhone: null,
        buyerVatNo: null,
        totalPrice: 24_000,
        downPayment: 0,
        months: 4,
        /** بدأ قبل شهرين — فقسطان حلّا وقسطان لم يحلّا. */
        startsOn: new Date(Date.now() - 62 * 86_400_000),
        note: null,
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.planId);

    const rows = await dealerPlans(dealerId, null);
    const mine = rows.find((row) => row.id === created.planId);
    /**
     * **والتأخّرُ بالتقويم**: آجالٌ قبل ٦٢ و٣٢ ويومين — ثلاثةٌ مضت،
     * والرابعُ بعد ٢٨ يومًا. وقسطُ اليوم نفسِه لا يُعَدّ متأخّرًا.
     */
    expect(mine?.overdueCount).toBe(3);
    expect(mine?.months).toBe(4);
    /** والباقي كلُّ المموَّل — فلا شيء حُصِّل بعد. */
    expect(mine?.remaining).toBe('24000.00');
  });
});

/**
 * ═══ وقسطُ اليوم ليس متأخّرًا ═══
 *
 * كشفَته الشاشةُ على عقدٍ بدأ اليوم: «متأخر» على قسطٍ لم يحن مساؤه.
 * و`dueOn <= now` تجعله كذلك منذ أوّل الصباح.
 */
describe('حد التأخر', () => {
  it('لا يعد قسط اليوم متأخرا', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const dealerId = owner.dealerId as string;
    const vehicle = await db.vehicle.findFirstOrThrow({ where: { dealerId }, select: { id: true } });

    const created = await createInstallmentPlan(
      { userId: owner.id, dealerId, branchId: null },
      {
        vehicleId: vehicle.id,
        invoiceId: null,
        buyerName: 'عميل اليوم',
        buyerPhone: null,
        buyerVatNo: null,
        totalPrice: 12_000,
        downPayment: 0,
        months: 2,
        /** أوّلُ أجلٍ اليوم — فالقسطُ الأوّل مستحقٌّ ولم يتأخّر. */
        startsOn: new Date(),
        note: null,
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    made.push(created.planId);

    const rows = await dealerPlans(dealerId, null);
    expect(rows.find((row) => row.id === created.planId)?.overdueCount).toBe(0);
  });
});
