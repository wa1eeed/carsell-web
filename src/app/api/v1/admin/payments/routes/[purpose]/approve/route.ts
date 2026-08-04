import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveRouteSwitch } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

const Body = z.object({ requestId: z.string().min(1).max(60) });

/**
 * `POST /api/v1/admin/payments/routes/{purpose}/approve` — الموافقة الثانية.
 *
 * **لم يكن لها مسار.** كان الطلب يُكتب بنصاب عضوين وتقول الشاشة إنه
 * ينتظر ثانيًا، ولا موضع يوافق فيه — فيبقى معلَّقًا حتى ينقضي.
 *
 * ورفضُ موافقة الطالب على طلبه `403` لا `422`: حدٌّ في الصلاحية لا خطأ
 * في المدخلات، والواجهة تشرحه للمشغّل بدل أن تقول «تحقّق من الحقول».
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ purpose: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ requestId: 'REQUIRED' }), 422);

  await params;
  const result = await approveRouteSwitch(guard.admin, parsed.data.requestId, guard.ip);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    const status = result.reason === 'SELF_APPROVAL' ? 403
      : result.reason === 'GATEWAY_NOT_FOUND' ? 409
      : 409;
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'SELF_APPROVAL'
            ? 'طالب التبديل لا يوافق على طلبه — يلزم عضو ثانٍ.'
            : result.reason === 'GATEWAY_NOT_FOUND'
              ? 'البوابة لم تعد صالحة لهذا الغرض — أُلغي التطبيق.'
              : result.reason === 'EXPIRED'
                ? 'انقضت مهلة الطلب — أعِد طلب التبديل.'
                : 'الطلب لم يعد قابلًا للاعتماد.',
        messageEn:
          result.reason === 'SELF_APPROVAL'
            ? 'The requester cannot approve their own switch.'
            : result.reason === 'GATEWAY_NOT_FOUND'
              ? 'The gateway is no longer eligible for this purpose.'
              : result.reason === 'EXPIRED'
                ? 'The request has expired — request the switch again.'
                : 'This request can no longer be approved.',
      },
      status,
    );
  }

  return ok(result);
}
