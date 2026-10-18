import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { EmptyState } from '@/components/ui/EmptyState';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import {
  invoiceCountsByType,
  invoiceTotals,
  blockedInvoices,
  listInvoices,
  listTaxRules,
  pendingRuleChanges,
  summarize,
} from '@/lib/domain/admin-tax';
import { SUPPLY_TYPE_LABEL } from '@/lib/labels/admin';
import { InvoicesTable } from './InvoicesTable';
import Link from 'next/link';
import { INVOICE_BLOCK_REASON } from '@/lib/labels/admin';
import { RulesTable } from './RulesTable';

export const dynamic = 'force-dynamic';

/**
 * A21 — محرّك الضريبة.
 *
 * **صفوفٌ يديرها المشغّل لا شروطٌ في الكود.** تعديل يناير ٢٠٢٦ قد يجعل
 * المنصّة موِردًا مفترضًا فتُستحقّ الضريبة على كامل قيمة المركبة لا على
 * العمولة — الفرق بين ١٥٠ و١٥٬٠٠٠ في صفقة واحدة. والتصنيف ينتظر مذكرة،
 * فالمعالجة صفٌّ يُفعَّل لا نشرةٌ تُطلق.
 */
/** شرائح A21 — بأسماء التوريد التي يقرؤها المحاسب لا برموزه. */
const SEGMENTS: readonly { key: string | null; label: string }[] = [
  { key: null, label: 'كل الفواتير' },
  { key: 'COMMISSION', label: 'عمولة' },
  { key: 'SERVICE', label: 'خدمات' },
  { key: 'VEHICLE', label: 'مركبة' },
  { key: 'credit', label: 'إشعارات دائنة' },
];

export default async function TaxEnginePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.type === 'string' ? search.type : null;
  const active = SEGMENTS.find((row) => row.key === raw)?.key ?? null;

  const counts = await invoiceCountsByType();
  const tabs: MonitorTab[] = SEGMENTS.map((row) => ({
    key: row.key,
    label: row.label,
    count: counts[row.key ?? 'all'] ?? 0,
  }));

  const [rules, awaiting, invoices, totals, blocked] = await Promise.all([
    listTaxRules(),
    pendingRuleChanges(),
    listInvoices(60, active),
    invoiceTotals(),
    blockedInvoices(),
  ]);
  const summary = summarize(rules);

  return (
    <AdminShell title="محرك الضريبة"
      subtitle="القواعد والفواتير والإشعارات" activeHref="/admin/tax" admin={admin}>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-70">
        <Quantity unit="taxRules" count={summary.total} />
        <span aria-hidden className="opacity-40">·</span>
        <Quantity unit="activeRules" count={summary.active} />
        <span aria-hidden className="opacity-40">·</span>
        <Quantity unit="awaitingRules" count={summary.awaiting} /> تنتظر المذكرة الضريبية
        <span aria-hidden className="opacity-40">·</span>
        <span>متوافق مع «فاتورة»</span>
      </p>

      {/*
        ═══ الانكشاف يُعرض في رأس الشاشة ═══

        وهو أكبر انكشافٍ ماليّ في المنتج، فموضعه فوق الجدول لا حاشيةً
        تحته: من يفتح الشاشة يجب أن يقرأه قبل أن يعدّل صفًّا.
      */}
      {summary.awaiting === 0 ? null : (
        <section className="mb-5 rounded-lg border border-warn-200 bg-warn-100 p-5 text-warn-900">
          <h2 className="mb-1.5 text-sm font-bold">
            قواعد تنتظر المذكرة الضريبية — «المورد المفترض»
          </h2>
          <p className="text-2xs leading-loose opacity-85">
            تعديل يناير 2026 قد يجعل المنصة موردا مفترضا حين يكون البائع فردا غير
            مسجل — فتستحق الضريبة على كامل قيمة المركبة لا على العمولة. وحتى يصل
            التصنيف المكتوب: تصدر هذه الصفقات عقدا وكشف تسوية بلا فاتورة مركبة،
            وفاتورتنا على العمولة وحدها.
          </p>
          <p className="mt-2.5 text-3xs opacity-75">
            الأسئلة الاثنتا عشرة للمستشار في <span dir="ltr" className="font-num">docs/tax-model.md</span>.
          </p>
        </section>
      )}

      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
        جدول القواعد — المطابقة بالأدق نطاقا
      </h2>
      <RulesTable
        rules={rules}
        awaiting={awaiting}
        adminId={admin.id}
        canManage={canWrite(admin.role, 'finance.view')}
      />

      <p className="mt-3 text-2xs leading-loose opacity-70">
        <strong>غياب قاعدة مطابقة يوقف الإصدار ويسجل السبب</strong> — لا يفترض النظام
        معالجة افتراضية أبدا. و<strong>خارج النطاق تعني لا فاتورة منا</strong> لا
        فاتورة بضريبة صفر: الصفر يقول «وردنا وضريبتها لا شيء»، والحقيقة أنا لم نورد.
      </p>

      <h2 className="mt-7 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
        صفقة واحدة — ثلاثة مستندات، ولكل مورده
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <DocCard
          n={1}
          title="عقد بيع المركبة"
          body="بين البائع والمشتري — لسنا طرفا فيه، وليس فاتورة. رقم الهيكل والأطراف والسعر والفحص."
          foot="يصدر عند تأكيد النقل"
        />
        <DocCard
          n={2}
          title="كشف التسوية المالية"
          body="قيمة المركبة · عمولتنا وضريبتها · رسوم المعالجة · الخدمات · الصافي للبائع · المحتجز والمردود."
          foot="ليس فاتورة ضريبية — مكتوب في رأسه"
        />
        <DocCard
          n={3}
          title="الفواتير الضريبية"
          body="قد تكون ثلاثا في الصفقة الواحدة ومن موردين مختلفين — المركبة من التاجر، والعمولة والرسوم منا."
          foot="متوافقة مع «فاتورة» · QR · UUID"
        />
      </div>

      <h2 className="mt-7 mb-2.5 flex flex-wrap items-center gap-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
        الفواتير الصادرة
      </h2>
      <MonitorTabs tabs={tabs} active={active} basePath="/admin/tax" param="type" />
      <div className="mb-3 flex flex-wrap gap-2">
        <Count label="كل الفواتير" value={totals.all} />
        {totals.bySupply.map((line) => (
          <Count
            key={line.key}
            label={SUPPLY_TYPE_LABEL[line.key] ?? line.key}
            value={line.count}
          />
        ))}
        <Count label="إشعارات دائنة" value={totals.creditNotes} />
      </div>

      {/*
        ═══ والمنع غيرُ الانتظار ═══

        «لا فواتير بعد · تصدر عند التسوية المؤكَّدة» تُقرأ «لم تقع تسوية».
        وقد وقعت وحُجبت الفاتورة: الحدث مكتوبٌ على الطلب منذ بُني
        (`invoice.blocked`) ويُقرأ في خطّه الزمنيّ — **ولا يصل الشاشة
        التي يقف عندها من يراقب الامتثال**، وهو لا يعرف أيّ طلبٍ يفتح.
        وأوّلُ مطابقةٍ شهرية تكشف فرقًا بلا جوابٍ مكتوب.
      */}
      {blocked.length === 0 ? null : (
        <section className="mb-4 rounded-lg border border-warn/35 bg-warn-100 p-4.5">
          <p className="mb-1.5 text-xs font-bold">
            <Quantity unit="blockedSettlements" count={blocked.length} />
          </p>
          <p className="mb-3 text-2xs leading-loose opacity-75">
            تأكدت التسوية ولم تصدر الفاتورة. وكل سطر يقول أي توريد حجب ولماذا —
            وأكثره يحل بإقرار قاعدة قائمة لا بكتابة جديدة.
          </p>
          <ul className="flex flex-col gap-2 text-2xs">
            {blocked.map((row) => (
              <li key={`${row.orderId}-${row.at}`} className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/admin/orders/${row.orderRef}`}
                  dir="ltr"
                  className="font-num font-bold underline"
                >
                  {row.orderRef}
                </Link>
                {row.lines.map((line) => (
                  <span key={`${line.supplyType}-${line.reason}`} className="opacity-75">
                    {SUPPLY_TYPE_LABEL[line.supplyType] ?? line.supplyType} —{' '}
                    {INVOICE_BLOCK_REASON[line.reason] ?? line.reason}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          title={blocked.length === 0 ? 'لا فواتير بعد' : 'لا فاتورة صدرت'}
          description={
            blocked.length === 0
              ? 'تصدر الفاتورة عند التسوية المؤكدة — و«ينتظر التأكيد» ليست واقعة بعد.'
              : 'وقعت تسويات ولم تصدر لها فاتورة — السبب في الإنذار أعلاه.'
          }
        />
      ) : (
        <InvoicesTable invoices={invoices} canCancel={canWrite(admin.role, 'finance.view')} />
      )}

      <p className="mt-3 text-2xs leading-loose opacity-70">
        <strong>لا تحذف فاتورة أبدا</strong> — الإلغاء إشعار دائن يشير إلى الأصل،
        وكلاهما يبقى ويقرأ معا. وفجوة في التسلسل لا تشرح لمدقق.
      </p>
      <p className="mt-1.5 text-2xs leading-loose opacity-70">
        تصدير زاتكا XML والتوقيع والإبلاغ <strong>غير مبنية بعد</strong> — تنتظر بيانات
        التسجيل لدى الهيئة.
      </p>
    
      <ListFooter
        shown={invoices.length}
        total={null}
        note="الفواتير الصادرة — والقواعد أعلاها"
        can="إصدار إشعار دائن على فاتورة، وإقرار قاعدة ضريبية معطلة بعد مراجعتها."
        cannot="تعديل فاتورة صدرت أو حذفها — الفاتورة الضريبية مستند لا ينقح، وتصحيحها إشعار دائن يعاكسها."
        automatic="فاتورة تحجب لغياب قاعدة أو لتعطيلها تسجل حدثا على طلبها."
      />
    </AdminShell>
  );
}

function DocCard({
  n,
  title,
  body,
  foot,
}: {
  n: number;
  title: string;
  body: string;
  foot: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <p className="mb-2 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full border border-line text-3xs font-bold">
          <ArabicNumber value={n} grouped={false} />
        </span>
        <span className="text-xs font-bold">{title}</span>
      </p>
      <p className="text-2xs leading-loose opacity-75">{body}</p>
      <p className="mt-2.5 border-t border-line pt-2.5 text-3xs opacity-70">{foot}</p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-md border border-line px-3 py-1.5 text-2xs">
      <span className="opacity-70">{label}</span>
      <ArabicNumber value={value} className="font-bold" />
    </span>
  );
}
