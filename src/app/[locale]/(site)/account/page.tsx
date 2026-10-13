import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { AccountBrief } from '@/components/site/AccountBrief';
import { AccountSections } from '@/components/site/AccountSections';
import { garageCounts, myVehicles } from '@/lib/domain/garage';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { taxProfileOf } from '@/lib/domain/tax-profile';
import { freshCount } from '@/lib/domain/saved-search';
import { db } from '@/lib/db';
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

  /**
   * عدّادات الأقسام — **وما يُعرض يُحسب، وما لا يُعرض لا يُستعلم**.
   * والعروض المنتظِرة وحدها لا كلّها: عددٌ يستدعي فعلًا، لا أرشيف.
   */
  const waitingOffers = data.offers.filter(
    (offer) => offer.status === 'PENDING' || offer.status === 'COUNTERED',
  ).length;
  const [fresh, favorites, vehicles] = await Promise.all([
    freshCount(user.id),
    db.favorite.count({ where: { userId: user.id } }),
    myVehicles(user.id, locale),
  ]);
  const garage = garageCounts(vehicles);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">
            {t('greeting', { name: data.user.name ?? t('anonymous') })}
          </h1>
          <p className="mb-4 text-sm opacity-60">{t('subtitle')}</p>

          {/* خلاصةٌ تُنهي بفعل — والجملة العامّة لا تقول ما ينتظره */}
          <AccountBrief data={data} locale={locale} />

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

          <AccountScreen
            data={data}
            locale={locale}
            taxProfile={taxProfileOf(user)}
            garage={garage}
          />

          <AccountSections
            locale={locale}
            sections={[
              {
                /*
                  **وسياراتي أوّلًا** — كما يرسمها التصميم (الشريط
                  الجانبيّ يبدأ بـ«سياراتي ٣»). وهي الكيان الذي يملكه
                  صاحب الحساب، والإعلان حالةٌ من حالاته لا العكس.
                */
                key: 'vehicles',
                label: 'سياراتي',
                hint: garage.garage > 0 ? 'منها ما في المرآب' : 'ما تملكه من مركبات',
                count: garage.total,
              },
              { key: 'listings', label: 'إعلاناتي', hint: 'ما عرضتَه للبيع', count: data.listings.length },
              { key: 'orders', label: 'طلباتي', hint: 'ما اشتريتَه وما في الطريق', count: data.orders.length },
              {
                key: 'offers',
                label: 'العروض',
                hint: 'ما عُرض عليك وما عرضتَه',
                count: waitingOffers,
                urgent: waitingOffers > 0,
              },
              {
                key: 'searches',
                label: 'بحوثي المحفوظة',
                hint: fresh > 0 ? 'فيها جديد يطابق بحثك' : 'نخبرك بما يُنشر مطابقًا',
                count: fresh,
                urgent: fresh > 0,
              },
              { key: 'favorites', label: 'المفضّلة', hint: 'ما حفظتَه للرجوع إليه', count: favorites },
              { key: 'reports', label: 'تقارير الفحص', hint: 'فحوص مركباتك', count: data.reports.length },
              { key: 'earnings', label: 'مستحقّاتي', hint: 'ما لك من كل صفقة' },
              { key: 'wallet', label: 'المحفظة', hint: 'رصيدك وكشفه' },
              { key: 'profile', label: 'بياناتي', hint: 'البريد والهوية والآيبان' },
            ]}
          />
        </div>
      </main>
    </>
  );
}
