'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import type { SettlementStatementView } from '@/lib/domain/documents';

/**
 * ═══ كشف التسوية — لماذا وصلك هذا المبلغ بالذات ═══
 *
 * البائع يرى مبلغًا في حسابه ولا يعرف كيف صار كذا. والكشف يُفصّل:
 * قيمةُ المركبة، ثمّ ما خُصم بندًا بندًا، ثمّ الصافي.
 *
 * **والجمع يظهر**: كشفٌ يقول «الصافي ٦٨٬٥٠٠» بلا سطورٍ قبله يُقرأ
 * ادّعاءً. والسطور تُجمع أمام القارئ فيستطيع مراجعتها.
 */

const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function SettlementSheet({
  statement,
  backHref,
}: {
  statement: SettlementStatementView;
  backHref: string;
}) {
  const deductions = [
    { label: 'عمولة المنصّة', amount: Number(statement.commission) },
    { label: 'ضريبة العمولة', amount: Number(statement.commissionTax) },
    { label: 'رسوم معالجة الدفع', amount: Number(statement.gatewayFee) },
    { label: 'خدمات على الطلب', amount: Number(statement.servicesTotal) },
  ].filter((row) => row.amount > 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-2xs opacity-55 hover:opacity-100">
          ← عودة إلى الطلب
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          تحميل PDF
        </Button>
      </div>

      <article className="rounded-xl border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <header className="mb-7 border-b border-line pb-5">
          <h1 className="mb-1.5 text-2xl font-bold">كشف التسوية</h1>
          <p className="text-2xs leading-relaxed opacity-60">
            تفصيلُ ما وصل البائع ولماذا — قيمةُ المركبة، وما خُصم بندًا بندًا،
            والصافي.
          </p>
          <p className="font-num mt-3 text-3xs opacity-55" dir="ltr">
            {statement.orderRef}
          </p>
        </header>

        <dl className="flex flex-col gap-2">
          <Row label="البائع" value={statement.sellerName} />
          <Row label="تاريخ الإصدار" value={date.format(new Date(statement.issuedAt))} />
        </dl>

        <table className="mt-7 w-full text-2xs">
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-2.5 font-bold">قيمة المركبة</td>
              <td className="py-2.5 text-end font-bold">
                <Money amount={Number(statement.vehicleValue)} size="sm" showCurrency={false} />
              </td>
            </tr>

            {deductions.length === 0 ? (
              /* **ولا خصمَ يُقال صراحةً** — والفراغ يُقرأ سهوًا */
              <tr>
                <td className="py-2.5 opacity-60" colSpan={2}>
                  لا خصومات على هذا الطلب.
                </td>
              </tr>
            ) : (
              deductions.map((row) => (
                <tr key={row.label}>
                  <td className="py-2.5 opacity-70">{row.label}</td>
                  <td className="py-2.5 text-end">
                    {/* الخصم سالبٌ — و`Money` تُبقي إشارته يسارًا */}
                    <Money amount={-row.amount} size="sm" showCurrency={false} negative />
                  </td>
                </tr>
              ))
            )}

            <tr className="border-t-2 border-ink/20">
              <td className="py-3 text-xs font-bold">الصافي للبائع</td>
              <td className="py-3 text-end">
                <Money amount={Number(statement.netToSeller)} size="md" />
              </td>
            </tr>
          </tbody>
        </table>

        {Number(statement.returnedAmount) <= 0 ? null : (
          <p className="mt-5 rounded-lg border border-line p-4 text-3xs leading-loose opacity-70">
            رُدّ إلى المشتري{' '}
            <Money amount={Number(statement.returnedAmount)} size="sm" /> من المبلغ المحجوز.
          </p>
        )}
      </article>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line/60 pb-2">
      <dt className="text-2xs opacity-55">{label}</dt>
      <dd className="bidi-isolate text-2xs font-bold">{value}</dd>
    </div>
  );
}
