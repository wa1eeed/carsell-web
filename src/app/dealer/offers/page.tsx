import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { deskCounts, deskOffers } from '@/lib/domain/dealer-desk';
import { dealerReplies } from '@/lib/domain/dealer-replies';
import { dealerBranches } from '@/lib/domain/dealer-branches';
import { DealerShell } from '@/components/dealer/DealerShell';
import { Quantity } from '@/components/ui/Quantity';
import { OffersTable } from './OffersTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'العروض — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D5` — العروض والمفاوضات ═══
 *
 * **والعرضُ يُقبل ويُقابَل ويُرفض من هنا**: قواعدُ التفاوض مبنيّةٌ في
 * كارز منذ بُنيت، والمعرضُ يراها على مركباته وفرعِه.
 */
export default async function DealerOffers() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'ACCOUNTANT') redirect('/dealer');

  const [rows, counts, replies, branches] = await Promise.all([
    deskOffers(actor.dealerId, actor.branchId),
    deskCounts(actor.dealerId, actor.branchId),
    /**
     * **والردودُ تُقرأ حيث تُستعمل.** بُنيت شاشتُها ثمّ كاد يبقى
     * جدولُها بلا قارئ — وهو الصنف الذي تحرسه البوابة ٦٤.
     */
    dealerReplies(actor.dealerId),
    dealerBranches(actor.dealerId),
  ]);

  const branchName =
    actor.branchId === null
      ? null
      : (branches.find((branch) => branch.id === actor.branchId)?.name ?? null);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/offers"
      title="العروض والمفاوضات"
      subtitle={undefined}
    >
      <p className="mb-5 flex flex-wrap items-center gap-2 text-2xs opacity-75">
        <Quantity unit="activeOffers" count={counts.offersActive} />
        <span aria-hidden className="opacity-40">·</span>
        <span className={counts.offersWaiting > 0 ? 'font-bold text-warn-900' : ''}>
          <Quantity unit="awaitingYou" count={counts.offersWaiting} />
        </span>
      </p>
      <OffersTable rows={rows} replies={replies} branchName={branchName} />
    </DealerShell>
  );
}
