import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { identityQueue, identityStats } from '@/lib/domain/admin-identity';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import type { IdentityStatus } from '@/generated/prisma/enums';
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
/**
 * شرائح A18 — **و`identityQueue` كانت تقبل الترشيح ولا يمرّره أحد.**
 * القدرة مبنيّة من يومها، والطابور يُعرض كاملًا فيقرأ المراجع
 * «موثَّق ١٬٤٢٨» صفًّا صفًّا ليجد السبعة التي تنتظره.
 */
const SEGMENTS: readonly { key: IdentityStatus | null; label: string }[] = [
  { key: 'PENDING', label: 'ينتظر' },
  { key: 'CLARIFICATION', label: 'مُعلَّق للتوضيح' },
  { key: 'VERIFIED', label: 'موثّق' },
  { key: 'REJECTED', label: 'مرفوض' },
];

export default async function AdminIdentityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'identity.review')) redirect('/admin');

  const search = await searchParams;
  const raw = typeof search.status === 'string' ? search.status : null;
  const status = SEGMENTS.find((row) => row.key === raw)?.key ?? null;

  const [rows, stats] = await Promise.all([identityQueue(status), identityStats()]);

  /**
   * **والعدّاد من `identityStats` لا من طول الصفوف.** الطابور محدودٌ
   * بمئتين، فعدُّ ما يُعرض يقول «موثّق ٢٠٠» على ألفٍ وأربعمئة.
   */
  const counts: Record<string, number> = {
    PENDING: stats.waiting,
    CLARIFICATION: stats.clarification,
    VERIFIED: stats.verifiedTotal,
    REJECTED: stats.rejectedTotal,
  };

  const tabs: MonitorTab[] = [
    {
      key: null,
      label: 'الطابور',
      count: stats.waiting + stats.clarification,
      tone: stats.waiting > 0 ? ('warn' as const) : undefined,
    },
    ...SEGMENTS.map((row) => ({
      key: row.key,
      label: row.label,
      count: counts[row.key ?? ''] ?? 0,
    })),
  ];

  return (
    <AdminShell title="توثيق الهوية"
      subtitle="طابور توثيق الهوية" activeHref="/admin/identity" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        الطابور اليدويّ وحده — النفاذ الوطنيّ يُوثَّق آليًّا. والهدف أقلّ من ساعة.
      </p>

      <MonitorTabs tabs={tabs} active={status} basePath="/admin/identity" param="status" />

      <IdentityQueue rows={rows} stats={stats} />
    
      <ListFooter
        shown={rows.length}
        total={null}
        note="الطابور اليدويّ وحده — والنفاذ الوطنيّ آليّ"
        can="التوثيق أو طلب توضيح أو الرفض بسببٍ مكتوب."
        cannot="عرض صورة الهوية أو رقمها كاملًا من الجدول — الاطّلاع فعلٌ مقصود يُقيَّد قبل أن يُعرض شيء."
      />
    </AdminShell>
  );
}
