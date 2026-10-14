import { cookies } from 'next/headers';
import { resolveProviderSession } from '@/lib/domain/provider-auth';
import { isDevelopment } from '@/lib/env';
import type { ProviderUser } from '@/generated/prisma/client';

/**
 * كوكي جلسة المزوّد — **منفصل عن كوكي المستخدمين وعن كوكي الأدمن**.
 *
 * و`sameSite=strict` كالأدمن: لوحة المزوّد لا تُقصد من روابط خارجية،
 * فتشديد الشرط يغلق CSRF بلا كلفة تجربة.
 */
export const PROVIDER_COOKIE = 'carsell_provider';

export async function currentProviderUser(): Promise<ProviderUser | null> {
  const store = await cookies();
  const token = store.get(PROVIDER_COOKIE)?.value;
  if (token === undefined || token === '') return null;
  return resolveProviderSession(token);
}

export function providerCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
