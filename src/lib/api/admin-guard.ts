import type { NextRequest } from 'next/server';
import { ERRORS, fail } from './response';
import { resolveAdminSession } from '@/lib/domain/admin-auth';
import { ADMIN_COOKIE } from '@/lib/auth/admin-session';
import { canWrite, type Permission } from '@/lib/domain/permissions';
import type { AdminUser } from '@/generated/prisma/client';
import type { NextResponse } from 'next/server';

/**
 * حارس مسارات الأدمن.
 *
 * **الصلاحية تُفحص في الخادم** — إخفاء زرّ في الواجهة تجربةُ مستخدم لا
 * حماية، ومن يعرف المسار يستدعيه مباشرةً.
 */
export type Guarded =
  | { ok: true; admin: AdminUser; ip: string | null }
  | { ok: false; response: NextResponse };

export async function requireAdmin(
  request: NextRequest,
  permission: Permission,
): Promise<Guarded> {
  const token = request.cookies.get(ADMIN_COOKIE)?.value ?? '';
  const admin = await resolveAdminSession(token);

  if (admin === null) return { ok: false, response: fail(ERRORS.UNAUTHORIZED, 401) };
  if (!canWrite(admin.role, permission)) {
    return { ok: false, response: fail(ERRORS.FORBIDDEN, 403) };
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  return { ok: true, admin, ip };
}
