import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { dealerPlans } from '@/lib/domain/installments';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { INSTALLMENT_STATUS_AR } from '@/lib/labels/installments';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'التقسيط — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D15` — عقودُ التقسيط ═══
 *
 * **والمتأخّرُ أوّلًا لا الأحدث.** قائمةٌ مرتَّبةٌ بالتاريخ تجعل من
 * تأخّر ثلاثة أشهرٍ في آخر الصفحة — ومن يفتح هذه الشاشة يفتحها ليعرف
 * **من لم يدفع**، لا ليقرأ سجلًّا.
 */
export default async function DealerInstallments() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (!(await dealerHasModule(actor, DEALER_MODULE.installments))) redirect('/dealer');
  if (actor.role === 'SALES') redirect('/dealer');

  const plans = await dealerPlans(actor.dealerId, actor.branchId);

  /** المتأخّرُ أوّلًا، وبأكبرِ متأخّرٍ داخلَه — فالقرارُ على الأكبر. */
  const sorted = [...plans].sort((a, b) => {
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    return Number(b.overdueAmount) - Number(a.overdueAmount);
  });

  const late = sorted.filter((row) => row.overdueCount > 0);
  const lateTotal = late.reduce((sum, row) => sum + Number(row.overdueAmount), 0);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/installments"
      title="التقسيط"
      subtitle="عقودك وأقساطها — والمتأخر أولا"
    >
      {plans.length === 0 ? (
        <EmptyState
          title="لا عقد تقسيط بعد"
          description="يفتح العقد من نقطة البيع: اختر التقسيط طريقة دفع، وحدد الدفعة الأولى وعدد الأشهر."
        />
      ) : (
        <>
          <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-2xs leading-loose">
            {late.length === 0 ? (
              <>لا قسط متأخر — وكل عقودك على جدولها.</>
            ) : (
              <>
                <b>
                  <Quantity unit="deals" count={late.length} />
                </b>{' '}
                فيها قسط حل أجله ولم يسدد، بمجموع{' '}
                <b>
                  <Money amount={lateTotal.toFixed(2)} />
                </b>
                .
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[52rem] border-collapse text-start">
              <thead>
                <tr className="border-b border-line bg-surface text-3xs opacity-70">
                  <th className="p-3 text-start font-bold">المشتري</th>
                  <th className="p-3 text-start font-bold">المركبة</th>
                  <th className="p-3 text-start font-bold">الأجل</th>
                  <th className="p-3 text-end font-bold">المحصل</th>
                  <th className="p-3 text-end font-bold">الباقي</th>
                  <th className="p-3 text-start font-bold">الحال</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <span className="block text-2xs font-bold">{row.buyerName}</span>
                      {row.buyerPhone === null ? null : (
                        <span dir="ltr" className="font-num mt-0.5 block text-3xs opacity-70">
                          {row.buyerPhone}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-2xs opacity-80">{row.vehicle}</td>
                    <td className="p-3 text-2xs">
                      <Quantity unit="months" count={row.months} />
                    </td>
                    <td className="p-3 text-end">
                      <Money amount={row.collected} />
                    </td>
                    <td className="p-3 text-end">
                      <Money amount={row.remaining} />
                    </td>
                    <td className="p-3">
                      {row.overdueCount > 0 ? (
                        <Badge tone="danger">
                          متأخر <ArabicNumber value={row.overdueCount} />
                        </Badge>
                      ) : (
                        <Badge tone={row.status === 'SETTLED' ? 'accent' : 'neutral'}>
                          {INSTALLMENT_STATUS_AR[row.status]}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-end">
                      <Link
                        href={`/dealer/installments/${row.id}`}
                        className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-ink"
                      >
                        الجدول
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DealerShell>
  );
}
