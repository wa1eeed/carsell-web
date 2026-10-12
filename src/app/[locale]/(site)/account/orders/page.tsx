import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { AccountList, AccountRow, Money } from '../AccountList';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'طلباتي', robots: { index: false, follow: false } };
}

/**
 * **القائمة التي كانت ٤٠٤** — وصفحة الطلب المفرد مبنيّة منذ المهمة ١٨.
 * فمن فتح طلبًا وأغلق التبويب لا يجد طريقًا يعود به إليه.
 */
export default async function OrdersPage({
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

  const date = new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <AccountList
      locale={locale}
      title="طلباتي"
      subtitle="كل صفقة ومرحلتها وأين مبلغها الآن."
      empty={{
        title: 'لا طلبات بعد',
        description: 'حين تشتري مركبة يظهر طلبها هنا بمراحله الستّ ومهلة كل مرحلة.',
      }}
      action={
        <Link href={`/${locale}/cars`}>
          <Button size="sm">تصفّح السيارات</Button>
        </Link>
      }
    >
      {data.orders.map((order) => (
        <AccountRow
          key={order.ref}
          href={order.path}
          title={order.title}
          year={order.year}
          badge={{
            text: te(`orderStage.${order.stage}`),
            tone: order.stage === 'DONE' ? 'accent' : 'neutral',
          }}
          meta={
            <>
              {/* المرجع يُنسخ ويُقارن — لاتينيّ معزول */}
              <span dir="ltr" className="font-num">{order.ref}</span>
              <span aria-hidden className="opacity-40">·</span>
              {/*
                **والتاريخ يُصاغ.** كان يُطبع خامًا كما يصل من النطاق
                — `2026-09-15T09:00:00.000Z` في شاشةٍ يقرؤها مشترٍ
                عن صفقته. والنطاق يعيد ISO وهو الصحيح، والصياغة في
                الشاشة التي تعرف اللغة.
              */}
              <span className="font-num">{date.format(new Date(order.createdAt))}</span>
            </>
          }
          value={<Money amount={order.amount} />}
        />
      ))}
    </AccountList>
  );
}
