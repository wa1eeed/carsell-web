import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DealerMark } from '@/components/site/DealerMark';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { FilterChip } from '@/components/ui/FilterChip';
import { LinkButton } from '@/components/ui/Button';
import { displayDigits } from '@/lib/arabic';
import { EmptyState } from '@/components/ui/EmptyState';
import { routing } from '@/i18n/routing';
import { listPublicDealers } from '@/lib/domain/dealer-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'dealer' });
  return {
    title: t('indexTitle'),
    description: t('indexSubtitle'),
    alternates: { canonical: `/${locale}/dealers` },
  };
}

/** فهرس المعارض — الموثّق أوّلًا، فالثقة ترتيبٌ لا شارةٌ وحدها. */
export default async function DealersPage({
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
  const city = typeof search.city === 'string' && search.city !== '' ? search.city : null;
  const sort = search.sort === 'rating' || search.sort === 'listings' ? search.sort : null;

  const [dealers, all, t] = await Promise.all([
    listPublicDealers(locale, { city, sort }),
    /**
     * **وعدّاد المدينة من الكلّ لا من المعروض.** عدٌّ من المرشَّح
     * يجعل كل شريحةٍ تقول عددَ نفسها ويُخفي البقيّة — فيظنّ الزائر
     * أن لا معارض في جدّة لأنه يقف على الرياض.
     */
    listPublicDealers(locale),
    getTranslations('dealer'),
  ]);

  const cities = [...new Set(all.map((dealer) => dealer.city))].sort((a, b) =>
    a.localeCompare(b, 'ar'),
  );

  /** **الموثَّق وحده يُعدّ** — الجملة تعدّ ما تضمنه الشارة لا كل صفّ. */
  const verifiedCount = all.filter((dealer) => dealer.verified).length;

  return (
    <>
      {/*
        **والمؤشّر يقول أين أنت.** كان يُضيء «الرئيسية» وزائرُه في
        المعارض — إشارةُ موضعٍ كاذبة في كل زيارة.
      */}
      <SiteHeader active="dealers" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">{t('indexTitle')}</h1>
          {/*
            ═══ العدّ ومعنى الشارة ═══

            كان النصّ «معارض السيارات على المنصّة» — جملةٌ لا تقول
            شيئًا. والتصميم يجعله **عدًّا ومعنى**: كم معرضًا موثّقًا
            وفي كم مدينة، ثمّ ما الذي تضمنه الشارة الخضراء. وهي
            آليّةُ الثقة في الصفحة كلّها: زائرٌ يرى شارةً ولا يعرف ما
            وراءها لا يبني عليها قرارًا.

            **ولا يُوعَد بما لا يُفحَص**: التصميم يكتب «سجلًّا تجاريًّا
            متحقَّقًا منه **وآيبان باسم المنشأة**»، و`approveDealer`
            تشترط `crNumber` وحده — ولا تمسّ آيبانًا. فكُتب المفحوص
            وحده، والسؤال في DESIGN-DECISIONS.
          */}
          <p className="mb-7 max-w-2xl text-sm leading-loose opacity-60">
            {/*
              **وما يوافق العددَ يدخل داخل صيغة الجمع.** أوّل صياغةٍ
              وضعت الصفة والجارّ خارج `<Quantity>` فخرج «٣ معارض
              **موثّقًا** في **مدينتان**» — صفةٌ لا توافق معدودها،
              ومثنّى مرفوعٌ بعد حرف جرّ. والصيغتان الآن تحملان الصفة
              والجارّ معًا. (البوابة ٣١.)
            */}
            {t('indexVerified', {
              count: verifiedCount,
              n: displayDigits(String(verifiedCount)),
            })}{' '}
            {t('indexCities', { count: cities.length, n: displayDigits(String(cities.length)) })}
            {' · '}
            {t('indexBadgeMeaning')}
          </p>

          {/*
            ═══ شريط المدن والترتيب ═══

            **والترتيب يُطلب لا يُفرَض**: «الأعلى تقييمًا» يريده من
            يوازن، و«الأكثر مخزونًا» يريده من يتصفّح. والافتراض
            «الموثَّق أوّلًا» لأنه ما تَعِد به المنصّة.
          */}
          <nav className="mb-4 flex flex-wrap items-center gap-2.5">
            <FilterChip href={`/${locale}/dealers`} active={city === null}>
              كل المدن
            </FilterChip>
            {cities.map((name) => (
              <FilterChip
                key={name}
                href={`/${locale}/dealers?city=${encodeURIComponent(name)}`}
                active={city === name}
                count={all.filter((dealer) => dealer.city === name).length}
              >
                {name}
              </FilterChip>
            ))}
          </nav>

          <nav className="mb-7 flex flex-wrap items-center gap-2.5">
            <FilterChip
              href={`/${locale}/dealers${city === null ? '' : `?city=${encodeURIComponent(city)}`}`}
              active={sort === null}
            >
              الموثّقة أوّلًا
            </FilterChip>
            <FilterChip
              href={`/${locale}/dealers?sort=rating${city === null ? '' : `&city=${encodeURIComponent(city)}`}`}
              active={sort === 'rating'}
            >
              الأعلى تقييمًا
            </FilterChip>
            <FilterChip
              href={`/${locale}/dealers?sort=listings${city === null ? '' : `&city=${encodeURIComponent(city)}`}`}
              active={sort === 'listings'}
            >
              الأكثر مخزونًا
            </FilterChip>
          </nav>

          {dealers.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dealers.map((dealer) => (
                <li key={dealer.slug}>
                  <Link
                    href={`/${locale}/dealers/${dealer.slug}`}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 hover:border-ink"
                  >
                    <span className="flex items-center gap-3">
                      {/*
                        **والشعار يُقرأ قبل الاسم.** وحين يغيب يُرسَم
                        حرفُ الاسم الأوّل لا فراغٌ — فالشبكة تبقى
                        منتظمة، ويبقى للبطاقة مرساةٌ بصرية.
                      */}
                      <DealerMark name={dealer.name} logoUrl={dealer.logoUrl} />
                      <span className="flex min-w-0 flex-wrap items-center gap-2 font-bold">
                        <span className="bidi-isolate truncate">{dealer.name}</span>
                        {!dealer.verified ? null : <Badge tone="accent">{t('verified')}</Badge>}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                      {/* المدينة وحدها تُضيّع من يبحث قربه — فالعنوان معها */}
                      <span className="bidi-isolate">
                        {dealer.address === null ? dealer.city : `${dealer.city} · ${dealer.address}`}
                      </span>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="flex items-center gap-1.5">
                        <ArabicNumber value={dealer.listingCount} />
                        <span>{t('listed')}</span>
                      </span>
                      {/*
                        **والتقييم بعدده.** «٤٫٧» وحدها لا تقول شيئًا
                        حتى يُعرف أعن تقييمين هي أم عن مئة.
                      */}
                      {dealer.rating === null || dealer.ratingCount === 0 ? null : (
                        <>
                          <span aria-hidden className="opacity-40">·</span>
                          <span className="flex items-center gap-1">
                            <span aria-hidden>★</span>
                            <span dir="ltr" className="font-num">
                              {displayDigits(Number(dealer.rating).toFixed(1))}
                            </span>
                            <span className="opacity-70">
                              (<ArabicNumber value={dealer.ratingCount} />)
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/*
            **ودعوةُ التسجيل في آخر الفهرس.** صاحب المعرض يصل إلى هنا
            ليرى منافسيه — وهي اللحظة التي يقرّر فيها، فلا تُترك بلا
            باب.
          */}
          <section className="mt-10 rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-2 text-base font-bold">عندك معرض؟</h2>
            <p className="mb-4 max-w-2xl text-2xs leading-loose opacity-70">
              سجّل معرضك بسجلّك التجاريّ، وارفع مخزونك دفعةً واحدة، وأدِر عروضك من لوحةٍ
              مخصّصة — بعمولة صفر.
            </p>
            <LinkButton href={`/${locale}/help/contact`}>سجّل معرضك</LinkButton>
          </section>
        </div>
      </main>
    </>
  );
}
