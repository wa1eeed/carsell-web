import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { payableProviders, recentProviderPayouts } from '@/lib/domain/provider-payouts';
import { ProviderPayoutsTable } from './ProviderPayoutsTable';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'صرف مستحقّات المزوّدين' };

/**
 * ═══ صرفُ مستحقّات المزوّدين — ولم يكن له شاشة ولا مسار ═══
 *
 * `PROVIDER_PAYABLE` يُقيَّد دائنًا عند كل خدمةٍ تُنجَز، وشاشةُ المزوّد
 * تقول «قيمةُ ما أنجزه» — **ولا شيء في المنتج كلّه يخصم هذا الدَّين**.
 * فالفاحصُ يفحص ونُقيّد له حقًّا ينمو إلى الأبد، ولا ريالٌ يصله.
 *
 * ═══ والمال يخرج بيد المالية ═══
 *
 * الحوالة إلى آيبان المزوّد تُنفَّذ من البنك (التكاملات مؤجَّلة بقرار
 * المالك)، فهذه الشاشة **تسجّل ما خرج** بمرجعه ليُطابَق بكشف البنك —
 * وعند التسجيل يُكتب القيد فيُخصم الدَّين.
 */
export default async function ProviderPayoutsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [owed, history] = await Promise.all([payableProviders(), recentProviderPayouts()]);

  const totalOwed = owed.reduce((sum, row) => sum + Number(row.payable), 0);

  return (
    <AdminShell
      title="صرف مستحقّات المزوّدين"
      subtitle="ما استُحقّ لمزوّدي الخدمات ولم يُحوَّل بعد"
      activeHref="/admin/provider-payouts"
      admin={admin}
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-lg text-sm leading-loose opacity-70">
          هذه مستحقّات قُيّدت عند إنجاز كل خدمة ولم تصل المزوّد بعد. والحوالة تُنفَّذ من
          البنك إلى حسابه، وتُسجَّل هنا بمرجعها — ويحتاج التسجيل موافقة شخصين: أحدهما
          يطلب والآخر يعتمد.
        </p>
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-3xs opacity-70">مستحقّ ولم يُحوَّل</span>
          <Money amount={totalOwed} size="lg" decimals={2} />
        </div>
      </div>

      <ProviderPayoutsTable
        owed={owed}
        history={history}
        adminId={admin.id}
        canSend={canWrite(admin.role, 'payouts.send')}
      />

      <ListFooter
        shown={owed.length + history.length}
        total={null}
        note="المستحقّ من دفتر الحسابات — لا من مجموع الطلبات المنجَزة"
        can="طلب تحويل مستحقّ مزوّد، واعتماد طلب غيرك بعد تنفيذ الحوالة."
        cannot="الطلب والاعتماد معًا — ولا تحويل لمزوّدٍ بلا آيبان مسجَّل."
      />
    </AdminShell>
  );
}
