import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerBranches } from '@/lib/domain/dealer-branches';
import { DealerShell } from '@/components/dealer/DealerShell';
import { BranchPanel } from './BranchPanel';
import { TeamPanel } from './TeamPanel';
import { dealerTeam } from '@/lib/domain/dealer-team';

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

  const [branches, team] = await Promise.all([
    dealerBranches(actor.dealerId),
    dealerTeam(actor.dealerId),
  ]);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/team"
      title="الفريق والفروع"
      subtitle="الأعضاء وأدوارهم، والفروع ومن يديرها"
    >
      <TeamPanel team={team} branches={branches} />
      <h2 className="mb-4 text-sm font-bold">الفروع</h2>
      <BranchPanel rows={branches} />
    </DealerShell>
  );
}
