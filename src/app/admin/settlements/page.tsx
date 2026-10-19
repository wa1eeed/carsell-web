import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { settlementHistory, settlementQueue } from '@/lib/domain/settlement-queue';
import { SettlementsTable } from './SettlementsTable';
import { SettlementHistoryTables } from './SettlementHistoryTables';

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
 * ═══ شرائح A25 — والتأجيل الذي سقط سببه ═══
 *
 * كُتب هنا أن «مُسترجَع» و«عرابين» تُتركان «حتى يُبنى مصدرهما»: لم
 * يكن في المنتج إلغاءٌ يُرجع مالًا، ولا عربونٌ بمالٍ خلفه. وشريحةٌ
 * تفتح على فراغٍ دائم تُقرأ عطلًا لا حدًّا.
 *
 * **والسبب سقط**: صار الإلغاء يُرجع (`order-cancel`)، وصار العربون
 * يمرّ بالبوابة ويُحصَّل ويُصادَر (القاعدة ٩، المهمّة ١٠٥). فالمصدر
 * موجود، والشرائح تُفتح.
 *
 * > **وتأجيلٌ مكتوبٌ بسببه يُراجَع حين يسقط سببه** — وإلّا بقي قرارًا
 * > قديمًا يُقرأ قاعدةً، ويُترك بابٌ مغلقًا ومفتاحُه في الجيب.
 */
const GROUPS = [
  { key: null, label: 'الكل' },
  { key: 'ready', label: 'جاهز للإفراج' },
  { key: 'awaiting', label: 'لم يكتمل' },
  { key: 'blocked', label: 'محجوب' },
  { key: 'settled', label: 'مسوى' },
  { key: 'refunded', label: 'مسترجع' },
  { key: 'deposits', label: 'عرابين' },
] as const;

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [queue, history] = await Promise.all([settlementQueue(), settlementHistory()]);

  const search = await searchParams;
  const raw = typeof search.group === 'string' ? search.group : null;
  const active = GROUPS.find((row) => row.key === raw)?.key ?? null;

  const COUNTS: Record<string, number> = {
    all: queue.ready.length + queue.awaitingApproval.length + queue.blocked.length,
    ready: queue.ready.length,
    awaiting: queue.awaitingApproval.length,
    blocked: queue.blocked.length,
    settled: history.settled.length,
    refunded: history.refunded.length,
    deposits: history.deposits.length,
  };

  const tabs: MonitorTab[] = GROUPS.map((row) => ({
    key: row.key,
    label: row.label,
    count: COUNTS[row.key ?? 'all'] ?? 0,
    ...(row.key === 'awaiting' ? { tone: 'warn' as const } : {}),
  }));

  /**
   * الشريحة تُخفي ما عداها — والمجموعات معروضةٌ كلّها حين لا شريحة.
   *
   * **والسجلّ ليس من «الكل»**: «الكل» طابورُ ما ينتظر عملًا، وضمُّ
   * المُسوّى والمُسترجَع إليه يُغرق ما يحتاج فعلًا بما انتهى.
   */
  const show = (group: 'ready' | 'awaiting' | 'blocked'): boolean =>
    active === null || active === group;
  const history_ = (group: 'settled' | 'refunded' | 'deposits'): boolean => active === group;
  const isHistory = active === 'settled' || active === 'refunded' || active === 'deposits';

  return (
    <AdminShell title="المدفوعات والضمان"
      subtitle="الضمان والإفراج والتسويات" activeHref="/admin/settlements" admin={admin}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-lg text-sm leading-loose opacity-70">
          ما هو محجوز لدى مزود الدفع باسم صفقاتنا. والإفراج يقع بضغطة واحدة: ينادى
          المزود في حينها، ويسجل الإجراء باسم من أفرج في سجل التدقيق.
        </p>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-3xs opacity-70">المحجوز الآن</span>
          <Money amount={Number(queue.totalHeld)} size="lg" decimals={2} />
        </div>
      </div>

      <MonitorTabs tabs={tabs} active={active} basePath="/admin/settlements" param="group" />

      {/*
        **ولا يُعرض الطابور على شريحة سجلّ.** `SettlementsTable` تعرض
        حالةً فارغة تقول «لا مبالغ محجوزة» حين تخلو مجموعاتُها
        الثلاث — وهي صادقةٌ في شرائح الطابور، **كاذبةٌ في شرائح
        السجلّ**: من فتح «عرابين» قرأ أن لا محجوز وفي الطابور واحد.
      */}
      {isHistory ? null : (
        <SettlementsTable
          ready={show('ready') ? queue.ready : []}
          awaitingApproval={show('awaiting') ? queue.awaitingApproval : []}
          blocked={show('blocked') ? queue.blocked : []}
          adminId={admin.id}
          canRelease={canWrite(admin.role, 'escrow.release')}
        />
      )}
    
      <SettlementHistoryTables
        settled={history_('settled') ? history.settled : []}
        refunded={history_('refunded') ? history.refunded : []}
        deposits={history_('deposits') ? history.deposits : []}
        settledThisMonth={history.settledThisMonth}
        locale="ar"
      />

      <ListFooter
        shown={COUNTS[active ?? 'all'] ?? 0}
        total={null}
        note={
          isHistory
            ? 'سجل ما تمت تسويته · للقراءة فقط'
            : 'ما لم يفرج عنه بعد'
        }
        can="طلب الإفراج عن مبلغ محجوز، واعتماد طلب غيره."
        cannot="الإفراج عن مبلغ محجوب بسبب قائم — ارفع السبب أولا، والإفراج بعده بضغطة."
      />
    </AdminShell>
  );
}
