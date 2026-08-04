import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { toggleProvider } from '@/lib/domain/admin-providers';

export const runtime = 'nodejs';

const Body = z.object({ active: z.boolean() });

/** `PATCH /api/v1/admin/providers/{id}` — تفعيل مزوّد خدمة أو تعطيله (A28). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ active: 'INVALID' }), 422);

  const result = await toggleProvider({
    providerId: id,
    active: parsed.data.active,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  // العدد يُعاد كي تقوله الشاشة: ما زال عليه طلباتٌ يُكملها
  return ok({ active: result.active, openRequests: result.openRequests });
}
