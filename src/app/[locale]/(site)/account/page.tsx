import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { taxProfileOf } from '@/lib/domain/tax-profile';
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  // بلا جلسة: إلى الدخول لا إلى ٤٠٤ — الصفحة موجودة والزائر ليس داخلًا
  if (user === null) redirect(`/${locale}/auth`);

  const [data, t, search] = await Promise.all([
    getAccountData(user, locale),
    getTranslations('account'),
    searchParams,
  ]);

  /**
   * **إعلانٌ نُشر تُقال بشارته.** معالج البيع يُحوّل إلى هنا بـ
   * `?listed=` ويفرّق بين المنشور والمراجَع — **ولم يكن أحد يقرؤه**.
   * فينتهي البائع من سبع خطوات ورفعِ صور ويصل إلى حسابه بلا كلمة:
   * لا يعرف أنُشر أم سقط.
   */
  const listed = typeof search.listed === 'string' && search.listed !== '' ? search.listed : null;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">
            {t('greeting', { name: data.user.name ?? t('anonymous') })}
          </h1>
          <p className="mb-8 text-sm opacity-60">{t('subtitle')}</p>

          {listed === null ? null : (
            <section
              className={
                listed === 'review'
                  ? 'mb-7 rounded-xl border border-warn-200 bg-warn-100 p-5 text-warn-900'
                  : 'mb-7 rounded-xl border border-accent-200 bg-accent-100 p-5 text-accent-900'
              }
            >
              <p className="text-sm font-bold">
                {listed === 'review' ? 'إعلانك قيد المراجعة' : 'نُشر إعلانك'}
              </p>
              <p className="mt-1.5 text-2xs leading-loose opacity-80">
                {listed === 'review'
                  ? 'يراجعه فريقنا قبل ظهوره في النتائج — ويصلك إشعار حين يُنشر.'
                  : 'صار ظاهرًا في نتائج البحث. وستجد عروضه هنا.'}
              </p>
              {listed === 'review' ? null : (
                <p className="mt-2.5">
                  {/* المرجع يُنسخ ويُقارن — لاتينيّ معزول */}
                  <span dir="ltr" className="font-num text-2xs opacity-70">
                    {listed}
                  </span>
                </p>
              )}
            </section>
          )}

          <AccountScreen data={data} locale={locale} taxProfile={taxProfileOf(user)} />
        </div>
      </main>
    </>
  );
}
