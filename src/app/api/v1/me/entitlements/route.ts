import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { resolveEntitlements } from '@/lib/domain/entitlements';

export const runtime = 'nodejs';

/**
 * `GET /api/v1/me/entitlements`
 * الواجهة تعرض أو تخفي خيارات البيع بناءً على هذه — لا شروط مكتوبة
 * في الواجهة ولا سؤال عن الدور أو اسم الباقة (HANDOFF §١٤).
 */
export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  return ok(await resolveEntitlements(user.id));
}
