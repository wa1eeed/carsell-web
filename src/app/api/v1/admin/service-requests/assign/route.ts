import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { autoAssignServiceRequests, bulkAssignServiceRequests } from '@/lib/domain/admin-services';
import { canWrite } from '@/lib/domain/permissions';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/service-requests/assign` — إسنادُ طلبٍ أو أكثر.
 *
 * **ومسارٌ واحد للمفرد والجماعيّ**: الجماعيُّ قائمةٌ بعنصر، والمفردُ
 * قائمةٌ بواحد — فلا مساران يتباعدان في الأهليّة.
 *
 * والنطاق يُسنِد **واحدًا واحدًا** ويردّ ما نجح وما لم ينجح بسببه.
 */
const MAX_BULK = 50;

/**
 * **و`providerId` اختياريّ**: غيابُه يعني «اختر أنت» — فيسأل المسارُ
 * محرّكَ الإسناد عن أفضل مرشّحٍ **لكلّ طلبٍ على حدة**، إذ مدينةُ الطلب
 * غيرُ مدينة جاره.
 */
const Body = z.object({
  refs: z.array(z.string().min(1)).min(1).max(MAX_BULK),
  providerId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'services.manage');
  if (!guard.ok) return guard.response;

  /** **والإسنادُ كتابة** — قارئٌ يُسنِد خمسين طلبًا ليس قارئًا. */
  if (!canWrite(guard.admin.role, 'services.manage')) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ refs: 'INVALID' }), 422);

  const providerId = parsed.data.providerId;

  return ok(
    providerId === undefined
      ? await autoAssignServiceRequests(guard.admin, parsed.data.refs, guard.ip)
      : await bulkAssignServiceRequests(guard.admin, parsed.data.refs, providerId, guard.ip),
  );
}
