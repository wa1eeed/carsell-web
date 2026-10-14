import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { AdminUser } from '@/generated/prisma/client';
import { feeMatrixFromPercent, type FeeMatrix } from '@/lib/payments/provider-platform';

/**
 * ═══ مصفوفةُ رسوم بوّابة المزوّدين — من اللوحة لا من الشيفرة ═══
 *
 * قرار المالك ٢٠٢٦-١٠-١٤: «الرسوم تُضبط من لوحة الأدمن ولا نضعها داخل
 * الكود». وهي شروطٌ تجاريّة مع شريكٍ حقيقيّ: ثابتٌ في الشيفرة يفرضها
 * بلا أن يقرّرها أحد، ولا تُكتشف إلّا حين يسأل عن خصمٍ لم يتّفق عليه.
 *
 * **و`null` ليست صفرًا.** مصفوفةٌ غير مضبوطة تَمنع فتحَ الحساب وتشير
 * إلى الشاشة؛ وإرسالُ أصفارٍ يعني «لا نأخذ من هذا الشريك شيئًا» —
 * قرارٌ تجاريّ لا يقع بالنسيان.
 */

export type ProviderFeePlanRow = {
  /** أقرّرها أحد؟ — والستّ الإلزاميّة تُكتب دفعةً فلا نصفَ ضبط */
  configured: boolean;
  madaPct: string;
  madaFixed: string;
  madaCap: string | null;
  madaRefundFixed: string;
  cardPct: string;
  cardFixed: string;
  cardRefundFixed: string;
  taxInclusive: boolean;
};

const EMPTY: ProviderFeePlanRow = {
  configured: false,
  madaPct: '',
  madaFixed: '',
  madaCap: null,
  madaRefundFixed: '',
  cardPct: '',
  cardFixed: '',
  cardRefundFixed: '',
  taxInclusive: false,
};

export async function getProviderFeePlan(): Promise<ProviderFeePlanRow> {
  const row = await db.platformSetting.findUnique({
    where: { id: 'default' },
    select: {
      providerFeeMadaPct: true,
      providerFeeMadaFixed: true,
      providerFeeMadaCap: true,
      providerFeeMadaRefundFixed: true,
      providerFeeCardPct: true,
      providerFeeCardFixed: true,
      providerFeeCardRefundFixed: true,
      providerFeeTaxInclusive: true,
    },
  });
  if (row === null) return EMPTY;

  const required = [
    row.providerFeeMadaPct,
    row.providerFeeMadaFixed,
    row.providerFeeMadaRefundFixed,
    row.providerFeeCardPct,
    row.providerFeeCardFixed,
    row.providerFeeCardRefundFixed,
  ];
  if (required.some((value) => value === null)) {
    return { ...EMPTY, taxInclusive: row.providerFeeTaxInclusive };
  }

  return {
    configured: true,
    madaPct: String(row.providerFeeMadaPct),
    madaFixed: String(row.providerFeeMadaFixed),
    madaCap: row.providerFeeMadaCap === null ? null : String(row.providerFeeMadaCap),
    madaRefundFixed: String(row.providerFeeMadaRefundFixed),
    cardPct: String(row.providerFeeCardPct),
    cardFixed: String(row.providerFeeCardFixed),
    cardRefundFixed: String(row.providerFeeCardRefundFixed),
    taxInclusive: row.providerFeeTaxInclusive,
  };
}

/**
 * المصفوفةُ بصيغة البوّابة — **أو `null` حين لم تُضبط**.
 *
 * ولا تُعيد افتراضًا: من يفتح حسابًا بلا مصفوفةٍ مقرَّرة يُردّ، لا
 * يُفتح له حسابٌ بشروطٍ لم يرها أحد.
 */
export async function providerFeeMatrix(): Promise<FeeMatrix | null> {
  const plan = await getProviderFeePlan();
  return plan.configured ? feeMatrixFromPercent(plan) : null;
}

export type FeePlanInput = {
  madaPct: number;
  madaFixed: number;
  madaCap: number | null;
  madaRefundFixed: number;
  cardPct: number;
  cardFixed: number;
  cardRefundFixed: number;
  taxInclusive: boolean;
};

export type FeePlanResult =
  | { ok: true; row: ProviderFeePlanRow; openAccounts: number }
  | { ok: false; reason: 'INVALID' };

/**
 * الحفظ **لا يمسّ حسابًا مفتوحًا**: الرسوم تُرسَل إلى البوّابة لحظةَ
 * فتح الحساب وتبقى عندها، فما فُتح يبقى بشروطه — والعددُ المُعاد يُري
 * المشغّل كم شريكًا على شروطٍ سابقة قبل أن يسأل عنه.
 */
export async function setProviderFeePlan(
  admin: AdminUser,
  input: FeePlanInput,
  ip: string | null,
  now: Date = new Date(),
): Promise<FeePlanResult> {
  /**
   * **الحدُّ مئةٌ لا واحد.** المخزَّن مئويّة، والبوّابة تحدّ الكسر
   * بواحد — أي مئةً هنا. وحدٌّ بواحدٍ على المئويّة يمنع «١٬٧٠٪» وهي
   * الشرط الشائع.
   */
  const pcts = [input.madaPct, input.cardPct];
  const amounts = [input.madaFixed, input.madaRefundFixed, input.cardFixed, input.cardRefundFixed];
  const sane =
    pcts.every((value) => Number.isFinite(value) && value >= 0 && value <= 100) &&
    amounts.every((value) => Number.isFinite(value) && value >= 0 && value <= 100_000) &&
    (input.madaCap === null || (Number.isFinite(input.madaCap) && input.madaCap >= 0));
  if (!sane) return { ok: false, reason: 'INVALID' };

  const before = await getProviderFeePlan();

  await db.platformSetting.update({
    where: { id: 'default' },
    data: {
      providerFeeMadaPct: new Prisma.Decimal(input.madaPct),
      providerFeeMadaFixed: new Prisma.Decimal(input.madaFixed),
      providerFeeMadaCap: input.madaCap === null ? null : new Prisma.Decimal(input.madaCap),
      providerFeeMadaRefundFixed: new Prisma.Decimal(input.madaRefundFixed),
      providerFeeCardPct: new Prisma.Decimal(input.cardPct),
      providerFeeCardFixed: new Prisma.Decimal(input.cardFixed),
      providerFeeCardRefundFixed: new Prisma.Decimal(input.cardRefundFixed),
      providerFeeTaxInclusive: input.taxInclusive,
    },
  });

  const openAccounts = await db.serviceProvider.count({
    where: { accountRef: { not: null } },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'PlatformSetting',
      entityId: 'default',
      action: 'payments.provider_fees_changed',
      before: { ...before },
      after: { ...input, openAccounts },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, row: await getProviderFeePlan(), openAccounts };
}
