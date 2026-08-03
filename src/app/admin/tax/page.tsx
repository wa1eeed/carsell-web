import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import {
  invoiceTotals,
  listInvoices,
  listTaxRules,
  summarize,
} from '@/lib/domain/admin-tax';
import { INVOICE_STATUS_LABEL, SUPPLY_TYPE_LABEL } from '@/lib/labels/admin';
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
export default async function TaxEnginePage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [rules, invoices, totals] = await Promise.all([
    listTaxRules(),
    listInvoices(),
    invoiceTotals(),
  ]);
  const summary = summarize(rules);

  return (
    <AdminShell title="محرّك الضريبة" activeHref="/admin/tax" admin={admin}>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-55">
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
            قواعد تنتظر المذكرة الضريبية — «المورِّد المفترض»
          </h2>
          <p className="text-2xs leading-loose opacity-85">
            تعديل يناير ٢٠٢٦ قد يجعل المنصّة موِردًا مفترضًا حين يكون البائع فردًا غير
            مسجَّل — فتُستحقّ الضريبة على كامل قيمة المركبة لا على العمولة. وحتى يصل
            التصنيف المكتوب: تصدر هذه الصفقات عقدًا وكشف تسوية بلا فاتورة مركبة،
            وفاتورتنا على العمولة وحدها.
          </p>
          <p className="mt-2.5 text-3xs opacity-70">
            الأسئلة الاثنتا عشرة للمستشار في <span dir="ltr" className="font-num">docs/tax-model.md</span>.
          </p>
        </section>
      )}

      <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        جدول القواعد — المطابقة بالأدقّ نطاقًا
      </h2>
      <RulesTable rules={rules} canManage={canWrite(admin.role, 'finance.view')} />

      <p className="mt-3 text-2xs leading-loose opacity-60">
        <strong>غياب قاعدة مطابقة يوقف الإصدار ويسجّل السبب</strong> — لا يفترض النظام
        معالجةً افتراضيّة أبدًا. و<strong>خارج النطاق تعني لا فاتورة منّا</strong> لا
        فاتورةً بضريبة صفر: الصفر يقول «وردنا وضريبتها لا شيء»، والحقيقة أنّا لم نورّد.
      </p>

      <h2 className="mt-7 mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        صفقة واحدة — ثلاثة مستندات، ولكلٍّ موِرده
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <DocCard
          n={1}
          title="عقد بيع المركبة"
          body="بين البائع والمشتري — لسنا طرفًا فيه، وليس فاتورة. رقم الهيكل والأطراف والسعر والفحص."
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
          body="قد تكون ثلاثًا في الصفقة الواحدة ومن مورّدين مختلفين — المركبة من التاجر، والعمولة والرسوم منّا."
          foot="متوافقة مع «فاتورة» · QR · UUID"
        />
      </div>

      <h2 className="mt-7 mb-2.5 flex flex-wrap items-center gap-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
        الفواتير الصادرة
      </h2>
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

      {invoices.length === 0 ? (
        <EmptyState
          title="لا فواتير بعد"
          description="تصدر الفاتورة عند التسوية المؤكَّدة — و«ينتظر التأكيد» ليست واقعة بعد."
        />
      ) : (
        <DataTable
          rows={invoices}
          rowKey={(invoice) => invoice.number}
          columns={[
            {
              id: 'number',
              header: 'رقم الفاتورة',
              /* يُقتبس ويُقارن خانةً بخانة — لاتينيّ ومعزول */
              cell: (invoice) => (
                <span dir="ltr" className="bidi-isolate font-num font-bold">
                  {invoice.number}
                </span>
              ),
            },
            {
              id: 'supply',
              header: 'النوع',
              cell: (invoice) => SUPPLY_TYPE_LABEL[invoice.supplyType] ?? invoice.supplyType,
            },
            {
              id: 'supplier',
              header: 'المورِّد',
              cell: (invoice) => <span className="bidi-isolate">{invoice.supplierName}</span>,
            },
            {
              id: 'customer',
              header: 'العميل',
              cell: (invoice) => <span className="bidi-isolate">{invoice.customerName}</span>,
            },
            {
              id: 'subtotal',
              header: 'قبل الضريبة',
              numeric: true,
              cell: (invoice) => <ArabicNumber value={Number(invoice.subtotal)} decimals={2} />,
            },
            {
              id: 'tax',
              header: 'الضريبة',
              numeric: true,
              cell: (invoice) => <ArabicNumber value={Number(invoice.taxTotal)} decimals={2} />,
            },
            {
              id: 'total',
              header: 'الإجمالي',
              numeric: true,
              cell: (invoice) => <Money amount={invoice.total} />,
            },
            {
              id: 'status',
              header: 'الحالة',
              cell: (invoice) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={invoice.status === 'REPORT_FAILED' ? 'warn' : 'neutral'}>
                    {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                  </Badge>
                  {/* الأصل يبقى ويُقرأ مع إشعاره — الإلغاء لا يحذف */}
                  {invoice.creditNotes === 0 ? null : (
                    <Badge tone="warn">
                      <Quantity unit="creditNotes" count={invoice.creditNotes} />
                    </Badge>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}

      <p className="mt-3 text-2xs leading-loose opacity-55">
        <strong>لا تُحذف فاتورة أبدًا</strong> — الإلغاء إشعار دائن يشير إلى الأصل،
        وكلاهما يبقى ويُقرأ معًا. وفجوةٌ في التسلسل لا تُشرح لمدقّق.
      </p>
      <p className="mt-1.5 text-2xs leading-loose opacity-55">
        تصدير زاتكا XML والتوقيع والإبلاغ <strong>غير مبنيَّة بعد</strong> — تنتظر بيانات
        التسجيل لدى الهيئة.
      </p>
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
      <p className="text-2xs leading-loose opacity-70">{body}</p>
      <p className="mt-2.5 border-t border-line pt-2.5 text-3xs opacity-55">{foot}</p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-md border border-line px-3 py-1.5 text-2xs">
      <span className="opacity-60">{label}</span>
      <ArabicNumber value={value} className="font-bold" />
    </span>
  );
}
