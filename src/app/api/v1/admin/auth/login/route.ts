import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { ADMIN_SESSION_HOURS, loginWithPassword } from '@/lib/domain/admin-auth';
import { ADMIN_COOKIE, adminCookieOptions } from '@/lib/auth/admin-session';
import { permissionsOf } from '@/lib/domain/permissions';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/**
 * `POST /api/v1/admin/auth/login` — **خطوة واحدة تُصدر الجلسة**.
 *
 * كانت خطوتين: بريدٌ وكلمة، ثم رمز TOTP إلزاميّ لكل الأدوار. أُلغيت
 * الثانية بقرار المصمّم، فالكلمة الصحيحة تدخل مباشرةً.
 *
 * والحارس الباقي هو القفل في `loginWithPassword`: خمس محاولات فاشلة
 * ⇒ ربع ساعة، والعدّاد على الحساب لا على الاتصال.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.ADMIN_INVALID_CREDENTIALS, 401);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const result = await loginWithPassword(parsed.data.email, parsed.data.password, ip, userAgent);

  if (!result.ok) {
    if (result.reason === 'LOCKED') return fail(ERRORS.ADMIN_LOCKED, 423);
    if (result.reason === 'INACTIVE') return fail(ERRORS.ADMIN_INACTIVE, 403);
    return fail(ERRORS.ADMIN_INVALID_CREDENTIALS, 401);
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
