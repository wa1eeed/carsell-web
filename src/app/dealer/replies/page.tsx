import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerReplies } from '@/lib/domain/dealer-replies';
import { DealerShell } from '@/components/dealer/DealerShell';
import { RepliesPanel } from './RepliesPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الردود الجاهزة — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ الردود الجاهزة ═══
 *
 * يرسمها ترميزُ `D5` بجوار صندوق العروض. **والقالبُ يُحفظ بمتغيّراته**
 * ويُستبدل وقت الإرسال — فقالبٌ استُبدل وقت الحفظ يجمّد سعرًا تغيّر
 * بعده.
 */
export default async function DealerRepliesPage() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'ACCOUNTANT') redirect('/dealer');

  const rows = await dealerReplies(actor.dealerId);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/replies"
      title="الردود الجاهزة"
      subtitle="تظهر في صندوق العروض لتختار منها بدل إعادة الكتابة"
    >
      <RepliesPanel rows={rows} />
    </DealerShell>
  );
}
