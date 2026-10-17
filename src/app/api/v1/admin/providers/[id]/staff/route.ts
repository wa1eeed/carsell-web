import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { createProviderUser } from '@/lib/domain/provider-staff';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().min(5).max(200),
});

/**
 * `POST /api/v1/admin/providers/{id}/staff` — فتحُ حساب دخولٍ لمزوّد.
 *
 * **والكلمة تُردّ مرّةً واحدة** ولا تُخزَّن إلّا مجزَّأة: من أغلق
 * النافذة قبل نسخها يُعيد الضبط، ولا يسترجعها أحدٌ من سجلّ.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ staff: 'INVALID' }), 422);

  const result = await createProviderUser({
    providerId: id,
    name: parsed.data.name,
    email: parsed.data.email,
    adminId: guard.admin.id,
    ip: guard.ip,
  });

  if (!result.ok) {
    if (result.reason === 'PROVIDER_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    return fail(ERRORS.VALIDATION({ staff: result.reason }), 422);
  }

  return ok({ id: result.id, tempPassword: result.tempPassword });
}
