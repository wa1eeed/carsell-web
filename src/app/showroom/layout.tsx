import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/ar.json';
import { figtree, tajawal } from '../fonts';
import '../globals.css';

/**
 * ═══ جذرٌ رابع — موقعُ المعرض ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: موقعٌ رسميّ **بهويّته هو**. فلا شريطَ كارز
 * ولا تذييلَها ولا بحثَ سوقٍ: من فتح موقعَ معرضٍ لا يُؤخذ إلى سيارةِ
 * جاره. وهذا ما يفرّقه عن `/ar/dealers/{slug}` — تلك صفحةٌ **في**
 * سوقنا، وهذه صفحتُه.
 */
export default function ShowroomLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${figtree.variable}`}>
      <body>
        {/*
          ═══ ومزوّدُ الترجمة لازمٌ لجذرٍ يعرض مكوّناتِنا ═══

          **وسقط الموقعُ بـ٥٠٠ بدونه**: `CarCard` يحوي `Countdown`، وهو
          مكوّنُ عميلٍ يطلب `useTranslations('ui')` — فجذرٌ بلا مزوّدٍ
          يرمي عند أوّل بطاقةِ مزاد. ولم يكشفه بناءٌ ولا مُصرِّفٌ ولا
          ألفٌ وسبعُ مئةِ اختبار؛ كشفه **فتحُ الصفحة**.

          وهو ما يفعله جذرُ اللوحة وجذرُ الأدمن — فكلُّ جذرٍ يعرض
          مكوّناتِنا يحمل مزوّدَها.
        */}
        <NextIntlClientProvider locale="ar" messages={messages} timeZone="Asia/Riyadh">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
