import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { displayDigits } from '@/lib/arabic';
import { routing } from '@/i18n/routing';
import { serviceByKey } from '@/lib/domain/content';
import { DEFAULT_VAT_PCT } from '@/lib/domain/tax';
import { serviceTotal } from '@/lib/domain/money';
import { currentUserFromCookies } from '@/lib/domain/account';
import { formatNumber } from '@/lib/arabic';
import { RequestService } from '@/components/site/RequestService';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; key: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, key } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const service = await serviceByKey(key);
  if (service === null) return {};
  const isArabic = locale === 'ar';
  return {
    title: isArabic ? service.nameAr : service.nameEn,
    description: isArabic ? service.descAr : service.descEn,
    alternates: { canonical: `/${locale}/services/${key}` },
  };
}

/**
 * Wx — تفاصيل خدمة.
 *
 * **والفهرس كان يعرض ولا يفتح**: تسع بطاقاتٍ تُعرض ولا تُنقر واحدة،
 * ولا صفحة تشرح ما تشمله الخدمة ولا كم ضريبتُها ولا من يؤدّيها.
 * فمن أراد أن يطلبها لم يجد أين — والصنف نفسه الذي وقع في نتائج البحث.
 *
 * ═══ والضريبة تُحسب من مصدرها ═══
 *
 * التصميم يعرض «٣٥٠ + ٥٢٫٥٠ = ٤٠٢٫٥٠». والنسبة من إعدادات المنصّة لا
 * مكتوبةً هنا: نسبةٌ مكتوبة تتباعد عن الإعداد أوّل تغيير، فيقرأ الطالب
 * رقمًا ويُفوتَر بغيره.
 */
export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, key } = await params;
  /**
   * ═══ المركبة تصل من بنر صفحتها ═══
   *
   * من فتح خدمةً من بنر مركبته يقصدها هي — وكان البنر يربط إلى الخدمة
   * **بلا أن يقول أيّ مركبة**، فيصل صاحبُها إلى قائمةٍ تطلب منه أن
   * يختار ما كان يقف عليه قبل نقرة.
   *
   * ولا يُوثق بالمعامل: الملتقط لا يعرض إلّا مركبات صاحب الجلسة، فما
   * لا يطابق واحدةً منها يسقط إلى الأولى.
   */
  const query = await searchParams;
  const askedVehicle = typeof query.vehicle === 'string' ? query.vehicle : undefined;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [service, platform, viewer, t] = await Promise.all([
    serviceByKey(key),
    db.platformSetting.findUnique({ where: { id: 'default' }, select: { vatPct: true } }),
    currentUserFromCookies(),
    getTranslations('services'),
  ]);

  // خدمةٌ غير موجودة أو عُطّلت ⇒ ٤٠٤ لا صفحةٌ فارغة
  if (service === null) notFound();

  const isArabic = locale === 'ar';
  const vatPct = Number(platform?.vatPct ?? DEFAULT_VAT_PCT);
  /**
   * **والقاعدة من `money.ts`** — هي نفسها التي يحجز بها الشراء. وحسابٌ
   * في كل موضعٍ يُنتج قاعدتين تتباعدان أوّل تغيير، فيدفع الطالب غير ما
   * رأى.
   */
  const money = serviceTotal(service.price, vatPct);
  const included = isArabic ? service.includesAr : service.includesEn;
  const price = Number(money.net);
  const vat = Number(money.vat);

  /**
   * مركبات صاحب الجلسة — والاستمارة تُقال فارغةً لمن لا مركبة له،
   * فقائمةٌ خالية تحت «اختر مركبتك» تُحيّر ولا تقول لماذا.
   */
  const vehicles =
    viewer === null
      ? []
      : (
          await db.vehicle.findMany({
            where: { ownerId: viewer.id },
            select: { id: true, brandName: true, modelName: true, year: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        ).map((vehicle) => ({
          id: vehicle.id,
          // check-9-ok: وسم <option> لا يقبل عنصرًا — نصٌّ فقط، و`displayDigits` هي التعريب الصحيح هنا
          title: `${vehicle.brandName} ${vehicle.modelName} ${displayDigits(String(vehicle.year))}`,
        }));

  /** مدن المزوّد — وإن لم يحدّدها فكل مدن المنصّة. */
  const coverage =
    service.providerCities.length > 0
      ? service.providerCities
      : (await db.listing.findMany({ distinct: ['city'], select: { city: true } })).map(
          (row) => row.city,
        );

  return (
    <>
      <SiteHeader active="services" />
      <main className="min-h-screen bg-bg text-ink">
        <div className="page-frame">
          <p className="mb-5 flex flex-wrap items-center gap-2 text-2xs opacity-55">
            <Link href={`/${locale}/services`} className="hover:underline">
              {t('title')}
            </Link>
            <span aria-hidden className="opacity-40">›</span>
            <span>{isArabic ? service.nameAr : service.nameEn}</span>
          </p>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              <h1 className="mb-2 flex flex-wrap items-center gap-2.5 text-3xl font-bold tracking-tight">
                {isArabic ? service.nameAr : service.nameEn}
                {!service.isAutomated ? null : <Badge tone="accent">{t('instant')}</Badge>}
              </h1>
              <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
                {isArabic ? service.descAr : service.descEn}
              </p>

              {/*
                ═══ ما تشمله الخدمة — قبل الدفع لا بعده ═══

                كانت الصفحة تعرض الاسم ووصفًا من سطر ثمّ التكلفة وزرّ
                الدفع. **فمن يدفع خمسمئة ريال مقابل «فحص شامل» لا يعرف
                ما اشترى**: أيشمل المحرك؟ أتجربةَ قيادة؟ أتقريرًا
                مصوّرًا؟ والثمن يُقارَن بما يقابله لا بوصفٍ عامّ.

                **وتُخفى حين تفرغ** — عنوانٌ فوق فراغٍ يُقرأ عطلًا،
                وخدمةٌ بلا بنودٍ تعرض وصفها وحده كما كانت.
              */}
              {included.length === 0 ? null : (
                <section className="mb-7">
                  <h2 className="mb-3.5 text-sm font-bold">{t('includes')}</h2>
                  <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                    {included.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-2xs leading-loose">
                        <CheckIcon />
                        <span className="min-w-0 flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/*
                **والمزوّد يُسمّى.** من يدفع لخدمةٍ يسأل من يؤدّيها —
                وخدمةٌ بلا مزوّدٍ مسمّى تُؤدّى منّا، فيُقال ذلك لا يُترك
                فراغًا.
              */}
              <section className="mb-7 rounded-xl border border-line bg-surface p-5">
                <h2 className="mb-2.5 text-sm font-bold">المزوّد</h2>
                <p className="flex flex-wrap items-center gap-2.5 text-2xs">
                  <span className="bidi-isolate font-bold">
                    {service.providerName ?? 'تُؤدى من كارز'}
                  </span>
                  {service.providerSlaHours === null ? null : (
                    <>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="opacity-60">
                        التزام التنفيذ <Quantity unit="hours" count={service.providerSlaHours} />
                      </span>
                    </>
                  )}
                </p>
                {service.providerCities.length === 0 ? null : (
                  <p className="mt-2.5 text-3xs leading-loose opacity-55">
                    يغطّي: {service.providerCities.join(' · ')}
                  </p>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-5">
              <section className="rounded-xl border-2 border-ink p-5">
                {/*
                  ═══ وسعرٌ يُقرأ بلمحة قبل التفصيل ═══

                  التصميم (Wx) يصدّر اللوحة بـ«٣٥٠ ر.س + ضريبة» ثمّ
                  يُفصّل تحتها. والتفصيل وحده يجعل من يقارن خدمتين
                  يجمع في رأسه قبل أن يقرأ.
                */}
                {Number(service.price) === 0 ? null : (
                  <p className="mb-3.5 flex items-baseline gap-1.5">
                    <Money amount={price} showCurrency={false} size="xl" />
                    <span className="text-2xs opacity-55">ر.س + ضريبة</span>
                  </p>
                )}

                <h2 className="mb-3.5 text-sm font-bold">التكلفة</h2>

                {Number(service.price) === 0 ? (
                  <p className="text-xl font-bold text-accent-700">{t('free')}</p>
                ) : (
                  <>
                    <Row label="الخدمة" value={price} />
                    {/*
                      النسبة من الإعداد لا مكتوبة — فلا تتباعد عنه.
                      **والرقم بالعربية-الهندية**: رقمٌ لاتينيّ قبل كلمة
                      عربية يُقرأ مقلوبًا، والبوابة ١٥ تمنعه.
                    */}
                    <Row
                      label={`ضريبة القيمة المضافة ${displayDigits(String(vatPct))}٪`}
                      value={vat}
                    />
                    <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3 text-base font-bold">
                      <span>الإجمالي</span>
                      {/* **والهللات تُعرض**: ٥١٨ بدل ٥١٧٫٥٠ خطأُ مبلغ لا عرض */}
                      <Money amount={price + vat} showCurrency={false} decimals={2} />
                    </div>
                  </>
                )}

                {/*
                  **ولا زرّ طلبٍ لا يعمل.** طلب الخدمة مبنيٌّ للمركبة من
                  صفحتها (يحتاج مركبةً ومكانًا وموعدًا)، ولا مسار يطلبها
                  مجرّدةً. وزرٌّ يردّ خطأً بعد الضغط أسوأ من غيابه.
                */}
              {/*
                ═══ والطلب هنا لا في صفحةٍ أخرى ═══

                كان زرًّا يقول «اختر مركبتك لطلب الخدمة» ويربط إلى
                فهرس المركبات، وتحته «تُطلب من صفحة المركبة» —
                **وصفحةُ المركبة لا زرّ فيها**. دائرةٌ مغلقة بلا مدخل،
                وخطُّ إيرادٍ كامل لا يدخله ريال.

                والتصميم يضعه هنا: المركبة والموقع والموعد ثم الدفع.
              */}
              <RequestService
                serviceKey={service.key}
                serviceName={locale === 'ar' ? service.nameAr : service.nameEn}
                vehicles={vehicles}
                initialVehicleId={askedVehicle}
                cities={coverage}
                total={formatNumber(Number(money.total), locale, { decimals: 2 })}
                addVehicleHref={`/${locale}/sell`}
              />
              </section>

              {service.slaHours === null ? null : (
                <p className="rounded-lg border border-line bg-surface p-4 text-3xs leading-loose opacity-65">
                  المهلة المعلنة <Quantity unit="hours" count={service.slaHours} /> من لحظة
                  التأكيد.
                </p>
              )}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="opacity-60">{label}</span>
      {/* الهللات تُعرض — فضريبةٌ بـ٦٧٫٥٠ لا تُكتب ٦٨ */}
      <Money amount={value} showCurrency={false} size="sm" decimals={2} />
    </div>
  );
}

/**
 * علامةُ بندٍ مشمول — **صحٌّ لا نقطة**. النقطة تعدّ، والصحّ يقول
 * «هذا لك»؛ وهو الفرق بين قائمةٍ تُقرأ وقائمةٍ تُقنع.
 */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-1 size-3 shrink-0 text-accent-700"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
