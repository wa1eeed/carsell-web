import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/Badge';
import { FilterChip } from '@/components/ui/FilterChip';
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
  garage: { label: 'مخفية عن السوق', tone: 'neutral' },
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
const TABS = ['listed', 'garage', 'sold'] as const;
type Tab = (typeof TABS)[number];

/**
 * ═══ التسمية — قرار المالك ═══
 *
 * **«مخفية عن السوق»** لا «في المرآب» ولا «خارج السوق». وهي تقول ما
 * وقع فعلًا: السيارة عند صاحبها ولا يراها أحد — بينما «خارج السوق»
 * تُقرأ إقصاءً كأنها أُخرجت.
 *
 * وملفّ التصميم يكتب «في المرآب»، وهذا تجاوزٌ مقصود من المالك مسجَّلٌ
 * في `DESIGN-DECISIONS`. **والاسم واحدٌ في كل موضع**: التبويب والوسم
 * على البطاقة وبطاقة الحساب — فاسمان لحالٍ واحدة يجعل القارئ يظنّهما
 * حالين.
 */
const TAB_LABEL: Record<Tab, string> = {
  listed: 'معروضة',
  garage: 'مخفية عن السوق',
  sold: 'مباعة',
};

export default async function MyVehiclesPage({
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

  const [vehicles, query] = await Promise.all([myVehicles(user.id, locale), searchParams]);
  const counts = garageCounts(vehicles);

  /**
   * **والترشيح بالعنوان لا بحالةٍ في المتصفّح**: الشاشة خادمية،
   * ويُشارَك الرابط، ويعمل بلا JS، ويعود إليه زرُّ الرجوع.
   */
  const asked = typeof query.tab === 'string' ? query.tab : 'listed';
  const tab: Tab = (TABS as readonly string[]).includes(asked) ? (asked as Tab) : 'listed';

  /** العدد من التصنيف نفسه الذي يُرشَّح به — لا شرطان يتباعدان. */
  const countOf = (which: Tab): number =>
    vehicles.filter((row) => row.state === which).length;
  const shown = vehicles.filter((row) => row.state === tab);

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
                  <span>مخفية</span>
                </span>
              </>
            )}
          </p>
        )
      }
      filters={
        counts.total === 0 ? undefined : (
          <nav className="flex flex-wrap items-center gap-2.5">
            {TABS.map((key) => {
              const count = countOf(key);
              return (
                <FilterChip
                  key={key}
                  href={
                    key === 'listed'
                      ? `/${locale}/account/vehicles`
                      : `/${locale}/account/vehicles?tab=${key}`
                  }
                  active={tab === key}
                  {...(count === 0 ? {} : { count })}
                >
                  {TAB_LABEL[key]}
                </FilterChip>
              );
            })}
          </nav>
        )
      }
      /*
        **والحالة الفارغة تتبع التبويب.** «سياراتك فارغة» جوابٌ صحيح
        لمن لا سيارة له، وخاطئٌ لمن له أربع ورشّح إلى «مباعة» فلم يجد
        فيها شيئًا.
      */
      empty={
        counts.total === 0
          ? {
              title: 'سياراتك فارغة',
              description: 'أضف سيارتك لتطلب عليها فحصًا أو تأمينًا — واعرضها للبيع متى شئت.',
            }
          : tab === 'listed'
            ? {
                title: 'لا سيارة معروضة',
                description: 'ما تعرضه للبيع يظهر هنا مع إعلانه.',
              }
            : tab === 'garage'
              ? {
                  title: 'لا سيارة مخفية',
                  description: 'كل سياراتك معروضة أو مباعة — وما تضيفه ولا تعرضه يظهر هنا.',
                }
              : {
                  title: 'لا سيارة مباعة',
                  description: 'ما تمّ بيعه ونُقلت ملكيته يظهر هنا.',
                }
      }
      action={
        <Link href={`/${locale}/sell`}>
          <Button size="sm">أضف سيارة</Button>
        </Link>
      }
    >
      {shown.map((vehicle) => {
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
