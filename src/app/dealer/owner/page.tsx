import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { db } from '@/lib/db';
import { OwnerForm } from './OwnerForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'بيانات صاحب المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D12` — ما يفتح النشرَ والتحويل ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «المعارض فصفحته هي لوحة تحكمه». فأُغلقت صفحةُ
 * الحساب على عضو المعرض — **وكانت الحقولُ الثلاثة التي يشترطها النشر
 * لا تُكتب إلّا فيها**: البريدُ وتوثيقُ المنشأة والآيبان. فبقي الشرطُ
 * مفروضًا بلا بابٍ يُستوفى منه، وهو أخطرُ من غيابه: يسجّل، ويدخل
 * لوحتَه، ويجهّز مخزونَه — ثمّ لا ينشر ولو اعتُمد سجلُّه.
 *
 * **ولمالكه وحده.** توثيقُ المنشأة وحسابُ التحويل قرارُ صاحبِ السجلّ
 * لا مديرِ فرعٍ ولا محاسب — ومن يملك تغييرَ الآيبان يملك تحويلَ
 * المستحقّات إلى حسابه.
 */
export default async function DealerOwnerPage() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role !== 'OWNER') redirect('/dealer');

  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: {
      email: true,
      businessName: true,
      crNumber: true,
      vatNumber: true,
      bankName: true,
      identityStatus: true,
      iban: true,
    },
  });

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/owner"
      title="بيانات صاحب المعرض"
      subtitle="ما يفتح النشر للسوق والتحويل إلى حسابك"
    >
      <OwnerForm
        email={user.email}
        businessName={user.businessName}
        crNumber={user.crNumber}
        vatNumber={user.vatNumber}
        bankName={user.bankName}
        identityStatus={user.identityStatus}
        /** **ولا يخرج الآيبان** — وجودُه خبرٌ، وقيمتُه لا تُعاد (قرار ٢٩). */
        hasIban={user.iban !== null && user.iban !== ''}
      />
    </DealerShell>
  );
}
