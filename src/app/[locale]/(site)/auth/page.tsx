import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { AuthForm } from './AuthForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth' });
  // صفحة دخول لا تُفهرَس — لا محتوى فيها لباحث
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Wm — الدخول.
 *
 * **الدخول والتسجيل خطوة واحدة**: أول تحقّق ناجح لرقم جديد يُنشئ الحساب.
 * وهذا ليس اختصارًا بل شرط أمني — شاشتان منفصلتان تعنيان أن الشاشة
 * تُخبر الزائر أيّهما يخصّه، أي تُسرّب وجود الحساب من عدمه.
 */
export default async function AuthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('auth');
  const promises = [1, 2, 3].map((i) => t(`promise.${i}`));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto flex w-full max-w-page flex-col lg:flex-row">
          {/* اليسار: لماذا carsell.one — سطح داكن */}
          <aside className="flex flex-col justify-center gap-7 bg-ink p-12 text-bg lg:w-[420px]">
            <p className="text-2xs font-bold tracking-[0.16em] opacity-45">{t('eyebrow')}</p>
            <h2 className="text-3xl leading-tight font-bold">{t('promiseTitle')}</h2>
            <ul className="flex flex-col gap-3.5">
              {promises.map((promise) => (
                <li key={promise} className="flex items-center gap-3">
                  <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-accent-400/18">
                    <svg viewBox="0 0 24 24" className="size-3 text-accent-400" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-sm opacity-85">{promise}</span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 border-s border-line p-12">
            <AuthForm locale={locale} />
          </div>
        </div>
      </main>
    </>
  );
}
