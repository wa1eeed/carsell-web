import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { settlementQueue } from '@/lib/domain/settlement-queue';
import { SettlementsTable } from './SettlementsTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'المدفوعات والضمان' };

/**
 * ═══ الإفراج عن الضمان ═══
 *
 * `requestSettle`/`approveSettle` والمسار والنصاب والاختبار كلّها
 * كانت قائمة، **ولا شاشة تناديها**. فمالٌ يدخل الضمان ولا يخرج —
 * والبائع يبيع ولا يقبض.
 *
 * ═══ ولماذا `finance.view` للدخول و`escrow.release` للفعل ═══
 *
 * من يملك قراءة المالية يحتاج أن يرى **أين المال ولماذا وقف**: سؤال
 * البائع «متى يصلني؟» يُجاب من هذه الشاشة. والفعل وحده محصورٌ بمن
 * يملك الإفراج — والخادم يفحصه ثانيةً، فحارس الشاشة اقتراح.
 */
/**
 * شرائح A25 — **ثلاثٌ لا أربع.**
 *
 * التصميم يذكر «مُسترجَع» و«عرابين»، وكلاهما لا يُقرأ من هذا الطابور:
 * هو طابورُ ما **لم يُفرَج عنه بعد** (`payments: { some: HELD }`)،
 * والمسترجَع خرج منه والعربون ليس فيه أصلًا. وشريحةٌ تفتح على فراغٍ
 * دائم تُقرأ عطلًا لا حدًّا — فتُترك حتى يُبنى مصدرها.
 */
const GROUPS = [
  { key: null, label: 'الكل' },
  { key: 'ready', label: 'جاهز للإفراج' },
  { key: 'awaiting', label: 'ينتظر اعتمادًا' },
  { key: 'blocked', label: 'محجوب' },
] as const;

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const queue = await settlementQueue();

  const search = await searchParams;
  const raw = typeof search.group === 'string' ? search.group : null;
  const active = GROUPS.find((row) => row.key === raw)?.key ?? null;

  const tabs: MonitorTab[] = GROUPS.map((row) => ({
    key: row.key,
    label: row.label,
    count:
      row.key === null
        ? queue.ready.length + queue.awaitingApproval.length + queue.blocked.length
        : row.key === 'ready'
          ? queue.ready.length
          : row.key === 'awaiting'
            ? queue.awaitingApproval.length
            : queue.blocked.length,
    ...(row.key === 'awaiting' ? { tone: 'warn' as const } : {}),
  }));

  /** الشريحة تُخفي ما عداها — والمجموعات معروضةٌ كلّها حين لا شريحة. */
  const show = (group: 'ready' | 'awaiting' | 'blocked'): boolean =>
    active === null || active === group;

  return (
    <AdminShell title="المدفوعات والضمان"
      subtitle="الضمان والإفراج والتسويات" activeHref="/admin/settlements" admin={admin}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-lg text-sm leading-loose opacity-60">
          ما هو محجوز لدى مزوّد الدفع باسم صفقاتنا. ويحتاج تحويل المبلغ موافقة شخصين: أحدهما
          يطلب والآخر يعتمد، وعند الاعتماد يُنادى المزوّد.
        </p>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-3xs opacity-50">المحجوز الآن</span>
          <Money amount={Number(queue.totalHeld)} size="lg" decimals={2} />
        </div>
      </div>

      <MonitorTabs tabs={tabs} active={active} basePath="/admin/settlements" param="group" />

      <SettlementsTable
        ready={show('ready') ? queue.ready : []}
        awaitingApproval={show('awaiting') ? queue.awaitingApproval : []}
        blocked={show('blocked') ? queue.blocked : []}
        adminId={admin.id}
        canRelease={canWrite(admin.role, 'escrow.release')}
      />
    
      <ListFooter
        shown={queue.ready.length + queue.awaitingApproval.length + queue.blocked.length}
        total={null}
        note="ما لم يُفرَج عنه بعد — والمسترجَع خرج منه"
        can="طلب الإفراج عن مبلغٍ محجوز، واعتماد طلب غيره."
        cannot="الطلب والاعتماد معًا — ولا يعتمد طالبٌ طلبَ نفسه، فالإفراج يحتاج شخصين."
      />
    </AdminShell>
  );
}
