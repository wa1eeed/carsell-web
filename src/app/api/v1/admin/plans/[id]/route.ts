import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { updatePlan } from '@/lib/domain/admin-plans';

export const runtime = 'nodejs';

const Body = z.object({
  price: z.number().min(0),
  visible: z.boolean(),
  entitlements: z.record(z.string(), z.string()),
});

/** `PUT /api/v1/admin/plans/{id}` — سعر الباقة وظهورها وقيَم خصائصها (A29). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ plan: 'INVALID' }), 422);

  const result = await updatePlan({
    planId: id,
    price: parsed.data.price,
    visible: parsed.data.visible,
    entitlements: parsed.data.entitlements,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'PLAN_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ plan: result.reason }), 422);
  }

  return ok({ updated: true });
}
