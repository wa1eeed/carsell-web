import { redirect } from 'next/navigation';
import { currentUserFromCookies } from '@/lib/domain/account';
import { currentDealer } from '@/lib/auth/dealer-session';
import { db } from '@/lib/db';
import { EnterPanel } from './EnterPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'دخول لوحة المعرض', robots: { index: false, follow: false } };

/**
 * ═══ مدخلُ اللوحة — بابٌ خاصّ لا شاشةُ دخولٍ عامّة ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥. ومديرُ المعرض يفتح لوحته صباحًا وهو لا
 * يتسوّق — فبابُه يقول له أين هو، ومنه يُسجَّل المعرضُ الجديد.
 *
 * **والاعتمادُ يبقى واحدًا**: من لم يُثبت هويّته يُرسَل إلى الدخول
 * العامّ بجواله ورمزِه، ثمّ يعود. ولا كلمةَ مرورٍ للمعرض تُتداوَل
 * بين موظّفيه — تُسرَّب، ولا تُسحب من شخصٍ بعينه، **وتمحو أثرَ من
 * فعل**.
 */
export default async function DealerEnterPage() {
  const already = await currentDealer();
  if (already !== null) redirect('/dealer');

  const user = await currentUserFromCookies();
  if (user === null) redirect('/ar/auth?next=/dealer/enter');

  /**
   * ═══ والدعوةُ تُقبَل عند أوّل دخولٍ لا بزرّ ═══
   *
   * من دُعي ثمّ فتح البابَ يجد نفسَه عضوًا. وزرُّ «اقبل الدعوة»
   * يحتاج شاشةً يصلها — **وهي شاشةٌ لا يعرف وجودَها**، فتبقى الدعوةُ
   * معلّقةً إلى أن تنتهي مهلتُها ويُقال له «لست عضوًا في أي معرض».
   */
  const { acceptPendingInvite } = await import('@/lib/domain/dealer-team');
  await acceptPendingInvite(user.id);

  const member = await db.user.findUnique({
    where: { id: user.id },
    select: {
      dealerRole: true,
      dealer: { select: { nameAr: true, status: true } },
    },
  });

  return (
    <EnterPanel
      name={user.name}
      dealerName={member?.dealer?.nameAr ?? null}
      dealerStatus={member?.dealer?.status ?? null}
      isMember={member?.dealerRole !== null && member?.dealer != null}
    />
  );
}
