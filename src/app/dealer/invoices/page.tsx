import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentDealer } from '@/lib/auth/dealer-session';
import {
  INVOICE_BUCKETS,
  dealerInvoiceBuckets,
  dealerInvoiceTotals,
  dealerInvoices,
  type InvoiceBucket,
} from '@/lib/domain/dealer-money';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { INVOICE_BUCKET_AR, INVOICE_STATUS_AR, SUPPLY_TYPE_AR } from '@/lib/labels/dealer';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'الفواتير والضريبة — المعرض', robots: { index: false, follow: false } };

function parseBucket(raw: string | undefined): InvoiceBucket {
  return INVOICE_BUCKETS.find((bucket) => bucket === raw) ?? 'ALL';
}

/**
 * ═══ `D7` — الفواتير والضريبة ═══
 *
 * **وهي قراءةٌ لوثائقَ صدرت، لا دفترٌ يُحرَّر.** الفاتورة يُصدرها
 * `issueInvoice` عند التسوية بلقطةِ قاعدتها الضريبية ورقمِها المتّصل
 * — ولا زرَّ «أنشئ فاتورة» هنا: الترميزُ يرسمه، **ولا شيء في المنتج
 * يُصدر فاتورةً بيد**، والتسلسلُ المتّصل يمنعه أصلًا. وزرٌّ لا يبلغ
 * دالّةً هو الصنف الذي أُصلح في هذا المستودع مرارًا.
 */
export default async function DealerInvoices({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'SALES') redirect('/dealer');

  const bucket = parseBucket((await searchParams).bucket);

  const [rows, buckets, totals] = await Promise.all([
    dealerInvoices(actor.dealerId, actor.branchId, bucket),
    dealerInvoiceBuckets(actor.dealerId, actor.branchId),
    dealerInvoiceTotals(actor.dealerId, actor.branchId),
  ]);

  const date = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  });

  const cards = [
    { label: 'إجمالي المبيعات', value: totals.sales },
    { label: 'ضريبة القيمة المضافة', value: totals.salesVat },
    { label: 'عمولة المنصة', value: totals.commission },
  ];

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/invoices"
      title="الفواتير والضريبة"
      subtitle={<Quantity unit="invoices" count={totals.count} />}
      actions={
        <LinkButton href="/api/v1/dealer/invoices/export" variant="outline" size="sm">
          تصدير محاسبي
        </LinkButton>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-line p-4">
            <p className="text-3xs opacity-70">{card.label}</p>
            {/*
              **وكلُّ رقمٍ يُطابَق بجهةٍ خارجية يُعرض بهللاته** — وهذه
              تُطابَق بهيئة الزكاة والضريبة والجمارك.
            */}
            <Money amount={card.value} decimals={2} size="lg" className="mt-1.5 block" />
          </div>
        ))}
        <div className={cn('rounded-xl border p-4', totals.unreported > 0 ? 'border-warn-200 bg-warn-100' : 'border-line')}>
          <p className="text-3xs opacity-70">لم ترسل للهيئة</p>
          <p className={cn('mt-1.5 font-num text-xl font-bold', totals.unreported > 0 && 'text-warn-900')}>
            <ArabicNumber value={totals.unreported} />
          </p>
        </div>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="شرائح الفواتير">
        {INVOICE_BUCKETS.map((item) => (
          <Link
            key={item}
            href={item === 'ALL' ? '/dealer/invoices' : `/dealer/invoices?bucket=${item}`}
            aria-current={item === bucket ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-2xs transition-colors',
              item === bucket ? 'bg-ink font-bold text-bg' : 'border border-line font-semibold hover:bg-ink/6',
            )}
          >
            <span>{INVOICE_BUCKET_AR[item]}</span>
            {buckets[item] === 0 ? null : (
              <span
                className={cn(
                  'flex min-w-4.5 items-center justify-center rounded-full px-1.5 font-num text-3xs font-bold',
                  item === bucket ? 'bg-bg/20' : 'bg-ink/8',
                )}
              >
                <ArabicNumber value={buckets[item]} />
              </span>
            )}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="لا فواتير بعد"
          description="فاتورة البيع تصدر آليا عند إتمام كل طلب — برقم متسلسل ورمز QR ومعرف UUID، وترسل للهيئة تلقائيا."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-200 border-collapse text-start">
            <thead>
              <tr className="border-b border-line bg-surface text-3xs opacity-70">
                <th scope="col" className="px-5 py-3 text-start font-bold">رقم الفاتورة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">البيان</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">العميل</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">قبل الضريبة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الضريبة</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الإجمالي</th>
                <th scope="col" className="px-5 py-3 text-start font-bold">الهيئة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.number} className="border-b border-line-2 last:border-b-0">
                  <td dir="ltr" className="px-5 py-3.5 text-start font-num text-2xs font-semibold">
                    {row.number}
                  </td>
                  <td className="px-5 py-3.5 text-2xs font-semibold">
                    {SUPPLY_TYPE_AR[row.supply]}
                    {row.vehicle === null ? null : <span> — {row.vehicle}</span>}
                    <span className="block text-3xs font-normal opacity-70">
                      {date.format(new Date(row.issuedAt))}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-2xs opacity-75">{row.customerName}</td>
                  <td className="px-5 py-3.5"><Money amount={row.subtotal} decimals={2} size="sm" showCurrency={false} /></td>
                  <td className="px-5 py-3.5"><Money amount={row.tax} decimals={2} size="sm" showCurrency={false} /></td>
                  <td className="px-5 py-3.5"><Money amount={row.total} decimals={2} size="sm" /></td>
                  <td className="px-5 py-3.5">
                    <Badge tone={INVOICE_STATUS_AR[row.status].tone}>
                      {INVOICE_STATUS_AR[row.status].text}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-line bg-surface p-5 text-2xs leading-loose opacity-75">
        كل فاتورة بيع تنشأ آليا عند إتمام الطلب، وتحمل رمز QR ومعرف UUID مطابقين لمتطلبات
        الفوترة الإلكترونية. الرقم الضريبي والسجل التجاري يأتيان من ملف المعرض، وتعديلهما
        يحتاج موافقة الأدمن.
      </p>
    </DealerShell>
  );
}
