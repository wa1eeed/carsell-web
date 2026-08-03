'use client';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Quantity } from '@/components/ui/Quantity';
import type { ServiceRequestRow } from '@/lib/domain/admin-services';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'جديد', ASSIGNED: 'مُسنَد', IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'مُنجَز', FAILED: 'فشل', REFUNDED: 'مُسترجَع',
};

/**
 * **المتجاوز بارز** — لونًا وترتيبًا ومرشِّحًا.
 *
 * ثلاثة معًا لأن أيًّا منها وحده يُخفي: اللون وحده يضيع في جدول طويل،
 * والترتيب وحده يخفت حين يُعاد الفرز بعمود آخر، والمرشِّح وحده يحتاج
 * أن يعرف المحرّر أن هناك ما يُرشَّح.
 */
export function RequestsTable({ requests }: { requests: readonly ServiceRequestRow[] }) {
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const rows = onlyOverdue ? requests.filter((request) => request.overdue) : requests;

  return (
    <>
      <div className="mb-4 flex items-center gap-2.5">
        <Button
          size="sm"
          variant={onlyOverdue ? 'primary' : 'outline'}
          onClick={() => setOnlyOverdue((value) => !value)}
        >
          المتجاوزة فقط
        </Button>
      </div>

      <DataTable
        rows={rows}
        rowKey={(request) => request.ref}
        columns={[
          {
            id: 'ref',
            header: 'الطلب',
            cell: (request) => <span className="font-num text-2xs">{request.ref}</span>,
          },
          {
            id: 'service',
            header: 'الخدمة',
            cell: (request) => <span className="bidi-isolate">{request.serviceName}</span>,
          },
          {
            id: 'status',
            header: 'الحالة',
            cell: (request) => (
              <Badge tone={request.status === 'DONE' ? 'accent' : 'neutral'}>
                {STATUS_LABEL[request.status] ?? request.status}
              </Badge>
            ),
          },
          {
            id: 'due',
            header: 'المهلة',
            numeric: true,
            sortable: true,
            cell: (request) =>
              request.overdue ? (
                <span className="flex items-center justify-end gap-1.5">
                  <Badge tone="danger">
                    <span className="flex items-center gap-1.5">
                      <span>متأخّر</span>
                      <Quantity unit="hours" count={request.overdueHours ?? 0} />
                    </span>
                  </Badge>
                </span>
              ) : request.dueAt === null ? (
                <span className="text-3xs opacity-40">—</span>
              ) : (
                <span className="text-3xs opacity-55">ضمن المهلة</span>
              ),
          },
          {
            id: 'amount',
            header: 'المبلغ',
            numeric: true,
            sortable: true,
            /* المبلغ لقطة الطلب لا سعر الخدمة اليوم */
            cell: (request) => <ArabicNumber value={Number(request.amount)} />,
          },
          {
            id: 'provider',
            header: 'المزوّد',
            cell: (request) =>
              request.providerName === null ? (
                <Badge tone="warn">بلا مزوّد</Badge>
              ) : (
                <span className="bidi-isolate text-2xs">{request.providerName}</span>
              ),
          },
          {
            id: 'customer',
            header: 'العميل',
            cell: (request) => <span className="bidi-isolate text-2xs">{request.customer}</span>,
          },
        ]}
        empty={{ title: onlyOverdue ? 'لا طلبات متأخّرة' : 'لا طلبات خدمات' }}
      />
    </>
  );
}
