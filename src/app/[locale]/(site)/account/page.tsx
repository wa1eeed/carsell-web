import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountScreen } from './AccountScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'account' });
  // صفحة خاصّة — لا تُفهرَس ولا تُتبع روابطها
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Wf — حساب المستخدم.
 *
 * **الحقول الناقصة بارزة** (معيار القبول): البريد والتوثيق والآيبان
 * مطلوبة قبل أول شراء أو بيع لا عند التسجيل، فالتذكير بها يجب أن يسبق
 * لحظة الحاجة — لا أن يظهر كخطأ عند الضغط على «اشترِ».
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  // بلا جلسة: إلى الدخول لا إلى ٤٠٤ — الصفحة موجودة والزائر ليس داخلًا
  if (user === null) redirect(`/${locale}/auth`);

  const [data, t] = await Promise.all([getAccountData(user, locale), getTranslations('account')]);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">
            {t('greeting', { name: data.user.name ?? t('anonymous') })}
          </h1>
          <p className="mb-8 text-sm opacity-60">{t('subtitle')}</p>

          <AccountScreen data={data} locale={locale} />
        </div>
      </main>
    </>
  );
}
