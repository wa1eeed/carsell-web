import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
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

  return (
    <AccountList
      locale={locale}
      title="طلباتي"
      subtitle="كل صفقة ومرحلتها وأين مبلغها الآن."
      empty={{
        title: 'لا طلبات بعد',
        description: 'حين تشتري مركبة يظهر طلبها هنا بمراحله الستّ ومهلة كل مرحلة.',
      }}
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
              <span>{order.createdAt}</span>
            </>
          }
          value={<Money amount={order.amount} />}
        />
      ))}
    </AccountList>
  );
}
