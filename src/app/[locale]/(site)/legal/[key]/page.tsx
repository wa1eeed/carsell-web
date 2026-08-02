import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { routing } from '@/i18n/routing';
import { getLegalDocument, listLegalDocuments } from '@/lib/domain/content';

export const dynamic = 'force-dynamic';

type Params = { locale: string; key: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, key } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const doc = await getLegalDocument(key);
  if (doc === null) return {};
  return {
    title: locale === 'ar' ? doc.titleAr : doc.titleEn,
    description: (locale === 'ar' ? doc.summaryAr : doc.summaryEn) ?? undefined,
  };
}

/**
 * Wo — المستندات القانونية.
 *
 * **النسخة وتاريخ السريان معروضان دائمًا.** مستخدم قَبِل شروط مارس
 * محكومٌ بنصّها لا بنصّ اليوم، فإخفاء النسخة يجعل المستند يبدو أزليًّا
 * وهو ليس كذلك.
 *
 * والبنود مرقّمة بمراسٍ ثابتة: نصٌّ قانوني يُقتبَس في نزاع، و«البند ٥»
 * يجب أن يكون رابطًا يُرسَل لا موضعًا يُبحث عنه.
 */
export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { locale, key } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [doc, others, t] = await Promise.all([
    getLegalDocument(key),
    listLegalDocuments(),
    getTranslations('legal'),
  ]);

  if (doc === null) notFound();

  const isArabic = locale === 'ar';
  const title = isArabic ? doc.titleAr : doc.titleEn;
  const summary = isArabic ? doc.summaryAr : doc.summaryEn;

  const effective = new Intl.DateTimeFormat(
    isArabic ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' },
  ).format(new Date(doc.effectiveAt));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <header className="mb-9 border-b border-line pb-7">
            <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{title}</h1>
            {summary === null ? null : (
              <p className="mb-4 max-w-2xl text-sm leading-loose opacity-68">{summary}</p>
            )}
            <p className="flex flex-wrap items-center gap-4 text-2xs opacity-55">
              <span className="flex items-center gap-1.5">
                {t('version')}
                <span className="font-num bidi-ltr font-bold">{doc.version}</span>
              </span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="flex items-center gap-1.5">
                {t('effectiveFrom')}
                <span className="bidi-isolate font-bold">{effective}</span>
              </span>
            </p>
          </header>

          <div className="flex flex-col gap-14 lg:flex-row-reverse">
            <nav className="w-full shrink-0 lg:w-64" aria-label={t('contents')}>
              <div className="sticky top-4">
                <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
                  {t('contents')}
                </h2>
                <ol className="flex flex-col gap-2 text-xs">
                  {doc.sections.map((section) => (
                    <li key={section.n}>
                      <a
                        href={`#s-${section.n}`}
                        className="flex gap-2 opacity-70 hover:opacity-100"
                      >
                        <ArabicNumber value={section.n} grouped={false} className="opacity-50" />
                        <span>{isArabic ? section.titleAr : section.titleEn}</span>
                      </a>
                    </li>
                  ))}
                </ol>

                <h2 className="mt-7 mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
                  {t('otherDocuments')}
                </h2>
                <ul className="flex flex-col gap-2 text-xs">
                  {others
                    .filter((other) => other.key !== doc.key)
                    .map((other) => (
                      <li key={other.key}>
                        <Link
                          href={`/${locale}/legal/${other.key}`}
                          className="opacity-70 hover:opacity-100 hover:underline"
                        >
                          {isArabic ? other.titleAr : other.titleEn}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            </nav>

            <article className="min-w-0 flex-1">
              {doc.sections.map((section) => (
                <section key={section.n} id={`s-${section.n}`} className="mb-8 scroll-mt-6">
                  <h2 className="mb-2.5 flex items-baseline gap-2.5 text-lg font-bold">
                    <ArabicNumber value={section.n} grouped={false} className="opacity-45" />
                    <span>{isArabic ? section.titleAr : section.titleEn}</span>
                  </h2>
                  <p className="max-w-3xl text-sm leading-loose opacity-75">
                    {isArabic ? section.bodyAr : section.bodyEn}
                  </p>
                </section>
              ))}
            </article>
          </div>
        </div>
      </main>
    </>
  );
}
