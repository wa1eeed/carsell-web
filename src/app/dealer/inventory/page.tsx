import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerStock } from '@/lib/domain/dealer-dashboard';
import { stockAging } from '@/lib/domain/dealer-stock';
import { DealerShell } from '@/components/dealer/DealerShell';
import { LinkButton } from '@/components/ui/Button';
import { StockFilters } from './StockFilters';
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
export default async function DealerInventory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; aged?: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const { q, aged } = await searchParams;
  const agedOnly = aged === '1';

  /**
   * **والعتبةُ تُحسب قبل الترشيح** — فالشاشةُ تقولها حتى حين لا يُرشَّح
   * بها، ورقمٌ يُرشَّح به ولا يُعرض حكمٌ بلا سند.
   */
  const aging = await stockAging(actor.dealerId, actor.branchId);
  const rows = await dealerStock(actor.dealerId, actor.branchId, {
    ...(q === undefined || q.trim() === '' ? {} : { q }),
    ...(agedOnly ? { agedOverDays: aging.thresholdDays } : {}),
  });

  /**
   * ═══ ورأسُ المال الواقف — وهو ما يُقرأ لا العدد ═══
   *
   * «ثلاثُ مركباتٍ راكدة» خبرٌ، و«٢٨٠ ألفًا واقفة» قرار. ويُجمع من
   * الكلفة المسجَّلة وحدها، **ويُقال كم مركبةً بلا كلفة** — فمجموعٌ
   * ينقصه نصفُ مخزونه يُقرأ كاملًا.
   */
  const agedRows = agedOnly
    ? rows
    : rows.filter((row) => row.ageDays > aging.thresholdDays);
  const tied = agedRows.reduce((total, row) => total + Number(row.cost ?? 0), 0);
  const agedWithoutCost = agedRows.filter((row) => row.cost === null).length;

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/inventory"
      title="المخزون"
      subtitle={actor.branchId === null ? 'كل الفروع' : 'فرعك'}
      /**
       * **والمحاسبُ يقرأ ولا يُدخل** — كما لا يعدّل الكلفة. ومن يستقبل
       * سيارةً في الصالة هو من يسجّلها، فالبائعُ والمديرُ والمالك.
       */
      actions={
        actor.role === 'ACCOUNTANT' ? undefined : (
          <LinkButton href="/dealer/inventory/new" size="sm">
            أضف مركبة
          </LinkButton>
        )
      }
    >
      <StockFilters
        q={q ?? ''}
        agedOnly={agedOnly}
        aging={aging}
        agedCount={agedRows.length}
        tiedCapital={tied.toFixed(2)}
        agedWithoutCost={agedWithoutCost}
      />

      <StockTable rows={rows} canEdit={actor.role !== 'ACCOUNTANT'} />
    </DealerShell>
  );
}
