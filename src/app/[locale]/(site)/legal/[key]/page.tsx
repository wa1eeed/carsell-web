import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { toArabicNumeric } from '@/lib/arabic';
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

  const [doc, others, t, nav, ui] = await Promise.all([
    getLegalDocument(key),
    listLegalDocuments(),
    getTranslations('legal'),
    getTranslations('site.nav'),
    getTranslations('ui'),
  ]);

  if (doc === null) notFound();

  const isArabic = locale === 'ar';
  const title = isArabic ? doc.titleAr : doc.titleEn;
  const summary = isArabic ? doc.summaryAr : doc.summaryEn;

  const date = new Intl.DateTimeFormat(isArabic ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const effective = date.format(new Date(doc.effectiveAt));
  const updated = date.format(new Date(doc.updatedAt));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <header className="mb-9 border-b border-line pb-7">
            {/*
              **ومن وصل من بحثٍ خارجيّ لا يعرف أين هو.** المستند
              القانونيّ أكثر ما يُفتح برابطٍ مباشر، وبلا مسارٍ فوقه
              يخرج الزائر بالرجوع لا بالصعود.

              و«القانوني» بلا `href`: لا فهرس له في المنتج، ورابطٌ
              يردّ ٤٠٤ أسوأ من نصٍّ لا يُنقر.
            */}
            <Breadcrumb
              label={ui('breadcrumb')}
              className="mb-3"
              items={[
                { label: nav('home'), href: `/${locale}` },
                { label: t('section') },
                { label: title },
              ]}
            />

            <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{title}</h1>
            {summary === null ? null : (
              <p className="mb-4 max-w-2xl text-sm leading-loose opacity-68">{summary}</p>
            )}
            <p className="flex flex-wrap items-center gap-4 text-2xs opacity-55">
              <span className="flex items-center gap-1.5">
                {t('version')}
                {/*
                  **ورقم النسخة رقمٌ كغيره.** كان يُطبع «1.1» لاتينيًّا
                  بين «النسخة» و«سارية من ١١ أكتوبر» — فسطرٌ واحد
                  بأبجديّتين، والتصميم يكتب «النسخة ٣٫١». ولوحة الأدمن
                  كانت تحوّله أصلًا، فالشاشتان تقولان الشيء نفسه بخطّين.
                */}
                <span className="font-num bidi-ltr font-bold">
                  {isArabic ? toArabicNumeric(doc.version) : doc.version}
                </span>
              </span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="flex items-center gap-1.5">
                {t('effectiveFrom')}
                <span className="bidi-isolate font-bold">{effective}</span>
              </span>
              {/*
                **ولا يُعرض آخر تحديث إن وافق السريان.** سطران
                بالتاريخ نفسه يُقرآن على أنهما خطأ عرضٍ لا حقيقتان،
                ويُشغلان موضعًا بلا معلومة.
              */}
              {updated === effective ? null : (
                <>
                  <span aria-hidden className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5">
                    {t('lastUpdated')}
                    <span className="bidi-isolate font-bold">{updated}</span>
                  </span>
                </>
              )}
            </p>
          </header>

          <div className="flex flex-col gap-14 lg:flex-row-reverse">
            <nav className="w-full shrink-0 lg:w-64" aria-label={t('documents')}>
              <div className="sticky top-4">
                {/*
                  ═══ والمستندات تسبق البنود ═══

                  من يقرأ الشروط يسأل عن الضمان وعن العمولة، لا عن
                  البند السابع. والتصميم يضع «الصفحات القانونية» أوّلًا
                  لهذا — وكان المبنيّ يضعها آخرًا ويحذف منها المستند
                  المفتوح، فلا يعرف القارئ أين هو من الثمانية.
                */}
                <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
                  {t('documents')}
                </h2>
                <ul className="mb-7 flex flex-col gap-2 text-xs">
                  {others.map((other) => {
                    const current = other.key === doc.key;

                    return (
                      <li key={other.key}>
                        {/*
                          **والمفتوح نصٌّ لا رابط.** رابطٌ إلى الصفحة
                          التي أنت فيها يُقرأ وجهةً، ويُعلنه قارئ
                          الشاشة رابطًا — فيُميَّز بالثقل و`aria-current`.
                        */}
                        {current ? (
                          <span aria-current="page" className="flex items-center gap-2 font-bold">
                            <span aria-hidden className="h-3.5 w-0.5 shrink-0 bg-ink" />
                            {isArabic ? other.titleAr : other.titleEn}
                          </span>
                        ) : (
                          <Link
                            href={`/${locale}/legal/${other.key}`}
                            className="flex items-center gap-2 opacity-70 hover:opacity-100 hover:underline"
                          >
                            <span aria-hidden className="h-3.5 w-0.5 shrink-0" />
                            {isArabic ? other.titleAr : other.titleEn}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
                  {t('contents')}
                </h2>
                <ol className="flex flex-col gap-2 text-xs">
                  {doc.sections.map((section) => (
                    <li key={section.n}>
                      <a
                        href={`#s-${String(section.n)}`}
                        className="flex gap-2 opacity-70 hover:opacity-100"
                      >
                        <ArabicNumber value={section.n} grouped={false} className="opacity-50" />
                        <span>{isArabic ? section.titleAr : section.titleEn}</span>
                      </a>
                    </li>
                  ))}
                </ol>
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
