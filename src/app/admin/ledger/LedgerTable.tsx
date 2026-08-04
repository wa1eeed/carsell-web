'use client';

import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { LEDGER_ACCOUNT_LABEL } from '@/lib/labels/admin';
import type { LedgerRow } from '@/lib/domain/platform-book';

/**
 * ═══ جدول الدفتر — **مكوّن عميل** ═══
 *
 * `DataTable` عميلٌ منذ بنائه، وأعمدتُه دوالّ `cell`. وتمريرُ دالّةٍ من
 * مكوّن خادم لا يمرّ: **«Functions cannot be passed directly to Client
 * Components»** — والشاشة تردّ ٥٠٠ لا تعرض جدولًا ناقصًا.
 *
 * وكانت الشاشة تفعله منذ بنائها: ١٢ شاشةً أخرى تستعمل `DataTable` من
 * مكوّن عميل، وهذه وحدها من الخادم. ولم يكشفها اختبار — **الاختبارات
 * لا تفتح شاشة**، وكشفها فحصُ كل وجهةٍ في الشريط بـ`curl`.
 */
export function LedgerTable({ entries }: { entries: readonly LedgerRow[] }) {
  return (
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
  );
}
