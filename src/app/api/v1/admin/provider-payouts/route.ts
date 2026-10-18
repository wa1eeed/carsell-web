import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { requestProviderPayout } from '@/lib/domain/provider-payouts';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/provider-payouts` — طلبُ تحويل مستحقّ مزوّد.
 *
 * **ولا مال يخرج هنا**: يُنشأ طلبٌ بنصاب اثنين، والاعتماد في
 * `/{id}/approve` بيد الثاني — وهو الذي يكتب قيد
 * `provider_payout.sent` فيُخصم الدَّين.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'payouts.send');
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object') {
    return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);
  }

  const input = body as { providerId?: unknown; amount?: unknown; note?: unknown };
  if (typeof input.providerId !== 'string' || input.providerId === '') {
    return fail(ERRORS.VALIDATION({ providerId: 'REQUIRED' }), 422);
  }
  if (typeof input.amount !== 'string' && typeof input.amount !== 'number') {
    return fail(ERRORS.VALIDATION({ amount: 'REQUIRED' }), 422);
  }

  const result = await requestProviderPayout({
    providerId: input.providerId,
    amount: input.amount,
    adminId: guard.admin.id,
    ip: guard.ip,
    ...(typeof input.note === 'string' && input.note !== '' ? { note: input.note } : {}),
  });

  if (!result.ok) {
    if (result.reason === 'PROVIDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ payout: result.reason }), 422);
  }

  return ok({ payoutId: result.payoutId, requestId: result.requestId });
}
