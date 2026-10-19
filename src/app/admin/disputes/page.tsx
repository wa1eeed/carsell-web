import { redirect } from 'next/navigation';
import { Counted } from '@/components/ui/Counted';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { type DisputeFilter, disputeCounts, listDisputes } from '@/lib/domain/disputes';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { DisputesQueue } from './DisputesQueue';

export const dynamic = 'force-dynamic';

/**
 * ═══ النزاعات — الطابور الذي لم تكن له شاشة ═══
 *
 * النطاق كامل ومختبَر منذ المهمة ١٨: فتحٌ ورسائل واقتراح قرار وموافقة
 * بنصابٍ صار واحدًا وتنفيذٌ تلقائيّ عند اكتماله (أُلغي نصابُ العضوين بقرار المالك ٢٠٢٦-١٠-١٤؛ ROADMAP §٣٥). **ولا مسار كان ينادي أيًّا منها،
 * ولا شاشة تعرض الطابور** — فالنزاع يُفتح ولا يُحسم، والمال محجوز.
 *
 * والقرار ماليّ بحت — استردادٌ كامل أو تسوية جزئية أو إفراج للبائع —
 * فحارسه `escrow.release`، ومن لا يملكه لاه دورٌ وحده.
 */
/** شرائح A17 — والتصميم يسمّيها «البلاغات والنزاعات»؛ والبلاغات شاشتُها. */
const SEGMENTS: readonly { key: string | null; label: string }[] = [
  { key: null, label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'investigating', label: 'قيد التحقيق' },
  { key: 'resolved', label: 'محلولة' },
];

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.filter === 'string' ? search.filter : null;
  const filter = (SEGMENTS.find((row) => row.key === raw)?.key ?? null) as DisputeFilter;

  const [disputes, counts] = await Promise.all([listDisputes(new Date(), filter), disputeCounts()]);

  const tabs: MonitorTab[] = SEGMENTS.map((row) => ({
    key: row.key,
    label: row.label,
    count: counts[row.key ?? 'all'] ?? 0,
    ...(row.key === 'open' ? { tone: 'danger' as const } : {}),
  }));
  /** المفتوح ما لم يُحسم — والحسم لصالح أحد الطرفين حالتان لا حالة. */
  const open = disputes.filter((row) => row.status === 'OPEN' || row.status === 'INVESTIGATING');
  const overdue = disputes.filter((row) => row.overdue);

  return (
    <AdminShell title="النزاعات"
      subtitle="النزاعات ومهلها" activeHref="/admin/disputes" admin={admin}>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-70">
        <Counted message="openDisputes" count={open.length} />
        <span aria-hidden className="opacity-40">·</span>
        <Counted message="overdueDisputes" count={overdue.length} />
        <span aria-hidden className="opacity-40">·</span>
        <span>كل قرار يسجل باسم من حسمه</span>
      </p>

      <MonitorTabs tabs={tabs} active={filter} basePath="/admin/disputes" param="filter" />

      {disputes.length === 0 ? (
        <EmptyState
          title="لا نزاعات"
          description="حين يفتح مشتري نزاعا على طلب يظهر هنا بمهلته، ويحسم بقرار يعتمده عضوان."
        />
      ) : (
        <DisputesQueue
          disputes={disputes}
          adminId={admin.id}
          canResolve={canWrite(admin.role, 'escrow.release')}
        />
      )}
    
      <ListFooter
        shown={disputes.length}
        total={null}
        note="المهلة تجري من لحظة الفتح"
        can="قراءة الرسائل والأدلة، وطلب قرار مالي (استرداد أو تسوية جزئية أو إفراج)."
        cannot="حسم نزاع بلا سبب مكتوب — والقرار يقيد في سجل التدقيق باسم من حسمه وبما حسم به."
        automatic="نزاع تجاوز مهلته يظهر أحمر، والطلب يبقى مجمدا حتى يحسم."
      />
    </AdminShell>
  );
}
