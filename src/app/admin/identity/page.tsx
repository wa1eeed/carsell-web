import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { identityQueue, identityStats } from '@/lib/domain/admin-identity';
import { IdentityQueue } from './IdentityQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'توثيق الهوية' };

/**
 * A18 — توثيق الهوية.
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` منطقيّ بلا كاتب، ولا
 * شاشة تعرض من قدّم هويته — وحارس الشراء يقرؤه. فكل حساب ممنوع من كل
 * معاملة، والباب الذي يُستوفى منه غير موجود.
 */
export default async function AdminIdentityPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'identity.review')) redirect('/admin');

  const [rows, stats] = await Promise.all([identityQueue(), identityStats()]);

  return (
    <AdminShell title="توثيق الهوية" activeHref="/admin/identity" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        الطابور اليدويّ وحده — النفاذ الوطنيّ يُوثَّق آليًّا. والهدف أقلّ من ساعة.
      </p>

      <IdentityQueue rows={rows} stats={stats} />
    </AdminShell>
  );
}
