'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ServiceRequestCard } from '@/components/admin/ServiceRequestCard';
import type { ServiceRequestRow } from '@/lib/domain/admin-services';


/**
 * **المتجاوز بارز** — لونًا وترتيبًا ومرشِّحًا.
 *
 * ثلاثة معًا لأن أيًّا منها وحده يُخفي: اللون وحده يضيع في جدول طويل،
 * والترتيب وحده يخفت حين يُعاد الفرز بعمود آخر، والمرشِّح وحده يحتاج
 * أن يعرف المحرّر أن هناك ما يُرشَّح.
 */
export function RequestsQueue({ requests }: { requests: readonly ServiceRequestRow[] }) {
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

      {rows.length === 0 ? (
        <EmptyState
          title={onlyOverdue ? 'لا طلبات متجاوزة' : 'لا طلبات هنا'}
          description={
            onlyOverdue
              ? 'كل الطلبات ضمن مهلها — أطفئ المرشّح لرؤية الباقي.'
              : 'حين يطلب عميلٌ خدمةً تظهر هنا بموعدها ومهلتها.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((request) => (
            <ServiceRequestCard key={request.ref} row={request} />
          ))}
        </div>
      )}
    </>
  );
}
