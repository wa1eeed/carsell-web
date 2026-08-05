import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { DashboardTabs, type DashboardTab } from './DashboardTabs';
import { FinanceTab } from './FinanceTab';
import { GrowthTab } from './GrowthTab';
import { OpsTab } from './OpsTab';

export const dynamic = 'force-dynamic';

/**
 * ═══ لوحة القيادة — A1 · A2 · A3 في شاشة واحدة ═══
 *
 * التصميم يضع الثلاثة **تابزًا**، والشريط الجانبي فيه «لوحة القيادة»
 * وحدها. وكان المبنيّ يفرّقها ثلاثةَ بنودٍ في الشريط — انحرافٌ عن
 * التصميم يجعل المقارنة بين نموٍّ وتشغيلٍ خروجًا من الشاشة وعودةً إليها.
 *
 * ═══ والحراسة هنا مرّة واحدة ═══
 *
 * كل تابٍ كان صفحةً تفحص صلاحيتها بنفسها. وجمعُها يجمع الفحص: التاب
 * المطلوب يُقاس بصلاحيته، ومن طلب ما لا يملك يُبدَّل له بأوّل ما يملك
 * — لا يُردّ ٤٠٣، فالرابط يُنسخ بين زميلين بدورين مختلفين.
 */
const PERMISSION = {
  growth: 'dashboard.view',
  ops: 'orders.view',
  finance: 'finance.view',
} as const;

const SUBTITLE: Record<DashboardTab, string> = {
  growth: 'نمو وأعداد — آخر ثلاثين يومًا',
  ops: 'تشغيلية — الطوابير والأزمنة',
  finance: 'مالية — GMV والوحدة الاقتصادية',
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');

  const available = (['growth', 'ops', 'finance'] as const).filter((key) =>
    can(admin.role, PERMISSION[key]),
  );

  /** لا يملك أيّ تاب ⇒ ليست شاشته — والطلبات أوّل ما يُحتمل أن يملكه. */
  if (available.length === 0) redirect('/admin/orders');

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : 'growth';
  const requested = (['growth', 'ops', 'finance'] as const).find((key) => key === raw);

  const active: DashboardTab =
    requested !== undefined && available.includes(requested)
      ? requested
      : (available[0] ?? 'growth');

  return (
    <AdminShell
      title="لوحة القيادة"
      subtitle={SUBTITLE[active]}
      activeHref="/admin"
      admin={admin}
    >
      <DashboardTabs active={active} available={available} />

      {active === 'growth' ? <GrowthTab /> : active === 'ops' ? <OpsTab /> : <FinanceTab admin={admin} />}
    </AdminShell>
  );
}
