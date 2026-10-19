import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import {
  validateFinancing,
  type FinancingError,
  type FinancingSettings,
} from '@/lib/finance/terms';

export type { FinancingSettings, FinancingError };

export type FinancingResult =
  | { ok: true; settings: FinancingSettings }
  | { ok: false; errors: FinancingError[] };

/**
 * ═══ إعدادُ التمويل — وكان لا يتغيّر إلّا بنشر ═══
 *
 * `FinanceSetting` صفٌّ واحد تزرعه البذرة **ولا شيء يعدّله**: لا شاشة
 * ولا مسار (قِيس بالبوابة ٦٣). وهو خلف كلّ «أو شهريا ٢٬١٤٠» على بطاقة
 * سيارة، وخلف أيِّ إعلانٍ يُعدّ قابلًا للتمويل أصلًا (`minPrice`).
 *
 * **فتغييرُ نسبةِ ربحٍ يحتاج نشرًا كاملًا** — وهي رقمٌ يتفاوض عليه
 * المموّل ويتغيّر بين فصلٍ وفصل.
 *
 * ═══ والرقمُ المعروض وعدٌ تقريبيّ، فيُقال تقريبُه ═══
 *
 * القسطُ حسابٌ محلّيّ (قرار ١٤) لا استدعاءُ مموّل، فما يراه المشتري
 * تقديرٌ يقرّب إلى أقرب عشرة — والشاشةُ تقول ذلك، وهذا ما يجعل
 * تحريرَه من اللوحة مشروعًا لا متهوّرًا.
 */

/** **والافتراضيّ يطابق المخطّط** — فصفٌّ غائب لا يُعطّل الشاشة. */
const FALLBACK: FinancingSettings = {
  downPaymentPct: 20,
  months: 60,
  profitRatePct: 0,
  minPrice: 0,
};

export async function financingSettings(): Promise<FinancingSettings> {
  const row = await db.financeSetting.findUnique({ where: { id: 'default' } });
  if (row === null) return FALLBACK;
  return {
    downPaymentPct: Number(row.downPaymentPct),
    months: row.months,
    profitRatePct: Number(row.profitRatePct),
    minPrice: Number(row.minPrice),
  };
}

export async function updateFinancingSettings(
  admin: { id: string },
  input: FinancingSettings,
  ip: string | null,
): Promise<FinancingResult> {
  const errors = validateFinancing(input);
  if (errors.length > 0) return { ok: false, errors };

  const before = await financingSettings();

  const row = await db.financeSetting.upsert({
    where: { id: 'default' },
    update: {
      downPaymentPct: new Prisma.Decimal(input.downPaymentPct.toFixed(2)),
      months: input.months,
      profitRatePct: new Prisma.Decimal(input.profitRatePct.toFixed(2)),
      minPrice: new Prisma.Decimal(input.minPrice.toFixed(2)),
    },
    create: {
      id: 'default',
      downPaymentPct: new Prisma.Decimal(input.downPaymentPct.toFixed(2)),
      months: input.months,
      profitRatePct: new Prisma.Decimal(input.profitRatePct.toFixed(2)),
      minPrice: new Prisma.Decimal(input.minPrice.toFixed(2)),
    },
  });

  /**
   * **وكلُّ إجراء أدمن يكتب `AuditLog`** — وهذا يغيّر رقمًا ماليًّا
   * معروضًا على كلّ بطاقة، فأولى من غيره بأثرٍ يُراجَع.
   */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'FinanceSetting',
      entityId: 'default',
      action: 'financing.update',
      before: { ...before },
      after: { ...input },
      ip,
    },
  });

  return {
    ok: true,
    settings: {
      downPaymentPct: Number(row.downPaymentPct),
      months: row.months,
      profitRatePct: Number(row.profitRatePct),
      minPrice: Number(row.minPrice),
    },
  };
}
