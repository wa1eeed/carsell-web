import { cookies } from 'next/headers';
import { resolveAdminSession } from '@/lib/domain/admin-auth';
import { isDevelopment } from '@/lib/env';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * كوكي جلسة الأدمن — **منفصل تمامًا** عن كوكي المستخدمين.
 * `sameSite=strict` لا `lax`: لوحة الأدمن لا تُقصد من روابط خارجية،
 * فتشديد الشرط يغلق CSRF بلا كلفة تجربة.
 */
export const ADMIN_COOKIE = 'carsell_admin';

export async function currentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token === undefined || token === '') return null;
  return resolveAdminSession(token);
}

export function adminCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
