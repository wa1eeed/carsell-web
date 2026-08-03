import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { getOrder } from '@/lib/domain/orders';
import { OrderScreen } from './OrderScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  // صفحة خاصّة بطرفَي الطلب — لا تُفهرَس
  return { title: ref, robots: { index: false, follow: false } };
}

/**
 * Wj — صفحة الطلب.
 *
 * **المرحلة من قاعدة البيانات ومدّة البقاء محسوبة** (معيار القبول):
 * تخزين «منذ ٣ أيام» يجعلها تكذب بعد ساعة.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const [order, t] = await Promise.all([
    getOrder(ref, user.id, locale),
    getTranslations('order'),
  ]);

  // غير الطرفين يرى ٤٠٤ لا ٤٠٣: وجود الطلب نفسه معلومة
  if (order === null) notFound();

  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-page px-10 py-10">
          <h1 className="font-num mb-1.5 text-3xl font-bold tracking-tight">{order.ref}</h1>
          <p className="mb-8 text-sm opacity-60">{t('subtitle')}</p>

          <OrderScreen
            order={order}
            formatted={{
              createdAt: date.format(new Date(order.createdAt)),
              stageEnteredAt: date.format(new Date(order.stageEnteredAt)),
              paymentDueAt:
                order.paymentDueAt === null ? null : date.format(new Date(order.paymentDueAt)),
              slaDueAt:
                order.dispute === null ? null : date.format(new Date(order.dispute.slaDueAt)),
            }}
          />
        </div>
      </main>
    </>
  );
}
