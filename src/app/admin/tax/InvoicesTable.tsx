'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
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
export function InvoicesTable({
  invoices,
  canCancel,
}: {
  invoices: readonly InvoiceRow[];
  /** الإلغاء يحتاج `finance.view` — ولا يُعرض زرٌّ يُرفض بعد الضغط. */
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<InvoiceRow | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const submit = (): void => {
    if (target === null) return;
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/tax/invoices/${encodeURIComponent(target.number)}/cancel`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      ).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { creditNoteNumber?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر الإلغاء.');
        return;
      }

      setTarget(null);
      setReason('');
      setToast(`صدر إشعار دائن ${payload?.data?.creditNoteNumber ?? ''}`.trim());
      router.refresh();
    });
  };

  return (
    <>
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
      header: 'المورد',
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
    /**
     * ═══ الإلغاء بإشعارٍ دائن — ولم يكن له باب ═══
     *
     * `cancelInvoice` مبنيّةٌ مختبَرة منذ المهمّة ٢١ ولا شيء يناديها،
     * ففاتورةٌ صدرت بخطأ تبقى صادرةً إلى الأبد.
     *
     * **والأصل لا يُحذف**: يبقى ويُقرأ مع إشعاره — فالفاتورة مستندٌ
     * لا يُنقَّح، وتصحيحُها قيدٌ يعاكسها.
     */
    {
      id: 'cancel',
      header: '',
      cell: (invoice) =>
        !canCancel || invoice.status === 'CANCELLED' ? null : (
          <button
            type="button"
            onClick={() => setTarget(invoice)}
            className="text-3xs font-bold text-danger underline underline-offset-2"
          >
            إشعار دائن
          </button>
        ),
    },
      ]}
    />

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title="إلغاء فاتورة بإشعار دائن"
      >
        <p className="mb-3.5 text-2xs leading-loose opacity-75">
          لا تحذف الفاتورة: يصدر إشعار دائن يعاكسها، ويبقى الأصل مقروءا معه.
          <span dir="ltr" className="ms-1.5 font-num opacity-70">
            {target?.number}
          </span>
        </p>

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-3xs font-bold opacity-70">السبب — إلزامي</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="صدرت على مشتر خاطئ · ألغي الطلب قبل التسليم · …"
            className="rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-loose"
          />
          {/*
            **ويُقرأ في مراجعةٍ بعد سنة.** «أُلغيت» بلا سببٍ مكتوب
            سؤالٌ بلا جواب — والحدّ خمسة أحرف لا لأنه كافٍ بل لأن ما
            دونه ليس سببًا.
          */}
          <span className="text-3xs opacity-65">يقرأ في مراجعة ضريبية بعد سنة.</span>
        </label>

        <div className="flex gap-2.5">
          <Button disabled={busy || reason.trim().length < 5} onClick={submit}>
            {busy ? 'جار…' : 'أصدر الإشعار'}
          </Button>
          <Button variant="outline" onClick={() => setTarget(null)}>
            تراجع
          </Button>
        </div>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
