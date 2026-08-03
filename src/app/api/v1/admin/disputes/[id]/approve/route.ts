import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveResolution } from '@/lib/domain/disputes';

export const runtime = 'nodejs';

const Body = z.object({ approvalId: z.string().min(1).max(60) });

/**
 * `POST /api/v1/admin/disputes/{id}/approve` — الموافقة الثانية.
 *
 * **لم يكن لها مسار.** `approveResolution` مبنيّةٌ ومختبَرة ولا ينادها
 * شيء — فكل نزاعٍ يُقترح له قرار يبقى في «قيد الفحص» بلا حسم، ومالُ
 * الضمان محجوزٌ إلى أن تنقضي مهلة الطلب.
 *
 * والتنفيذ يقع داخل النطاق حين تكتمل الموافقات — لا تحويل يدويّ بعده.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request, 'escrow.release');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ approvalId: 'REQUIRED' }), 422);

  await params;
  const result = await approveResolution({
    approvalId: parsed.data.approvalId,
    adminId: guard.admin.id,
  });

  if (!result.ok) {
    if (result.reason === 'APPROVAL_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(
      {
        code: result.reason,
        messageAr:
          result.reason === 'SELF_APPROVAL'
            ? 'مقترِح القرار لا يوافق على اقتراحه — يلزم عضو ثانٍ.'
            : result.reason === 'ALREADY_APPROVED'
              ? 'وافقتَ على هذا الطلب من قبل.'
              : result.reason === 'EXPIRED'
                ? 'انقضت مهلة الطلب — أعِد اقتراح القرار.'
                : 'الطلب لم يعد قابلًا للاعتماد.',
        messageEn:
          result.reason === 'SELF_APPROVAL'
            ? 'The proposer cannot approve their own resolution.'
            : result.reason === 'ALREADY_APPROVED'
              ? 'You have already approved this request.'
              : result.reason === 'EXPIRED'
                ? 'The request has expired — propose the resolution again.'
                : 'This request can no longer be approved.',
      },
      result.reason === 'SELF_APPROVAL' ? 403 : 409,
    );
  }

  return ok(result);
}
