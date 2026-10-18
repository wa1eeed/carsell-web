import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'لوحة المزودين — كارز',
  /** لوحةُ عملٍ خاصّة، لا تُفهرَس */
  robots: { index: false, follow: false },
};

/**
 * ═══ لوحةٌ موحَّدة لكل المزوّدين ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): لا لوحةَ لكل صنف. الفاحص اليوم، ومزوّدُ
 * نقل الملكية لاحقًا بالطريقة نفسها — **والفرق في صفحة التفاصيل**:
 * كرت معلوماتٍ ثابت، وقسمٌ متغيّر بأزرار الأكشن.
 *
 * وهي خارج `[locale]`: عربيةٌ وحدها كلوحة الأدمن — لا محوّل لغة
 * (القرار ٢٠٢٦-١٠-١٢).
 *
 * ═══ وجذرٌ كامل لا `div` ═══
 *
 * `app/layout.tsx` **مرورٌ لا غلاف**: كلُّ شجرةٍ ترسم `<html>` و
 * `<body>` بنفسها لأنها وحدها تعرف لغتها. و`[locale]` و`admin`
 * يفعلان — **وهذه كانت `div` وحده**: بلا `<html lang dir>` وبلا
 * خطوط وبلا `globals.css`. فتعمل في التطوير بما تحقنه شجرةٌ أخرى،
 * وتصل الإنتاج بلا تنسيقٍ ولا خطّ عربيّ.
 *
 * ═══ ومُثبَّتةٌ على `ar` بسياقٍ لا بحرمانٍ منه ═══
 *
 * وبلا `NextIntlClientProvider` **يُسقط أيُّ مكوّنٍ مشترك الصفحةَ
 * كلَّها** لا سطرَه: `Quantity` و`Money` و`TimeAgo` ترمي «context
 * from NextIntlClientProvider was not found». ووقع: أوّلُ استعمالٍ
 * لـ`Quantity` هنا أخرج شاشة خطأ كاملة.
 *
 * ولوحةُ الأدمن تقول القاعدة منذ كُتبت: «بلا ترجمة» تعني ألّا نبني
 * نسخةً إنجليزية، **لا أن نحرم المكوّنات المشتركة من صياغة الأرقام
 * بالعربية-الهندية** — وهي بالضبط ما تحتاجه اللوحة.
 */
export default function ProviderLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${figtree.variable}`}>
      <body className="min-h-screen bg-bg text-ink">
        <NextIntlClientProvider locale="ar" messages={messages} timeZone="Asia/Riyadh">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
