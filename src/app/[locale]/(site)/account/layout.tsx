import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentUserFromCookies } from '@/lib/domain/account';
import { DEALER_MEMBERSHIP_SELECT, dealerMembership } from '@/lib/domain/dealer-membership';
import { db } from '@/lib/db';

/**
 * ═══ حسابٌ شخصيّ — وعضوُ المعرض لا يمرّ من هنا ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «لم يعجبني وجود صفحة حساب عاديه للمعرض
 * وفيها زر تسجيل معرض او دخول» و«المفترض المعرض يسجل و يدخل للوحة
 * تحكمه مباشره».
 *
 * **والتحويلُ في التخطيط لا في الصفحة.** للحساب خمسَ عشرةَ شاشةً
 * فرعية (الطلبات · المحفظة · المفضّلة · …)، ومنعُ الجذر وحده يترك
 * أربعَ عشرةَ بابًا مفتوحة — وهو نصفُ قاعدةٍ، وقد كُتب في هذا
 * المستودع أنّ نصفَ القاعدة يُقرأ سهوًا لا قرارًا.
 *
 * **والموقوفُ يبقى له حسابُه.** التحويلُ لعضوٍ في معرضٍ `ACTIVE`
 * وحده: من أُوقف معرضُه لا تُفتح له اللوحة، فتحويلُه إليها يتركه بلا
 * شاشةٍ واحدة — شرطٌ يُفرَض ولا بابَ لاستيفائه.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await currentUserFromCookies();

  if (user !== null) {
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: DEALER_MEMBERSHIP_SELECT,
    });
    if (dealerMembership(row).state === 'MEMBER') redirect('/dealer');
  }

  return children;
}
