import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updateFinancingSettings } from '@/lib/domain/financing';

export const runtime = 'nodejs';

const Body = z.object({
  downPaymentPct: z.number(),
  months: z.number().int(),
  profitRatePct: z.number(),
  minPrice: z.number(),
});

/** والرسالةُ تقول الحدَّ لا «قيمة غير صحيحة» — فيُصحَّح من أوّل محاولة. */
const MESSAGE: Record<string, string> = {
  DOWN_PAYMENT_RANGE: 'الدفعة الأولى بين 0 و90 بالمئة.',
  MONTHS_RANGE: 'المدة بين 6 و96 شهرا.',
  PROFIT_RATE_RANGE: 'نسبة الربح بين 0 و30 بالمئة.',
  MIN_PRICE_RANGE: 'أقل سعر للتمويل بين 0 ومليون ريال.',
};

/**
 * `PUT /api/v1/admin/financing` — ما يبني «أو شهريا» على كل بطاقة.
 *
 * **والصلاحيةُ `finance.view` ومستواها يفرّق**: `requireAdmin` يردّ
 * من يملك العرض وحده (`'read'`) على كل ما ليس قراءة. وهو نمطُ العمولة
 * والباقات نفسُه — فالصلاحيةُ تسمّي المجال والمستوى يقرّر الفعل.
 *
 * **ولا نصاب عليها**: القسطُ رقمٌ تقديريّ يُعرض، لا مالٌ يخرج ولا
 * ضمانٌ يُفرَج — والأثر في `AuditLog` يُراجَع.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ financing: 'INVALID' }), 422);

  const result = await updateFinancingSettings(guard.admin, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      {
        code: result.errors[0] ?? 'INVALID',
        messageAr: MESSAGE[result.errors[0] ?? ''] ?? 'تعذر الحفظ.',
        messageEn: 'Could not save the financing settings.',
      },
      422,
    );
  }

  return ok(result.settings);
}
