import { notFound, redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { DealerShell } from '@/components/dealer/DealerShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { planDetail } from '@/lib/domain/installments';
import { DEALER_MODULE, dealerHasModule } from '@/lib/domain/dealer-modules';
import { INSTALLMENT_METHOD_AR, INSTALLMENT_STATUS_AR } from '@/lib/labels/installments';
import { ReceiptForm } from './ReceiptForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'عقد تقسيط — المعرض', robots: { index: false, follow: false } };

/**
 * ═══ `D15` — جدولُ العقد وسنداتُه ═══
 *
 * **والسنداتُ تُعرض** — وكانت تُكتب ولا يقرؤها شيء (أمسكتها البوابة ٦٤
 * في يومها). وسندٌ لا يُقرأ يجعل «المدفوع» رقمًا بلا أثرٍ يشرحه، وأوّلُ
 * سؤالٍ يسأله عميلٌ متنازِع هو «متى دفعتُ؟».
 */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (!(await dealerHasModule(actor, DEALER_MODULE.installments))) redirect('/dealer');
  if (actor.role === 'SALES') redirect('/dealer');

  const { id } = await params;
  const plan = await planDetail(actor.dealerId, id);
  if (plan === null) notFound();

  const collected = plan.dues.reduce((sum, due) => sum + Number(due.paidAmount), 0);
  const financed = plan.dues.reduce((sum, due) => sum + Number(due.amount), 0);

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/installments"
      title={plan.buyerName}
      subtitle={`${plan.vehicle} · ${
        plan.invoiceNumber === null ? 'بلا فاتورة مربوطة' : `فاتورة ${plan.invoiceNumber}`
      }`}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="السعر">
          <Money amount={plan.totalPrice} />
        </Card>
        <Card title="الدفعة الأولى">
          {/* **والصفرُ هنا حالٌ لا نقص** — عقدٌ بلا دفعةٍ أولى واردٌ. */}
          {Number(plan.downPayment) === 0 ? (
            <span className="text-2xs opacity-70">بلا دفعة أولى</span>
          ) : (
            <Money amount={plan.downPayment} />
          )}
        </Card>
        <Card title="المحصل من الأقساط">
          <Money amount={collected.toFixed(2)} />
        </Card>
        <Card title="الباقي">
          <Money amount={(financed - collected).toFixed(2)} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-5">
          <section className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[34rem] border-collapse text-start">
              <thead>
                <tr className="border-b border-line bg-surface text-3xs opacity-70">
                  <th className="p-3 text-start font-bold">القسط</th>
                  <th className="p-3 text-start font-bold">يستحق</th>
                  <th className="p-3 text-end font-bold">المبلغ</th>
                  <th className="p-3 text-end font-bold">المسدد</th>
                  <th className="p-3 text-start font-bold">الحال</th>
                </tr>
              </thead>
              <tbody>
                {plan.dues.map((due) => (
                  <tr key={due.id} className="border-b border-line last:border-0">
                    <td className="font-num p-3 text-2xs font-bold">{due.sequence}</td>
                    <td dir="ltr" className="font-num p-3 text-2xs">
                      {due.dueOn.slice(0, 10)}
                    </td>
                    <td className="p-3 text-end">
                      <Money amount={due.amount} />
                    </td>
                    <td className="p-3 text-end">
                      <Money amount={due.paidAmount} />
                    </td>
                    <td className="p-3">
                      {due.settled ? (
                        <Badge tone="accent">سدد</Badge>
                      ) : due.overdue ? (
                        <Badge tone="danger">متأخر</Badge>
                      ) : (
                        <Badge tone="neutral">قادم</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold">سندات القبض</h2>
            {plan.receipts.length === 0 ? (
              <p className="text-2xs leading-loose opacity-70">
                لا سند مسجل بعد — وأول قبض يظهر هنا باسم من قبضه ووقته.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {plan.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2.5 text-2xs last:border-0 last:pb-0"
                  >
                    <span>
                      <b>
                        <Money amount={receipt.amount} />
                      </b>{' '}
                      <span className="opacity-70">
                        {INSTALLMENT_METHOD_AR[receipt.method]}
                        {receipt.dueSequence === null ? '' : ` · على القسط ${String(receipt.dueSequence)}`}
                      </span>
                    </span>
                    <span dir="ltr" className="font-num text-3xs opacity-65">
                      {receipt.receivedAt.slice(0, 10)}
                      {receipt.recordedBy === null ? '' : ` — ${receipt.recordedBy}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">العقد</h2>
            <p className="text-2xs leading-loose">
              <Quantity unit="months" count={plan.months} /> ·{' '}
              {INSTALLMENT_STATUS_AR[plan.status]}
            </p>
            {plan.note === null ? null : (
              <p className="mt-1.5 text-3xs leading-loose opacity-70">{plan.note}</p>
            )}
          </section>

          <ReceiptForm planId={plan.id} dues={plan.dues} />
        </div>
      </div>
    </DealerShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-2 text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="text-xl font-bold">{children}</p>
    </section>
  );
}
