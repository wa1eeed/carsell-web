import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerStock } from '@/lib/domain/dealer-dashboard';
import { DealerShell } from '@/components/dealer/DealerShell';
import { StockTable } from './StockTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'المخزون — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D2` — المخزون ═══
 *
 * **ومن هنا تُسجَّل الكلفة**، فهي مُدخَلُ الهامش وضريبةِ الهامش معًا.
 * ووضعُها في شاشةٍ محاسبيةٍ منفصلة يجعلها تُملأ متأخّرةً أو لا تُملأ:
 * من يُدخل مركبةً إلى مخزونه يعرف ثمنَها في تلك اللحظة.
 */
export default async function DealerInventory() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const rows = await dealerStock(actor.dealerId, actor.branchId);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/inventory"
      title="المخزون"
      subtitle={actor.branchId === null ? 'كل الفروع' : 'فرعك'}
    >
      <StockTable rows={rows} canEdit={actor.role !== 'ACCOUNTANT'} />
    </DealerShell>
  );
}
