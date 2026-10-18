import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updateTrustMark } from '@/lib/domain/trust-marks';

export const runtime = 'nodejs';

/**
 * **والاسمُ والشعارُ لا يُحرَّران من هنا.** الشعارُ ملفٌّ في المستودع
 * (`logoPath`) لا رابطٌ خارجيّ، والاسمُ اسمُ جهةٍ نظامية. وما يملكه
 * المالكُ هو **الدعوى**: رقمُ تسجيله، وصفحةُ التحقّق، وأيعرضها أصلًا.
 */
const Body = z.object({
  registrationNo: z.string().max(40).nullable().optional(),
  verifyUrl: z.string().max(400).nullable().optional(),
  active: z.boolean().optional(),
});

const MESSAGE: Record<string, string> = {
  NOT_FOUND: 'لا توجد علامة بهذا المفتاح.',
  INVALID_URL: 'رابط التحقق يجب أن يبدأ بـ https.',
  INVALID_NUMBER: 'رقم التسجيل أطول مما يقبله الحقل.',
};

/** `PATCH /api/v1/admin/trust-marks/{key}` — رقمُ العلامة ورابطُها وحالُها. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ trustMark: 'INVALID' }), 422);

  const result = await updateTrustMark(guard.admin, key, parsed.data, guard.ip);
  if (!result.ok) {
    return fail(
      {
        code: result.reason,
        messageAr: MESSAGE[result.reason] ?? 'تعذر الحفظ.',
        messageEn: 'Could not save the trust mark.',
      },
      result.reason === 'NOT_FOUND' ? 404 : 422,
    );
  }

  return ok(result.mark);
}
