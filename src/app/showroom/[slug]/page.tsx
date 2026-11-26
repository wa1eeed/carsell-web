import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CarCard } from '@/components/ui/CarCard';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Quantity } from '@/components/ui/Quantity';
import { getDealerPage } from '@/lib/domain/dealer-page';
import { publicSite } from '@/lib/domain/dealer-site';
import { getTranslations } from 'next-intl/server';
import { badgeLabel } from '@/lib/catalog/badges';
import { SITE_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await publicSite(decodeURIComponent(slug));
  if (found === null) return { title: 'غير موجود', robots: { index: false, follow: false } };

  const dealer = await getDealerPage(found.dealerSlug, 'ar');
  if (dealer === null) return { title: 'غير موجود', robots: { index: false, follow: false } };

  return {
    title: `${dealer.name} — معرض سيارات`,
    description: found.site.tagline ?? `سيارات ${dealer.name} في ${dealer.city}`,
    /** **وموقعُه يُفهرَس** — هو موقعُه الرسميّ، لا نسخةٌ من صفحةٍ عندنا. */
    alternates: { canonical: `${SITE_URL}/showroom/${found.site.slug}` },
  };
}

/**
 * ═══ `D16` — موقعُ المعرض ═══
 *
 * **وسياراتُه وحدها.** لا «سيارات مشابهة» ولا شريطُ بحثٍ في السوق: من
 * فتح موقعَ معرضٍ جاء له، وأخذُه إلى غيره خيانةُ الوعد الذي بُني الموقعُ
 * عليه.
 *
 * **والسيارةُ تُفتح في كارز**: الضمانُ والعقدُ ونقلُ الملكية كلُّها
 * هناك، وصفحةُ شراءٍ ثانيةٌ هنا تعني مسارَي شراءٍ يتباعدان — وهو الصنف
 * الذي كلّف هذا المستودع مرارًا. فالموقعُ واجهةٌ تعرض، والشراءُ من
 * مكانه الواحد.
 */
export default async function ShowroomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await publicSite(decodeURIComponent(slug));
  if (found === null) notFound();

  const [dealer, te] = await Promise.all([
    getDealerPage(found.dealerSlug, 'ar'),
    getTranslations({ locale: 'ar', namespace: 'enums' }),
  ]);
  if (dealer === null) notFound();

  /**
   * **ولونُ المعرض بياناتُه، والافتراضيُّ توكنُنا.** هو يختار سادسَ
   * عشريٍّ لهويّته — وما لم يختر يُقرأ لونُ كارز من `globals.css` لا
   * يُكتب رقمًا هنا، فيتبعُ التبديلَ ولا يتجمّد.
   */
  const accent = found.site.accent ?? 'var(--color-accent)';

  return (
    <main className="min-h-screen bg-bg text-ink">
      {/*
        **والخلفيةُ من لونه بشفافية** — و`color-mix` تقبل التوكن
        والسادسَ عشريّ معًا، فلا يُفرَّق بين من اختار ومن لم يختر.
      */}
      <header
        className="border-b border-line"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 7%, transparent)` }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-5 px-5 py-9">
          {dealer.logoUrl === null ? null : (
            <Image
              src={dealer.logoUrl}
              alt={dealer.name}
              width={72}
              height={72}
              className="rounded-xl border border-line bg-bg object-contain p-1.5"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{dealer.name}</h1>
            <p className="mt-1.5 text-2xs leading-loose opacity-75">
              {found.site.tagline ?? `معرض سيارات في ${dealer.city}`}
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-3 text-3xs opacity-70">
              {/*
                **والصفةُ تتبع العدد** — «سيارتان معروضة» خطأٌ يراه كلُّ
                زائر: المثنّى يطلب «معروضتان». و«للبيع» لا تتصرّف، فتصحّ
                مع الستّ كلِّها. (وهي قاعدةُ «العددُ يحكم المعدود ولو كان
                في عنصرٍ شقيق» المسجَّلة.)
              */}
              <span>
                <Quantity unit="cars" count={dealer.listingCount} /> للبيع
              </span>
              {dealer.verified ? <span style={{ color: accent }}>تاجر موثق في كارز</span> : null}
              {dealer.phone === null ? null : (
                <span dir="ltr" className="font-num">
                  {dealer.phone}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-9">
        {dealer.listings.length === 0 ? (
          /*
            **والفراغُ يقول سببَه** — «لا سيارات» وحدها تجعل الزائرَ يحسب
            الموقعَ معطّلًا، و«تُضاف قريبًا» تقول إنّ الموقعَ يعمل.
          */
          <p className="rounded-lg border border-line bg-surface px-5 py-8 text-center text-2xs leading-loose opacity-75">
            لا سيارة معروضة الآن — وتضاف هنا فور عرضها.
          </p>
        ) : (
          <>
            <h2 className="mb-5 text-sm font-bold">
              سياراتنا المعروضة
              <span className="ms-2 text-3xs font-normal opacity-65">
                <ArabicNumber value={dealer.listings.length} />
              </span>
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dealer.listings.map((listing) => (
                /*
                  **والسيارةُ تُفتح في كارز**: الضمانُ والعقدُ ونقلُ
                  الملكية هناك، وصفحةُ شراءٍ ثانيةٌ هنا تعني مسارَي شراءٍ
                  يتباعدان.
                */
                <Link key={listing.ref} href={`${SITE_URL}${listing.href}`}>
                  <CarCard
                    data={{
                      ref: listing.ref,
                      title: listing.title,
                      year: listing.year,
                      city: listing.city,
                      mileageKm: listing.mileageKm,
                      transmissionLabel: te(`transmission.${listing.transmission}`),
                      price: Number(listing.price),
                      type: listing.type,
                      inspected: listing.inspected,
                      imageCount: listing.imageCount,
                      sellerName: listing.sellerName ?? dealer.name,
                      sellerVerified: listing.sellerVerified,
                      isOwn: false,
                      badges: listing.badges.map((badge) => badgeLabel(badge, 'ar')),
                      ...(listing.bidderCount === null ? {} : { bidderCount: listing.bidderCount }),
                      ...(listing.endsAt === null ? {} : { endsAt: listing.endsAt }),
                    }}
                  />
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-3xs opacity-70">
          <span>
            {dealer.name}
            {dealer.address === null ? '' : ` · ${dealer.address}`}
          </span>
          {/*
            **والشراءُ في كارز يُقال لا يُخفى**: الزائرُ يحتاج أن يعرف أين
            يقع البيعُ وبأيّ ضمان — وموقعٌ يصمت عن ذلك يبدو واجهةً بلا ظهر.
          */}
          <span>
            البيع والضمان ونقل الملكية عبر{' '}
            <Link href={`${SITE_URL}/ar/dealers/${dealer.slug}`} className="underline">
              كارز
            </Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
