import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { ADMIN_SESSION_HOURS, verifyTotpAndIssueSession } from '@/lib/domain/admin-auth';
import { ADMIN_COOKIE, adminCookieOptions } from '@/lib/auth/admin-session';
import { permissionsOf } from '@/lib/domain/permissions';
import { toLatinDigits } from '@/lib/arabic';

export const runtime = 'nodejs';

const Body = z.object({
  adminUserId: z.string().min(1),
  code: z.string().min(1).max(12),
});

/** الخطوة الثانية — النجاح وحده يُصدر الجلسة. */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.ADMIN_INVALID_CODE, 401);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const result = await verifyTotpAndIssueSession(
    parsed.data.adminUserId,
    toLatinDigits(parsed.data.code).trim(),
    ip,
    userAgent,
  );

  if (!result.ok) {
    if (result.reason === 'LOCKED') return fail(ERRORS.ADMIN_LOCKED, 423);
    if (result.reason === 'NOT_ENROLLED') return fail(ERRORS.ADMIN_NOT_ENROLLED, 403);
    return fail(ERRORS.ADMIN_INVALID_CODE, 401);
  }

  const response = ok({
    admin: {
      id: result.admin.id,
      name: result.admin.name,
      email: result.admin.email,
      role: result.admin.role,
    },
    permissions: permissionsOf(result.admin.role),
    mustChangePassword: result.mustChangePassword,
  });

  response.cookies.set(
    ADMIN_COOKIE,
    result.token,
    adminCookieOptions(ADMIN_SESSION_HOURS * 3600),
  );
  return response;
}
