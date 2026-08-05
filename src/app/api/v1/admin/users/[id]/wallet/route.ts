import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { WALLET_REASON_MIN, requestWalletAdjustment } from '@/lib/domain/wallet';

export const runtime = 'nodejs';

const Body = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive(),
  reason: z.string().min(WALLET_REASON_MIN),
});

/**
 * `POST /api/v1/admin/users/{id}/wallet` — **طلبُ** تعديل رصيد.
 *
 * ولا يُنفَّذ هنا: يُنشأ طلبُ موافقةٍ بشخصين، ويُنفّذه الثاني من
 * `/wallet-adjustments/{id}/approve`. ومالُ عميلٍ لا يمسّه واحد.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'wallet.adjust');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(ERRORS.VALIDATION({ wallet: 'INVALID' }), 422);
  }

  const result = await requestWalletAdjustment({
    userId: id,
    direction: parsed.data.direction,
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'USER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ wallet: result.reason }), 422);
  }

  return ok({ requestId: result.requestId, pendingApproval: true });
}
