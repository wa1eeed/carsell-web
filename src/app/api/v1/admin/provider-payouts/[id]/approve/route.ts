import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { approveProviderPayout } from '@/lib/domain/provider-payouts';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/provider-payouts/{id}/approve` — الاعتماد الثاني.
 *
 * **وهو الذي يكتب القيد**: الصفّ `SENT` وقيدَي الدفتر المتوازنين
 * والأثر في معاملةٍ واحدة، فيُخصم دَينُ المزوّد. وطالبُ التحويل لا
 * يعتمد على نفسه — والفحص في النطاق لا هنا.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'payouts.send');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const bankRef =
    body !== null && typeof body === 'object' && typeof (body as { bankRef?: unknown }).bankRef === 'string'
      ? (body as { bankRef: string }).bankRef
      : '';

  const result = await approveProviderPayout({
    payoutId: id,
    adminId: guard.admin.id,
    bankRef,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'PAYOUT_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    // **واعتمادُ النفس ٤٠٣ لا ٤٢٢**: فعلٌ ممنوعٌ على هذا الشخص مهما أعاد
    if (result.reason === 'SELF_APPROVAL') return fail(ERRORS.FORBIDDEN, 403);
    return fail(ERRORS.VALIDATION({ payout: result.reason }), 422);
  }

  return ok({ payoutId: result.payoutId, remaining: result.remaining });
}
