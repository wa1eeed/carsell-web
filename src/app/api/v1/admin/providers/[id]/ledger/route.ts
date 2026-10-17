import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { PROVIDER_REASON_MIN, requestProviderAdjustment } from '@/lib/domain/provider-ledger';

export const runtime = 'nodejs';

const Body = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive(),
  reason: z.string().min(PROVIDER_REASON_MIN),
});

/**
 * `POST /api/v1/admin/providers/{id}/ledger` — **طلبُ** قيدٍ على حسابه.
 *
 * ولا يقع هنا: يُنشأ طلبُ موافقةٍ بشخصين وينفّذه الثاني من
 * `/provider-adjustments/{id}/approve`. ومالُ طرفٍ ثالث لا يمسّه واحد.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'providers.adjust');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ ledger: 'INVALID' }), 422);

  const result = await requestProviderAdjustment({
    providerId: id,
    direction: parsed.data.direction,
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'PROVIDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ ledger: result.reason }), 422);
  }

  return ok({ requestId: result.requestId, pendingApproval: true });
}
