import { cookies } from 'next/headers';
import { resolveDealerSession, type DealerActor } from '@/lib/domain/dealer-auth';
import { isDevelopment } from '@/lib/env';

/**
 * كوكي لوحة المعرض — **ثالثٌ لا ثاني**.
 *
 * `carsell_session` للمتجر، و`carsell_admin` لفريق المنصّة، وهذا
 * للوحة المعرض. و`path: '/dealer'` يحصره بها: كوكي لا يُرسَل مع كل
 * طلبِ صفحةٍ عامّة أضيقُ سطحًا، **وجهازٌ يُترك مفتوحًا في صالة العرض
 * لا يكشف محفظة صاحبه**.
 *
 * و`sameSite=strict` كالأدمن: اللوحةُ لا تُقصد من روابط خارجية.
 */
export const DEALER_COOKIE = 'carsell_dealer';

export async function currentDealer(): Promise<DealerActor | null> {
  const store = await cookies();
  const token = store.get(DEALER_COOKIE)?.value;
  if (token === undefined || token === '') return null;
  return resolveDealerSession(token);
}

export function dealerCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: 'strict' as const,
    path: '/dealer',
    maxAge: maxAgeSeconds,
  };
}
