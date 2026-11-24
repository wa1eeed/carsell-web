import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { OfferActions } from '@/components/site/OfferActions';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { routing } from '@/i18n/routing';
import { FilterChip } from '@/components/ui/FilterChip';
import { currentUserFromCookies } from '@/lib/domain/account';
import {
  getOfferedVehicles,
  getOfferInbox,
  type InboxOffer,
  type InboxTab,
} from '@/lib/domain/offer-inbox';
import { FloorEditor } from '@/components/site/FloorEditor';
import { Quantity } from '@/components/ui/Quantity';
import { OFFER_STANDING } from '@/lib/labels/offers';

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

  const [inbox, vehicles, t, te] = await Promise.all([
    getOfferInbox(user.id, locale),
    getOfferedVehicles(user.id, locale),
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
        <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-70">
          <span className="font-num">{offer.listing.ref}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="bidi-isolate">{offer.listing.city}</span>
          <span aria-hidden className="opacity-40">·</span>
          {/*
            **والشارة من `sentByMe` لا من `role`.** الدور ثابتٌ طول
            المفاوضة (المشتري مشترٍ ولو قابَله البائع)، فاشتقاقُ الاتّجاه
            منه يجعل البائع يقرأ «وارد» على مقابلِه هو، والمشتري «مُرسَل»
            على ما وصله. والتبويب يفرزهما بـ`sentByMe` أصلًا، فكانت
            الشارة تناقض العمود الذي هي فيه.
          */}
          <span>{t(offer.sentByMe ? 'sentBy' : 'received')}</span>
        </span>
      </span>

      <span className="flex flex-col items-end gap-1.5">
        <span className="text-3xs opacity-65">{t('asking')}</span>
        <ArabicNumber value={Number(offer.listing.askPrice)} className="text-2xs opacity-70" />
      </span>

      {/* العرض المنتهي يقول ذلك ولو بقيت حالته المخزَّنة نشطة */}
      <Badge tone={offer.lapsed ? 'neutral' : offer.autoRejected ? 'danger' : 'warn'}>
        {offer.lapsed && (offer.status === 'PENDING' || offer.status === 'COUNTERED')
          ? te('offerStatus.EXPIRED')
          : te(`offerStatus.${offer.status}`)}
      </Badge>

      {/*
        ═══ وموضعُ العرض يُقال بجوار مبلغه ═══

        ترميز `Wl` يكتبه تحت كل عرض: «أعلى من سعرك بـ ١٬٠٠٠» · «فوق
        الحد الأدنى». **والبائع كان يقرأ رقمًا وحده** ويقارنه في رأسه
        بسعرٍ في عمودٍ آخر وبأرضيّةٍ لا تُعرض له أصلًا.

        ولا يُعرض لمن ليس بائعَ الإعلان — موضعٌ من أرضيّةٍ لا يملكها.
      */}
      <span className="flex flex-col items-end gap-1">
        <Money amount={Number(offer.amount)} size="md" showCurrency={false} className="text-accent-700" />
        {offer.standing === null ? null : (
          <span
            className={
              offer.standing === 'below_floor' ? 'text-3xs text-danger' : 'text-3xs opacity-70'
            }
          >
            {offer.standing === 'above_ask' && offer.vsAsk !== null && offer.vsAsk > 0 ? (
              <>
                {OFFER_STANDING.above_ask}{' '}
                <Money amount={offer.vsAsk} showCurrency={false} />
              </>
            ) : (
              OFFER_STANDING[offer.standing]
            )}
          </span>
        )}
      </span>

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
        <div className="page-frame">
          <Breadcrumb
            label="مسار التنقل"
            separator="›"
            className="mb-6"
            items={[{ label: 'حسابي', href: `/${locale}/account` }, { label: 'عروضي' }]}
          />

          <h1 className="mb-1.5 text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mb-7 text-sm opacity-70">{t('intro')}</p>

          {/*
            **والشريحة من `FilterChip` لا مكتوبةً بيد.** كانت نسخةً
            ثانية بأصنافها — تتباعد عن الأولى أوّل تغييرٍ في الشكل،
            فتبدو صفحتان من منصّتين.

            **وصفرٌ لا يُعرض**: «منتهية (٠)» رقمٌ يشغل مكانًا ولا يقول
            شيئًا، وغيابُه هو الخبر نفسه — كما في «طلباتي» و«سياراتي».
          */}
          <nav className="mb-6 flex flex-wrap items-center gap-2.5">
            {TABS.map((key) => {
              const count = inbox[key].length;
              return (
                <FilterChip
                  key={key}
                  href={`/${locale}/account/offers?tab=${key}`}
                  active={key === tab}
                  {...(count === 0 ? {} : { count })}
                >
                  {t(`tab.${key}`)}
                </FilterChip>
              );
            })}
          </nav>

          <div className="flex flex-col gap-7 lg:flex-row-reverse lg:items-start">
            {/*
              ═══ «مركباتك المعروضة» — وما لم يصلك عرضٌ عليه ═══

              عمودُ الترميز الأيمن. والصندوقُ يعرض ما وصل، وهذا يقول
              **ما لم يصل**: فيعرف البائع أيَّ سياراته لا يسأل عنها
              أحد — وهو ما يُفتح الصندوقُ لأجله بعد أوّل أسبوع.

              **وهنا وحده يُعرض الحدُّ الأدنى ويُعدَّل**: رقمٌ يرفض
              العروض تلقائيًّا، فموضعُه حيث تُقرأ العروض لا في استمارةِ
              نشرٍ انتهت.
            */}
            {vehicles.length === 0 ? null : (
              <aside className="flex w-full shrink-0 flex-col gap-2.5 lg:w-80">
                <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">
                  مركباتك المعروضة
                </h2>
                {vehicles.map((vehicle) => (
                  <div
                    key={vehicle.ref}
                    className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="washed size-12 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <Link
                          href={vehicle.path}
                          className="flex flex-wrap items-baseline gap-1.5 text-2xs font-bold hover:underline"
                        >
                          <span className="bidi-isolate">{vehicle.title}</span>
                          <ArabicNumber value={vehicle.year} grouped={false} />
                        </Link>
                        <span className="mt-0.5 block text-3xs opacity-70">
                          {t('asking')}{' '}
                          <Money amount={Number(vehicle.askPrice)} showCurrency={false} />
                        </span>
                      </span>
                      {/*
                        **والصفرُ يُقال ولا يُترك فارغًا**: «لا عروض
                        بعد» نصُّ الترميز، وغيابُ الشارة يُقرأ عطلًا.
                      */}
                      {vehicle.liveOffers === 0 ? (
                        <span className="shrink-0 text-3xs opacity-65">لا عروض بعد</span>
                      ) : (
                        <Badge tone="warn">
                          <Quantity unit="offers" count={vehicle.liveOffers} />
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line pt-2.5">
                      <span className="text-3xs opacity-70">
                        {vehicle.minAcceptPrice === null ? (
                          'لا حد أدنى — كل عرض يصلك'
                        ) : (
                          <>
                            الحد الأدنى المخفي{' '}
                            <Money
                              amount={Number(vehicle.minAcceptPrice)}
                              showCurrency={false}
                            />
                          </>
                        )}
                      </span>
                      <FloorEditor
                        listingRef={vehicle.ref}
                        askPrice={Number(vehicle.askPrice)}
                        floor={
                          vehicle.minAcceptPrice === null ? null : Number(vehicle.minAcceptPrice)
                        }
                      />
                    </div>
                  </div>
                ))}
              </aside>
            )}

            <div className="min-w-0 flex-1">
              {rows.length === 0 ? (
                <EmptyState title={t(`empty.${tab}`)} description={t('emptyBody')} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {rows.map((offer) => (
                    <Row key={offer.id} offer={offer} />
                  ))}
                </ul>
              )}

              {/*
                ═══ وما يقع عند القبول يُقال قبله ═══

                نصُّ الترميز حرفيًّا. **وقبولُ عرضٍ فعلٌ لا رجعةَ فيه**:
                يُغلق بقيّةَ العروض ويسحب الإعلان — ومن ضغط «اقبل» وهو
                لا يعرف ذلك اكتشفه بعد وقوعه.
              */}
              {rows.length === 0 ? null : (
                <p className="mt-5 rounded-xl border border-line bg-surface p-4.5 text-3xs leading-loose opacity-72">
                  قبول عرض يغلق بقية العروض تلقائيا مع إشعار أصحابها، ويسحب الإعلان من
                  التصفح. وللمشتري مهلة لإتمام الدفع، وإن لم يدفع عاد الإعلان وأخطر بقية
                  المتقدمين.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
