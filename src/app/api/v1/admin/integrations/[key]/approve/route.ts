import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveRotation } from '@/lib/domain/admin-integrations';

export const runtime = 'nodejs';

const Body = z.object({ requestId: z.string().min(1).max(60) });

/**
 * `POST /api/v1/admin/integrations/{key}/approve` — الموافقة الثانية.
 *
 * ورفضُ موافقة الطالب على طلبه يعود بـ`403` لا `422`: هو ليس خطأً في
 * المدخلات بل حدٌّ في الصلاحية، والرمز يُقرأ في الواجهة ليُشرح للمستخدم.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'integrations.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ requestId: 'REQUIRED' }), 422);

  await params;
  const result = await approveRotation(guard.admin, parsed.data.requestId, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'SELF_APPROVAL'
            ? 'طالب التدوير لا يوافق على طلبه — يلزم عضو ثانٍ.'
            : 'الطلب لم يعد قابلًا للاعتماد.',
        messageEn:
          result.reason === 'SELF_APPROVAL'
            ? 'The requester cannot approve their own rotation.'
            : 'This request can no longer be approved.',
      },
      result.reason === 'SELF_APPROVAL' ? 403 : 409,
    );
  }

  return ok(result);
}
