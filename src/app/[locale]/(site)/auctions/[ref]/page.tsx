import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { getAuction, sellerDecisionView } from '@/lib/domain/auctions';
import { canonicalPath, findPublishedListing } from '@/lib/domain/listing-detail';
import { AuctionScreen } from './AuctionScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { title: ref };
}

/**
 * We — شاشة المزاد.
 *
 * **اتصال واحد، والعدّاد محلّي بمزامنة كل ٣٠ ثانية** (معيار القبول):
 * عدّادٌ يعتمد على الشبكة لكل ثانية يتوقّف عند أول انقطاع، وعدّادٌ لا
 * يُزامَن ينحرف. والحقيقة من REST عند الاتصال وعند كل فجوة.
 */
export default async function AuctionPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [auction, listing, viewer, t] = await Promise.all([
    getAuction(ref),
    findPublishedListing(ref),
    // البائع لا يزايد على مركبته — والشاشة تقولها قبل الضغط
    currentUserFromCookies(),
    getTranslations('auctions'),
  ]);

  if (auction === null || listing === null) notFound();

  /**
   * **القرار المعلَّق — للبائع وحده، وبعد أن نعرف من هو.**
   *
   * قراءةٌ ثانية لأنها تعتمد على `viewer`، والشكل العامّ لا يحملها:
   * `sellerDecisionDueAt` يقول متى ينتهي حقٌّ لا يملكه غيره.
   */
  const decision =
    viewer === null ? null : await sellerDecisionView(ref, viewer.id);

  const title = [listing.vehicle.brandName, listing.vehicle.modelName, listing.vehicle.trimName]
    .filter((part) => part !== null && part !== '')
    .join(' ');

  return (
    <>
      <SiteHeader active="auctions" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-2xs opacity-50">
            <Link href={`/${locale}/auctions`} className="hover:underline">
              {t('title')}
            </Link>
            <span aria-hidden>›</span>
            <span className="bidi-isolate font-bold opacity-100">{title}</span>
          </nav>

          <AuctionScreen
            auction={auction}
            vehicle={{ title, year: listing.vehicle.year, city: listing.city }}
            listingPath={canonicalPath(locale, listing).path}
            viewer={{
              signedIn: viewer !== null,
              isOwn: viewer !== null && viewer.id === listing.sellerId,
            }}
            decision={decision}
            locale={locale}
          />
        </div>
      </main>
    </>
  );
}
