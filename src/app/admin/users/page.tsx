import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import {
  listAdminUsers,
  userSegmentCounts,
  type UserSegment,
} from '@/lib/domain/admin-orders';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { ListSearch } from '@/components/admin/ListSearch';
import { ListFooter } from '@/components/admin/ListFooter';
import { UserCard } from '@/components/admin/UserCard';
import { EmptyState } from '@/components/ui/EmptyState';

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
  { key: 'individuals', label: 'أفراد' },
  { key: 'dealers', label: 'معارض' },
  { key: 'verified', label: 'موثقون' },
  { key: 'unverified', label: 'غير موثقين' },
  { key: 'repeat', label: 'متكررون' },
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
  const term = typeof search.q === 'string' && search.q.trim() !== '' ? search.q.trim() : null;

  const [users, counts, segments] = await Promise.all([
    listAdminUsers(segment, term),
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
      {/*
        **والتصدير من مكان القائمة.** شاشةٌ جامعة صحيحةٌ للمراجعة
        الدورية، لكن من يقف على طابورٍ مرشَّح يريد تصديره الآن.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
        <ExportLink reportKey="customers" allowed={can(admin.role, 'users.viewIdentity')} />
      </div>

      <ListSearch
        action="/admin/users"
        value={term}
        placeholder="رقم العميل · الاسم · البريد"
        keep={{ tab: segment === 'all' ? null : segment }}
      />

      <MonitorTabs tabs={tabs} active={segment === 'all' ? null : segment} basePath="/admin/users" param="tab" />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="نشط" value={countOf('ACTIVE')} />
        <StatCard label="موقوف" value={countOf('SUSPENDED')} tone={countOf('SUSPENDED') > 0 ? 'warn' : 'plain'} />
        <StatCard label="محظور" value={countOf('BANNED')} />
        {/*
          ═══ وبطاقاتُ الصفّ الواحد تصف شيئًا واحدًا ═══

          كانت هذه وحدَها تُحسب من `users` — **القائمة المرشَّحة** —
          وجاراتُها من القاعدة. فعلى شريحة «معارض» يقرأ المشغّل «نشط ٢٦
          · موثّق ٤»: ثلاثٌ تصف المنصّة وواحدةٌ تصف الصفحة، في صفٍّ
          واحد ولا شيء يفرّق. فيُقرأ أن ستّةً وعشرين نشطًا منهم أربعةٌ
          موثّقون.
        */}
        <StatCard label="موثق" value={segments.verified} />
      </div>

      {/*
        **والكروت لا الجدول.** الصف كان اسمًا وآخر أربعة من الجوال
        وعددين، فمراجعة عشرين حسابًا عشرون فتحًا ورجوعًا. والكرت يحمل
        التصنيف والتوثيق والحالة وثلاثة أرقام وتاريخ الانضمام.
      */}
      {users.length === 0 ? (
        <EmptyState
          title="لا عملاء في هذه الشريحة"
          description="جرب شريحة أخرى أو امسح البحث."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {users.map((user) => (
            <UserCard key={user.id} row={user} />
          ))}
        </div>
      )}
      <ListFooter
        shown={users.length}
        total={segment === 'all' && term === null ? segments.all : null}
        can="فتح ملف العميل لقراءة إعلاناته وطلباته وكشف محفظته، وطلب تعديل رصيده (يعتمده شخص ثان)."
        cannot="عرض رقم الهوية أو صورتها من الجدول — الاطلاع فعل مقصود على عميل واحد بسبب مكتوب، ويقيد قبل أن يعرض شيء. والآيبان بأربعة أرقام: تكفي للمطابقة ولا تكفي للتحويل."
        automatic="البحث لا يشمل رقم الجوال — رقم كامل في مربع بحث يسجل في كل سجل وصول."
      />
    </AdminShell>
  );
}
