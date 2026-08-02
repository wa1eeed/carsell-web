import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Money } from '@/components/ui/Money';
import { Badge } from '@/components/ui/Badge';
import { SectionHead } from '@/components/ui/HomeSections';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { SERVICE_CATEGORIES, listServices } from '@/lib/domain/content';
import { CategoryFilter } from './CategoryFilter';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'services' });
  return { title: t('title'), description: t('intro') };
}

/**
 * Wi — دليل الخدمات.
 *
 * **مجموعة بفئتها لا قائمة واحدة**: «قبل الشراء» و«بعد الشراء»
 * و«للبائعين» ثلاثة أسئلة مختلفة يطرحها ثلاثة أشخاص مختلفين، وخلطها
 * يجبر كلًّا منهم على تخطّي ما لا يعنيه.
 *
 * والمرشِّح يكتب في الرابط كما في Wb — لا حالة عميل.
 */
export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const search = await searchParams;
  const raw = typeof search.category === 'string' ? search.category : undefined;
  const active = SERVICE_CATEGORIES.find((key) => key === raw) ?? null;

  const [services, t, te] = await Promise.all([
    listServices(),
    getTranslations('services'),
    getTranslations('enums'),
  ]);

  const isArabic = locale === 'ar';
  const shown = SERVICE_CATEGORIES.filter((key) => active === null || key === active);

  return (
    <>
      <SiteHeader active="services" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <header className="mb-9 flex flex-wrap items-end gap-12">
            <div className="min-w-72 flex-1">
              <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
              <p className="max-w-xl text-sm leading-loose opacity-68">{t('intro')}</p>
            </div>
            <CategoryFilter active={active} />
          </header>

          {shown.map((category) => {
            const rows = services.filter((service) => service.category === category);
            if (rows.length === 0) return null;

            return (
              <section key={category} className="border-t border-line py-9 first:border-0 first:pt-0">
                <SectionHead title={te(`serviceCategory.${category}`)} />
                <p className="-mt-3 mb-5 text-xs opacity-45">
                  <Quantity unit="services" count={rows.length} />
                </p>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {rows.map((service) => (
                    <article
                      key={service.key}
                      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface"
                    >
                      <span className="washed relative block aspect-16/10">
                        {!service.isAutomated ? null : (
                          <Badge tone="accent" className="absolute top-2.5 start-2.5">
                            {t('instant')}
                          </Badge>
                        )}
                      </span>

                      <div className="flex flex-1 flex-col p-4.5">
                        <h3 className="mb-1.5 text-base font-bold">
                          {isArabic ? service.nameAr : service.nameEn}
                        </h3>
                        <p className="mb-3.5 text-xs leading-relaxed opacity-60">
                          {isArabic ? service.descAr : service.descEn}
                        </p>

                        <div className="mt-auto flex items-end justify-between gap-3">
                          {/* المجاني يُقال صراحةً — صفرٌ في موضع السعر يُقرأ خطأً */}
                          {Number(service.price) === 0 ? (
                            <span className="text-base font-bold text-accent-700">{t('free')}</span>
                          ) : (
                            <Money amount={Number(service.price)} size="md" />
                          )}
                          {service.slaHours === null ? null : (
                            <span className="text-3xs opacity-50">
                              <Quantity unit="hours" count={service.slaHours} />
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
