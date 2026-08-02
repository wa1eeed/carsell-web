'use client';

import { useRouter } from '@/i18n/navigation';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/i18n/routing';
import { usePathname } from '@/i18n/navigation';

/**
 * مبدّل اللغة — **الموضع الوحيد** الذي يُكتب فيه كوكي `NEXT_LOCALE`.
 * الاختيار المعلن يُحفظ ويُقرأ في `/` وحده (انظر `middleware.ts`).
 * لا يُكتب الكوكي من أي تنقّل آخر ولا يُستنتج من ترويسة المتصفح.
 */
export function LocaleSwitcher({
  locale,
  label,
  className,
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function choose() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    router.replace(pathname, { locale });
  }

  return (
    <button type="button" onClick={choose} className={className} lang={locale}>
      {label}
    </button>
  );
}
