import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { rejectPayout } from '@/lib/domain/payouts';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/payouts/{id}/reject` — إلغاء طلب تحويل.
 *
 * **ويملكه طالبُه أيضًا**: النصاب على خروج المال لا على إلغائه.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'payouts.send');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const reason =
    body !== null && typeof body === 'object' && typeof (body as { reason?: unknown }).reason === 'string'
      ? (body as { reason: string }).reason
      : '';

  const result = await rejectPayout({ payoutId: id, adminId: guard.admin.id, reason, ip: guard.ip });
  if (!result.ok) {
    if (result.reason === 'PAYOUT_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ payout: result.reason }), 422);
  }

  return ok({ payoutId: id });
}
