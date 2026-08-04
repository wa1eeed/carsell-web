import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { platformBook, recentEntries } from '@/lib/domain/platform-book';
import { LEDGER_ACCOUNT_LABEL } from '@/lib/labels/admin';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'دفتر الأستاذ' };

/**
 * A25 — دفتر الأستاذ.
 *
 * **من الدفتر لا بالتجميع.** شاشة المالية تُجمّع الطلبات عند كل فتح
 * فتقول «كم» ولا تقول «لماذا تغيّر»؛ وهذه تقرأ قيودًا محفوظة، وكل رقم
 * فيها له أثرٌ يُتتبَّع.
 */
export default async function LedgerPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [book, entries] = await Promise.all([platformBook(), recentEntries()]);

  return (
    <AdminShell title="دفتر الأستاذ" activeHref="/admin/ledger" admin={admin}>
      {/*
        الاختلال في الصدارة لا في الذيل: رقمٌ في الأسفل يُتأمَّل، وفي
        الأعلى يُعالَج. ويجب أن يكون صفرًا دائمًا.
      */}
      {book.unbalanced.length === 0 ? null : (
        <section className="mb-7 rounded-xl border-2 border-danger bg-danger/10 p-5">
          <h2 className="text-sm font-bold text-danger">معاملات غير متوازنة</h2>
          <p className="mt-1.5 text-2xs leading-loose">
            هذا لا يقع إلا بكاتبٍ يتجاوز <code>postEntries</code>. أوقِف الكتابة
            وراجع القيود التالية قبل أي إفراج.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {book.unbalanced.map((row) => (
              <li key={row.txnId} dir="ltr" className="font-num text-2xs">
                {row.txnId} — debit {row.debit} · credit {row.credit}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="إيراد المنصّة" note="العمولة والرسوم — لا قيمة المركبات" amount={book.revenue} strong />
        <Figure label="ضريبة مستحقّة" note="دَينٌ للهيئة على توريداتنا" amount={book.vatPayable} strong />
        <Figure label="لدى مزوّد الدفع" note="التزامٌ تجاه الأطراف، لا مالٌ لنا" amount={book.atProvider} />
        <Figure label="قُبض ولم يُستحقّ" note="في نافذة الإرجاع" amount={book.buyerAdvance} />
        <Figure label="حقوق البائعين" note="استُحقّت ولم تُحوَّل" amount={book.sellerPayable} />
        <Figure label="رسوم عبور" note={`بوابة ${book.clearing.gateway} · حكومية ${book.clearing.government}`} amount={book.clearing.gateway} />
      </div>

      <section className="mb-7 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3.5 text-sm font-bold">أرصدة الحسابات</h2>
        <dl className="flex flex-col gap-2 text-2xs">
          {book.balances.map((row) => (
            <div key={row.account} className="flex items-center justify-between gap-4">
              <dt className="opacity-65">{LEDGER_ACCOUNT_LABEL[row.account] ?? row.account}</dt>
              <dd className="font-num font-bold">
                <ArabicNumber value={Number(row.amount)} decimals={2} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-3xs opacity-45">
          <span>قيود مسجَّلة</span>
          <ArabicNumber value={book.entryCount} />
          {book.unbalanced.length === 0 ? <Badge tone="accent">كلها متوازنة</Badge> : null}
        </p>
      </section>

      <h2 className="mb-3.5 text-sm font-bold">آخر القيود</h2>
      {entries.length === 0 ? (
        <EmptyState
          title="الدفتر فارغ"
          description="أوّل صفقة تُدفع تكتب أوّل قيد — والدفتر يبدأ من هناك."
        />
      ) : (
        <DataTable
          rows={entries}
          rowKey={(row) => `${row.txnId}-${row.account}-${row.direction}`}
          columns={[
            { id: 'event', header: 'الحدث', cell: (row) => <span dir="ltr" className="text-2xs">{row.event}</span> },
            {
              id: 'account',
              header: 'الحساب',
              cell: (row) => LEDGER_ACCOUNT_LABEL[row.account] ?? row.account,
            },
            {
              id: 'dir',
              header: 'الاتّجاه',
              cell: (row) => (
                <Badge tone={row.direction === 'DEBIT' ? 'neutral' : 'accent'}>
                  {row.direction === 'DEBIT' ? 'مدين' : 'دائن'}
                </Badge>
              ),
            },
            {
              id: 'amount',
              header: 'المبلغ',
              numeric: true,
              cell: (row) => <Money amount={Number(row.amount)} showCurrency={false} />,
            },
            {
              id: 'order',
              header: 'الطلب',
              /* المرجع يُنسخ ويُقارن — لاتينيّ معزول */
              cell: (row) =>
                row.orderRef === null ? (
                  <span className="opacity-35">—</span>
                ) : (
                  <span dir="ltr" className="font-num text-2xs">{row.orderRef}</span>
                ),
            },
          ]}
        />
      )}
    </AdminShell>
  );
}

function Figure({
  label,
  note,
  amount,
  strong,
}: {
  label: string;
  note: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <section
      className={
        strong === true
          ? 'rounded-lg border-2 border-ink p-4'
          : 'rounded-lg border border-line bg-surface p-4'
      }
    >
      <p className="text-2xs opacity-55">{label}</p>
      <p className="mt-1.5">
        <Money amount={Number(amount)} size="lg" />
      </p>
      <p className="mt-1 text-3xs leading-loose opacity-45">{note}</p>
    </section>
  );
}
