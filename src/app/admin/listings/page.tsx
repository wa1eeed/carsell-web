import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { reviewQueue, reviewStats } from '@/lib/domain/admin-listings';
import type { ReviewReason } from '@/generated/prisma/enums';
import { ReviewQueue } from './ReviewQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'مراجعة الإعلانات' };

const REASONS: readonly string[] = [
  'DUPLICATE_IMAGE',
  'PRICE_OUTLIER',
  'NEW_ACCOUNT_BURST',
  'USER_REPORT',
];

/**
 * A15 — مراجعة الإعلانات.
 *
 * قرار ٣٣ يُدخل المرشَّح آليًّا إلى الطابور، **ولم تكن ثمّة شاشة
 * تقرؤه**: فإعلانٌ رُشّح يقف بلا نهاية، لا يُعتمد ولا يُردّ، وصاحبه
 * ينتظر شيئًا لن يقع.
 */
export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'listings.review')) redirect('/admin');

  const { reason } = await searchParams;
  // سببٌ مجهول يُقرأ «الكل» — لا يُسقط الشاشة بـ٥٠٠
  const filter = reason !== undefined && REASONS.includes(reason) ? (reason as ReviewReason) : null;

  const [rows, stats] = await Promise.all([reviewQueue(filter), reviewStats()]);

  return (
    <AdminShell title="مراجعة الإعلانات" activeHref="/admin/listings" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        الطابور الآليّ — لا مراجعةُ كل إعلان. يدخله ما رشّحته قاعدة: صورة مكرّرة، أو
        سعر شاذّ، أو حساب جديد، أو بلاغ.
      </p>

      <ReviewQueue
        rows={rows}
        stats={stats}
        filter={filter}
        canSuspend={can(admin.role, 'users.suspend')}
      />
    </AdminShell>
  );
}
