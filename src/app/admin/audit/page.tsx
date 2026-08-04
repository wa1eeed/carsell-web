import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { MonitorCards, MonitorList, MonitorRow, MonitorTabs } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { auditCounts, auditTrail, type AuditLens } from '@/lib/domain/admin-monitors';
import { AUDIT_ACTION_LABEL } from '@/lib/labels/audit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سجل التدقيق' };

const LENSES: readonly string[] = ['money', 'identity', 'permissions'];

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * A16 — سجل التدقيق.
 *
 * **لا يُعدَّل ولا يُحذف** — وهو تعريفه لا خاصّيةٌ فيه. فلا زرّ هنا
 * إطلاقًا: سجلٌّ فيه زرّ تعديل ليس سجلًّا.
 *
 * والتصفية **بصنف الإجراء لا ببحثٍ نصّيّ**: من يبحث عن «إفراج» يفوته
 * `escrow.settled`، ومن يصفّي بالصنف يجد كل ما يمسّ المال.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'audit.view')) redirect('/admin');

  const { lens } = await searchParams;
  const active = lens !== undefined && LENSES.includes(lens) ? (lens as AuditLens) : null;

  const [rows, counts] = await Promise.all([auditTrail(active), auditCounts()]);

  return (
    <AdminShell title="سجل التدقيق" activeHref="/admin/audit" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        كل إجراء بمن فعله ومتى وماذا تغيّر. <b>لا يُعدَّل ولا يُحذف</b> — ولا زرّ في هذه
        الشاشة.
      </p>

      <MonitorCards
        cards={[
          { title: 'إجمالي المدخلات', value: counts.total ?? 0, note: 'منذ البداية' },
          { title: 'تمسّ المال', value: counts.money ?? 0, note: 'إفراج · عمولة · مهل' },
          { title: 'تمسّ بيانات شخصية', value: counts.identity ?? 0, note: 'اطّلاع وتوثيق' },
          { title: 'تمسّ الصلاحيات', value: counts.permissions ?? 0, note: 'حسابات وأدوار' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/audit"
        param="lens"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.total ?? 0 },
          { key: 'money', label: 'مالية', count: counts.money ?? 0 },
          { key: 'identity', label: 'بيانات شخصية', count: counts.identity ?? 0 },
          { key: 'permissions', label: 'صلاحيات', count: counts.permissions ?? 0 },
        ]}
      />

      <MonitorList
        empty={{ title: 'لا مدخلات', description: 'كل إجراء أدمن يُكتب هنا فور وقوعه.' }}
        note="السجلّ يُضاف إليه ولا يُعدَّل. والاحتفاظ ٢٤ شهرًا، والحذف لا سبيل إليه من اللوحة."
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.id}
            title={AUDIT_ACTION_LABEL[row.action] ?? row.action}
            subtitle={`${row.entity} · ${row.entityId}`}
            meta={riyadh.format(new Date(row.createdAt))}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="bidi-isolate text-2xs font-semibold">
                {row.actorName ?? 'النظام'}
              </span>
              <span className="font-num text-3xs opacity-45">{row.actorRole}</span>
            </div>

            {/* النظام فاعلٌ أيضًا — ووسمُه يميّز ما وقع بلا إنسان */}
            <Badge tone={row.actorType === 'system' ? 'neutral' : 'ink'}>
              {row.actorType === 'system' ? 'آليّ' : 'بشريّ'}
            </Badge>

            {/* العنوان يُقارن خانةً بخانة — لاتينيّ معزول */}
            <span dir="ltr" className="font-num text-3xs opacity-45">
              {row.ip ?? '—'}
            </span>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}
