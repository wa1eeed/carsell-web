import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { saveFaq } from '@/lib/domain/admin-content';

export const runtime = 'nodejs';

/**
 * ═══ `POST /api/v1/admin/faq` — سؤالٌ جديد (A33) ═══
 *
 * `FaqItem` كان **لا يكتبه إلا الزرع**: الشاشة تُخفي وتُظهر وتضبط
 * المواضع، ولا تملك إضافة سؤالٍ ولا تصحيح حرفٍ فيه — **وهي تعدّ
 * «ترجمة ناقصة» وتسمّي صفوفها** بلا بابٍ لملئها.
 *
 * وzod تحرس الشكل والحجم، والمعنى في النطاق — فتعود الأخطاء دفعةً.
 */
const Body = z.object({
  questionAr: z.string().max(400),
  questionEn: z.string().max(400),
  answerAr: z.string().max(4000),
  answerEn: z.string().max(4000),
  category: z.string().max(60),
  sort: z.string().max(5).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ questionAr: 'REQUIRED' }), 422);

  const result = await saveFaq({
    id: null,
    draft: parsed.data,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    return result.reason === 'VALIDATION'
      ? fail(ERRORS.VALIDATION(result.fields), 422)
      : fail(ERRORS.NOT_FOUND, 404);
  }

  return ok({ id: result.id });
}
