import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import Link from 'next/link';
import type { Metadata } from 'next';

import { SiteHeader } from '@/components/site/SiteHeader';
import { routing } from '@/i18n/routing';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { title: locale === 'ar' ? 'تواصل معنا' : 'Contact us' };
}

/**
 * ═══ تواصل معنا — الوجهة التي كان يربط إليها المساعدة وترد ٤٠٤ ═══
 *
 * **وقنوات التواصل بيانٌ لا نصّ في الشيفرة**: تتغيّر بلا نشر، ورقمٌ
 * مكتوبٌ في مكوّن يبقى بعد أن يتغيّر.
 *
 * ولا استمارة هنا: صندوق بلاغاتٍ بلا من يقرؤه أسوأ من رقمٍ ظاهر —
 * يَعِد بردٍّ لا يأتي. والبلاغ على إعلانٍ له مساره في صفحته.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [settings, t] = await Promise.all([
    db.platformSetting.findUnique({ where: { id: 'default' } }),
    getTranslations('help'),
  ]);

  const channels = [
    {
      key: 'whatsapp',
      label: locale === 'ar' ? 'واتساب' : 'WhatsApp',
      value: settings?.supportWhatsapp ?? null,
      href: (v: string) => `https://wa.me/${v.replace(/\D/g, '')}`,
    },
    {
      key: 'phone',
      label: locale === 'ar' ? 'هاتف' : 'Phone',
      value: settings?.supportPhone ?? null,
      href: (v: string) => `tel:${v.replace(/\s/g, '')}`,
    },
    {
      key: 'email',
      label: locale === 'ar' ? 'بريد' : 'Email',
      value: settings?.supportEmail ?? null,
      href: (v: string) => `mailto:${v}`,
    },
  ].filter((channel) => channel.value !== null && channel.value !== '');

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-2xl px-10 py-10">
          <Link
            href={`/${locale}/help`}
            className="mb-6 inline-block text-2xs opacity-55 hover:opacity-100"
          >
            ← {t('title')}
          </Link>

          <h1 className="mb-1.5 text-3xl font-bold tracking-tight">
            {locale === 'ar' ? 'تواصل معنا' : 'Contact us'}
          </h1>
          <p className="mb-8 text-sm leading-loose opacity-60">
            {locale === 'ar'
              ? 'فريق الدعم يردّ في أوقات العمل. وللبلاغ على إعلانٍ بعينه استعمل «أبلغ عن الإعلان» في صفحته — يصلنا معه مرجعه.'
              : 'Support replies during working hours. To report a specific listing, use “Report listing” on its page so its reference reaches us with it.'}
          </p>

          {channels.length === 0 ? (
            /* بلا قناة مضبوطة: سطرٌ صريح لا صفحةٌ فارغة توهم بالعطل */
            <p className="rounded-lg border border-line bg-surface p-5 text-2xs leading-loose opacity-60">
              {locale === 'ar'
                ? 'قنوات التواصل غير مضبوطة بعد.'
                : 'Support channels are not configured yet.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {channels.map((channel) => (
                <a
                  key={channel.key}
                  href={channel.href(channel.value ?? '')}
                  className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4 transition-opacity hover:opacity-80"
                >
                  <span className="text-sm font-bold">{channel.label}</span>
                  {/* الرقم والبريد يُنسخان ويُقارنان — لاتينيّ معزول */}
                  <span dir="ltr" className="font-num text-2xs opacity-70">
                    {channel.value}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
