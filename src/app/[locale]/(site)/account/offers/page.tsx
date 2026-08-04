import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { OfferActions } from '@/components/site/OfferActions';
import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { getOfferInbox, type InboxOffer, type InboxTab } from '@/lib/domain/offer-inbox';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'inbox' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

const TABS: readonly InboxTab[] = ['active', 'sent', 'closed'];

/**
 * Wl — صندوق العروض.
 *
 * **لا عرض مرفوض في «نشطة»** (معيار القبول). و«نشط» يجمع شرطين: حالة
 * مخزَّنة نشطة **ومهلة لم تنتهِ**. الاكتفاء بالحالة يُدخل عرضًا فات
 * وقته بين مرور الوظيفة الدورية ومرورها التالي، فينتظر المشتري ردًّا
 * لن يأتي.
 */
export default async function OffersInboxPage({
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
  if (user === null) redirect(`/${locale}/auth`);

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : undefined;
  const tab = TABS.find((key) => key === raw) ?? 'active';

  const [inbox, t, te] = await Promise.all([
    getOfferInbox(user.id, locale),
    getTranslations('inbox'),
    getTranslations('enums'),
  ]);

  const rows = inbox[tab];

  const Row = ({ offer }: { offer: InboxOffer }) => (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5">
      <span className="washed size-16 shrink-0 rounded-lg" />

      <span className="min-w-40 flex-1">
        <Link
          href={offer.listing.path}
          className="flex flex-wrap items-baseline gap-1.5 font-bold hover:underline"
        >
          <span className="bidi-isolate">{offer.listing.title}</span>
          <ArabicNumber value={offer.listing.year} grouped={false} />
        </Link>
        <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
          <span className="font-num">{offer.listing.ref}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="bidi-isolate">{offer.listing.city}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span>{t(offer.role === 'seller' ? 'received' : 'sentBy')}</span>
        </span>
      </span>

      <span className="flex flex-col items-end gap-1.5">
        <span className="text-3xs opacity-45">{t('asking')}</span>
        <ArabicNumber value={Number(offer.listing.askPrice)} className="text-2xs opacity-55" />
      </span>

      {/* العرض المنتهي يقول ذلك ولو بقيت حالته المخزَّنة نشطة */}
      <Badge tone={offer.lapsed ? 'neutral' : offer.autoRejected ? 'danger' : 'warn'}>
        {offer.lapsed && (offer.status === 'PENDING' || offer.status === 'COUNTERED')
          ? te('offerStatus.EXPIRED')
          : te(`offerStatus.${offer.status}`)}
      </Badge>

      <Money amount={Number(offer.amount)} size="md" showCurrency={false} className="text-accent-700" />

      {/*
        الردّ — **وكان غائبًا كلّه**. والعرض المنتهي أو المغلق لا يُردّ
        عليه، فيقتصر الصفّ على شارته.
      */}
      <OfferActions
        offerId={offer.id}
        sentByMe={offer.sentByMe}
        amount={offer.amount}
        askPrice={offer.listing.askPrice}
        actionable={
          !offer.lapsed && (offer.status === 'PENDING' || offer.status === 'COUNTERED')
        }
      />
    </li>
  );

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mb-7 text-sm opacity-60">{t('intro')}</p>

          <nav className="mb-6 flex flex-wrap gap-2.5">
            {TABS.map((key) => (
              <Link
                key={key}
                href={`/${locale}/account/offers?tab=${key}`}
                className={
                  key === tab
                    ? 'flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg'
                    : 'flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-ink/5'
                }
              >
                {t(`tab.${key}`)}
                <ArabicNumber value={inbox[key].length} className="opacity-60" />
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <EmptyState title={t(`empty.${tab}`)} description={t('emptyBody')} />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((offer) => (
                <Row key={offer.id} offer={offer} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
