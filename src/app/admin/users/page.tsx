import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import {
  listAdminUsers,
  userSegmentCounts,
  type UserSegment,
} from '@/lib/domain/admin-orders';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { UsersTable } from './UsersTable';

export const dynamic = 'force-dynamic';

/**
 * A5 — العملاء.
 *
 * **الهوية خلف صلاحية، وكل اطّلاع مسجَّل** (معيار القبول).
 *
 * والجدول لا يعرض الهوية أصلًا: عرضُها ثم إخفاء بعضها يجعل كل تحميل
 * صفحةٍ اطّلاعًا جماعيًّا على مئة عميل. الاطّلاع **فعلٌ مقصود** على
 * عميل واحد، بسبب مكتوب، ويُسجَّل قبل أن يُعرض شيء.
 */
/**
 * شرائح A5 — **بالترتيب الذي رسمه التصميم** لا بترتيب المخطّط.
 * والمشغّل يتعلّم موضع الشريحة بيده، فترتيبٌ يتغيّر يُبطئه كل مرّة.
 */
const SEGMENTS: readonly { key: UserSegment; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'buyers', label: 'مشترون' },
  { key: 'sellers', label: 'بائعون' },
  { key: 'dealers', label: 'تجار' },
  { key: 'verified', label: 'موثّقون' },
  { key: 'unverified', label: 'غير موثّقين' },
  { key: 'repeat', label: 'متكرّرون' },
  { key: 'suspended', label: 'موقوفون' },
  { key: 'banned', label: 'محظورون' },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'users.view')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : 'all';
  const segment: UserSegment = SEGMENTS.find((row) => row.key === raw)?.key ?? 'all';

  const [users, counts, segments] = await Promise.all([
    listAdminUsers(segment),
    db.user.groupBy({ by: ['status'], _count: { _all: true } }),
    userSegmentCounts(),
  ]);

  const tabs: MonitorTab[] = SEGMENTS.map((row) => ({
    key: row.key === 'all' ? null : row.key,
    label: row.label,
    count: segments[row.key],
    ...(row.key === 'suspended' || row.key === 'banned' ? { tone: 'warn' as const } : {}),
  }));

  const countOf = (status: string): number =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <AdminShell title="العملاء"
      subtitle="تصنيفات وسلوك وقيمة" activeHref="/admin/users" admin={admin}>
      <MonitorTabs tabs={tabs} active={segment === 'all' ? null : segment} basePath="/admin/users" param="tab" />

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <StatCard label="نشط" value={countOf('ACTIVE')} />
        <StatCard label="موقوف" value={countOf('SUSPENDED')} tone={countOf('SUSPENDED') > 0 ? 'warn' : 'plain'} />
        <StatCard label="محظور" value={countOf('BANNED')} />
        <StatCard label="موثّق" value={users.filter((user) => user.idVerified).length} />
      </div>

      <UsersTable users={users} canViewIdentity={canWrite(admin.role, 'users.viewIdentity')} />

      <section className="mt-5 rounded-lg border border-line bg-surface p-5.5">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">قواعد الاطّلاع</h2>
        <ul className="flex flex-col gap-2.5 text-sm leading-loose opacity-72">
          <li>الجدول لا يعرض هوية — عرضها ثم إخفاء بعضها يجعل كل تحميل صفحة اطّلاعًا على مئة عميل.</li>
          <li>الاطّلاع فعلٌ مقصود على عميل واحد، بسبب مكتوب.</li>
          <li>يُسجَّل في سجلّ التدقيق <strong>قبل</strong> أن يُعرض شيء — اطّلاعٌ بلا أثر يُفرغ السجلّ من معناه.</li>
          <li>صورة الهوية ورقمها كاملًا لا يُعادان هنا: الاسم والحالة وتاريخ التوثيق تكفي من يعالج طلبًا.</li>
          <li>الآيبان بأربعة أرقام أخيرة — تكفي للمطابقة ولا تكفي للتحويل.</li>
        </ul>
      </section>
    </AdminShell>
  );
}
