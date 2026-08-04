import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountList, AccountRow } from '../AccountList';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'تقارير الفحص', robots: { index: false, follow: false } };
}

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
      subtitle="فحوص مركباتك ونتائجها."
      empty={{
        title: 'لا تقارير',
        description: 'حين تُفحص مركبتك في مركز معتمد يظهر تقريرها هنا بنتيجته وتاريخه.',
      }}
    >
      {data.reports.map((report) => (
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
      ))}
    </AccountList>
  );
}
