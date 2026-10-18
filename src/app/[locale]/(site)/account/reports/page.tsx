import { LinkButton } from '@/components/ui/Button';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountList, AccountRow } from '../AccountList';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { SERVICE_REQUEST_NEXT, SERVICE_REQUEST_STATUS } from '@/lib/labels/services';
import { SERVICE_DONE_BY_TYPE } from '@/lib/labels/completion';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'تقارير الفحص', robots: { index: false, follow: false } };
}

/**
 * **والقائمة كانت ناقصة**: ثلاثُ حالاتٍ من تسع، وما عداها يُعرض مفتاحًا
 * خامًا. والصياغة في `labels/services.ts` تقرؤها هذه الشاشة وصفحةُ
 * الطلب معًا — ونسختان تتباعدان أوّل حالٍ تُضاف.
 */

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/** التقرير يبقى وإن سُحب إعلانه — **وملكه لا يزول بزوال العرض**. */
export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const data = await getAccountData(user, locale);

  return (
    <AccountList
      locale={locale}
      title="تقارير الفحص"
      crumb="تقاريري"
      subtitle="فحوص مركباتك ونتائجها."
      empty={{
        title: 'لا تقارير',
        description: 'حين تفحص مركبتك في مركز معتمد يظهر تقريرها هنا بنتيجته وتاريخه.',
      }}
      action={
        <LinkButton href={`/${locale}/services/inspection`} size="sm">اطلب تقريرا</LinkButton>
      }
    >
      {/*
        ═══ القائم قبل المنتهي ═══

        هذه الشاشة كانت تعرض `InspectionReport` وحدها — أي ما انتهى.
        ومن دفع خمسمئة ريال واختار موعدًا لا يرى طلبَه في المنتج كلّه
        حتى يصدر التقرير. **ورسالةُ النجاح تقول «وتتابعه من ‹تقاريري›»**
        — فالشاشة تَعِد بمتابعةٍ لا تقع.

        والموعد والمدينة يُعرضان: هما ما سألناه عنه، وبهما يعرف أين
        يكون ومتى.
      */}
      {[
        ...data.serviceRequests.map((request) => (
        <AccountRow
          key={request.ref}
          /**
            ═══ والمعروضُ يُفتح ═══

            كان `null` — فيقرأ من طلب فحصًا مرجعَه ولا يستطيع فتحه،
            ولا يعرف أينتظر إذنًا أم سدادًا أم تقريرًا. **والعدّاد
            يربط إلى شاشة أو لا يُعرض.**
          */
          href={`/${locale}/account/reports/${encodeURIComponent(request.ref)}`}
          title={`${request.serviceName}${request.title === '' ? '' : ` — ${request.title}`}`}
          meta={
            <>
              <span dir="ltr" className="font-num">{request.ref}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span>{SERVICE_REQUEST_STATUS[request.status] ?? request.status}</span>
              {request.city === null ? null : (
                <>
                  <span aria-hidden className="opacity-40">·</span>
                  <span>{request.city}</span>
                </>
              )}
              {request.scheduledAt === null ? null : (
                <>
                  <span aria-hidden className="opacity-40">·</span>
                  <span>{riyadh.format(new Date(request.scheduledAt))}</span>
                </>
              )}
            </>
          }
          /*
            **و«بانتظار التقرير» كانت تُقال لكل حال** — حتى لمن رُفض
            طلبُه، فيقرأ أنه ينتظر تقريرًا لن يأتي.
          */
          value={
            <span className="text-2xs opacity-70">
              {/*
                **و«التقرير جاهز» كانت تُقال لكل صنف** — فناقلٌ أوصل
                مركبةً ومصوّرٌ سلّم صورًا يقول لصاحبهما إنّ تقريرًا جاهز،
                ولا تقريرَ في الدنيا.
              */}
              {request.status === 'DONE' && request.providerType !== null
                ? (SERVICE_DONE_BY_TYPE[request.providerType] ?? SERVICE_REQUEST_NEXT.DONE)
                : (SERVICE_REQUEST_NEXT[request.status] ?? '')}
            </span>
          }
        />
        )),
        ...data.reports.map((report) => (
        <AccountRow
          key={report.ref}
          href={report.path}
          title={report.title}
          meta={
            <>
              <span dir="ltr" className="font-num">{report.ref}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span>{report.inspectedAt}</span>
            </>
          }
          value={
            <span className="font-num text-lg font-bold">
              <ArabicNumber value={report.score} grouped={false} />
            </span>
          }
        />
      )),
      ]}
    </AccountList>
  );
}
