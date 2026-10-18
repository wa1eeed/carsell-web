import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { LinkButton } from '@/components/ui/Button';
import { FilterChip } from '@/components/ui/FilterChip';
import { Quantity } from '@/components/ui/Quantity';
import { Badge } from '@/components/ui/Badge';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountList, AccountRow, Money } from '../AccountList';
import { ListingControls } from '@/components/site/ListingControls';
import { ListingStatsRow } from '@/components/site/ListingStatsRow';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'إعلاناتي', robots: { index: false, follow: false } };
}

/** **المعروضة والمراجَعة والمحجوزة معًا** — وإخفاء المراجَعة يجعل البائع يظنّ نشره ضاع. */
/**
 * ═══ ترشيح «إعلاناتي» ═══
 *
 * ثماني حالاتٍ في المخطّط، وأربعٌ منها تظهر معًا في قائمةٍ واحدة:
 * مسودّة وقيد مراجعة ومنشور ومباع. **فالبائع يبحث عن إعلانه بين
 * حالاتٍ لا تخصّه** — والمسودّة التي لم تكتمل تختفي بين منشورين.
 *
 * وثلاثٌ لأنها ثلاثةُ أسئلة: **ما يعمل الآن** · **ما ينتظرني** ·
 * **ما انتهى**. والحالة التي لا جواب لها ليست تبويبًا.
 */
const GROUPS = ['live', 'waiting', 'closed'] as const;
type Group = (typeof GROUPS)[number];

const GROUP_LABEL: Record<Group, string> = {
  live: 'معروضة',
  waiting: 'تنتظرك',
  closed: 'منتهية',
};

/** `DRAFT` تنتظر صاحبها ليكملها، و`PENDING_REVIEW` تنتظرنا — وكلتاهما لا تُعرض. */
function groupOf(status: string): Group {
  if (status === 'PUBLISHED' || status === 'RESERVED') return 'live';
  if (status === 'DRAFT' || status === 'PENDING_REVIEW') return 'waiting';
  return 'closed';
}

export default async function ListingsPage({
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

  // التسمية من `enums` نفسها التي تقرؤها بطاقة الحساب — لا نسخة ثانية
  const [data, te, query] = await Promise.all([
    getAccountData(user, locale),
    getTranslations('enums'),
    searchParams,
  ]);

  /** الترشيح بالعنوان — يُشارَك ويعمل بلا JS، والشاشة خادمية. */
  const asked = typeof query.group === 'string' ? query.group : 'live';
  const group: Group = (GROUPS as readonly string[]).includes(asked) ? (asked as Group) : 'live';

  /** العدد من التصنيف نفسه الذي يُرشَّح به — لا شرطان يتباعدان. */
  const countOf = (which: Group): number =>
    data.listings.filter((row) => groupOf(row.status) === which).length;
  const shown = data.listings.filter((row) => groupOf(row.status) === group);

  return (
    <AccountList
      locale={locale}
      /**
       * **إعلاناتي لا مركباتي.** الصفحة تعرض `Listing` لا `Vehicle`،
       * وهما كيانان منفصلان في المخطّط — ومركبةٌ في المرآب بلا إعلان
       * لا تظهر هنا. والتصميم يسمّيها «إعلاناتي»، وقاعدةُ المستودع
       * تقول «لا تخلطهما».
       */
      title="إعلاناتي"
      subtitle="ما عرضته، وحاله، وكم شوهد."
      stats={<ListingStatsRow stats={data.listingStats} />}
      filters={
        data.listings.length === 0 ? undefined : (
          <nav className="flex flex-wrap items-center gap-2.5">
            {GROUPS.map((key) => {
              const count = countOf(key);
              return (
                <FilterChip
                  key={key}
                  href={
                    key === 'live'
                      ? `/${locale}/account/listings`
                      : `/${locale}/account/listings?group=${key}`
                  }
                  active={group === key}
                  {...(count === 0 ? {} : { count })}
                >
                  {GROUP_LABEL[key]}
                </FilterChip>
              );
            })}
          </nav>
        )
      }
      /*
        **والحالة الفارغة تتبع التبويب.** «انشر مركبتك الأولى» جوابٌ
        صحيح لمن لا إعلان له، وخاطئٌ لمن له ستّةٌ ورشّح إلى «منتهية».
      */
      empty={
        data.listings.length === 0
          ? {
              title: 'لا مركبات معروضة',
              description: 'انشر مركبتك الأولى وستظهر هنا مع عروضها ومشاهداتها.',
            }
          : group === 'live'
            ? {
                title: 'ما عندك إعلان معروض الحين',
                description: 'إعلاناتك اللي يشوفها المشترين تظهر هنا مع مشاهداتها وعروضها.',
              }
            : group === 'waiting'
              ? {
                  title: 'ما في شي ينتظرك',
                  description: 'المسودات واللي تحت المراجعة تلقاها هنا.',
                }
              : {
                  title: 'ما في إعلان منتهي',
                  description: 'المباع والموقوف والمنتهي تلقاه هنا.',
                }
      }
      action={
        <LinkButton href={`/${locale}/sell`} size="sm">بع سيارتك</LinkButton>
      }
    >
      {shown.map((listing) => (
        <div key={listing.ref}>
        <AccountRow
          href={listing.path}
          title={listing.title}
          year={listing.year}
          badge={
            <Badge
              tone={
                listing.status === 'PUBLISHED'
                  ? 'accent'
                  : listing.status === 'PENDING_REVIEW'
                    ? 'warn'
                    : 'neutral'
              }
            >
              {te(`listingStatus.${listing.status}`)}
            </Badge>
          }
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
          description={listing.description}
          hasActiveOrder={listing.hasActiveOrder}
        />

        {listing.reviewNote === null ? null : (
          <p className="mt-2 mb-4 rounded-md border border-warn-200 bg-warn-100 p-3.5 text-2xs leading-loose text-warn-900">
            <b>أعيد للتعديل:</b> {listing.reviewNote}
          </p>
        )}
        </div>
      ))}
    </AccountList>
  );
}
