import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { landingContent } from '@/lib/domain/landing';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; city: string; brand: string; model: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, city, brand, model } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const content = await landingContent(city, brand, model);
  if (content === null) return {};

  const t = await getTranslations({ locale, namespace: 'landing' });
  return {
    title: t('titleModel', { model: content.model ?? content.brand, city: content.city }),
    description: t('metaModel', { model: content.model ?? content.brand, city: content.city, count: content.count }),
    // الأصل واحد — والصفحة بوّابةٌ إلى البحث لا نسخةٌ منه
    alternates: { canonical: `/${locale}/browse/${city}/${brand}/${model}` },
  };
}

/**
 * ١٠-ب — صفحة هبوط: مدينة × ماركة.
 *
 * والمقطع الثابت **لاتينيّ عمدًا**: مجلّدٌ باسمٍ عربيّ يُخزَّن على macOS
 * بصيغة NFD ويُقدَّم على Linux بـNFC، فيعمل محلّيًّا ويسقط ٤٠٤ بعد
 * النشر. والكلمات العربية باقية في المقاطع المتغيّرة — المدينة والماركة.
 *
 * **ولا تُولَّد إلا لتركيبةٍ لها إعلانات.** صفحةٌ فارغة أسوأ من غيابها:
 * يصلها الباحث فيخرج، ويتعلّم المحرّك أن الموقع يَعِد بما لا يملك.
 *
 * وهي **بوّابةٌ إلى البحث لا بديلٌ عنه**: الأرقام أعلاه والرابط يذهب
 * إلى نتائج البحث نفسها بمرشّحاتها.
 */
export default async function CityBrandModelLanding({ params }: { params: Params }) {
  const { locale, city, brand, model } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [content, t] = await Promise.all([
    landingContent(city, brand, model),
    getTranslations('landing'),
  ]);
  // نفدت التركيبة ⇒ ٤٠٤ لا صفحةٌ فارغة
  if (content === null) notFound();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">
            {t('titleModel', { model: content.model ?? content.brand, city: content.city })}
          </h1>
          <p className="mb-7 flex flex-wrap items-center gap-2.5 text-sm opacity-65">
            <Quantity unit="cars" count={content.count} />
            {content.inspectedCount === 0 ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex items-center gap-1.5">
                  <ArabicNumber value={content.inspectedCount} />
                  <span>{t('inspected')}</span>
                </span>
              </>
            )}
            {content.priceMin === null || content.priceMax === null ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{t('from')}</span>
                  <Money amount={content.priceMin} />
                  <span>{t('to')}</span>
                  <Money amount={content.priceMax} />
                </span>
              </>
            )}
          </p>

          <Link
            href={`/${locale}/cars?${content.searchQuery}`}
            className="inline-block rounded-full border border-ink px-7 py-3 text-sm font-bold hover:bg-ink hover:text-bg"
          >
            {t('browseModel', { model: content.model ?? content.brand, city: content.city })}
          </Link>

        </div>
      </main>
    </>
  );
}
