import { BRAND_AR } from '@/lib/brand';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { figtree, tajawal } from '../fonts';
import messages from '@/messages/ar.json';
import '../globals.css';

export const metadata = {
  title: `${BRAND_AR} — لوحة المعرض`,
  robots: { index: false, follow: false },
};

/**
 * ═══ جذرٌ ثالث — لوحة المعرض ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥: «**المعرض ليس كمثل المستخدم العادي**».
 *
 * فثلاثةُ جذور لا اثنان: `[locale]` للمتجر، و`/admin` لفريق المنصّة،
 * وهذا لفريق المعرض. **والمساحةُ لوحةٌ كاملة** — لا شريطَ كارز ولا
 * بطاقاتِ سيارات: من يفتحها صباحًا يدير مخزونًا ومالًا، لا يتسوّق.
 *
 * وبلا بادئة لغةٍ كالأدمن: أداةُ عملٍ عربية في المرحلة الأولى.
 */
export default function DealerLayout({ children }: { children: ReactNode }) {
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
