import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { currentUserFromCookies, getAccountData } from '@/lib/domain/account';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { FilterChip } from '@/components/ui/FilterChip';
import { ORDER_GROUPS, orderGroup, orderNeedsBuyer, type OrderGroup } from '@/lib/domain/order-state';
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
  const [data, query] = await Promise.all([getAccountData(user, locale), searchParams]);

  /**
   * ═══ المجموعة من العنوان ═══
   *
   * **والشاشة خادمية، فالترشيح بالعنوان لا بحالةٍ في المتصفّح**: يُشارَك
   * الرابط، ويعمل بلا JS، ويعود إليه زرُّ الرجوع. (ودالّةٌ لا تعبر حدّ
   * الخادم أصلًا — البوابة ٢٢.)
   */
  const asked = typeof query.group === 'string' ? query.group : 'live';
  const group: OrderGroup = (ORDER_GROUPS as readonly string[]).includes(asked)
    ? (asked as OrderGroup)
    : 'live';

  /** العدد من التصنيف نفسه الذي يُرشَّح به — لا شرطان يتباعدان (البوابة ٤٠). */
  const liveCount = data.orders.filter((order) => orderGroup(order.status) === 'live').length;
  const shown = data.orders.filter((order) => orderGroup(order.status) === group);
  const needsAction = data.orders.some((order) => orderNeedsBuyer(order.status, order.stage));

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
      subtitle="كل صفقة ومرحلتها، ووين مبلغها الحين."
      filters={
        <nav className="flex flex-wrap items-center gap-2.5">
          {/*
            **والعدّاد على «قيد الإجراء» وحده.** «الملغاة (٤)» رقمٌ لا
            يُفعل به شيء — والعدد يُعرض حيث يُقرَّر عليه.
          */}
          <FilterChip
            href={`/${locale}/account/orders`}
            active={group === 'live'}
            {...(liveCount === 0 ? {} : { count: liveCount })}
          >
            <span className="flex items-center gap-1.5">
              قيد الإجراء
              {/*
                نقطةٌ تنبض متى كان بينها ما ينتظر فعلًا من صاحبه: دفعًا
                أو تأكيد استلام. و`motion-safe` تُسكتها لمن طلب تقليل
                الحركة — وميضٌ لا يُكتَم إعلانٌ لا تنبيه.
              */}
              {needsAction ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-warn-400 motion-safe:animate-pulse"
                  aria-hidden
                />
              ) : null}
            </span>
          </FilterChip>
          <FilterChip href={`/${locale}/account/orders?group=done`} active={group === 'done'}>
            المكتملة
          </FilterChip>
          <FilterChip
            href={`/${locale}/account/orders?group=cancelled`}
            active={group === 'cancelled'}
          >
            الملغاة
          </FilterChip>
        </nav>
      }
      /*
        **والحالة الفارغة تتبع المجموعة.** «حين تشتري مركبة يظهر طلبها
        هنا» جوابٌ صحيحٌ لمن لا طلبات له — وخاطئٌ لمن له ستّةٌ ورشّح
        إلى «الملغاة» فلم يجد فيها شيئًا.
      */
      empty={
        data.orders.length === 0
          ? {
              title: 'لا طلبات بعد',
              description: 'حين تشتري مركبة يظهر طلبها هنا بمراحله الستّ ومهلة كل مرحلة.',
            }
          : group === 'live'
            ? {
                title: 'لا طلبات قيد الإجراء',
                description: 'الطلبات اللي تنتظر منك شي تلقاها هنا مع مهلتها.',
              }
            : group === 'done'
              ? {
                  title: 'لا طلبات مكتملة',
                  description: 'الصفقات اللي تمت وانتقلت ملكيتها تلقاها هنا مع عقودها.',
                }
              : {
                  title: 'لا طلبات ملغاة',
                  description: 'الطلبات الملغاة تبقى هنا، ومعها سبب الإلغاء.',
                }
      }
      action={
        <Link href={`/${locale}/cars`}>
          <Button size="sm">تصفّح السيارات</Button>
        </Link>
      }
    >
      {shown.map((order) => (
        <AccountRow
          key={order.ref}
          /*
            **والصفّ يفتح الطلب لا الإعلان.** كان `order.path` وهو
            المسار القانونيّ للمركبة — فمن ضغط صفَّ طلبه وصل صفحةَ
            سيارةٍ معروضة، لا طلبَه ومراحله ومهلتَه.
          */
          href={`/${locale}/account/orders/${order.ref}`}
          title={order.title}
          year={order.year}
          badge={<OrderStatusBadge status={order.status} stage={order.stage} />}
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
