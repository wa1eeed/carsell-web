'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
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
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import {
  isClosedOrder,
  orderGroup,
  orderNeedsBuyer,
  type OrderGroup,
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
  const { missing, canBuy, canSell } = data.completion;
  if (missing.length === 0) return null;

  return (
    <section className="mb-8 rounded-xl border border-warn-200 bg-warn-100 p-6 text-warn-900">
      <h2 className="mb-1.5 text-base font-bold">{t('completeTitle')}</h2>
      <p className="mb-4 text-xs leading-loose opacity-85">
        {/* ما يمنعه النقص يُقال صراحةً — «أكمل ملفك» وحدها لا تدفع أحدًا */}
        {!canBuy ? t('blocksBuying') : !canSell ? t('blocksSelling') : t('completeBody')}
      </p>

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
  const [tab, setTab] = useState('listings');
  /**
   * ═══ تبويبٌ فرعيّ تحت «طلباتي» ═══
   *
   * القائمة كانت واحدة: الجاري والمكتمل والملغى في صفٍّ واحد مرتَّبين
   * بالتاريخ — **فالطلب الذي ينتظر دفعًا يختفي بين ملغيَيْن**.
   */
  const [orderGroupTab, setOrderGroupTab] = useState<OrderGroup>('live');

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

  const shownOrders = data.orders.filter((order) => orderGroup(order.status) === orderGroupTab);

  /** ما ينتظر فعلًا منه — دفعًا أو تأكيد استلام. */
  const needsAction = data.orders.some((order) => orderNeedsBuyer(order.status, order.stage));
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

  const tabs = [
    { id: 'listings', label: t('tab.listings'), count: data.listings.length },
    { id: 'offers', label: t('tab.offers'), count: data.offers.length },
    { id: 'orders', label: t('tab.orders'), count: data.orders.length },
    { id: 'reports', label: t('tab.reports'), count: data.reports.length },
  ];

  return (
    <>
      <MissingFields data={data} locale={locale} />

      {/*
        ═══ بطاقة الحساب — من أنتَ ورقمُك ورصيدك ═══

        كانت الصفحة تبدأ بأربع عدّادات ثم قوائم، **بلا سطرٍ واحد يقول
        من صاحبها**: لا رقم عميلٍ يُقتبس في مكالمة دعم، ولا بريدٌ ولا
        حالةُ توثيقٍ ولا رصيدٌ لمحفظة.
      */}
      <ProfileCard data={data} locale={locale} />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          ]}
        />
        {data.stats
          .filter((stat) => stat.key !== 'listings')
          .map((stat) => (
            <StatCard key={stat.key} label={t(`stat.${stat.key}`)} value={stat.value} />
          ))}
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

      <Tabs items={tabs} active={tab} onChange={setTab} className="mb-6" />

      {tab === 'listings' ? (
        data.listings.length === 0 ? (
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
            {data.listings.map((listing) => (
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
        )
      ) : null}

      {tab === 'offers' ? (
        data.offers.length === 0 ? (
          <EmptyState title={t('noOffers')} description={t('noOffersBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.offers.map((offer) => (
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
        )
      ) : null}

      {tab === 'orders' ? (
        data.orders.length === 0 ? (
          <EmptyState title={t('noOrders')} description={t('noOrdersBody')} />
        ) : (
          <>
            {/*
              **والعدّاد على «قيد الإجراء» وحده.** «الملغاة (٤)» رقمٌ
              لا يُفعل به شيء، و«المكتملة (٢)» كذلك — والعدد يُعرض حيث
              يُقرَّر عليه. والنقطة تنبض متى كان بينها ما ينتظر فعلًا
              من صاحبه: دفعًا أو تأكيد استلام.
            */}
            <Tabs
              items={[
                {
                  id: 'live',
                  label: 'قيد الإجراء',
                  /** وصفرٌ لا يُعرض — «قيد الإجراء (٠)» ضجيجٌ، والفراغ أبلغ. */
                  ...(groupCounts.live === 0 ? {} : { count: groupCounts.live }),
                  alert: needsAction,
                },
                { id: 'done', label: 'المكتملة' },
                { id: 'cancelled', label: 'الملغاة' },
              ]}
              active={orderGroupTab}
              onChange={(id) => setOrderGroupTab(id as OrderGroup)}
              className="mb-5"
            />

            {shownOrders.length === 0 ? (
              <EmptyState
                title={
                  orderGroupTab === 'live'
                    ? 'لا طلبات قيد الإجراء'
                    : orderGroupTab === 'done'
                      ? 'لا طلبات مكتملة'
                      : 'لا طلبات ملغاة'
                }
                description={
                  orderGroupTab === 'live'
                    ? 'ما يحتاج منك إجراءً يظهر هنا، ومعه مهلتُه.'
                    : orderGroupTab === 'done'
                      ? 'الصفقات التي تمّت ونُقلت ملكيتها تظهر هنا مع عقودها.'
                      : 'الطلبات التي أُلغيت تبقى هنا بسبب إلغائها.'
                }
              />
            ) : (
          <ul className="flex flex-col gap-3">
            {shownOrders.map((order) => (
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
            )}
          </>
        )
      ) : null}

      {tab === 'reports' ? (
        data.reports.length === 0 ? (
          <EmptyState title={t('noReports')} description={t('noReportsBody')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.reports.map((report) => (
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
        )
      ) : null}

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
function ProfileCard({ data, locale }: { data: AccountData; locale: string }) {
  const t = useTranslations('account');
  const { user } = data;

  const joined = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(user.memberSince));

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="bidi-isolate truncate text-xl font-bold">
            {user.name ?? t('noName')}
          </span>
          <span className="flex flex-wrap items-center gap-2.5 text-2xs opacity-60">
            {/* رقم العميل يُقتبس في مكالمة — لاتينيّ معزول ويُنسخ خانةً بخانة */}
            {user.ref === null ? null : (
              <span dir="ltr" className="font-num">
                {user.ref}
              </span>
            )}
            <span aria-hidden className="opacity-40">·</span>
            <span>{t('memberSince', { date: joined })}</span>
          </span>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-2xs opacity-55">{t('walletBalance')}</span>
          <Money amount={Number(data.walletBalance)} size="lg" />
          {/*
            **والمحجوز يُقال.** رصيدٌ يُعرض كاملًا وبعضُه عربونُ مزادٍ
            لم يُحسم يجعل صاحبه يخطّط لما لا يملك التصرّف فيه.
          */}
          {Number(data.walletHeld) === 0 ? null : (
            <span className="flex items-center gap-1 text-3xs opacity-55">
              منها
              <Money amount={Number(data.walletHeld)} showCurrency={false} size="sm" />
              محجوزة كعربون مزاد
            </span>
          )}
          {/* **والعدّاد يربط إلى شاشة أو لا يُعرض** — والقاعدة مسجَّلة */}
          <Link
            href={`/${locale}/account/wallet`}
            className="text-3xs font-bold underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            كشف المحفظة ←
          </Link>
        </div>
      </div>

      <dl className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
        <Row label={t('field.phone')} value={user.phone} ltr />
        <Row label={t('field.email')} value={user.email} ltr missing={t('notSet')} />
        <Row
          label={t('field.identity')}
          value={user.idVerified ? t('identityVerified') : null}
          missing={t('identityMissing')}
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
        className="mt-5 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
      >
        {t('editProfile')}
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
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
  missing?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-2.5">
      <dt className="shrink-0 text-2xs opacity-55">{label}</dt>
      <dd
        dir={ltr === true && value !== null ? 'ltr' : undefined}
        className={
          value === null
            ? 'text-2xs opacity-45'
            : `truncate text-2xs font-semibold ${ltr === true ? 'font-num' : 'bidi-isolate'}`
        }
      >
        {value ?? missing ?? '—'}
      </dd>
    </div>
  );
}
