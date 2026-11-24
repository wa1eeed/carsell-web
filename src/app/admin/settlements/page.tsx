import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLink } from '@/components/admin/AdminLink';
import { ExportLink } from '@/components/admin/ExportLink';
import { ListFooter } from '@/components/admin/ListFooter';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Duration } from '@/components/ui/Duration';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorCards, MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { settlementHistory, settlementQueue } from '@/lib/domain/settlement-queue';
import { latestRuns } from '@/lib/domain/reconciliation';
import { SettlementsTable } from './SettlementsTable';
import { SettlementHistoryTables } from './SettlementHistoryTables';
import { ReconciliationPanel } from './ReconciliationPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'المدفوعات والضمان' };

/**
 * ═══ الإفراج عن الضمان ═══
 *
 * `requestSettle`/`approveSettle` والمسار والصلاحية والاختبار كلّها
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
 *
 * ═══ و«لم يكتمل» شريحةٌ يبلغها المنتج ═══
 *
 * النصابُ واحد (§٤١)، فـ`requestSettle` تعتمد في حينها ولا تترك صفًّا
 * ينتظر أحدًا. **وتبقى الشريحة مع ذلك**: `approveSettle` تردّ
 * `GATEWAY_FAILED` فيبقى الطلب `PENDING` حتى تنقضي نافذتُه — ومالٌ
 * لطلبٍ في هذا الحال يختفي من الشاشة كلّها لو حُذفت شريحتُه.
 * فالتسميةُ تقول حالَه الحقيقيّ («لم يكتمل») لا «ينتظر عضوًا ثانيًا».
 */
const GROUPS = [
  { key: null, label: 'الكل' },
  { key: 'ready', label: 'تنتظر الإفراج' },
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

  const [queue, history, recon] = await Promise.all([
    settlementQueue(),
    settlementHistory(),
    latestRuns(),
  ]);

  /**
   * **ومتى طُوبق؟** الترميز يكتبه في البطاقة («طوبقت اليوم ٠٣:٠٠»)،
   * والوظيفةُ اليومية تُشغّلها — فالسطرُ يقول لحظةَ آخرِ تشغيلٍ فعليّ،
   * لا جدولًا مكتوبًا. و`Duration` تأخذ دقائق فتُحسب هنا على الخادم.
   */
  const ranMinutes =
    recon.ranAt === null ? null : Math.floor((Date.now() - Date.parse(recon.ranAt)) / 60_000);

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
    <AdminShell
      title="المدفوعات والضمان"
      subtitle={
        <>
          <Money amount={queue.totalHeld} decimals={2} size="sm" /> محجوزة ·{' '}
          <Quantity count={COUNTS.ready ?? 0} unit="awaitingRelease" />
        </>
      }
      activeHref="/admin/settlements"
      admin={admin}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        {/*
          **والنصُّ يقول ما يفعله النظام كلَّه لا ما تفعله الشاشة.**
          كان يقول «الإفراج يقع بضغطة واحدة» — وهو صحيحٌ عن هذه الشاشة
          وناقصٌ عن المنتج: `settleOnTransferConfirmed` تُفرج **تلقائيًّا**
          لحظةَ تأكيد النقل، والوظيفة الدورية شبكةُ أمانٍ تلتقط ما تعثّر.
          فمن قرأ الأوّل حسب نفسَه البوّابة، وهو في الحقيقة يرى ما لم
          يُفرَج تلقائيًّا.
        */}
        <p className="max-w-lg text-sm leading-loose opacity-70">
          ما هو محجوز لدى مزود الدفع باسم صفقاتنا. والإفراج يقع تلقائيا لحظة تأكيد
          نقل الملكية — وما يظهر هنا ما لم يكتمل إفراجه: بوابة لم ترد، أو سبب قائم.
        </p>
        {/*
          ═══ «المطابقة اليومية» رابطٌ لا زرّ ═══

          الترميز يضعها زرًّا في الترويسة، **والمطابقة تجري وحدها**:
          `reconcileYesterday` مسجَّلةٌ في المُجدوِل وتُطابق أمسِ لا
          اليوم — فاليومُ لم ينتهِ، ومطابقتُه تقارن نصفَ دفترٍ بنصف
          كشف. فزرٌّ يُشغّلها الآن إمّا يُعيد ما طُوبق (فيمحو معالجةَ
          إنسانٍ) أو يُطابق يومًا ناقصًا.

          **فالفعلُ المتاح هو النظر** — والرابط يذهب إلى سجلّها في
          A20، حيث تُفتح معاملاتُ كلّ فرق. وزرٌّ لا يبلغه أحدٌ أسوأ من
          رابطٍ يبلغ ما يُفيد.
        */}
        <nav className="flex flex-wrap items-center gap-2.5">
          <AdminLink
            href="/admin/payments"
            className="rounded-btn border border-line px-3.5 py-2.25 text-3xs font-bold hover:border-ink"
          >
            المطابقة اليومية
          </AdminLink>
          <ExportLink reportKey="ledger" allowed={can(admin.role, 'finance.view')} />
        </nav>
      </div>

      {/*
        ═══ بطاقاتُ الترميز الأربع ═══

        والثالثةُ كانت «تنتظر نصاب الإفراج · موافقة عضوين»، **والنصاب
        أُلغي** (§٤١): فصارت تقول ما يقع فعلًا — ما ينتظر ضغطةً، وشرطا
        الإفراج تحتها. والرابعةُ لم يكن لها مصدرٌ في المنتج كلّه.
      */}
      <MonitorCards
        cards={[
          {
            title: 'محجوز الآن',
            money: queue.totalHeld,
            note: <Quantity count={COUNTS.all ?? 0} unit="orders" />,
          },
          {
            title: 'مسوى هذا الشهر',
            money: history.settledThisMonth,
            note: <Quantity count={history.settledThisMonthCount} unit="orders" />,
          },
          {
            title: 'تنتظر الإفراج',
            value: COUNTS.ready ?? 0,
            note: 'لم يكتمل إفراجها تلقائيا',
          },
          {
            title: 'فرق المطابقة',
            value: recon.mismatches,
            /**
             * **والصفرُ يُصدَّق بعد إثبات أنّ الأداة عملت.** «فرق
             * المطابقة ٠» على بوّابةٍ لم تُقرأ قطّ ليست سلامةً — فتقول
             * البطاقةُ متى طُوبق آخرَ مرّة، و«لم تطابق بعد» حين لا صفّ.
             */
            note:
              ranMinutes === null ? (
                'لم تطابق بعد'
              ) : (
                <>
                  طوبقت منذ <Duration minutes={ranMinutes} genitive />
                </>
              ),
          },
        ]}
      />

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

      {/*
        ═══ ولوحةُ الترميز اليسرى كانت تَعِد بعضوٍ ثانٍ ═══

        نصُّها: «اعتمادك يفتح طلب موافقة، ولا يُنفَّذ حتى يعتمده عضو
        ثانٍ. الشرطان قبل أي إفراج: نقل الملكية مؤكَّد، ونافذة
        الاسترجاع ٧ أيام انقضت». وكلا جملتيها نُقضت: النصاب أُلغي
        (§٤١)، ونافذةُ الاسترجاع أُلغيت في المهمّة ٣٧ — **والمال يصل
        البائع في لحظة تأكيد النقل**.

        فتبقى اللوحة بشرطَي `canSettle` الحقيقيَّين، لا بنصٍّ يَعِد
        بحارسٍ لا وجود له.
      */}
      <section className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1 rounded-lg border border-warn-200 bg-warn-100 p-5">
          <h2 className="mb-2 text-2xs font-bold text-warn-900">
            ثلاثة شروط، ويفرج النظام من تلقائه
          </h2>
          <p className="text-2xs leading-loose text-warn-900">
            نقل الملكية مؤكد في المرور، ولا نزاع قائم، والمبلغ ما زال محجوزا. وعند
            اكتمالها يفرج النظام لحظتها بلا ضغطة، ووظيفة دورية تلتقط ما تعثر. فما
            يبقى هنا ما لم يكتمل إفراجه — والضغطة إعادة محاولة تسجل باسمك، ويفحص
            الخادم الشروط عندها ثانية.
          </p>
        </div>

        <ReconciliationPanel recon={recon} />
      </section>

      <ListFooter
        shown={COUNTS[active ?? 'all'] ?? 0}
        total={null}
        note={isHistory ? 'سجل ما تمت تسويته، للقراءة فقط' : 'ما لم يفرج عنه بعد'}
        can="الإفراج عن مبلغ محجوز بضغطة واحدة، وتصدير دفتر الأستاذ."
        cannot="الإفراج عن مبلغ محجوب بسبب قائم. ارفع السبب أولا، ثم أفرج بضغطة."
      />
    </AdminShell>
  );
}
