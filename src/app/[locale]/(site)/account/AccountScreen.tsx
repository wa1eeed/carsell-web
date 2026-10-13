'use client';

import Link from 'next/link';
import { Percent } from '@/components/ui/Quantity';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { displayDigits, formatNumber, AR_DATE_LOCALE } from '@/lib/arabic';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { TaxStatusDialog } from '@/components/site/TaxStatusDialog';
import { MyAuctions } from '@/components/site/MyAuctions';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { StatCard } from '@/components/ui/StatCard';
import { cn } from '@/lib/cn';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import {
  isClosedOrder,
  orderGroup,
  orderNeedsBuyer,
} from '@/lib/domain/order-state';
import type { AccountData } from '@/lib/domain/account';

/**
 * **الحقول الناقصة بارزة** — معيار قبول Wf.
 *
 * ليست شارةً في زاوية: بطاقة في صدر الصفحة تسمّي ما ينقص وتقول ما
 * يمنعه. البريد والتوثيق والآيبان مطلوبة قبل أول معاملة لا عند
 * التسجيل، فالتذكير يسبق لحظة الحاجة بدل أن يظهر خطأً عند الضغط على
 * «اشترِ» — وهي أسوأ لحظة يكتشف فيها القارئ أن عليه عملًا.
 */
function MissingFields({ data, locale }: { data: AccountData; locale: string }) {
  const t = useTranslations('account');
  const { missing, canBuy, canSell, percent } = data.completion;
  if (missing.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-warn-200 bg-warn-100 p-6 text-warn-900">
      <h2 className="mb-1.5 text-base font-bold">{t('completeTitle')}</h2>
      <p className="mb-4 text-xs leading-loose opacity-85">
        {/* ما يمنعه النقص يُقال صراحةً — «أكمل ملفك» وحدها لا تدفع أحدًا */}
        {!canBuy ? t('blocksBuying') : !canSell ? t('blocksSelling') : t('completeBody')}
      </p>

      {/*
        ═══ والنسبة تُرى قبل أن تُقرأ ═══

        قائمةُ نواقصَ تقول «ما المطلوب» ولا تقول «كم بقي» — ومن يرى
        ثلاثة حقول لا يعرف أهي ثلاثةٌ من أربعة أم من ثمانية. والشريط
        يجيب في لمحة، والرقم بجواره يجيب بالضبط.

        **والمعروض هو المحسوب**: النسبة من `profileCompletion` لا من
        عدٍّ ثانٍ في الشاشة — فرقمان يُحسبان في موضعين يتباعدان.
      */}
      <div className="mb-4 flex items-center gap-3">
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-warn-200">
          <span
            className="block h-full rounded-full bg-warn-700"
            style={{ width: `${String(percent)}%` }}
          />
        </span>
        <span className="flex shrink-0 items-baseline gap-1 text-2xs font-bold">
          <Percent value={percent} />
          <span className="font-normal opacity-65">{t('completePercent')}</span>
        </span>
      </div>

      <p className="mb-4 text-2xs leading-loose opacity-70">{t('completeStrength')}</p>

      <ul className="flex flex-wrap gap-2.5">
        {missing.map((field) => (
          <li key={field}>
            <Link
              href={`/${locale}/account/profile#${field}`}
              className="flex items-center gap-2 rounded-md border border-warn-200 bg-bg px-3.5 py-2 text-xs font-semibold hover:border-warn-700"
            >
              <span className="size-1.5 rounded-full bg-warn-700" aria-hidden />
              {t(`missing.${field}`)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * ═══ قسمٌ في لوحة الحساب — عنوانٌ و«عرض الكل» ═══
 *
 * **والتصميم يكدّس الأقسام ولا يُخفيها خلف تابز.** صاحب الحساب يفتحه
 * ليعرف حاله، وتابزٌ تعرض واحدًا تجعله ينقر ثلاث مرّات ليراه — وقد
 * يغادر قبل أن يصل إلى ما ينتظره.
 *
 * ولكلّ قسمٍ ثلاثةُ صفوفٍ و«عرض الكل» إلى صفحته: اللوحة خلاصة،
 * والصفحة المخصّصة هي التي تُرشِّح وتستوعب.
 *
 * **ويختفي بلا محتوى**: عنوانٌ فوق فراغٍ يقول إن المنصّة خالية.
 */
function HomeSection({
  title,
  href,
  all,
  children,
}: {
  title: string;
  href: string;
  /** العدد الكامل — و«عرض الكل» تظهر حين يزيد عمّا عُرض. */
  all: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="mb-3.5 flex flex-wrap items-baseline gap-3.5">
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="h-px flex-1 bg-line" />
        {all > HOME_ROWS ? (
          <Link href={href} className="text-2xs font-bold text-accent-700 hover:underline">
            عرض الكل
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** ثلاثةٌ كما في التصميم — والرابع في صفحته. */
const HOME_ROWS = 3;

export function AccountScreen({
  data,
  locale,
  taxProfile,
  garage,
}: {
  data: AccountData;
  locale: string;
  taxProfile: TaxProfile;
  /** عدّادات المرآب — «٢ معروضة · ١ مخفية» (التسمية قرارُ المالك). */
  garage: { total: number; listed: number; garage: number; sold: number };
}) {
  const t = useTranslations('account');
  const te = useTranslations('enums');
  const tx = useTranslations('tax');

  /**
   * **والعدد من التصنيف نفسه الذي يُرشِّح به.** عددٌ يُحسب بشرطٍ
   * والقائمة تُرشَّح بآخر يقول التبويب «٣» ويعرض اثنين — والبوابة ٤٠
   * وُلدت من هذا بعينه.
   */
  const groupCounts = {
    live: data.orders.filter((order) => orderGroup(order.status) === 'live').length,
    done: data.orders.filter((order) => orderGroup(order.status) === 'done').length,
    cancelled: data.orders.filter((order) => orderGroup(order.status) === 'cancelled').length,
  };


  /**
   * ═══ تفكيك البطاقات — كما يكتبه التصميم ═══
   *
   * **ولا يُعرض ما لا عدد له**: «٠ مكتملة» سطرٌ يشغل مكانًا ولا يقول
   * شيئًا، وغيابُه نفسه خبر.
   */
  const orderSplit = [
    { label: 'تحت المعالجة', value: groupCounts.live },
    { label: 'مكتملة', value: groupCounts.done },
  ].filter((row) => row.value > 0);

  const topOffer =
    data.offers.length === 0
      ? null
      : formatNumber(
          Math.max(...data.offers.map((offer) => Number(offer.amount))),
          locale === 'en' ? 'en' : 'ar',
        );

  /** **والمزاد الحيّ بالحالة والوقت معًا** — لا بالحالة وحدها. */
  const liveAuctions = data.auctions.filter((row) => row.live);
  const auctionSplit = [
    { label: 'تزايد فيه', value: liveAuctions.filter((row) => row.role === 'bidder').length },
    { label: 'تعرضه', value: liveAuctions.filter((row) => row.role === 'seller').length },
  ].filter((row) => row.value > 0);

  const [tax, setTax] = useState<TaxProfile>(taxProfile);
  const [editingTax, setEditingTax] = useState(false);

  const date = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const Title = ({ title, year }: { title: string; year: number }) => (
    <span className="flex flex-wrap items-baseline gap-1.5 font-bold">
      <span className="bidi-isolate">{title}</span>
      <ArabicNumber value={year} grouped={false} />
    </span>
  );


  return (
    <>
      <MissingFields data={data} locale={locale} />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/*
          **وبطاقة المركبات تُفصَّل.** التصميم يكتب «٣ مركباتي · ٢
          معروضة · ١ مخفية» — والعدد وحده لا يقول أيُّها في السوق
          وأيُّها ينتظر قرار صاحبه.
        */}
        <StatCard
          label={t('stat.vehicles')}
          value={garage.total}
          breakdown={[
            { label: 'معروضة', value: garage.listed },
            { label: 'مخفية', value: garage.garage },
          ].filter((row) => row.value > 0)}
        />
        {/*
          ═══ وكل بطاقةٍ تقول ممّ تتكوّن ═══

          التصميم يكتب تحت كل رقمٍ سطرًا يفكّه: «٤ طلبات جارية — ٢ تحت
          المعالجة · ٢ مكتملة» و«٦ عروض واردة — أعلى عرض ١٤١٬٠٠٠».
          **ورقمٌ بلا تفكيكه لا يُقرَّر عليه**: «٦ عروض» لا تقول أتستحقّ
          فتحَ الصفحة الآن أم تنتظر.
        */}
        <StatCard
          label={t('stat.orders')}
          value={data.orders.length}
          breakdown={orderSplit}
        />
        <StatCard
          label={t('stat.offers')}
          value={data.offers.length}
          breakdown={topOffer === null ? undefined : [{ label: 'أعلى عرض', value: topOffer }]}
        />
        <StatCard
          label="مزادات نشطة"
          value={liveAuctions.length}
          breakdown={auctionSplit}
        />
      </div>

      {/*
        الدفتر المالي — **يُعرض لمن باع فقط**. ومن لم يبع بعدُ لا يحتاج
        صفحة مستحقّات فارغة تسأله عمّا لم يفعله.
      */}
      {data.listings.length === 0 && data.orders.length === 0 ? null : (
        <Link
          href={`/${locale}/account/earnings`}
          className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4 transition-opacity hover:opacity-80"
        >
          <span>
            <span className="block text-sm font-bold">مستحقّاتي</span>
            <span className="mt-1 block text-2xs opacity-55">
              ما لك من كل صفقة، وممّ خُصم، ومتى يصلك
            </span>
          </span>
          <span aria-hidden className="text-lg opacity-40">←</span>
        </Link>
      )}

      

      {data.listings.length === 0 ? null : (
        <HomeSection
          title={t('tab.listings')}
          href={`/${locale}/account/listings`}
          all={data.listings.length}
        >
          {false ? (
          <EmptyState
            title={t('noListings')}
            description={t('noListingsBody')}
            action={
              <Link href={`/${locale}/sell`}>
                <Button>{t('sellNow')}</Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.listings.slice(0, HOME_ROWS).map((listing) => (
              <li
                key={listing.ref}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <span className="washed size-16 shrink-0 rounded-lg" />
                <span className="min-w-40 flex-1">
                  <Title title={listing.title} year={listing.year} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num">{listing.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <Quantity unit="views" count={listing.viewCount} />
                    <span aria-hidden className="opacity-40">·</span>
                    <Quantity unit="offers" count={listing.offerCount} />
                  </span>
                </span>
                <Badge tone={listing.status === 'PUBLISHED' ? 'accent' : 'neutral'}>
                  {te(`listingStatus.${listing.status}`)}
                </Badge>
                <Money amount={Number(listing.price)} size="md" showCurrency={false} />
                <Link href={listing.path} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
        )}
        </HomeSection>
      )}

      {data.offers.length === 0 ? null : (
        <HomeSection
          title="العروض الواردة على مركباتك"
          href={`/${locale}/account/offers`}
          all={data.offers.length}
        >
          {false ? (
          <EmptyState title={t('noOffers')} description={t('noOffersBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.offers.slice(0, HOME_ROWS).map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <span className="min-w-40 flex-1">
                  <Title title={offer.title} year={offer.year} />
                  <span className="mt-1 block text-2xs opacity-55">
                    {t('expiresOn')} <span className="bidi-isolate">{date.format(new Date(offer.expiresAt))}</span>
                  </span>
                </span>
                <Badge tone="warn">{te(`offerStatus.${offer.status}`)}</Badge>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <Money amount={Number(offer.amount)} size="md" showCurrency={false} className="text-accent-700" />
                  {/*
                    **والمعلن بجواره.** عرضٌ بلا ما يُقارَن به لا
                    يُقرَّر عليه: «١٤١٬٠٠٠» تعني شيئًا حين يكون المعلن
                    «١٤٥٬٠٠٠» وشيئًا آخر حين يكون «٢٠٠٬٠٠٠».
                  */}
                  <span className="flex items-center gap-1 text-3xs opacity-50">
                    سعرك المعلن
                    <ArabicNumber value={Number(offer.askPrice)} />
                  </span>
                </span>
                <Link href={offer.path} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
        )}
        </HomeSection>
      )}

      {data.orders.length === 0 ? null : (
        <HomeSection
          title={t('tab.orders')}
          href={`/${locale}/account/orders`}
          all={data.orders.length}
        >
          {false ? (
          <EmptyState title={t('noOrders')} description={t('noOrdersBody')} />
        ) : (
          <>
          <ul className="flex flex-col gap-3">
            {data.orders.slice(0, HOME_ROWS).map((order) => (
              <li
                key={order.ref}
                /*
                  **والصفّ الذي ينتظره يُميَّز بحدٍّ لا بوميض.** وميضٌ
                  في كل سطر يُلغي نفسه — وثلاثةٌ تنبض معًا لا تقول أيَّها
                  أوّلًا. فالنقطة على التبويب وحدها، والصفُّ هنا يُعرف
                  بحدِّه.
                */
                className={cn(
                  'flex flex-wrap items-center gap-4 rounded-xl border bg-surface p-4.5',
                  orderNeedsBuyer(order.status, order.stage)
                    ? 'border-warn-400'
                    : 'border-line',
                )}
              >
                <span className="min-w-40 flex-1">
                  <Title title={order.title} year={order.year} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num">{order.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="bidi-isolate">{date.format(new Date(order.createdAt))}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-start gap-1">
                  {/*
                    **وكان وسمَ المرحلة بلون `accent`** — فطلبٌ ملغى
                    يحمل وسمًا أخضر يقول «دفع». والوسم الواحد يجمع
                    الحال والمرحلة: «أُلغي عند الدفع» (قرار المصمّم ١٧).
                  */}
                  <OrderStatusBadge status={order.status} stage={order.stage} />
                  {/*
                    **والخطوة تُقال بعددها.** اسم المرحلة وحده لا يقول
                    كم بقي — ومن يقرأ «نقل الملكية» لا يعرف أهو في أوّل
                    الطريق أم آخره. والترتيب من `STAGES` لا مكتوبًا.
                  */}
                  {/*
                    **والصياغة تضع الكلمة قبل الرقمين.** «١ من ٦» فيها
                    كلمةٌ عربية بين رقمين، والبوابة تمنعها بحقّ: العربية
                    ستّ حالات جمع. فتُصاغ «الخطوة (١/٦)» — والكسر
                    لاتينيٌّ معزول يُقرأ خانةً بخانة.
                  */}
                  {/*
                    **و«الخطوة ٤/٦» لا تُقال لطلبٍ مغلق.** الكسر يقول
                    «بقي اثنتان» — ولا بقيّةَ طريقٍ في طلبٍ أُلغي.
                  */}
                  {isClosedOrder(order.status) ? null : (
                    <span className="flex items-center gap-1 text-3xs opacity-50">
                      الخطوة
                      <span dir="ltr" className="font-num">
                        {displayDigits(String(order.step))}/{displayDigits(String(order.stepCount))}
                      </span>
                    </span>
                  )}
                </span>
                <Money amount={Number(order.amount)} size="md" showCurrency={false} />
                <Link href={`/${locale}/account/orders/${order.ref}`} className="text-xs font-bold text-accent-700 hover:underline">
                  {t('view')}
                </Link>
              </li>
            ))}
          </ul>
          </>
        )}
        </HomeSection>
      )}

      {data.reports.length === 0 ? null : (
        <HomeSection
          title={t('tab.reports')}
          href={`/${locale}/account/reports`}
          all={data.reports.length}
        >
          {false ? (
          <EmptyState title={t('noReports')} description={t('noReportsBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.reports.slice(0, HOME_ROWS).map((report) => (
              <li
                key={report.ref}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4.5"
              >
                <ScoreRing score={report.score} size="sm" />
                <span className="min-w-40 flex-1">
                  <Title title={report.title} year={0} />
                  <span className="mt-1 flex flex-wrap items-center gap-2.5 text-2xs opacity-55">
                    <span className="font-num bidi-ltr">{report.ref}</span>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="bidi-isolate">{date.format(new Date(report.inspectedAt))}</span>
                  </span>
                </span>
                {/* التقرير يبقى وإن سُحب الإعلان — ورابطه يذهب معه */}
                {report.path === null ? (
                  <span className="text-xs opacity-45">{t('listingWithdrawn')}</span>
                ) : (
                  <Link href={report.path} className="text-xs font-bold text-accent-700 hover:underline">
                    {t('view')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        </HomeSection>
      )}

      {/* مزاداتي — ما أعرضه وما أزايد فيه، والقسم يختفي بلا مزاد */}
      <MyAuctions rows={data.auctions} />

      {/*
        ═══ الإعدادات المالية والضريبية ═══

        الحالة تُعرض شارةً لا نصًّا مدفونًا: المستخدم يريد أن يعرف بنظرة
        أيّ وضعٍ يُطبَّق عليه، والرقم `dir="ltr"` لأنه يُقارَن خانةً بخانة.
      */}
      <section className="mt-9 rounded-xl border border-line p-5">
        <h2 className="mb-3 text-sm font-bold">{tx('settingsTitle')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          {tax.status === null ? (
            <p className="min-w-0 flex-1 text-2xs leading-loose opacity-60">{tx('currentUnset')}</p>
          ) : (
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs">
              <Badge tone={tax.status === 'VAT_REGISTERED' ? 'accent' : 'neutral'}>
                {tax.status === 'VAT_REGISTERED'
                  ? tx('currentRegistered')
                  : tx('currentIndividual')}
              </Badge>
              {tax.vatNumber === null ? null : (
                <span dir="ltr" className="bidi-isolate font-num opacity-70">
                  {tax.vatNumber}
                </span>
              )}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditingTax(true)}>
            {tx('edit')}
          </Button>
        </div>
      </section>

      <TaxStatusDialog
        open={editingTax}
        onClose={() => setEditingTax(false)}
        initial={tax}
        onSaved={(profile) => {
          setTax(profile);
          setEditingTax(false);
        }}
      />
    </>
  );
}

/** بطاقة الحساب — الهويّة والتواصل والمال في مكانٍ واحد. */
/**
 * ═══ بطاقة الهوية — في الشريط الجانبيّ ═══
 *
 * **والتصميم يضعها عمودًا لا صفًّا**: الاسم والرصيد وأقسام الحساب في
 * عمودٍ أيسر ثابت، والمحتوى بجواره. فتبقى هويّتُك ورصيدُك مرئيّين
 * وأنت تقرأ طلباتك، ولا تُدفع الأقسام إلى قاع الصفحة حيث لا يصلها أحد.
 */
export function ProfileCard({ data, locale }: { data: AccountData; locale: string }) {
  const t = useTranslations('account');
  const { user } = data;

  const joined = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(user.memberSince));

  const initial = (user.name ?? 'ح').trim().charAt(0);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      {/*
        ═══ الهوية: حرفٌ واسمٌ ورقمٌ يُقتبس ═══

        كان الاسم نصًّا عاديًّا ورقمُ العميل بجواره بلا تمييز. والحرفُ
        في حلقةٍ يجعل البطاقة تُعرف بنظرة، ورقمُ العميل في رقاقةٍ يُقال
        إنه **يُقتبس في مكالمة دعم** لا أنه زينة.
      */}
      <div className="flex items-start gap-3.5 p-5">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-lg font-bold text-accent-700"
        >
          {initial}
        </span>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="bidi-isolate truncate text-base font-bold">
            {user.name ?? t('noName')}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-3xs opacity-60">
            {user.ref === null ? null : (
              <span dir="ltr" className="rounded-full bg-ink/8 px-2 py-0.5 font-num">
                {user.ref}
              </span>
            )}
            <span>{t('memberSince', { date: joined })}</span>
          </span>
        </div>
      </div>

      {/*
        ═══ الرصيد لوحةٌ لا سطرٌ ═══

        كان نصًّا رماديًّا تحت الاسم: «رصيد المحفظة ٠ ريال» — فرقمٌ
        **يُتصرَّف به** يُقرأ حاشيةً. واللوحة الداكنة هي ما يعامل به
        التصميم أرقامَه الحاسمة (عدّاد المزاد والسعر)، فيُعرف وزنُه
        قبل قراءته.
      */}
      <div className="mx-5 mb-5 rounded-lg bg-ink p-4 text-bg">
        <span className="block text-3xs opacity-70">{t('walletBalance')}</span>
        <span className="mt-1 block">
          <Money amount={Number(data.walletBalance)} size="lg" />
        </span>

        {/*
          **والمحجوز يُقال.** رصيدٌ يُعرض كاملًا وبعضُه عربونُ مزادٍ لم
          يُحسم يجعل صاحبه يخطّط لما لا يملك التصرّف فيه.
        */}
        {Number(data.walletHeld) === 0 ? null : (
          <span className="mt-2 flex flex-wrap items-center gap-1 rounded-md bg-bg/12 px-2 py-1 text-3xs">
            منها
            <Money amount={Number(data.walletHeld)} showCurrency={false} size="sm" />
            محجوزة كعربون مزاد
          </span>
        )}

        {/* **والعدّاد يربط إلى شاشة أو لا يُعرض** — والقاعدة مسجَّلة */}
        <Link
          href={`/${locale}/account/wallet`}
          className="mt-3 flex items-center justify-between gap-2 rounded-md border border-bg/25 px-3 py-2 text-3xs font-bold transition-colors hover:bg-bg/10"
        >
          <span>كشف المحفظة</span>
          <span aria-hidden>←</span>
        </Link>
      </div>

      <dl className="flex flex-col gap-px bg-line">
        <Row label={t('field.phone')} value={user.phone} ltr />
        <Row label={t('field.email')} value={user.email} ltr missing={t('notSet')} />
        <Row
          label={t('field.identity')}
          value={user.idVerified ? t('identityVerified') : null}
          missing={t('identityMissing')}
          good={user.idVerified}
        />
        <Row label={t('field.iban')} value={user.ibanMasked} ltr missing={t('notSet')} />
        <Row
          label={t('field.taxStatus')}
          value={user.taxStatus === null ? null : t(`taxStatus.${user.taxStatus}`)}
          missing={t('notAsked')}
        />
        {user.vatNumber === null ? null : (
          <Row label={t('field.vatNumber')} value={user.vatNumber} ltr />
        )}
      </dl>

      <Link
        href={`/${locale}/account/profile`}
        className="flex items-center justify-between gap-2 bg-surface p-4 text-2xs font-bold transition-colors hover:bg-ink/4"
      >
        <span>{t('editProfile')}</span>
        <span aria-hidden className="opacity-40">←</span>
      </Link>
    </section>
  );
}

/** سطرُ حقل — **والناقص يُقال لا يُترك فارغًا**، فالفراغ يُقرأ عطلًا. */
function Row({
  label,
  value,
  ltr,
  missing,
  good,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
  missing?: string;
  /** حالةٌ محقَّقة تُقال بلونها — «موثّقة» رماديةً كـ«لم يُضف» تُقرأ سواء. */
  good?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-surface px-5 py-3">
      <dt className="shrink-0 text-2xs opacity-55">{label}</dt>
      <dd
        dir={ltr === true && value !== null ? 'ltr' : undefined}
        className={
          value === null
            ? 'text-2xs opacity-45'
            : `truncate text-2xs font-semibold ${good === true ? 'text-accent-700 ' : ''}${ltr === true ? 'font-num' : 'bidi-isolate'}`
        }
      >
        {value ?? missing ?? '—'}
      </dd>
    </div>
  );
}
