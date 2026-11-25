import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { NewSegment } from '@/app/admin/campaigns/NewSegment';
import { SEGMENT_FIELDS } from '@/lib/campaigns/segments';
import { StatCard } from '@/components/ui/StatCard';
import { StatCard as ValueCard } from '@/components/admin/StatCard';
import { Quantity } from '@/components/ui/Quantity';
import { displayDigits } from '@/lib/arabic';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import {
  customerValue,
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

/**
 * ما يقابل فلترَ الشاشة من شروط الشريحة — **وما لا يقابله ليس هنا**.
 *
 * «متكرّرون» تحتاج عدّ الصفقات، و«موقوفون» و«محظورون» حالةُ حساب لا
 * سلوك — ولا تُرسَل إليهم حملةٌ أصلًا (موافقةُ التسويق تُسقطهم).
 */
const SEGMENT_RULE_OF: Readonly<Record<string, Readonly<Record<string, 'on' | 'not'>>>> = {
  dealers: { isDealer: 'on' },
  individuals: { isDealer: 'not' },
  verified: { isVerified: 'on' },
  unverified: { isVerified: 'not' },
  sellers: { hasListing: 'on' },
  buyers: { hasCompletedOrder: 'on' },
};

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

  const [users, counts, segments, value] = await Promise.all([
    listAdminUsers(segment, term),
    db.user.groupBy({ by: ['status'], _count: { _all: true } }),
    userSegmentCounts(),
    customerValue(),
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
        {/*
          **و«شريحة جديدة» تفتح بما يقابل الفلتر — حين يقابله.** الترميز
          يقول «يمكن حفظ أيّ فلتر كشريحة»، وأكثرُ فلاتر هذه الشاشة ليس من
          مفردات الشرائح («متكرّرون» · «موقوفون»). فما يقابله يُفتح
          مضبوطًا، وما لا يقابله يُفتح فارغًا — ولا يُوعَد بحفظٍ لا يقع.
        */}
        {can(admin.role, 'notifications.manage') ? (
          <NewSegment
            fields={SEGMENT_FIELDS}
            label="شريحة جديدة"
            initial={SEGMENT_RULE_OF[segment] ?? {}}
          />
        ) : null}
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
        ═══ ثلاثةُ مؤشّرات يرسمها الترميز — ومقامُها معلَن ═══

        «متوسط قيمة العميل» و«متوسط الصفقات للعميل» يصفان **المشتري** لا
        كلَّ مسجَّل: قسمتُهما على المسجَّلين تجعل ألفَ حسابٍ جديد تنصّف
        الرقمين بلا أن يتغيّر سلوكُ من يشتري. فالمقام مكتوبٌ تحتهما.
      */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <ValueCard
          title="متوسط قيمة العميل"
          money={value.averageValue}
          note={
            /* الجارُّ لا يسبق العدد — الصيغةُ تحمله أو يُزاح (البوابة ٥٨) */
            <>
              <Quantity unit="buyers" count={value.buyers} /> اشتروا — وعليهم قسمت
            </>
          }
        />
        <ValueCard
          title="متوسط الصفقات للعميل"
          value={value.dealsPerBuyer}
          note="الطلبات المكتملة على من اشترى"
        />
        <ValueCard
          title="نسبة التوثيق"
          value={`${displayDigits(String(value.verifiedPct))}٪`}
          note="الموثقون من كل مسجل"
        />
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
        can="فتح ملف العميل لقراءة إعلاناته وطلباته وكشف محفظته، وتعديل رصيده، ويسجل باسمك في سجل التدقيق."
        cannot="عرض رقم الهوية أو صورتها من الجدول. الاطلاع يتم من صفحة العميل بسبب مكتوب، ويسجل قبل أن يعرض شيء. والآيبان يعرض بأربعة أرقام تكفي للمطابقة ولا تكفي للتحويل."
        automatic="البحث لا يشمل رقم الجوال. الرقم الكامل في مربع بحث يسجل في كل سجل وصول."
      />
    </AdminShell>
  );
}
