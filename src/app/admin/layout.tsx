import type { ReactNode } from 'react';
import '../globals.css';

export const metadata = {
  title: 'CarSell — لوحة الأدمن',
  robots: { index: false, follow: false },
};

/**
 * جذر مستقلّ للوحة الأدمن.
 *
 * `/admin` **بلا بادئة لغة** (القسم ٨) واللوحة عربية فقط في المرحلة
 * الأولى — أداة داخلية بلا ترجمة. ولذلك جذر ثانٍ لا امتداد لجذر
 * `[locale]`: الاثنان لا يشتركان في `<html>` ولا في مزوّد ترجمة.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
