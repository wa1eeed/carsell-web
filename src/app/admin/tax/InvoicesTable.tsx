'use client';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { DataTable } from '@/components/ui/DataTable';
import { Quantity } from '@/components/ui/Quantity';
import { INVOICE_STATUS_LABEL, SUPPLY_TYPE_LABEL } from '@/lib/labels/admin';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import type { InvoiceRow } from '@/lib/domain/admin-tax';

/**
 * ═══ جدول الفواتير — **مكوّن عميل** ═══
 *
 * `DataTable` عميلٌ وأعمدتُه دوالّ `cell`، ودالّةٌ لا تعبر حدّ الخادم:
 * **«Functions cannot be passed directly to Client Components»**.
 *
 * وكانت الشاشة **تمرّ ٢٠٠** لأن لا فاتورة في القاعدة — فالفرع لا
 * يُصيَّر أصلًا. وأوّل فاتورةٍ تُصدَر تُسقطها. والبوابة ٢٢ تمنع الصنف.
 */
export function InvoicesTable({ invoices }: { invoices: readonly InvoiceRow[] }) {
  return (
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
  );
}
