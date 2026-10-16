import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { ListFooter } from '@/components/admin/ListFooter';
import { StatCard } from '@/components/ui/StatCard';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { db } from '@/lib/db';
import {
  listServiceRequests,
  serviceRequestCounts,
  serviceQueueHealth,
} from '@/lib/domain/admin-services';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { RequestsQueue } from './RequestsQueue';

export const dynamic = 'force-dynamic';

/**
 * A6 — طلبات الخدمات.
 *
 * **المهلة المتجاوزة بارزة** (معيار القبول): الطابور مرتَّب بالمهلة
 * تصاعديًّا، والمتجاوز أحمر في صدره. وترتيبٌ بتاريخ الإنشاء يدفن طلبًا
 * تأخّر أسبوعًا تحت عشرة وصلت اليوم.
 */
/**
 * شرائح A6 — **حالاتٌ ثم أنواع**، كما يرتّبها التصميم. والمشغّل يسأل
 * «ما المتأخّر؟» و«كم فحصًا اليوم؟» بالتبادل، فشريطٌ واحد لا شريطان.
 */
const SEGMENTS: readonly { key: string | null; label: string }[] = [
  { key: null, label: 'الكل' },
  { key: 'NEW', label: 'معلّقة' },
  { key: 'ASSIGNED', label: 'مسندة' },
  { key: 'IN_PROGRESS', label: 'قيد التنفيذ' },
  { key: 'DONE', label: 'مكتملة' },
  { key: 'FAILED', label: 'ملغاة' },
  /**
   * **وحالةٌ بلا شريحة لا تُرى.** `REFUNDED` موجودةٌ في التعداد ويكتبها
   * المنتج، ولم تكن لها شريحة — فطلبٌ مستردٌّ لا يُبلَغ إلا من «الكل».
   */
  { key: 'REFUNDED', label: 'مستردّة' },
];

/** اسمُ المرشَّح كما يُقرأ في سطر «معروضٌ: …». */
const SCOPE_LABEL: Record<'open' | 'overdue' | 'unassigned', string> = {
  open: 'المفتوحة وحدها',
  overdue: 'المتجاوزة للمهلة وحدها',
  unassigned: 'ما لا مزوّد له وحده',
};

/** بطاقةٌ تُفتح متى كان فيها ما يُفتح — والصفر لا يُربط. */
function StatLink({
  href,
  show,
  children,
}: {
  href: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {children}
    </Link>
  );
}

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'serviceRequests.handle')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.filter === 'string' ? search.filter : null;
  /**
   * ═══ `?overdue=1` و`?unassigned=1` ═══
   *
   * `onlyOverdue` موجودٌ في مرشّحات النطاق منذ بُنيت **ولا يمرّره أحد**،
   * و«بلا مزوّد» لم يكن له مرشّحٌ أصلًا. والبطاقتان تعدّان ولا تفتحان —
   * فيقرأ المشغّل «تجاوزت المهلة ١» ثم يبحث عنها في الجدول بعينه.
   */
  const onlyOverdue = search.overdue === '1';
  const onlyUnassigned = search.unassigned === '1';
  const onlyOpen = search.open === '1';
  const scope = onlyOverdue ? 'overdue' : onlyUnassigned ? 'unassigned' : onlyOpen ? 'open' : null;

  const [counts, services, health] = await Promise.all([
    serviceRequestCounts(),
    db.service.findMany({ where: { active: true }, orderBy: { sort: 'asc' }, select: { key: true, nameAr: true } }),
    serviceQueueHealth(),
  ]);

  /**
   * **والمفتاح يُقبل متى عرفناه.** مفتاحٌ مجهول يُقرأ «الكل» ولا يُسقط
   * الشاشة — والرابط قد يُنسخ بعد حذف خدمة.
   */
  const known = new Set<string>([
    ...SEGMENTS.map((row) => row.key).filter((key): key is string => key !== null),
    ...services.map((row) => row.key),
  ]);
  const filter = raw !== null && known.has(raw) ? raw : null;

  const requests = await listServiceRequests({
    filter,
    ...(onlyOverdue ? { onlyOverdue: true } : {}),
    ...(onlyUnassigned ? { onlyUnassigned: true } : {}),
    ...(onlyOpen ? { onlyOpen: true } : {}),
  });

  const tabs: MonitorTab[] = [
    ...SEGMENTS.map((row) => ({
      key: row.key,
      label: row.label,
      count: counts[row.key ?? 'all'] ?? 0,
      ...(row.key === 'NEW' ? { tone: 'warn' as const } : {}),
    })),
    /*
      ثم الأنواع — من الكتالوج لا مكتوبةً بيد، فخدمةٌ جديدة تظهر وحدها.

      **والنوعُ الذي لا طلب له ليس شريحةَ طابور.** كانت تُعرض الخدماتُ
      كلُّها فيأخذ الشريطُ خمسةَ أسطر قبل أوّل طلب، خمسٌ منها أصفار
      تَعِد بقائمةٍ ثم تفتح فراغًا. وعددُ الطلبات لكلّ خدمة سؤالُ
      كتالوجٍ لا سؤالُ طابور، وجوابُه في عمود «طلبات قائمة» في
      `/admin/services`. والنشِطةُ تبقى ولو صفرًا — وإلّا اختفت
      الشريحةُ التي يقف عليها المشغّل.
    */
    ...services
      .filter((row) => (counts[row.key] ?? 0) > 0 || row.key === filter)
      .map((row) => ({
        key: row.key,
        label: row.nameAr,
        count: counts[row.key] ?? 0,
      })),
  ];

  return (
    <AdminShell title="طلبات الخدمات"
      subtitle="الإسناد والالتزام" activeHref="/admin/service-requests" admin={admin}>
      {/*
        **والتصدير من مكان القائمة.** شاشةٌ جامعة صحيحةٌ للمراجعة
        الدورية، لكن من يقف على طابورٍ مرشَّح يريد تصديره الآن.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
        <ExportLink reportKey="service_requests" allowed={can(admin.role, 'serviceRequests.handle')} />
      </div>

      <MonitorTabs tabs={tabs} active={filter} basePath="/admin/service-requests" param="filter" />

      {/*
        **وبطاقةٌ تعدّ مشكلةً تفتح قائمتها.** «تجاوزت المهلة» و«بلا
        مزوّد» حالان لا يتحرّك فيهما الطلب — مدفوعٌ ولا أحد يعمل عليه،
        أو فاتت مهلته. وقراءةُ الرقم بلا طريقٍ إليه تترك المشغّل يبحث.

        **والبطاقةُ هي المرشِّح** — لا بطاقةٌ تعدّ وزرٌّ يرشّح. كان في
        الشاشة ثلاثةُ ضوابط للمعنى الواحد: بطاقةٌ تعدّ، ورابطٌ أضفتُه،
        وزرُّ «المتجاوزة فقط» بحالةٍ محلّية داخل مكوّن العميل — فتنقر
        البطاقةَ فيُرشَّح الجدولُ والزرُّ لا يزال يقول إنه مُطفأ.

        **ورقمُها حالُ الطابور كلِّه** لا حالُ المعروض: كانت تُحسب من
        القائمة المرشَّحة، فأوّلُ نقرةٍ تجعلها تصف نفسها — «الإجمالي ١»
        والطابور ثمانية. والنشِطةُ حِبريّة، فيُعرَف المرشَّحُ من لمحة.

        **والصفر لا يُربط**: وعدٌ ثم قائمةٌ فارغة أسوأ من رقمٍ ساكن.
      */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatLink href="/admin/service-requests?open=1" show={health.open > 0 && scope !== 'open'}>
          <StatCard label="مفتوحة" value={health.open} tone={scope === 'open' ? 'ink' : 'plain'} />
        </StatLink>
        <StatLink
          href="/admin/service-requests?overdue=1"
          show={health.overdue > 0 && scope !== 'overdue'}
        >
          <StatCard
            label="تجاوزت المهلة"
            value={health.overdue}
            tone={scope === 'overdue' ? 'ink' : health.overdue > 0 ? 'warn' : 'plain'}
          />
        </StatLink>
        <StatLink
          href="/admin/service-requests?unassigned=1"
          show={health.unassigned > 0 && scope !== 'unassigned'}
        >
          <StatCard
            label="بلا مزوّد"
            value={health.unassigned}
            tone={scope === 'unassigned' ? 'ink' : health.unassigned > 0 ? 'warn' : 'plain'}
          />
        </StatLink>
        <StatLink href="/admin/service-requests" show={scope !== null}>
          <StatCard label="الإجمالي" value={health.total} />
        </StatLink>
      </div>

      {/*
        **والمرشَّحُ يُقال ويُزال.** بطاقةٌ حِبريّة تقول «هناك مرشّح»
        ولا تقول كيف يُرفع — ونقرةٌ ثانيةٌ عليها ليست بابًا يُهتدى إليه.
      */}
      {scope === null ? null : (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-70">
          <span>معروضٌ: {SCOPE_LABEL[scope]}</span>
          <Link href="/admin/service-requests" className="font-semibold underline opacity-100">
            أزِل المرشّح
          </Link>
        </p>
      )}

      <RequestsQueue requests={requests} scoped={scope !== null} />

      <ListFooter
        shown={requests.length}
        total={health.total}
        note="المفتوح لا يُقتطَع، والمنجَز يُقرأ أحدثه"
        can="إسناد الطلب إلى مزوّد، وتغيير حالته، وتسجيل سبب الإلغاء."
        cannot="تعديل سعر الخدمة من هنا — السعر من الكتالوج، وتغييره يمسّ كل طلبٍ قادم."
        automatic="طلبٌ تجاوز مهلته المعلنة يظهر أوكر."
      />
    </AdminShell>
  );
}
