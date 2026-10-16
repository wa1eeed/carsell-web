import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { payableSellers, recentPayouts } from '@/lib/domain/payouts';
import { PayoutsTable } from './PayoutsTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'تحويل مستحقّات البائعين' };

/**
 * ═══ الطرف الأخير من رحلة البيع — ولم يكن له شاشة ═══
 *
 * `recordSellerPayout` مكتوبة منذ بُني الدفتر، وتعليقها يقول إن حقّ
 * البائع يبقى موجبًا إلى الأبد ما لم تُنادى — **ولم يكن في المنتج
 * كلّه منادٍ**. فدفتر البائع يعرض «حُوِّل إليك: ٠٫٠٠» دائمًا، و«جاهز
 * للصرف» ينمو مع كل بيعة.
 *
 * ═══ والمال يخرج بيد المالية ═══
 *
 * الحوالة البنكية إلى آيبان البائع تُنفَّذ من البنك (التكاملات مؤجَّلة)،
 * فهذه الشاشة **تسجّل ما خرج** بمرجع الحوالة ليُطابَق بكشف البنك —
 * وعند التسجيل يُكتب القيد فيُصفَّر الحقّ.
 */
export default async function PayoutsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [owed, history] = await Promise.all([payableSellers(), recentPayouts()]);

  const totalOwed = owed.reduce((sum, row) => sum + Number(row.payable), 0);

  return (
    <AdminShell
      title="تحويل مستحقّات البائعين"
      subtitle="ما استُحقّ للبائعين ولم يُحوَّل بعد"
      activeHref="/admin/payouts"
      admin={admin}
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-lg text-sm leading-loose opacity-70">
          هذه مستحقّات استُحقّت بعد إتمام البيع ولم تصل البائع بعد. والحوالة تُنفَّذ من البنك
          إلى آيبانه، وتُسجَّل هنا بمرجعها — ويحتاج التسجيل موافقة شخصين: أحدهما يطلب
          والآخر يعتمد.
        </p>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-3xs opacity-70">مستحقّ ولم يُحوَّل</span>
          <Money amount={totalOwed} size="lg" decimals={2} />
        </div>
      </div>

      <PayoutsTable
        owed={owed}
        history={history}
        adminId={admin.id}
        canSend={canWrite(admin.role, 'payouts.send')}
      />

      <ListFooter
        shown={owed.length + history.length}
        total={null}
        note="المستحقّ من دفتر الحسابات — لا من مجموع الطلبات"
        can="طلب تحويل مستحقّات بائع، واعتماد طلب غيرك بعد تنفيذ الحوالة."
        cannot="الطلب والاعتماد معًا — ولا تحويل لبائعٍ لم يُدخل آيبانه."
      />
    </AdminShell>
  );
}
