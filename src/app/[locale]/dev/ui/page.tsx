import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { ReactNode } from 'react';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge, InspectedBadge } from '@/components/ui/Badge';
import { CarCard, CarRow, type ListingCardData } from '@/components/ui/CarCard';
import { Countdown } from '@/components/ui/Countdown';
import { Percent, Quantity } from '@/components/ui/Quantity';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { PlateBadge } from '@/components/ui/PlateBadge';
import { RangeBar } from '@/components/ui/RangeBar';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { SpecRow, StatCard } from '@/components/ui/StatCard';
import { StageTracker } from '@/components/ui/StageTracker';
import { Toast } from '@/components/ui/Toast';
import { ADMIN_NAV } from '@/components/admin/AdminShell';
import { DevInteractive } from './DevInteractive';
import { routing } from '@/i18n/routing';

/**
 * `/dev/ui` — كل حالة لكل مكوّن.
 * هذه أداة المراجعة البصرية: تُفتح بجانب بطاقة التصميم ويُقارَن.
 * لا تُنشر في الإنتاج — تُحجب في المهمة ٢٨ مع بقية مسارات التطوير.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-7">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Case({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-2 p-4">
      <p className="text-3xs font-bold tracking-[0.14em] opacity-45">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** مواعيد واقعية — لا ٢٠٩٩، فالعدّاد يجب أن يُقرأ لا أن يُحسب. */
const SOON = new Date(Date.now() + 4 * 3600 * 1000 + 14 * 60 * 1000).toISOString();
const LATER = new Date(Date.now() + 3 * 86400 * 1000 + 4 * 3600 * 1000).toISOString();

const CAR: ListingCardData = {
  ref: 'ADS2026A0005',
  title: 'تويوتا كامري GLE ٢٠٢٤',
  city: 'الرياض',
  mileageKm: 3456,
  transmission: 'أوتوماتيك',
  price: 145_000,
  monthly: 3120,
  type: 'NEGOTIATION',
  inspected: true,
  imageCount: 16,
  sellerName: 'معرض الصفوة',
  sellerVerified: true,
};

const AUCTION_CAR: ListingCardData = {
  ...CAR,
  ref: 'ADS2026A0012',
  title: 'نيسان باترول ٢٠٢٢',
  type: 'AUCTION',
  highestBid: 208_500,
  bidderCount: 4,
  endsAt: SOON,
  sellerName: 'خالد العتيبي',
  sellerVerified: false,
};

const TEXT_SCALE = [
  ['text-3xs', '8.5'],
  ['text-2xs', '9.5'],
  ['text-xs', '10.5'],
  ['text-sm', '11.5'],
  ['text-base', '12.5'],
  ['text-md', '13.5'],
  ['text-lg', '15'],
  ['text-xl', '17'],
  ['text-2xl', '20'],
  ['text-3xl', '22'],
  ['text-4xl', '26'],
  ['text-5xl', '32'],
  ['text-6xl', '36'],
] as const;

const SPACE_SCALE = [
  ['p-0.5', '2'],
  ['p-1', '4'],
  ['p-1.5', '6'],
  ['p-2', '8'],
  ['p-2.5', '10'],
  ['p-3', '12'],
  ['p-3.5', '14'],
  ['p-4', '16'],
  ['p-4.5', '18'],
  ['p-5', '20'],
  ['p-5.5', '22'],
  ['p-6', '24'],
  ['p-8', '32'],
  ['p-10', '40'],
] as const;

export default async function DevUiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('dev');

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-10 py-10">
        <header>
          <h1 className="text-5xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="mt-2.5 max-w-xl text-base opacity-65">{t('subtitle')}</p>
        </header>

        {/* ═══ السلالم ═══ */}
        <Section title={t('scales')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Case label="أحجام النص">
              <div className="flex w-full flex-col gap-2">
                {TEXT_SCALE.map(([cls, px]) => (
                  <div key={cls} className="flex items-baseline gap-3">
                    <span className="w-20 text-3xs opacity-45">{cls}</span>
                    <ArabicNumber value={px} className="w-8 text-3xs opacity-45" />
                    <span className={cls}>الأرقام ١٢٣ والحروف</span>
                  </div>
                ))}
              </div>
            </Case>
            <Case label="المسافات">
              <div className="flex w-full flex-col gap-1.5">
                {SPACE_SCALE.map(([cls, px]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="w-20 text-3xs opacity-45">{cls}</span>
                    <ArabicNumber value={px} className="w-8 text-3xs opacity-45" />
                    <span
                      className="h-2.5 rounded-full bg-accent"
                      style={{ width: `${Number(px) * 3}px` }}
                    />
                  </div>
                ))}
              </div>
            </Case>
          </div>
        </Section>

        {/* ═══ الذرّية ═══ */}
        <Section title={t('atomic')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Case label="Money — عادي · مشطوب · سالب أخضر · مقاسات">
              <Money amount={145000} />
              <Money amount={162000} struck />
              <Money amount={7000} negative />
              <Money amount={145000} size="sm" />
              <Money amount={145000} size="xl" />
            </Case>

            <Case label="ArabicNumber — صحيح · كسري · بلا فواصل">
              <ArabicNumber value={18400} className="text-2xl font-bold" />
              <ArabicNumber value={2.5} decimals={1} className="text-2xl font-bold" />
              <ArabicNumber value={2026} grouped={false} className="text-2xl font-bold" />
            </Case>

            <Case label="Badge — الأنغام الخمسة + مفحوصة">
              <Badge>مباشر</Badge>
              <Badge tone="accent">تفاوض</Badge>
              <Badge tone="warn">قيد المراجعة</Badge>
              <Badge tone="danger">مرفوض</Badge>
              <Badge tone="ink">مزاد</Badge>
              <InspectedBadge />
            </Case>

            <Case label="PlateBadge — sm ٨٢ · md ١٢٠ · lg ١٨٠ · المكافئ اللاتيني مشتقّ">
              <PlateBadge letters="أ ب ح" numbers="1234" size="sm" />
              <PlateBadge letters="أ ب ح" numbers="1234" size="md" />
              <PlateBadge letters="ب س د" numbers="4444" size="lg" />
              <PlateBadge letters="م ص ط" numbers="9078" size="md" />
            </Case>

            <Case label="Countdown — دون ٢٤ ساعة: HH:MM:SS · فوقها: أيام وساعات">
              <Countdown endsAt={SOON} />
              <Countdown endsAt={SOON} tone="warn" />
              <Countdown endsAt={SOON} tone="plain" />
              <Countdown endsAt={LATER} tone="warn" />
            </Case>

            <Case label="Quantity — الجمع العربي بحالاته الست">
              <div className="flex w-full flex-col gap-1.5 text-sm">
                {[0, 1, 2, 3, 9, 11, 38, 100].map((n) => (
                  <Quantity key={n} unit="orders" count={n} />
                ))}
              </div>
            </Case>

            <Case label="Percent — الإشارة والرقم والعلامة مقطع واحد">
              <Percent value={18} className="text-2xl font-bold text-accent-700" />
              <Percent value={-40} className="text-2xl font-bold text-warn-700" />
              <Percent value={180} className="text-2xl font-bold text-accent-700" />
              <Percent value={0} className="text-2xl font-bold opacity-55" />
            </Case>

            <Case label="ScoreRing — sm · md · lg · عتبات اللون">
              <ScoreRing score={92} size="sm" />
              <ScoreRing score={92} />
              <ScoreRing score={68} />
              <ScoreRing score={41} />
              <ScoreRing score={92} size="lg" />
            </Case>
          </div>

          <DevInteractive />
        </Section>

        {/* ═══ المركّبة ═══ */}
        <Section title={t('composite')}>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="إجمالي المبيعات"
              value={14_200_000}
              delta={18}
              breakdown={[
                { label: 'بيع مباشر', value: 6_100_000 },
                { label: 'تفاوض', value: 5_400_000 },
              ]}
            />
            <StatCard label="مهلة متجاوزة" value={9} tone="warn" delta={-4} unit="طلب" />
            <StatCard
              label="نقد الضمان"
              value={2_300_000}
              tone="ink"
              breakdown={[{ label: 'محتجز جارٍ', value: 1_720_000 }]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Case label="CarCard — تفاوض · مفحوصة">
              <CarCard data={CAR} className="w-full" />
            </Case>
            <Case label="CarCard — مزاد بعدّاد">
              <CarCard data={AUCTION_CAR} className="w-full" />
            </Case>
            <Case label="CarCard — مموّل">
              <CarCard data={{ ...CAR, inspected: false }} sponsored className="w-full" />
            </Case>
          </div>

          <Case label="CarRow — عرض القائمة">
            <CarRow data={CAR} className="w-full" />
          </Case>

          <div className="grid gap-4 md:grid-cols-2">
            <Case label="SpecRow — جدول المواصفات">
              <div className="w-full">
                <SpecRow label="الماركة والطراز">تويوتا · كامري</SpecRow>
                <SpecRow label="سنة الصنع">
                  <ArabicNumber value={2024} grouped={false} />
                </SpecRow>
                <SpecRow label="الممشى">
                  <ArabicNumber value={3456} /> كم
                </SpecRow>
                <SpecRow label="ناقل الحركة">أوتوماتيك</SpecRow>
              </div>
            </Case>

            <Case label="RangeBar — داخل النطاق">
              <div className="w-full">
                <RangeBar
                  price={145_000}
                  stats={{ p10: 128_000, p25: 136_000, p50: 152_000, p75: 161_000, p90: 170_000, sampleSize: 26 }}
                />
              </div>
            </Case>

            <Case label="RangeBar — خارج النطاق (مثبّت عند الطرف)">
              <div className="w-full">
                <RangeBar
                  price={195_000}
                  stats={{ p10: 128_000, p25: 136_000, p50: 152_000, p75: 161_000, p90: 170_000, sampleSize: 26 }}
                />
              </div>
            </Case>

            <Case label="RangeBar — عيّنة < ٨ ⇒ لا شيء يُعرض">
              <div className="w-full text-2xs opacity-45">
                <RangeBar
                  price={145_000}
                  stats={{ p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, sampleSize: 3 }}
                />
                البطاقة مخفية عمدًا — لا متوسط من ثلاث صفقات.
              </div>
            </Case>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Case label="StageTracker — أفقي">
              <div className="w-full">
                <StageTracker current="PAYMENT" />
              </div>
            </Case>
            <Case label="StageTracker — رأسي">
              <StageTracker current="INSPECTION" orientation="vertical" />
            </Case>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Case label="Toast — نجاح · خطأ · معلومة">
              <div className="flex w-full flex-col gap-2.5">
                <Toast tone="success" title="نُشر إعلانك" description="ظهر في نتائج البحث الآن." />
                <Toast tone="error" title="تعذّر الحفظ" description="راجع الحقول المعلَّمة." />
                <Toast tone="info" title="مهلة الدفع تقترب" />
              </div>
            </Case>
            <Case label="EmptyState">
              <EmptyState
                title="لا نتائج مطابقة"
                description="جرّب توسيع نطاق السعر أو إزالة بعض الفلاتر."
                className="w-full"
              />
            </Case>
          </div>
        </Section>

        {/* ═══ الأصداف ═══ */}
        <Section title={t('shells')}>
          <Case label="AdminShell — قائمة التنقّل: أربع مجموعات وثلاثون بندًا">
            <div className="grid w-full gap-4 md:grid-cols-4">
              {ADMIN_NAV.map((group) => (
                <div key={group.title} className="rounded-lg bg-ink p-3.5 text-bg">
                  <p className="px-1 pb-2 text-3xs font-bold tracking-[0.16em] opacity-38">
                    {group.title}
                  </p>
                  {group.items.map((item) => (
                    <p
                      key={item.label}
                      className={`flex items-center gap-2 rounded-sm px-1 py-1.5 text-3xs ${
                        item.href === null ? 'opacity-28' : 'opacity-70'
                      }`}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === null ? <span>قريبًا</span> : null}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Case>
        </Section>
      </div>
    </main>
  );
}
