import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { toggleAdSlot } from '@/lib/domain/admin-plans';

export const runtime = 'nodejs';

const Body = z.object({ active: z.boolean() });

/** `PATCH /api/v1/admin/ad-slots/{key}` — تفعيل مساحة إعلانية أو تعطيلها (A30). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin(request, 'finance.view');
  if (!guard.ok) return guard.response;

  const { key } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ active: 'INVALID' }), 422);

  const result = await toggleAdSlot({
    key,
    active: parsed.data.active,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
  return ok({ active: result.active });
}
