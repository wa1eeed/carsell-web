'use client';

import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import type { UserRow } from '@/lib/domain/admin-orders';
import { IdentityPanel } from './IdentityPanel';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط', SUSPENDED: 'موقوف', BANNED: 'محظور',
};

/**
 * جدول العملاء — **بلا هوية**.
 *
 * الصفوف تصل مُعدّة من الخادم بأربعة أرقام أخيرة وحدها: تمرير الصفّ
 * كاملًا يضع مئة رقم جوال في حمولة الصفحة ولو لم يُعرض أيٌّ منها.
 * الإخفاء بالعرض ليس إخفاءً — ما يعبر الحدّ يصل المتصفّح.
 */
export function UsersTable({ users, canViewIdentity }: { users: readonly UserRow[]; canViewIdentity: boolean }) {
  return (
    <DataTable
      rows={users}
      rowKey={(user) => user.id}
      columns={[
        {
          id: 'phone',
          header: 'الجوال',
          cell: (user) => (
            <span className="font-num bidi-ltr text-2xs">···{user.phoneTail}</span>
          ),
        },
        {
          id: 'name',
          header: 'الاسم',
          // **الاسم يفتح الملفّ** — وقائمةٌ لا تُفتح صفوفُها لا يُتصرَّف فيها
          cell: (user) => (
            <Link
              href={`/admin/users/${user.id}`}
              className="bidi-isolate font-semibold underline underline-offset-4 hover:opacity-70"
            >
              {user.name ?? 'بلا اسم'}
            </Link>
          ),
        },
        {
          id: 'status',
          header: 'الحالة',
          cell: (user) => (
            <Badge tone={user.status === 'ACTIVE' ? 'accent' : 'warn'}>
              {STATUS_LABEL[user.status] ?? user.status}
            </Badge>
          ),
        },
        {
          id: 'verified',
          header: 'التوثيق',
          cell: (user) =>
            user.idVerified ? <Badge tone="accent">موثّق</Badge> : <Badge tone="neutral">غير موثّق</Badge>,
        },
        {
          id: 'listings',
          header: 'إعلانات',
          numeric: true,
          sortable: true,
          cell: (user) => <ArabicNumber value={user.listingCount} />,
        },
        {
          id: 'orders',
          header: 'طلبات',
          numeric: true,
          sortable: true,
          cell: (user) => <ArabicNumber value={user.orderCount} />,
        },
        {
          id: 'identity',
          header: '',
          cell: (user) => <IdentityPanel userId={user.id} allowed={canViewIdentity} />,
        },
      ]}
      empty={{ title: 'لا عملاء' }}
    />
  );
}
