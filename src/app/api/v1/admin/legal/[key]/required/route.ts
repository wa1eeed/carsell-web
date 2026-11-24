import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { setRequiredAtSignup } from '@/lib/domain/admin-legal';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/legal/{key}/required` — «إلزاميّ للتسجيل».
 *
 * **والحقلُ هو الذي يقرؤه التسجيل نفسُه**: فتبديلُه هنا يبدّل ما
 * يطلبه `recordAcceptance` وما يعرضه عمود «يظهر في» معًا — ولا
 * يتباعدان لأنهما مصدرٌ واحد.
 */
const Body = z.object({ required: z.boolean() });

export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const guard = await requireAdmin(request, 'notifications.manage');
  if (!guard.ok) return guard.response;

  const { key } = await context.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ required: 'REQUIRED' }), 422);

  const result = await setRequiredAtSignup({
    key,
    required: parsed.data.required,
    adminId: guard.admin.id,
    ip: guard.ip,
  });
  if (!result.ok) return fail(ERRORS.NOT_FOUND, 404);

  return ok({ required: parsed.data.required });
}
