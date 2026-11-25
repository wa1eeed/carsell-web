import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerBranches } from '@/lib/domain/dealer-branches';
import { DealerShell } from '@/components/dealer/DealerShell';
import { BranchPanel } from './BranchPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الفريق والفروع — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D9` — الفريق والفروع ═══
 *
 * الفروعُ أوّلًا: **العضوُ يُسنَد إلى فرع**، فبناءُ الأعضاء قبلها
 * يُنتج فريقًا بلا مواضع. ودعواتُ الأعضاء تلحق.
 */
export default async function DealerTeam() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') redirect('/dealer');

  const branches = await dealerBranches(actor.dealerId);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/team"
      title="الفريق والفروع"
      subtitle="الفروع ومن يديرها — والأعضاء تلحق"
    >
      <BranchPanel rows={branches} />
    </DealerShell>
  );
}
