import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { type DisputeFilter, disputeCounts, listDisputes } from '@/lib/domain/disputes';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { DisputesTable } from './DisputesTable';

export const dynamic = 'force-dynamic';

/**
 * ═══ النزاعات — الطابور الذي لم تكن له شاشة ═══
 *
 * النطاق كامل ومختبَر منذ المهمة ١٨: فتحٌ ورسائل واقتراح قرار وموافقة
 * بعضوين وتنفيذٌ تلقائيّ عند اكتمالها. **ولا مسار كان ينادي أيًّا منها،
 * ولا شاشة تعرض الطابور** — فالنزاع يُفتح ولا يُحسم، والمال محجوز.
 *
 * والقرار ماليّ بحت — استردادٌ كامل أو تسوية جزئية أو إفراج للبائع —
 * فحارسه `escrow.release`، وهو في نصاب العضوين لا يملكه دورٌ وحده.
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
      <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-55">
        <Quantity unit="disputes" count={open.length} /> مفتوحة
        <span aria-hidden className="opacity-40">·</span>
        <Quantity unit="disputes" count={overdue.length} /> فاتت مهلتها
        <span aria-hidden className="opacity-40">·</span>
        <span>القرار يحتاج موافقة عضوين</span>
      </p>

      <MonitorTabs tabs={tabs} active={filter} basePath="/admin/disputes" param="filter" />

      {disputes.length === 0 ? (
        <EmptyState
          title="لا نزاعات"
          description="حين يفتح مشترٍ نزاعًا على طلب يظهر هنا بمهلته، ويُحسم بقرارٍ يعتمده عضوان."
        />
      ) : (
        <DisputesTable
          disputes={disputes}
          adminId={admin.id}
          canResolve={canWrite(admin.role, 'escrow.release')}
        />
      )}
    </AdminShell>
  );
}
