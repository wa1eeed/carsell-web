import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
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
export default async function SettlementsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const queue = await settlementQueue();

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

      <SettlementsTable
        ready={queue.ready}
        awaitingApproval={queue.awaitingApproval}
        blocked={queue.blocked}
        adminId={admin.id}
        canRelease={canWrite(admin.role, 'escrow.release')}
      />
    </AdminShell>
  );
}
