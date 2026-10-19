import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { financingSettings } from '@/lib/domain/financing';
import { FinancingForm } from './FinancingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التمويل والقسط' };

/**
 * ═══ إعدادُ التمويل — الشاشة التي لم تكن ═══
 *
 * `FinanceSetting` صفٌّ تزرعه البذرة **ولا شيء يعدّله**: نسبةُ الدفعة
 * الأولى والمدّة ونسبةُ الربح وأقلُّ سعرٍ للتمويل — أربعةُ أرقام خلف
 * كلّ «أو شهريا» على بطاقة سيارة، وخلف أيِّ إعلانٍ يُعدّ قابلًا
 * للتمويل أصلًا. وتغييرُ نسبةِ ربحٍ كان يحتاج نشرًا كاملًا.
 *
 * (كشفته البوابة ٦٣ حين كُتب سببُ تجمّده، وطلب المالك إصلاحه.)
 */
export default async function AdminFinancingPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const settings = await financingSettings();

  return (
    <AdminShell
      title="التمويل والقسط"
      subtitle="الأرقام التي يبنى منها «أو شهريا» على كل بطاقة"
      activeHref="/admin/financing"
      admin={admin}
    >
      <p className="mb-7 max-w-2xl text-sm leading-loose opacity-70">
        هذه الأرقام تبني القسط التقريبي الظاهر في{' '}
        <Link href="/ar/cars" className="font-bold underline underline-offset-2" target="_blank">
          نتائج البحث
        </Link>{' '}
        وصفحة السيارة. <b>والقسط تقدير لا عرض تمويل</b> — يحسب عندنا ولا يمر بممول،
        ويقرب إلى أقرب عشرة. <b>وأقل سعر للتمويل</b> يقرر أي إعلان يظهر له القسط
        أصلا، فالأقل منه لا يعرض شيئا.
      </p>

      <FinancingForm settings={settings} canEdit={canWrite(admin.role, 'finance.view')} />
    </AdminShell>
  );
}
