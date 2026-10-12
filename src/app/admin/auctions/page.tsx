import { AuctionCard } from '@/components/admin/AuctionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { ListFooter } from '@/components/admin/ListFooter';
import { ListSearch } from '@/components/admin/ListSearch';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { auctionCounts, auctionMonitor } from '@/lib/domain/admin-monitors';
import { displayDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المزادات' };

const FILTERS = ['live', 'scheduled', 'unmet', 'ended'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * A22 — المزادات.
 *
 * **مراقبة لا تدخّل**: المزاد يُدار من قواعده، ولا زرّ هنا يغيّر
 * مزايدةً أو يمدّد وقتًا — وزرٌّ كهذا أوّل ما يُساء استعماله.
 */
export default async function AdminAuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { filter, q } = await searchParams;
  const term = (q ?? '').trim() === '' ? null : (q ?? '').trim();
  const active = FILTERS.includes(filter as Filter) ? (filter as Filter) : null;

  const [rows, counts] = await Promise.all([auctionMonitor(active, new Date(), term), auctionCounts()]);

  return (
    <AdminShell title="المزادات" activeHref="/admin/auctions" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        الجارية والقادمة وما لم يبلغ احتياطيه. والاحتياطي نفسه لا يُعرض — يُعرض بلوغُه.
      </p>

      <MonitorCards
        cards={[
          { title: 'جارية الآن', value: counts.live, note: 'الحالة وانقضاء الوقت معًا' },
          {
            title: 'قيمة المزايدات القائمة',
            value: `${displayDigits(Number(counts.liveValue).toLocaleString('en-US'))}`,
            note: 'مجموع أعلى المزايدات',
          },
          { title: 'لم تبلغ الاحتياطي', value: counts.unmet, note: 'تحتاج قرار البائع' },
          {
            title: 'نسبة الرسوّ',
            value: `${displayDigits(String(counts.clearancePct))}٪`,
            note: 'من المنتهية',
          },
        ]}
      />

      {/*
        **والتصدير من مكان القائمة.** شاشةٌ جامعة صحيحةٌ للمراجعة
        الدورية، لكن من يقف على طابورٍ مرشَّح يريد تصديره الآن.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
        <ExportLink reportKey="auction_performance" allowed={can(admin.role, 'orders.view')} />
      </div>

      <ListSearch
        action="/admin/auctions"
        value={term}
        placeholder="مرجع الإعلان · المركبة · المدينة · البائع"
        keep={{ filter: active }}
      />

      <MonitorTabs
        basePath="/admin/auctions"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.all },
          { key: 'live', label: 'جارية', count: counts.live },
          { key: 'scheduled', label: 'قادمة', count: counts.scheduled },
          { key: 'unmet', label: 'دون الاحتياطي', count: counts.unmet },
          { key: 'ended', label: 'منتهية', count: counts.ended },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="لا مزادات هنا"
          description="حين يُنشأ مزاد يظهر هنا بمزايداته ووقته."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <AuctionCard key={row.listingRef} row={row} />
          ))}
        </div>
      )}

      <p className="mt-4 text-3xs leading-relaxed opacity-45">
        الاحتياطي سرّ البائع — تعرض الشاشة بلوغَه لا قيمته، فلا يمرّ في لقطة شاشة.
      </p>

      <ListFooter
        shown={rows.length}
        total={null}
        note="الجارية والقادمة وما لم يبلغ احتياطيَه"
        can="فتح المزاد لقراءة سجلّه، والانتقال إلى إعلانه أو بائعه."
        cannot="المزايدة بدلًا عن أحد، ولا تعديل سعرٍ احتياطيّ بعد بدء المزاد — فالمزايدون بنوا عليه."
        automatic="مزادٌ في آخر دقائقه يمتدّ تلقائيًّا مع كل مزايدة."
      />
    </AdminShell>
  );
}
