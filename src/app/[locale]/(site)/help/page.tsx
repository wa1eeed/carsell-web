import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { SectionHead } from '@/components/ui/HomeSections';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { helpCategories, helpFaqs } from '@/lib/domain/content';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'help' });
  return { title: t('title'), description: t('intro') };
}

/**
 * Wn — مركز المساعدة.
 *
 * **العدّادات محسوبة**: «٨ مقالة» تحت موضوع يجب أن تصير تسعًا حين يضيف
 * المحرّر التاسعة، وإلا صار العدّ كذبًا مطبوعًا. والمواضيع تُشتقّ من
 * الأسئلة الموجودة، فموضوعٌ أُفرغ يختفي ولا ينتظر من يحذفه.
 */
export default async function HelpPage({
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
  const topic = typeof search.topic === 'string' ? search.topic : undefined;
  const query = typeof search.q === 'string' && search.q.trim() !== '' ? search.q.trim() : undefined;

  const [categories, faqs, t, te] = await Promise.all([
    helpCategories(),
    // البحث يوسّع الحدّ: من يبحث يريد كل ما يطابق لا أوّل ثمانية
    helpFaqs(topic, query === undefined && topic === undefined ? 8 : 30, query),
    getTranslations('help'),
    getTranslations('enums'),
  ]);

  const isArabic = locale === 'ar';
  const known = categories.some((category) => category.key === topic);
  const label = (key: string): string => {
    const translated = te.has(`helpTopic.${key}`) ? te(`helpTopic.${key}`) : key;
    return translated;
  };

  return (
    <>
      <SiteHeader active="services" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <header className="mb-9">
            <h1 className="mb-2.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mb-6 max-w-2xl text-sm leading-loose opacity-68">{t('intro')}</p>

            {/*
              ═══ ابحث عن سؤالك ═══

              **ومن يفتح مركز المساعدة يبحث لا يتصفّح.** تصفّحٌ بالمواضيع
              يفترض أنه يعرف تحت أيٍّ منها سؤاله، وهو لا يعرف — يكتب
              «عربون» ويريد الجواب أيًّا كان بابه.

              **والبحث في السؤال والجواب معًا**: صياغةُ المحرّر ليست
              صياغةَ السائل، والبحث في العنوان وحده يردّ «لا نتائج»
              على سؤالٍ مُجاب.

              ونموذجٌ لا حالةُ عميل: الرابط يُشارَك، ويعمل بلا JS.
            */}
            <form method="get" action={`/${locale}/help`} className="flex flex-wrap gap-2.5">
              {topic === undefined ? null : <input type="hidden" name="topic" value={topic} />}
              <label className="relative flex min-w-56 flex-1 items-center">
                <span className="pointer-events-none absolute start-3.5 opacity-40">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <input
                  type="search"
                  name="q"
                  defaultValue={query ?? ''}
                  placeholder="ابحث عن سؤالك…"
                  className="w-full rounded-full border border-line bg-surface py-3 pe-5 ps-11 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-full border border-ink px-6 py-3 text-sm font-bold hover:bg-ink hover:text-bg"
              >
                ابحث
              </button>
            </form>
          </header>

          <section className="mb-10">
            <SectionHead
              title={t('browseByTopic')}
              {...(topic === undefined ? {} : { action: t('allTopics'), href: `/${locale}/help` })}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => (
                <Link
                  key={category.key}
                  href={`/${locale}/help?topic=${category.key}`}
                  className={
                    category.key === topic
                      ? 'rounded-xl border border-accent bg-accent-100 p-5'
                      : 'rounded-xl border border-line bg-surface p-5 hover:border-ink/25'
                  }
                >
                  <span className="mb-1 block text-sm font-bold">{label(category.key)}</span>
                  <span className="block text-2xs opacity-50">
                    <Quantity unit="articles" count={category.count} />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-14 lg:flex-row">
            <section className="min-w-0 flex-[1.5]">
              <SectionHead title={topic === undefined ? t('mostAsked') : label(topic)} />
              {faqs.length === 0 ? (
                <EmptyState title={t('emptyTopic')} description={t('intro')} />
              ) : (
                <FaqAccordion
                  rows={faqs.map((faq) => ({
                    id: faq.id,
                    question: isArabic ? faq.questionAr : faq.questionEn,
                    answer: isArabic ? faq.answerAr : faq.answerEn,
                  }))}
                />
              )}
              {/* موضوع في الرابط لا نعرفه: لا نصمت ولا نُخطئ — نقول ونعرض الكل */}
              {topic !== undefined && !known ? (
                <p className="mt-4 text-xs opacity-55">{t('emptyTopic')}</p>
              ) : null}
            </section>

            <aside className="w-full shrink-0 lg:w-80">
              <div className="rounded-xl border border-line bg-surface p-6">
                <h2 className="mb-2 text-base font-bold">{t('notFound')}</h2>
                <p className="mb-4 text-xs leading-loose opacity-65">{t('notFoundBody')}</p>
                <Link
                  href={`/${locale}/help/contact`}
                  className="inline-flex rounded-md bg-accent px-5 py-2.5 text-xs font-bold text-bg"
                >
                  {t('contact')}
                </Link>
              </div>

              {/*
                ═══ ومن له نزاع لا يريد نموذج تواصل ═══

                التصميم يفرد للنزاعات كتلةً — **وهو محقّ**: من دفع
                ووجد المركبة تخالف وصفها يحتاج الباب الذي يجمّد ماله،
                لا بريدًا يُردّ عليه خلال يوم عمل.

                **والوجهة طلباتُه لا صفحةٌ تشرح.** النزاع يُفتح من
                صفحة الطلب نفسها، فالرابط يقود إليها.

                ولا تُذكر «محادثة مباشرة» ولا «تذكرة دعم» ممّا يرسمه
                التصميم: لا وجود لهما في المنتج، وقناةٌ تُعلَن ولا تردّ
                أسوأ من قناةٍ لا تُعلَن.
              */}
              <div className="mt-4 rounded-xl border border-line bg-surface p-6">
                <h2 className="mb-2 text-base font-bold">{t('disputesTitle')}</h2>
                <p className="mb-4 text-xs leading-loose opacity-65">{t('disputesBody')}</p>
                <Link
                  href={`/${locale}/account/orders`}
                  className="inline-flex rounded-md border border-line px-5 py-2.5 text-xs font-bold hover:border-ink"
                >
                  {t('disputesCta')}
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
