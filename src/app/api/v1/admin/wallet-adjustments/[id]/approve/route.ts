import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveWalletAdjustment } from '@/lib/domain/wallet';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/wallet-adjustments/{id}/approve` — الموافقة الثانية.
 *
 * **وهي التي تُنفّذ**: تكتب قيد المحفظة وقيدَي الدفتر المتوازنين والأثر
 * في معاملةٍ واحدة. وطالبُ التعديل لا يوافق على نفسه — والفحص في
 * النطاق لا هنا، فالحارس في الشاشة اقتراحٌ لا حراسة.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'wallet.adjust');
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const result = await approveWalletAdjustment({
    requestId: id,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'REQUEST_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    /**
     * **وموافقةُ النفس ٤٠٣ لا ٤٢٢**: ليست مُدخلًا خاطئًا يُصحَّح، بل
     * فعلٌ ممنوعٌ على هذا الشخص مهما أعاد.
     */
    if (result.reason === 'SELF_APPROVAL') return fail(ERRORS.FORBIDDEN, 403);
    return fail(ERRORS.VALIDATION({ wallet: result.reason }), 422);
  }

  return ok({ balance: result.balance });
}
