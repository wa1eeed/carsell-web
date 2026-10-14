import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'لوحة المزوّدين — كارز',
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
 */
export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-bg text-ink">
      {children}
    </div>
  );
}
