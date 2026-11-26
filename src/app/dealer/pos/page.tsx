import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { dealerStock } from '@/lib/domain/dealer-dashboard';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { Counter } from './Counter';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'نقطة البيع — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D14` — نقطةُ البيع ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: «الـPOS يستعرض نفس السيارات المضافه في مخزونه».
 * فالقائمةُ صفوفُ `dealerStock` نفسُها — لا جدولَ أسعارٍ ثانٍ يتباعد.
 *
 * **والمحاسبُ لا يبيع** — يقرأ الفواتير ولا يُنشئها، كما لا يُدخل مخزونًا.
 */
export default async function DealerPos() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (!(await dealerHasModule(actor, DEALER_MODULE.pos))) redirect('/dealer');
  if (actor.role === 'ACCOUNTANT') redirect('/dealer');

  const stock = await dealerStock(actor.dealerId, actor.branchId);

  /**
   * **وما بيع لا يُعرض على المنضدة.** صفُّ المخزون يحمل حالَ العرض،
   * والمباعُ منه يخرج — فلا يُختار مرّتين.
   */
  const sellable = stock.filter((row) => row.listingStatus !== 'SOLD');

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/pos"
      title="نقطة البيع"
      subtitle="لعميل يقف أمامك — من مخزونك، وبفاتورة ضريبية"
    >
      <Counter rows={sellable} />
    </DealerShell>
  );
}
