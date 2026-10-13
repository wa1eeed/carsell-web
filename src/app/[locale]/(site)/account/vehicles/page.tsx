import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Quantity } from '@/components/ui/Quantity';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { myVehicles, garageCounts, type VehicleState } from '@/lib/domain/garage';
import { cityLabel } from '@/lib/labels/cities';
import { AccountList, AccountRow } from '../AccountList';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: 'سياراتي', robots: { index: false, follow: false } };
}

const STATE: Record<VehicleState, { label: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  listed: { label: 'معروضة للبيع', tone: 'accent' },
  garage: { label: 'في المرآب', tone: 'neutral' },
  sold: { label: 'مُباعة', tone: 'neutral' },
};

/**
 * ═══ سياراتي — المرآب الذي يفترضه التصميم ولم يكن ═══
 *
 * بطاقة الحساب في التصميم تقول «٣ مركباتي · ٢ معروضة · ١ في المرآب»،
 * و«سياراتي» أوّلُ بنود شريطه الجانبيّ. ولوحة الأدمن تعدّ شريحة
 * `garage` بتعريف «مركبة بلا إعلان».
 *
 * **والعدّاد كان صفرًا بنيويًّا**: الطريق الوحيد لإنشاء مركبة هو النشر
 * وهو يكتب إعلانًا معها دائمًا. فقِيس ٦١ مركبة و٦١ إعلانًا وصفرًا في
 * المرآب.
 *
 * ═══ ولماذا المرآب قبل الإعلان ═══
 *
 * من يملك سيارةً قد يريد عليها فحصًا أو تأمينًا أو تقرير «موجز» **ولا
 * يريد بيعها**. وربطُ وجودِها في المنصّة بعرضِها للبيع يجعل كلَّ خدمةٍ
 * تمرّ بإعلان — ويُخرج من السوق كلَّ من يريد خدمةً ولا يبيع.
 */
export default async function MyVehiclesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const vehicles = await myVehicles(user.id, locale);
  const counts = garageCounts(vehicles);

  return (
    <AccountList
      locale={locale}
      title="سياراتي"
      subtitle="ما تملكه — اعرضه للبيع أو اطلب عليه خدمة."
      stats={
        counts.total === 0 ? undefined : (
          <p className="flex flex-wrap items-center gap-2.5 text-2xs opacity-65">
            <Quantity unit="cars" count={counts.total} />
            {counts.listed === 0 ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex items-center gap-1.5">
                  <ArabicNumber value={counts.listed} />
                  <span>معروضة</span>
                </span>
              </>
            )}
            {counts.garage === 0 ? null : (
              <>
                <span aria-hidden className="opacity-40">·</span>
                <span className="flex items-center gap-1.5">
                  <ArabicNumber value={counts.garage} />
                  <span>في المرآب</span>
                </span>
              </>
            )}
          </p>
        )
      }
      empty={{
        title: 'سياراتك فارغة',
        description: 'أضف سيارتك لتطلب عليها فحصًا أو تأمينًا — واعرضها للبيع متى شئت.',
      }}
      action={
        <Link href={`/${locale}/sell`}>
          <Button size="sm">أضف سيارة</Button>
        </Link>
      }
    >
      {vehicles.map((vehicle) => {
        const state = STATE[vehicle.state];
        return (
          <AccountRow
            key={vehicle.id}
            /**
             * **والمعروضة تفتح إعلانها، والمرآبيّة لا تفتح شيئًا.**
             * صفٌّ يربط إلى لا شيء أسوأ من صفٍّ لا يربط: الأوّل يَعِد
             * ثم يخيب. والأفعال تحته صريحة.
             */
            href={vehicle.listingRef === null ? null : `/${locale}/account/listings`}
            title={vehicle.title}
            year={vehicle.year}
            badge={<Badge tone={state.tone}>{state.label}</Badge>}
            meta={
              <>
                <span className="bidi-isolate">{cityLabel(vehicle.city, locale)}</span>
                <span aria-hidden className="opacity-40">·</span>
                <Quantity unit="km" count={vehicle.mileageKm} />
                {vehicle.openServices === 0 ? null : (
                  <>
                    <span aria-hidden className="opacity-40">·</span>
                    <span className="flex items-center gap-1.5 text-warn-900">
                      <ArabicNumber value={vehicle.openServices} />
                      <span>خدمة قائمة</span>
                    </span>
                  </>
                )}
              </>
            }
            value={
              <span className="flex flex-wrap items-center justify-end gap-2">
                {/*
                  **والفعل حيث القرار.** من فتح «سياراتي» يريد أن يفعل
                  بسيارةٍ شيئًا — فالزرّان هنا لا في شاشةٍ ثانية.
                */}
                <Link
                  href={`/${locale}/services?vehicle=${encodeURIComponent(vehicle.id)}`}
                  className="relative z-10 rounded-full border border-line px-3.5 py-1.5 text-3xs font-bold hover:border-ink"
                >
                  اطلب خدمة
                </Link>
                {vehicle.state === 'garage' ? (
                  <Link
                    href={`/${locale}/sell`}
                    className="relative z-10 rounded-full bg-ink px-3.5 py-1.5 text-3xs font-bold text-bg"
                  >
                    اعرضها للبيع
                  </Link>
                ) : null}
              </span>
            }
          />
        );
      })}
    </AccountList>
  );
}
