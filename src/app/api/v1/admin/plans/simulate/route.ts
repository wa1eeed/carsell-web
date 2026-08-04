import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { simulateCommission } from '@/lib/domain/admin-plans';

export const runtime = 'nodejs';

const Body = z.object({
  price: z.number().min(0),
  pct: z.number().min(0).max(100),
  fixedFee: z.number().min(0),
  minFee: z.number().min(0).nullable(),
  maxFee: z.number().min(0).nullable(),
});

/**
 * `POST /api/v1/admin/plans/simulate` — محاكي العمولة (A29).
 *
 * **ولا يكتب شيئًا.** ويستدعي حساب العمولة نفسه الذي يستدعيه إنشاء
 * الطلب — فما يقوله هنا هو ما يقع هناك.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ simulation: 'INVALID' }), 422);

  return ok({ commission: simulateCommission(parsed.data) });
}
