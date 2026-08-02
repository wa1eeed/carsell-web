import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { Figtree, Tajawal } from 'next/font/google';
import messages from '@/messages/ar.json';
import '../globals.css';

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata = {
  title: 'CarSell — لوحة الأدمن',
  robots: { index: false, follow: false },
};

/**
 * جذر مستقلّ للوحة الأدمن.
 *
 * `/admin` **بلا بادئة لغة** (القسم ٨)، واللوحة عربية فقط في المرحلة
 * الأولى — أداة داخلية بلا ترجمة. ولذلك جذر ثانٍ لا امتداد لجذر
 * `[locale]`: الاثنان لا يشتركان في `<html>`.
 *
 * المزوّد **مثبَّت على `ar` بلا مبدّل**: «بلا ترجمة» تعني ألّا نبني
 * نسخة إنجليزية، لا أن نحرم المكوّنات المشتركة من صياغة الأرقام
 * بالعربية-الهندية — وهي بالضبط ما تحتاجه اللوحة.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${figtree.variable}`}>
      <body>
        <NextIntlClientProvider locale="ar" messages={messages} timeZone="Asia/Riyadh">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
