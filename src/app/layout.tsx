import type { ReactNode } from 'react';

/**
 * ═══ تخطيط الجذر — مرورٌ لا غلاف ═══
 *
 * `[locale]/layout.tsx` هو من يرسم `<html>` و`<body>` لأنه وحده يعرف
 * اللغة والاتّجاه، فغلافٌ ثانٍ هنا يُنتج `<html>` داخل `<html>`.
 *
 * **لكنّ وجوده لازم**: صفحات الجذر الخاصّة (`/_not-found` و
 * `/_global-error`) لا تجد ما تُرسَم فيه بدونه، فتسقط عند التصدير بـ
 * `useContext` على `null`. وكلٌّ منهما ترسم غلافها بنفسها.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
