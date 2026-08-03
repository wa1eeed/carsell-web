import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { REPORT_REASONS, fileReport } from '@/lib/domain/offer-inbox';

export const runtime = 'nodejs';

const Body = z.object({
  targetType: z.enum(['listing', 'user']),
  targetId: z.string().min(1).max(40),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
});

/**
 * `POST /api/v1/reports` — بلاغ.
 *
 * **الأسباب قائمة مغلقة**: نصّ حرّ وحده يُنتج طابورًا لا يُفرَز، والفرز
 * هو ما يجعل البلاغات تُعالَج أصلًا. والتفاصيل حرّة **بعد** اختيار سبب.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ reason: 'INVALID' }), 422);

  const result = await fileReport({ ...parsed.data, reporterId: user.id });

  if (!result.ok) {
    if (result.reason === 'TARGET_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    if (result.reason === 'OWN_TARGET') return fail(ERRORS.FORBIDDEN, 403);
    return fail(ERRORS.REPORT_DUPLICATE, 409);
  }

  return ok({ reportId: result.reportId, underReview: result.underReview }, undefined, {
    status: 201,
  });
}
