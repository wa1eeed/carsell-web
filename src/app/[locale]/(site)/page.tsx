import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { LocaleSwitcher } from '@/components/site/LocaleSwitcher';
import { getDirection, routing, type Locale } from '@/i18n/routing';

/**
 * المهمة ١ — معيار القبول:
 * صفحة بلونَي الخلفية والخط الصحيح في اللغتين.
 * هذه الشاشة مؤقّتة ويحلّ محلّها Wa الرئيسية في المهمة ١٢.
 */
export default async function FoundationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  const t = await getTranslations('foundation');
  const other: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto w-full max-w-page px-10 py-12">
        <header className="mb-8 flex items-center gap-4">
          <span className="rounded-full border border-line px-3 py-1 text-[11px] font-bold tracking-[0.16em] opacity-55">
            {t('eyebrow')}
          </span>
          <span className="h-px flex-1 bg-line" />
          <LocaleSwitcher
            locale={other}
            label={t('switch')}
            className="rounded-full border border-ink px-4 py-2 text-xs font-bold"
          />
        </header>

        <h1 className="mb-3 text-4xl leading-tight font-extrabold tracking-tight">
          {t('title')}
        </h1>
        <p className="mb-10 max-w-xl text-sm leading-loose opacity-70">
          {t('body')}
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-4 text-xs font-bold tracking-[0.14em] opacity-45">
              {t('surfaces')}
            </h2>
            <ul className="flex flex-col gap-3 text-xs">
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm border border-line bg-bg" />
                {t('surfaceBg')}
              </li>
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm border border-line bg-surface" />
                {t('surfaceCard')}
              </li>
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm bg-ink" />
                {t('surfaceInk')}
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-4 text-xs font-bold tracking-[0.14em] opacity-45">
              {t('semantics')}
            </h2>
            <ul className="flex flex-col gap-3 text-xs">
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm bg-accent" />
                {t('semanticAccent')}
              </li>
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm bg-warn" />
                {t('semanticWarn')}
              </li>
              <li className="flex items-center gap-3">
                <span className="size-7 rounded-sm bg-danger" />
                {t('semanticDanger')}
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-4 text-xs font-bold tracking-[0.14em] opacity-45">
              {t('direction')}
            </h2>
            <p className="text-xs opacity-70">{t('directionValue')}</p>
            <p className="font-num mt-3 text-xs opacity-70">
              {`lang="${locale}" dir="${getDirection(locale)}"`}
            </p>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-xs font-bold tracking-[0.14em] opacity-45">
            {t('typography')}
          </h2>
          <p className="mb-2 text-xl font-bold">{t('typeHeading')}</p>
          <p className="mb-6 text-sm leading-loose opacity-70">
            {t('typeBody')}
          </p>
          <div className="border-t border-line-2 pt-5">
            <p className="mb-2 text-xs opacity-45">{t('numbers')}</p>
            {/* كل مقطع معزول — وإلا انزلق الفاصل «·» إلى الجهة الخطأ */}
            <p className="flex flex-wrap items-center gap-2 text-2xl font-bold text-accent-700">
              <span className="bidi-isolate">{t('numbersPrice')}</span>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="bidi-isolate">{t('numbersMileage')}</span>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="bidi-isolate">{t('numbersScore')}</span>
            </p>
            <p className="mt-4 text-xs opacity-45">
              {t('reference')}{' '}
              <span className="bidi-ltr font-num font-bold opacity-100">
                {t('referenceValue')}
              </span>
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-ink p-8 text-bg">
          <p className="mb-4 text-xs font-bold tracking-[0.14em] opacity-45">
            {t('surfaceInk')}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-sm bg-accent-400 px-3 py-1 font-bold text-ink">
              {t('semanticAccent')}
            </span>
            <span className="rounded-sm bg-warn-400 px-3 py-1 font-bold text-ink">
              {t('semanticWarn')}
            </span>
            <span className="font-num text-lg font-bold">00:14:05</span>
          </div>
        </section>
      </div>
    </main>
  );
}
