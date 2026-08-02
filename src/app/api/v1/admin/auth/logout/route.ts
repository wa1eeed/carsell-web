import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { revokeAdminSession } from '@/lib/domain/admin-auth';
import { ADMIN_COOKIE, adminCookieOptions } from '@/lib/auth/admin-session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (token !== undefined && token !== '') await revokeAdminSession(token);

  const response = ok({ signedOut: true });
  response.cookies.set(ADMIN_COOKIE, '', adminCookieOptions(0));
  return response;
}
