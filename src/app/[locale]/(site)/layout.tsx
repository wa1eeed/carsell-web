import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site/SiteHeader';

/**
 * ═══ التذييل تحت كل صفحةٍ عامّة — **وكان تحت واحدة** ═══
 *
 * قِيس: `SiteFooter` يُصيَّر في الرئيسية وحدها، **من ثلاثٍ وثلاثين
 * صفحة**. فمن وصل من محرّك بحثٍ إلى صفحة سيارة لا يجد «الشروط
 * والأحكام» ولا «سياسة الخصوصية» ولا «مركز المساعدة» في الشاشة كلّها
 * — وهي ممّا يجب أن يبلغه الزائر من أي موضع.
 *
 * وسببُه أن التذييل كان يأخذ أعمدته خاصّيةً، فكانت كل صفحةٍ تريده
 * تنسخ خمسة أسطر — **فلم تنسخها إلّا واحدة**. وصار يقرؤها بنفسه،
 * ومجموعةُ `(site)` تضعه تحت الجميع بلا أن تلمسها صفحة.
 *
 * ولا يشمل `/admin` ولا `/provider`: لوحتا عملٍ لا موقع.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  /** واللغةُ من المسار — فالتذييل يسمّي علاماتِه بلغة من يقرؤه. */
  const { locale } = await params;
  return (
    <>
      {children}
      <SiteFooter locale={locale} />
    </>
  );
}
