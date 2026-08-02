import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { profileCompletion, toPublicUser } from '@/lib/domain/profile';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/me`
 * المستخدم + الحقول الناقصة قبل المعاملة (القسم ٦).
 */
export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  return ok({
    user: toPublicUser(user),
    completion: profileCompletion(user),
  });
}
