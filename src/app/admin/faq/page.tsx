import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { faqList, faqStats } from '@/lib/domain/admin-content';
import { FaqTable } from './FaqTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأسئلة الشائعة' };

const CATEGORY_LABEL: Record<string, string> = {
  buying: 'الشراء',
  selling: 'البيع',
  auction: 'المزاد',
  escrow: 'الضمان',
  services: 'الخدمات',
};

/**
 * A33 — الأسئلة الشائعة.
 *
 * بنكٌ واحد ومواضع حسب طريقة البيع. والمحتوى مزروعٌ منذ البداية **ولا
 * شاشة تديره** — فسؤالٌ خاطئ يبقى معروضًا حتى نشرةٍ قادمة.
 */
export default async function AdminFaqPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'notifications.manage')) redirect('/admin');

  const stats = await faqStats();
  const { filter } = await searchParams;
  const categories = stats.byCategory.map((row) => row.category);
  const active = filter !== undefined && categories.includes(filter) ? filter : null;

  const rows = await faqList(active);

  return (
    <AdminShell title="الأسئلة الشائعة" activeHref="/admin/faq" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        بنكٌ واحد، ومواضعُ كل سؤال تتبع طريقة البيع. وصفحة السيارة تعرض ستّة كحدّ أقصى —
        وزيادتها تدفن الجواب الذي يبحث عنه المشتري.
      </p>

      <MonitorCards
        cards={[
          { title: 'أسئلة في البنك', value: stats.total, note: `أقسام (${String(stats.byCategory.length)})` },
          { title: 'في صفحة السيارة', value: stats.onListingPage, note: 'أربعة إلى ستّة كحدّ أقصى' },
          { title: 'بلا ترجمة إنجليزية', value: stats.missingEn, note: 'تظهر بالعربية للجميع' },
          { title: 'الأقسام', value: stats.byCategory.length, note: 'تصنيف البنك' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/faq"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: stats.total },
          ...stats.byCategory.map((row) => ({
            key: row.category,
            label: CATEGORY_LABEL[row.category] ?? row.category,
            count: row.count,
          })),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState title="لا أسئلة" description="بنك الأسئلة يُزرع مع المنصّة." />
      ) : (
        <FaqTable rows={rows} />
      )}
    </AdminShell>
  );
}
