import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { routing } from '@/i18n/routing';
import { db } from '@/lib/db';
import { DealerOnboarding } from './DealerOnboarding';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('dealerTitle'), description: t('dealerLead') };
}

/**
 * ═══ تسجيل المعرض — تهيئةٌ لا استمارة ═══
 *
 * حسابٌ تجاريّ يُفتح على أربع إجابات: من أنت، وأنّ الرقم رقمُك، وما
 * سجلُّك، وأين يصلك المال. وعرضُها دفعةً واحدة يُري المعرضَ جدارًا من
 * اثني عشر حقلًا فيُغلق الصفحة — والخطوة الواحدة تُنجَز.
 *
 * **والشريط يقول أين هو ممّا بقي**: تهيئةٌ بلا مؤشّر تُقرأ بلا نهاية.
 */
export default async function DealerJoinPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });

  /**
   * ═══ والأرقام من القاعدة لا مكتوبةً بيد ═══
   *
   * «٠٪ عمولة» تحت عنوانٍ يَعِد بها صارت خطأً أوّلَ نسبةٍ يضبطها
   * الأدمن — وهو ما وقع في صدر «بِع سيارتك» قبل أن تُقرأ من قاعدتها.
   */
  const [rule, buyers, registry] = await Promise.all([
    db.commissionRule.findFirst({
      where: { scope: 'global', side: 'SELLER' },
      orderBy: { activeFrom: 'desc' },
      select: { pct: true, enabled: true },
    }),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.integration.findUnique({ where: { key: 'lean' }, select: { status: true } }),
  ]);

  const commissionPct = rule === null || !rule.enabled ? 0 : Number(rule.pct);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <section className="bg-ink text-bg">
          <div className="page-frame py-11">
            <h1 className="mb-4 max-w-2xl text-display leading-tight font-extrabold tracking-tight">
              {t('dealerTitle')}
            </h1>
            <p className="mb-8 max-w-xl text-sm leading-loose opacity-70">{t('dealerLead')}</p>

            <dl className="flex flex-wrap gap-9">
              {[
                { key: 'dealerStat1', value: commissionPct, suffix: '٪' },
                { key: 'dealerStat2', value: buyers, suffix: null },
                { key: 'dealerStat3', value: 3, suffix: null },
              ].map((stat) => (
                <div key={stat.key}>
                  <dd className="flex items-baseline text-3xl leading-none font-bold">
                    <ArabicNumber value={stat.value} />
                    {stat.suffix === null ? null : <span>{stat.suffix}</span>}
                  </dd>
                  <dt className="mt-1.5 text-2xs opacity-60">{t(stat.key)}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="page-frame py-10">
          {/*
            **وحالُ التكامل تُمرَّر لا تُستنتج في المتصفّح.** الشاشة
            تعرض زرّ الجلب متى كان له مصدر — ومن يضغط زرًّا لا وصلة
            خلفه يظنّ أنه أخطأ وهو لم يخطئ.
          */}
          <DealerOnboarding locale={locale} registryLive={registry?.status === 'ACTIVE'} />
        </div>
      </main>
    </>
  );
}
