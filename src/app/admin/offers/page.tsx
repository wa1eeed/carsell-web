import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListSearch } from '@/components/admin/ListSearch';
import { Quantity } from '@/components/ui/Quantity';
import { deadline } from '@/lib/domain/deadlines';
import { ListFooter } from '@/components/admin/ListFooter';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { OfferCard } from '@/components/admin/OfferCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { offerCounts, offerMonitor } from '@/lib/domain/admin-monitors';
import { displayDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'العروض والمفاوضات' };

const FILTERS = ['active', 'countered', 'accepted', 'auto'] as const;
type Filter = (typeof FILTERS)[number];


/**
 * A23 — العروض والمفاوضات.
 *
 * **مراقبة لا تدخّل** — عنوان التصميم حرفيًّا. ولا زرّ يقبل عرضًا
 * أو يرفضه: المفاوضة بين طرفين، ومن يملك زرًّا فيها يملك ترجيح أحدهما.
 */
export default async function AdminOffersPage({
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

  const [rows, counts, offerTtl] = await Promise.all([
    offerMonitor(active, new Date(), term),
    offerCounts(),
    // المهلةُ من الإعدادات لا ثابتًا — فما يُعرض هو ما يُطبَّق
    deadline('offerTtlHours'),
  ]);

  return (
    <AdminShell title="العروض والمفاوضات" activeHref="/admin/offers" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-70">
        ما يجري بين المشترين والبائعين. تقرأ ولا تغير، فالمفاوضة بين طرفيها.
      </p>

      <MonitorCards
        cards={[
          { title: 'عروض نشطة', value: counts.active, note: 'حالتها نشطة ومهلتها قائمة' },
          {
            /**
             * **وسيطٌ لا متوسّط** — ردٌّ واحدٌ بعد أسبوعٍ يجرّ متوسّطَ
             * عشرين ردًّا في دقائق، فيقول الرقمُ عن السوق ما لا يلقاه أحد.
             */
            title: 'وسيط رد البائع',
            value: counts.medianResponseHours ?? '—',
            note:
              counts.medianResponseHours === null ? (
                'لا رد بعد'
              ) : (
                <>
                  بالساعات · المهلة <Quantity unit="hours" count={offerTtl} />
                </>
              ),
          },
          { title: 'بلا رد أكثر من يوم', value: counts.stale, note: 'تسقط تلقائيا بانقضاء المهلة' },
          {
            title: 'نسبة القبول',
            value: `${displayDigits(String(counts.acceptancePct))}٪`,
            /**
             * **والنسبةُ تُقرأ على ضوء كم عرضًا بلغ الأرضيّة**: ما دونها
             * يُرفض آليًّا، فنسبةُ قبولٍ منخفضة قد تعني عروضًا متدنّية لا
             * بائعًا متمنّعًا — والرقمان مفترقين لا يقولانها.
             */
            note:
              counts.aboveFloorPct === null ? (
                'مما نظر فيه البائع'
              ) : (
                <>
                  مما نظر فيه البائع ·{' '}
                  {displayDigits(String(counts.aboveFloorPct))}٪ من العروض فوق الحد
                </>
              ),
          },
        ]}
      />

      <ListSearch
        action="/admin/offers"
        value={term}
        placeholder="مرجع الإعلان · المركبة · المدينة · البائع"
        keep={{ filter: active }}
      />

      <MonitorTabs
        basePath="/admin/offers"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.all },
          { key: 'active', label: 'بانتظار البائع', count: counts.active },
          { key: 'countered', label: 'عرض مقابل', count: counts.countered },
          { key: 'accepted', label: 'مقبولة', count: counts.accepted },
          { key: 'auto', label: 'مرفوضة تلقائيا', count: counts.autoRejected },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="لا عروض هنا"
          description="حين يقدم مشتري عرضا يظهر هنا بحاله ومهلته."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <OfferCard key={row.id} row={row} />
          ))}
        </div>
      )}

      <p className="mt-4 text-3xs leading-relaxed opacity-65">
        لا زر في هذه الشاشة عمدا: المفاوضة بين طرفين، ومن يملك زرا فيها يملك
        ترجيح أحدهما.
      </p>

      <ListFooter
        shown={rows.length}
        total={null}
        note="العروض النشطة. والمنتهية تسقط تلقائيا بعد مهلتها"
        can="قراءة سلسلة العرض والعرض المقابل، والانتقال إلى الإعلان أو طرفيه."
        cannot="القبول أو الرفض بدلا عن البائع. العرض عقد بين طرفين، وقبوله منا ينشئ التزاما
        لم يقرره صاحبه."
      />
    </AdminShell>
  );
}
