import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { MAX_COMMISSION_PCT, setCommissionRule } from '@/lib/domain/admin-commission';

export const runtime = 'nodejs';

const Body = z.object({
  side: z.enum(['BUYER', 'SELLER']),
  enabled: z.boolean(),
  pct: z.number().min(0).max(MAX_COMMISSION_PCT),
  fixedFee: z.number().min(0).max(1_000_000),
  minFee: z.number().min(0).max(1_000_000).nullable(),
  maxFee: z.number().min(0).max(1_000_000).nullable(),
});

const STATUS: Record<string, number> = {
  PCT_OUT_OF_RANGE: 422,
  NEGATIVE_AMOUNT: 422,
  MIN_ABOVE_MAX: 422,
  NO_CHARGE_ENABLED: 422,
};

const MESSAGE: Record<string, string> = {
  PCT_OUT_OF_RANGE: `النسبة بين صفر و${MAX_COMMISSION_PCT} بالمئة.`,
  NEGATIVE_AMOUNT: 'لا مبلغ سالبًا.',
  MIN_ABOVE_MAX: 'الحدّ الأدنى أعلى من الأقصى.',
  NO_CHARGE_ENABLED: 'مفعَّلة بصفر: اضبط نسبةً أو مبلغًا، أو عطّلها.',
};

/**
 * `PUT /api/v1/admin/commission` — قاعدة طرفٍ واحد.
 *
 * **طرفًا طرفًا لا استمارةً واحدة**: من يعدّل عمولة البائع لا يُعاد
 * إليه خطأٌ لأن حقلًا في عمولة المشتري خارج حدوده.
 *
 * ولا نصاب عليها: العمولة تسري على ما **يُنشأ بعدها** ولا تمسّ طلبًا
 * قائمًا ولا مالًا محجوزًا — بخلاف الإفراج. والأثر مكتوبٌ في `AuditLog`.
 */
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ pct: 'INVALID' }), 422);

  const result = await setCommissionRule({
    ...parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذّر الحفظ.',
        messageEn: 'Could not save the commission rule.',
      },
      STATUS[result.reason] ?? 409,
    );
  }

  return ok({ side: result.side });
}
