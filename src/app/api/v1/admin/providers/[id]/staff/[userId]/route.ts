import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { resetProviderUserPassword, setProviderUserActive } from '@/lib/domain/provider-staff';

export const runtime = 'nodejs';

/**
 * `PATCH /api/v1/admin/providers/{id}/staff/{userId}`
 *
 * فعلان: إيقافُ الحساب وإعادتُه، وإعادةُ ضبط الكلمة. وكلاهما يسحب
 * الجلسات — فمن أُوقف لا يبقى داخلًا، ومن سُرقت كلمتُه لا يبقى سارقُها.
 */
const Body = z.union([
  z.object({ active: z.boolean() }),
  z.object({ resetPassword: z.literal(true) }),
]);

type Params = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id, userId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ staff: 'INVALID' }), 422);

  if ('resetPassword' in parsed.data) {
    const result = await resetProviderUserPassword({
      providerId: id,
      providerUserId: userId,
      adminId: guard.admin.id,
      ip: guard.ip,
    });
    if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
    return ok({ tempPassword: result.tempPassword });
  }

  const result = await setProviderUserActive({
    providerId: id,
    providerUserId: userId,
    active: parsed.data.active,
    adminId: guard.admin.id,
    ip: guard.ip,
  });
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);
  return ok({ active: parsed.data.active });
}
