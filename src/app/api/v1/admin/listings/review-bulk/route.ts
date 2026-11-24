import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/admin-guard';
import { bulkApproveReviews } from '@/lib/domain/admin-listings';
import { canWrite } from '@/lib/domain/permissions';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/admin/listings/review-bulk` — اعتمادُ المحدَّد.
 *
 * **والنطاق يعتمد واحدًا واحدًا** عبر `decideReview` — فالفحوصُ هي
 * نفسُها، والتدقيقُ يُكتب لكلّ إعلان، وفشلُ واحدٍ لا يوقف الباقين.
 */
const MAX_BULK = 50;

const Body = z.object({ refs: z.array(z.string().min(1)).min(1).max(MAX_BULK) });

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request, 'listings.review');
  if (!guard.ok) return guard.response;
  if (!canWrite(guard.admin.role, 'listings.review')) return fail(ERRORS.FORBIDDEN, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ refs: 'INVALID' }), 422);

  return ok(
    await bulkApproveReviews({
      refs: parsed.data.refs,
      adminId: guard.admin.id,
      ip: guard.ip,
      canSuspend: canWrite(guard.admin.role, 'users.suspend'),
    }),
  );
}
