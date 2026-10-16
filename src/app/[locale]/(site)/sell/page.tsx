import { getTranslations, setRequestLocale } from 'next-intl/server';
import { deadline } from '@/lib/domain/deadlines';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { db } from '@/lib/db';
import { listSellableBrandOptions } from '@/lib/domain/catalog-options';
import { isFeatureOn } from '@/lib/env';
import { routing } from '@/i18n/routing';
import { currentUserFromCookies } from '@/lib/domain/account';
import { sellingAllowance } from '@/lib/domain/entitlements';
import { taxProfileOf } from '@/lib/domain/tax-profile';
import { auctionSettings } from '@/lib/domain/admin-auction-settings';
import { SellWizard } from './SellWizard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'sell' });
  return { title: `${t('title')} ${t('titleTail')}` };
}

/**
 * Wh — بِع سيارتك.
 *
 * **الجلب يفشل ⇒ إدخال يدوي** (معيار القبول). والمسار اليدوي ليس بديلًا
 * احتياطيًا بل مسارٌ أول من الدرجة نفسها: تكامل بيانات المركبات ليس
 * قائمًا في المرحلة الأولى، وأي بائع قد يحمل مركبة لا يعرفها أي مزوّد.
 */
export default async function SellPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // النشر يحتاج حسابًا — والتصفّح لا (Wm)
  const user = await currentUserFromCookies();
  if (user === null) redirect(`/${locale}/auth`);

  const [brands, cities, stats, auction, t] = await Promise.all([
    listSellableBrandOptions(),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' }, _count: { _all: true } })
      .then((rows) => rows.map((row) => row.city).sort()),
    db.priceStat.aggregate({ _avg: { daysToSellMedian: true } }),
    auctionSettings(),
    getTranslations('sell'),
  ]);

  const medianDays = Math.round(stats._avg.daysToSellMedian ?? 0);

  /**
   * نسبةُ عمولة البائع السارية — من `CommissionRule` نفسها التي
   * يقرؤها `computeOrderAmounts`. والقواعد تُضاف ولا تُعدَّل، فالأحدث
   * سريانًا هي السارية، والمعطَّلة تعني صفرًا لا نسبةً قديمة.
   */
  const rule = await db.commissionRule.findFirst({
    where: { scope: 'global', side: 'SELLER', activeFrom: { lte: new Date() } },
    orderBy: { activeFrom: 'desc' },
    select: { pct: true, enabled: true },
  });
  const sellerCommissionPct = rule === null || !rule.enabled ? 0 : Number(rule.pct);
  const vinLookup = isFeatureOn('VIN_LOOKUP');

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <section className="bg-ink text-bg">
          <div className="page-frame py-11">
            <h1 className="mb-5 max-w-2xl text-display leading-tight font-extrabold tracking-tight">
              {t('title')}
              <span className="block opacity-70">{t('titleTail')}</span>
            </h1>

            {/*
              ═══ وسطرُ الصدر يقول ما يحتاجه البائع قبل أن يبدأ ═══

              التصميم يضع تحت العنوان فقرةً تقول ثلاثًا: النشر مجاني،
              والدفع عبر الضمان، والسعر مقترحٌ من صفقات حقيقية. وكان
              الصدر عنوانًا وأرقامًا بلا جملةٍ واحدة — فمن يقف عليه أوّل
              مرّة لا يعرف أيأخذ منه مالًا أم لا.

              **وجلبُ الرقم التسلسلي خلف راية**، فلا يُوعَد به وهو
              مُطفأ: وعدٌ لا يجد صاحبُه حقلَه أسوأ من سطرٍ أقصر.
            */}
            <p className="mb-7 max-w-2xl text-sm leading-loose opacity-75">
              {vinLookup ? t('leadVin') : t('lead')}
            </p>

            <dl className="flex flex-wrap gap-9">
              {[
                /**
                 * **والعمولة من قاعدتها لا مكتوبةً بيد.** كانت `0`
                 * حرفيًّا تحت عنوانٍ يقول «ومن دون عمولة» — وأوّلُ
                 * نسبةٍ يضبطها الأدمن تجعل الصدر يَعِد بما يناقضه
                 * الطلب، بلا تغييرِ سطرٍ وبلا ما يُنبّه أحدًا.
                 */
                { key: 'commission', value: sellerCommissionPct, percent: true },
                { key: 'days', value: medianDays, percent: false },
                { key: 'minutes', value: 5, percent: false },
              ].map((stat) => (
                <div key={stat.key}>
                  <dd className="flex items-baseline text-3xl leading-none font-bold">
                    <ArabicNumber value={stat.value} percent={stat.percent} />
                  </dd>
                  <dt className="mt-1.5 text-2xs opacity-70">{t(`stat.${stat.key}`)}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="page-frame">
          <SellWizard
            /*
              **وحدود المزاد من اللوحة لا من رقمٍ في المعالج.** المدد
              المتاحة وأدنى فرقٍ بين مزايدتين والعربون كلُّها في إعدادات
              المزادات — ونسخُها هنا يُنتج مصدرَي حقيقةٍ يتباعدان أوّل
              تغيير، فيعرض المعالج مدّةً يرفضها الخادم.
            */
            auctionLimits={{
              durationsDays: auction.durationsDays,
              minIncrement: auction.minIncrement,
              defaultDeposit: auction.defaultDeposit,
              buyNowBeforeReserve: auction.buyNowBeforeReserve,
              extendWindowSeconds: auction.extendWindowSeconds,
              extendBySeconds: auction.extendBySeconds,
            }}
            /*
              ═══ قواعدُ المنصّة تُعرض بقيمها الحيّة ═══

              التصميم يعرض في خطوة البيع «مهلة العرض ٤٨ ساعة» و«رسوم
              النقل ٢٠٠ ر.س» — **وهي قواعد لا خيارات**. فتُقرأ من
              مصدرها لا تُكتب رقمًا في الشاشة: رقمٌ منسوخ يتباعد عن
              الإعداد أوّل تغيير، فيَعِد البائع بمهلةٍ غير التي تقع.
            */
            rules={{
              offerTtlHours: await deadline('offerTtlHours'),
              paymentWindowHours: await deadline('paymentWindowHours'),
              transferFee: Number(
                (await db.platformSetting.findUnique({ where: { id: 'default' } }))?.transferFee ?? 0,
              ),
            }}
            /*
              **وطرقُ البيع من خصائص الباقة** — والخادم يفرضها
              أيضًا في `createListing`: حارسٌ في العميل ليس حارسًا. وهذا
              لئلّا يكتشف البائع المنع **بعد سبع خطوات ورفعِ صور**.
            */
            allowedMethods={(await sellingAllowance(user.id)).types}
            taxProfile={taxProfileOf(user)}
            brands={brands}
            cities={cities}
            locale={locale}
            vinLookupEnabled={vinLookup}
          />
        </div>
      </main>
    </>
  );
}
