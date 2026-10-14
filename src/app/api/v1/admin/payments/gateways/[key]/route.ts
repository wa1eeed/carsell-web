import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setGatewayFees } from '@/lib/domain/payment-routing';

export const runtime = 'nodejs';

/** الرسومُ وحدها: الرايات تصف ما تستطيعه البوّابة، ومنحُها بيدٍ كذب. */
const Body = z.object({
  feePct: z.number().min(0).max(100),
  feeFixed: z.number().min(0).max(100_000),
});

/**
 * `PUT /api/v1/admin/payments/gateways/{key}` — ما تأخذه البوّابة منّا.
 *
 * و`resolve.ts` يقرأ القدرات من الصفّ منذ بُني ويقول «المشغّل يعدّلها
 * بلا نشر» — **ولم تكن هناك شاشة تعدّلها**، فالوعد كان بلا باب.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { key } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ feePct: 'INVALID' }), 422);

  const result = await setGatewayFees(guard.admin, key, parsed.data, guard.ip);
  if (!result.ok) {
    return result.reason === 'NOT_FOUND'
      ? fail(ERRORS.NOT_FOUND, 404)
      : fail(ERRORS.VALIDATION({ feePct: 'INVALID' }), 422);
  }

  return ok(result.row);
}
