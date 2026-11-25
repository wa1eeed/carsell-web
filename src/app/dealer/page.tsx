import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerKpis } from '@/lib/domain/dealer-dashboard';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Counted } from '@/components/ui/Counted';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'لوحة القيادة — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D1` — صحّةُ المعرض في شاشة ═══
 *
 * خمسُ بطاقات. **وأربعٌ منها كانت ممكنةً من اليوم الأوّل، والخامسة
 * لا**: «الهامش» يحتاج سعرَ شراءٍ لم يكن له حقلٌ في `Vehicle`.
 *
 * **ولا رقمَ هنا مخترَع**: المبيعاتُ من طلباتٍ تمّت لا من أسعارٍ
 * معروضة، والهامشُ من دفتر الكلفة، والوسيطُ وسيطٌ لا متوسّط.
 */
export default async function DealerDashboard() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');

  const kpis = await dealerKpis(actor.dealerId, actor.branchId);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer"
      title="لوحة القيادة"
      subtitle={actor.branchId === null ? 'كل الفروع' : 'فرعك'}
    >
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card label="مبيعات الشهر">
          <Money amount={Number(kpis.monthSales)} showCurrency={false} size="xl" />
          <Foot>
            <Quantity unit="deals" count={kpis.monthDeals} />
            {kpis.salesChangePct === null ? (
              /*
                **ونسبةٌ على شهرٍ بلا مبيعات لا تُحسب.** «+١٠٠٪» أو
                «+∞» يقولان ما لا يُقاس — و«أول شهر» يقول الحقيقة.
              */
              <span className="opacity-65">أول شهر بمبيعات</span>
            ) : (
              <span className={kpis.salesChangePct >= 0 ? 'text-accent-700' : 'text-danger'}>
                <span>عن الشهر السابق</span>{' '}
                <span>
                  {kpis.salesChangePct >= 0 ? '+' : ''}
                  <ArabicNumber value={kpis.salesChangePct} percent />
                </span>
              </span>
            )}
          </Foot>
        </Card>

        <Card label="الهامش">
          {kpis.margin === null ? (
            /*
              **ولا يُقال «صفر».** صفرٌ يعني «بعنا بلا ربح»، والحقيقة
              أنّ كلفةَ المركبات لم تُسجَّل بعد — وهما حالان مختلفتان
              تمامًا، وإحداهما تُصلَح بإدخال رقم.
            */
            <p className="text-2xs leading-loose opacity-70">
              لم تسجل كلفة شراء لأي مركبة بيعت هذا الشهر — فلا هامش يحسب.
              سجلها من صفحة المركبة.
            </p>
          ) : (
            <>
              <Money amount={Number(kpis.margin)} showCurrency={false} size="xl" />
              <Foot>
                {kpis.marginPct === null ? null : (
                  <span>
                    <span>من المبيعات</span>{' '}
                    <ArabicNumber value={kpis.marginPct} percent />
                  </span>
                )}
                {/*
                  **والمقامُ يُقال.** هامشٌ من ثلاث صفقاتٍ من اثنتي عشرة
                  ليس هامشَ المعرض — ومن قرأه نسبةً عامّة بنى عليه سعرًا.
                */}
                {kpis.marginFrom === kpis.marginOf ? null : (
                  <span className="opacity-65">
                    <Counted message="dealsWithCost" count={kpis.marginFrom} />{' '}
                    <Counted message="ofDeals" count={kpis.marginOf} />
                  </span>
                )}
              </Foot>
            </>
          )}
        </Card>

        <Card label="المخزون النشط">
          <p className="text-2xl font-bold">
            <ArabicNumber value={kpis.activeStock} />
          </p>
          <Foot>
            <span>
              قيمته <Money amount={Number(kpis.stockValue)} showCurrency={false} size="sm" />
            </span>
          </Foot>
        </Card>

        <Card label="وسيط أيام البيع">
          {kpis.medianDaysToSell === null ? (
            <p className="text-2xs opacity-70">لا صفقات مكتملة هذا الشهر.</p>
          ) : (
            <p className="text-2xl font-bold">
              <ArabicNumber value={kpis.medianDaysToSell} />
            </p>
          )}
        </Card>

        <Card label="عروض تحتاج ردا">
          <p className="text-2xl font-bold">
            <ArabicNumber value={kpis.offersWaiting} />
          </p>
          <Foot>
            {kpis.oldestOfferHours === null ? (
              <span className="opacity-65">لا عروض معلقة</span>
            ) : (
              <span className={kpis.oldestOfferHours >= 24 ? 'text-warn-900' : ''}>
                <span>أقدمها</span>{' '}
                <Counted message="agoHours" count={kpis.oldestOfferHours} />
              </span>
            )}
          </Foot>
        </Card>
      </dl>
    </DealerShell>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <dt className="mb-2.5 text-2xs opacity-70">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs">{children}</p>
  );
}
