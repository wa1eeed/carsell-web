import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountList, AccountRow, Money } from '../AccountList';
import { ListingControls } from '@/components/site/ListingControls';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'مركباتي', robots: { index: false, follow: false } };
}

/** **المعروضة والمراجَعة والمحجوزة معًا** — وإخفاء المراجَعة يجعل البائع يظنّ نشره ضاع. */
export default async function ListingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  // التسمية من `enums` نفسها التي تقرؤها بطاقة الحساب — لا نسخة ثانية
  const [data, te] = await Promise.all([getAccountData(user, locale), getTranslations('enums')]);

  return (
    <AccountList
      locale={locale}
      title="مركباتي"
      subtitle="ما عرضتَه، وحاله، وكم شوهد."
      empty={{
        title: 'لا مركبات معروضة',
        description: 'انشر مركبتك الأولى وستظهر هنا مع عروضها ومشاهداتها.',
      }}
      action={
        <Link href={`/${locale}/sell`}>
          <Button size="sm">بِع سيارتك</Button>
        </Link>
      }
    >
      {data.listings.map((listing) => (
        <div key={listing.ref}>
        <AccountRow
          href={listing.path}
          title={listing.title}
          year={listing.year}
          badge={{
            text: te(`listingStatus.${listing.status}`),
            tone:
              listing.status === 'PUBLISHED'
                ? 'accent'
                : listing.status === 'PENDING_REVIEW'
                  ? 'warn'
                  : 'neutral',
          }}
          meta={
            <>
              <Quantity unit="views" count={listing.viewCount} />
              <span aria-hidden className="opacity-40">·</span>
              <Quantity unit="offers" count={listing.offerCount} />
            </>
          }
          value={<Money amount={listing.price} />}
        />
              {/*
          **ملاحظة المراجع تُعرض للبائع.** إعلانٌ يعود مسودّةً بلا
          سببٍ مقروء يجعل صاحبه ينشره كما هو فيعود إلى الطابور —
          ودورةٌ لا تنتهي بين الطرفين.
        */}
        {/*
          **التحكّم — وكان غائبًا كلّه.** البائع ينشر ثم لا يستطيع
          تغيير سعره ولا إيقاف عرضه، وهو أوّل ما يفعله كل بائع.
        */}
        <ListingControls
          listingRef={listing.ref}
          status={listing.status}
          price={Number(listing.price)}
          negotiable={listing.negotiable}
          hasActiveOrder={listing.hasActiveOrder}
        />

        {listing.reviewNote === null ? null : (
          <p className="mt-2 mb-4 rounded-md border border-warn-200 bg-warn-100 p-3.5 text-2xs leading-loose text-warn-900">
            <b>أُعيد للتعديل:</b> {listing.reviewNote}
          </p>
        )}
        </div>
      ))}
    </AccountList>
  );
}
