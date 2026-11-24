import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { LinkButton } from '@/components/ui/Button';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies, favoriteListings } from '@/lib/domain/account';
import { Badge } from '@/components/ui/Badge';
import { Duration } from '@/components/ui/Duration';
import { AccountList, AccountRow, Money } from '../AccountList';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'المفضلة', robots: { index: false, follow: false } };
}

/** **كانت تُعدّ ولا تُقرأ** — بطاقة الحساب تعرض عددًا يربط إلى ٤٠٤. */
export default async function FavoritesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const favorites = await favoriteListings(user.id, locale);

  return (
    <AccountList
      locale={locale}
      title="المفضلة"
      subtitle="ما حفظته للرجوع إليه."
      empty={{
        title: 'لا مركبات محفوظة',
        description: 'احفظ ما يعجبك أثناء التصفح ليظهر هنا بسعره وحاله.',
      }}
      action={
        <LinkButton href={`/${locale}/cars`} size="sm">تصفح السيارات</LinkButton>
      }
    >
      {favorites.map((item) => (
        <AccountRow
          key={item.ref}
          href={item.path}
          title={item.title}
          year={item.year}
          badge={
            /*
              ═══ المزادُ أوّلًا — فهو ما يحتاج فعلًا الآن ═══

              ترميز `Wu` يضع «في مزاد · ينتهي غدًا». ومن حفظ مركبةً
              في مزادٍ يغلق غدًا يحتاج أن يعرف **قبل** أن يفوته، لا أن
              يفتح الصفّ ليكتشف.

              **والمسحوبُ يبقى ويُقال** — حذفُه يوهم المستخدم أنه لم
              يحفظه. والمبيعُ غيرُ المسحوب: الأوّل انتهى بثمن، والثاني
              أخفاه صاحبُه.
            */
            item.auctionMinutesLeft !== null ? (
              <Badge tone="warn">
                {/*
                  **واليومُ وغدًا بكلمتيهما.** «ينتهي بعد يوم واحد»
                  عربيّةٌ ثقيلة، والترميز يكتب «ينتهي غدًا». وما جاوزهما
                  يُقال بمدّته — **والجارُّ مكتوب**: «ينتهي يومان» خطأ،
                  و«بعد» تحكم ما يليها فيصير «يومين» (`genitive`).
                */}
                في مزاد · ينتهي{' '}
                {item.auctionEndsInDays === 0 ? (
                  'اليوم'
                ) : item.auctionEndsInDays === 1 ? (
                  'غدا'
                ) : (
                  <>
                    بعد <Duration minutes={item.auctionMinutesLeft} genitive />
                  </>
                )}
              </Badge>
            ) : item.sold ? (
              <Badge tone="neutral">بيعت</Badge>
            ) : item.available ? undefined : (
              <Badge tone="warn">لم تعد معروضة</Badge>
            )
          }
          meta={<span>{item.city}</span>}
          value={<Money amount={item.price} />}
        />
      ))}
    </AccountList>
  );
}
