'use client';

import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import type { OrderRow } from '@/lib/domain/admin-orders';

const STAGE_LABEL: Record<string, string> = {
  REQUEST: 'الطلب', APPROVED: 'الموافقة', INSPECTION: 'الفحص',
  PAYMENT: 'الدفع', TRANSFER: 'نقل الملكية', DONE: 'تمّ',
};

/**
 * الجدول مكوّن عميل، والصفوف تصله **مُعدّة على الخادم**.
 *
 * `DataTable` يستقبل دوال `cell`، ودالةٌ لا تعبر حدّ الخادم/العميل —
 * فالجدول كلّه على العميل والبيانات وحدها تعبر. وهذا هو نفس حدّ
 * الاستيرادات المسجَّل في CLAUDE.md، بوجهه الآخر.
 */
export function OrdersTable({ orders }: { orders: readonly OrderRow[] }) {
  return (
    <DataTable
      rows={orders}
      rowKey={(order) => order.ref}
      columns={[
        {
          id: 'ref',
          header: 'الطلب',
          /*
            **المرجع يفتح الطلب.** والقائمة كانت تعرض صفوفًا ولا تفتحها،
            فمن رأى طلبًا متعثّرًا لا يعرف لماذا.
          */
          cell: (order) => (
            <Link
              href={`/admin/orders/${encodeURIComponent(order.ref)}`}
              dir="ltr"
              className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-70"
            >
              {order.ref}
            </Link>
          ),
        },
        {
          id: 'stage',
          header: 'المرحلة',
          cell: (order) => <Badge tone="neutral">{STAGE_LABEL[order.stage] ?? order.stage}</Badge>,
        },
        {
          id: 'dwell',
          header: 'مدّة البقاء',
          numeric: true,
          sortable: true,
          cell: (order) => (
            <span className="flex items-center justify-end gap-1.5">
              <ArabicNumber value={order.dwellHours} />
              <span className="text-3xs opacity-45">/</span>
              <ArabicNumber value={order.targetHours} className="text-3xs opacity-45" />
              {order.critical ? (
                <Badge tone="danger">تجاوز الضعف</Badge>
              ) : order.late ? (
                <Badge tone="warn">متأخّر</Badge>
              ) : null}
            </span>
          ),
        },
        {
          id: 'total',
          header: 'الإجمالي',
          numeric: true,
          sortable: true,
          cell: (order) => <ArabicNumber value={Number(order.total)} />,
        },
        {
          id: 'parties',
          header: 'الطرفان',
          cell: (order) => (
            <span className="flex flex-col gap-0.5 text-2xs">
              <span className="bidi-isolate">{order.buyer}</span>
              <span className="bidi-isolate opacity-55">{order.seller}</span>
            </span>
          ),
        },
        {
          id: 'flags',
          header: '',
          cell: (order) => (order.hasDispute ? <Badge tone="warn">نزاع</Badge> : null),
        },
      ]}
      empty={{ title: 'لا طلبات جارية' }}
    />
  );
}
