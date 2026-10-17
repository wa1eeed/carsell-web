import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { routing } from '@/i18n/routing';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentUserFromCookies } from '@/lib/domain/account';
import { viewingsFor, type ViewingRow } from '@/lib/domain/viewings';
import {
  VIEWING_CANCELLED_BY,
  VIEWING_NEXT_BUYER,
  VIEWING_NEXT_SELLER,
  VIEWING_PERIOD,
  VIEWING_STATUS,
} from '@/lib/labels/viewings';
import { AccountList } from '../AccountList';
import { ViewingActions } from './ViewingActions';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'مواعيد المعاينة', robots: { index: false, follow: false } };
}

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * ═══ مواعيدُ المعاينة — بوجهين في شاشةٍ واحدة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «افعل ما تراه احترافيًّا ويناسب السوق
 * السعودي». **والمعاينةُ لقاءٌ بين طرفي الصفقة** لا خدمةَ مزوّد.
 *
 * **وشاشةٌ واحدة لا شاشتان**: من يبيع ويشتري في المنصّة نفسها لا
 * يتنقّل بين بابين لشيءٍ واحد — وشاشتان متوأمتان تتباعدان أوّل تعديل
 * في إحداهما.
 *
 * **وما يُنتظر منك يتصدّر**: قسمُ «طلبات على إعلاناتك» أوّلًا متى كان
 * فيه ما ينتظر ردّك.
 */
export default async function ViewingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const { asBuyer, asSeller } = await viewingsFor(user.id, locale);
  const awaiting = asSeller.filter((row) => row.status === 'REQUESTED' && !row.past).length;

  return (
    <AccountList
      locale={locale}
      title="مواعيد المعاينة"
      crumb="المعاينات"
      subtitle="مواعيدُ طلبتَها، وطلباتٌ على إعلاناتك. والمعاينةُ لقاءٌ بينك وبين الطرف الآخر — بلا وسيطٍ وبلا رسوم."
      stats={
        /** **والعدّادُ يُحسب بمرشّح ما يفتحه** — لا بكلّ صفٍّ في القائمة */
        <div className="flex flex-wrap gap-6">
          <Stat label="ينتظر ردّك" value={awaiting} />
          <Stat label="طلبتَها" value={asBuyer.length} />
        </div>
      }
      empty={{
        title: 'لا مواعيد',
        description:
          'حين تطلب معاينة سيارةٍ من صفحتها، أو يطلب أحدٌ معاينة مركبتك، يظهر الموعد هنا.',
      }}
    >
      {[
        ...(asSeller.length === 0
          ? []
          : [
              <h2 key="h-seller" className="mt-1 text-sm font-bold">
                طلبات على إعلاناتك
              </h2>,
              ...asSeller.map((row) => (
                <Card key={`s-${row.ref}`} row={row} side="SELLER" />
              )),
            ]),
        ...(asBuyer.length === 0
          ? []
          : [
              <h2 key="h-buyer" className="mt-4 text-sm font-bold">
                مواعيد طلبتَها
              </h2>,
              ...asBuyer.map((row) => (
                <Card key={`b-${row.ref}`} row={row} side="BUYER" />
              )),
            ]),
      ]}
    </AccountList>
  );
}

function Card({ row, side }: { row: ViewingRow; side: 'BUYER' | 'SELLER' }) {
  const next = side === 'SELLER' ? VIEWING_NEXT_SELLER : VIEWING_NEXT_BUYER;
  /**
   * **والحالةُ وانقضاءُ الوقت معًا**: موعدٌ مضى وحالتُه `REQUESTED` لم
   * تلتقطه الوظيفةُ الدورية بعد — فيُعرض «انقضى» لا «ينتظر ردّه»، ولا
   * تُعرض أزرارُه.
   */
  const effective = row.past && row.status === 'REQUESTED' ? 'EXPIRED' : row.status;

  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">
            <span className="bidi-isolate">{row.listingTitle}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs opacity-70">
            <span className="bidi-isolate">{riyadh.format(new Date(row.onDate))}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span>{VIEWING_PERIOD[row.period] ?? row.period}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span>{row.city}</span>
          </p>
        </div>
        <Badge
          tone={
            effective === 'CONFIRMED'
              ? 'accent'
              : effective === 'REQUESTED'
                ? 'warn'
                : effective === 'DECLINED' || effective === 'CANCELLED'
                  ? 'danger'
                  : 'neutral'
          }
        >
          {VIEWING_STATUS[effective] ?? effective}
        </Badge>
      </div>

      <dl className="mt-3.5 flex flex-col gap-2 border-t border-line pt-3.5 text-2xs">
        <Line label={side === 'SELLER' ? 'الطالب' : 'البائع'} value={row.counterpartName ?? '—'} />
        {row.counterpartPhoneTail === null ? null : (
          <Line
            label="جواله"
            value={<span className="bidi-isolate font-num">••••{row.counterpartPhoneTail}</span>}
          />
        )}
        {/*
          **ونقطةُ اللقاء لا تخرج قبل القبول** — والنطاق لا يُدخلها
          الكائنَ أصلًا، فما لا يُجلَب لا يتسرّب.
        */}
        {row.meetingPoint === null ? null : <Line label="نقطة اللقاء" value={row.meetingPoint} />}
        {row.buyerNote === null ? null : <Line label="ملاحظة الطالب" value={row.buyerNote} />}
        {row.declineReason === null ? null : <Line label="سبب الاعتذار" value={row.declineReason} />}
        {row.cancelledBy === null ? null : (
          <Line label="الإلغاء" value={VIEWING_CANCELLED_BY[row.cancelledBy] ?? '—'} />
        )}
        <Line label="ما بعده" value={next[effective] ?? ''} />
      </dl>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={row.listingPath}
          className="-my-1 inline-block py-1 text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          افتح الإعلان
        </Link>
        <span className="font-num text-3xs opacity-65">{row.ref}</span>
      </div>

      {row.past ? null : <ViewingActions ref_={row.ref} side={side} status={row.status} />}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-num text-2xl font-bold">
        <ArabicNumber value={value} />
      </span>
      <span className="text-3xs opacity-65">{label}</span>
    </span>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 opacity-70">{label}</dt>
      <dd className="text-end font-semibold">{value}</dd>
    </div>
  );
}
