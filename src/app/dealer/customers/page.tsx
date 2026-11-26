import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { dealerCustomers } from '@/lib/domain/dealer-customers';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'العملاء — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ العملاء ═══
 *
 * **وهم من تعامل لا من تصفّح**: قائمةٌ من المشاهدات تُنتج آلافًا بلا
 * معنى. وتُجمع من الطلبات **والعروض معًا** — فمن فاوض ولم يُتمّ هو
 * أكثرُ من يُعاود، وقائمةٌ من الطلبات وحدها تُسقطه.
 */
export default async function DealerCustomers() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'ACCOUNTANT') redirect('/dealer');
  /** **وحارسٌ في الشريط ليس حارسًا** — ومن كتب العنوان بيده يصل الشاشة. */
  if (!(await dealerHasModule(actor, DEALER_MODULE.customers))) redirect('/dealer');

  const rows = await dealerCustomers(actor.dealerId, actor.branchId);

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/customers"
      title="العملاء"
      subtitle={<Quantity unit="customers" count={rows.length} />}
    >
      {rows.length === 0 ? (
        <EmptyState
          title="لا عملاء بعد"
          description="يظهر هنا كل من قدم عرضا على مركباتك أو أنشأ طلبا عليها، ومن اشتراها من معرضك."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-180 border-collapse text-start">
            <thead>
              <tr className="border-b border-line bg-surface text-3xs opacity-70">
                <th scope="col" className="px-5 py-3 text-start font-bold">العميل</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">المدينة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الطلبات</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">العروض</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">ما أتمه</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">آخر تعامل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line-2 last:border-b-0">
                  <td className="px-5 py-3.5 text-2xs font-semibold">
                    {row.name ?? '—'}
                    {/*
                      **وعميلُ الصالة يُقال** — فالمعرضُ يعرف من يراسله
                      على كارز ممّن يحضر إليه، ولا يبحث عن حسابٍ لا وجود
                      له.
                    */}
                    {!row.walkIn ? null : (
                      <Badge tone="neutral" size="sm" className="ms-2">من المعرض</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-2xs opacity-75">{row.city ?? '—'}</td>
                  <td className="px-5 py-3.5 font-num text-2xs"><ArabicNumber value={row.orders} /></td>
                  <td className="px-5 py-3.5 font-num text-2xs"><ArabicNumber value={row.offers} /></td>
                  <td className="px-5 py-3.5">
                    {/*
                      **وصفرُ المال يُقال نفيًا لا رقمًا**: «٠ ريال»
                      تحت «ما أتمه» تُقرأ حكمًا على العميل، و«لم يتم
                      بعد» تقول الحال.
                    */}
                    {row.spent === '0.00' ? (
                      <span className="text-2xs opacity-70">لم يتم بعد</span>
                    ) : (
                      <Money amount={row.spent} decimals={2} size="sm" />
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-2xs opacity-75">
                    {date.format(new Date(row.lastAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DealerShell>
  );
}
