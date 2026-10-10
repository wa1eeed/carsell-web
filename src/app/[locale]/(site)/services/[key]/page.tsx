import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { toArabicDigits } from '@/lib/arabic';
import { routing } from '@/i18n/routing';
import { serviceByKey } from '@/lib/domain/content';
import { DEFAULT_VAT_PCT } from '@/lib/domain/tax';
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
export default async function ServiceDetailPage({ params }: { params: Params }) {
  const { locale, key } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [service, platform, t] = await Promise.all([
    serviceByKey(key),
    db.platformSetting.findUnique({ where: { id: 'default' }, select: { vatPct: true } }),
    getTranslations('services'),
  ]);

  // خدمةٌ غير موجودة أو عُطّلت ⇒ ٤٠٤ لا صفحةٌ فارغة
  if (service === null) notFound();

  const isArabic = locale === 'ar';
  const price = Number(service.price);
  const vatPct = Number(platform?.vatPct ?? DEFAULT_VAT_PCT);
  const vat = Math.round(price * vatPct) / 100;

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
                **والمزوّد يُسمّى.** من يدفع لخدمةٍ يسأل من يؤدّيها —
                وخدمةٌ بلا مزوّدٍ مسمّى تُؤدّى منّا، فيُقال ذلك لا يُترك
                فراغًا.
              */}
              <section className="mb-7 rounded-xl border border-line bg-surface p-5">
                <h2 className="mb-2.5 text-sm font-bold">المزوّد</h2>
                <p className="flex flex-wrap items-center gap-2.5 text-2xs">
                  <span className="bidi-isolate font-bold">
                    {service.providerName ?? 'تُؤدّى من carsell.one'}
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
                      label={`ضريبة القيمة المضافة ${toArabicDigits(String(vatPct))}٪`}
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
                <Link href={`/${locale}/cars`} className="mt-4 block">
                  <Button className="w-full">اختر مركبتك لطلب الخدمة</Button>
                </Link>
                <p className="mt-2.5 text-3xs leading-loose opacity-55">
                  تُطلب من صفحة المركبة — فالموعد والموقع يتبعانها.
                </p>
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
