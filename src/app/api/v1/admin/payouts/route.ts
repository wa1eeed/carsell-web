import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { requestPayout } from '@/lib/domain/payouts';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/payouts` — طلبُ تحويل مستحقّات بائع.
 *
 * **ولا مال يخرج هنا**: يُنشأ طلبٌ بنصاب اثنين، والاعتماد في
 * `/{id}/approve` بيد الثاني — وهو الذي يكتب قيد `payout.sent`.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'payouts.send');
  if (!guard.ok) return guard.response;

  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== 'object') return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const input = body as { sellerId?: unknown; amount?: unknown; note?: unknown };
  if (typeof input.sellerId !== 'string' || input.sellerId === '') {
    return fail(ERRORS.VALIDATION({ sellerId: 'REQUIRED' }), 422);
  }
  if (typeof input.amount !== 'string' && typeof input.amount !== 'number') {
    return fail(ERRORS.VALIDATION({ amount: 'REQUIRED' }), 422);
  }

  const result = await requestPayout({
    sellerId: input.sellerId,
    amount: input.amount,
    adminId: guard.admin.id,
    ip: guard.ip,
    ...(typeof input.note === 'string' && input.note !== '' ? { note: input.note } : {}),
  });

  if (!result.ok) {
    if (result.reason === 'SELLER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ payout: result.reason }), 422);
  }

  return ok({ payoutId: result.payoutId, requestId: result.requestId });
}
