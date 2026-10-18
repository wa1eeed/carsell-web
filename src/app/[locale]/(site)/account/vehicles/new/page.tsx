import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { routing } from '@/i18n/routing';
import { CITY_NAMES } from '@/lib/labels/cities';
import { currentUserFromCookies } from '@/lib/domain/account';
import { listSellableBrandOptions } from '@/lib/domain/catalog-options';
import { AddVehicleForm } from './AddVehicleForm';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  // صفحة خاصّة تحمل بيانَ مركبةٍ لصاحبها — لا تُفهرَس
  return { title: 'أضف سيارة', robots: { index: false, follow: false } };
}

/**
 * ═══ أضف سيارة — الشاشة التي كان الزرّ يَعِد بها ═══
 *
 * `POST /api/v1/vehicles` قائمٌ منذ بُني المرآب، **ولا شاشة تناديه
 * إلّا زرٌّ ثانويّ داخل معالج البيع**. وزرُّ «أضف سيارة» في «سياراتي»
 * كان يقود إلى `/sell` — ترويسةٌ تقول «بِع سيارتك» ومعالجٌ من ثلاث
 * خطوات ينتهي بالنشر.
 *
 * ومن يضيف سيارةً إلى حسابه قد لا يبيعها: يطلب عليها فحصًا أو
 * تأمينًا أو تقرير «موجز». فالباب الذي يَعِد به الزرّ يُفتح هنا.
 */
export default async function AddVehiclePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  /**
   * **والماركات ما يُكمَل وحده** — القائمة نفسها التي يقرؤها معالج
   * البيع، وتحتها بابٌ لمن لا يجد ماركته.
   */
  const brands = await listSellableBrandOptions();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-3xl px-10 py-10">
          <Breadcrumb
            label="مسار التنقل"
            separator="›"
            className="mb-6"
            items={[
              { label: 'حسابي', href: `/${locale}/account` },
              { label: 'سياراتي', href: `/${locale}/account/vehicles` },
              { label: 'أضف سيارة' },
            ]}
          />

          <h1 className="mb-1.5 text-3xl font-bold tracking-tight">أضف سيارة</h1>
          {/*
            **وما تفتحه الإضافة يُقال قبلها.** «أضف سيارة» وحدها لا
            تقول لماذا، ومن لا يعرف الأثر لا يُضيف.
          */}
          <p className="mb-8 text-sm leading-loose opacity-70">
            سجل سيارتك في حسابك بدون ما تعرضها للبيع. تقدر تطلب عليها فحصا أو خدمة، وتعرضها
            للبيع وقت ما تحب.
          </p>

          <AddVehicleForm brands={brands} cities={CITY_NAMES} locale={locale} />
        </div>
      </main>
    </>
  );
}
