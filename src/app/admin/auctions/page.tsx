import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import {
  MonitorCards, MonitorList, MonitorRow, MonitorTabs, countdown,
} from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { auctionCounts, auctionMonitor } from '@/lib/domain/admin-monitors';
import { toArabicDigits } from '@/lib/arabic';

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
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { filter } = await searchParams;
  const active = FILTERS.includes(filter as Filter) ? (filter as Filter) : null;

  const [rows, counts] = await Promise.all([auctionMonitor(active), auctionCounts()]);

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
            value: `${toArabicDigits(Number(counts.liveValue).toLocaleString('en-US'))}`,
            note: 'مجموع أعلى المزايدات',
          },
          { title: 'لم تبلغ الاحتياطي', value: counts.unmet, note: 'تحتاج قرار البائع' },
          {
            title: 'نسبة الرسوّ',
            value: `${toArabicDigits(String(counts.clearancePct))}٪`,
            note: 'من المنتهية',
          },
        ]}
      />

      <MonitorTabs
        basePath="/admin/auctions"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.live + counts.scheduled + counts.ended },
          { key: 'live', label: 'جارية', count: counts.live },
          { key: 'scheduled', label: 'قادمة', count: counts.scheduled },
          { key: 'unmet', label: 'دون الاحتياطي', count: counts.unmet },
          { key: 'ended', label: 'منتهية', count: counts.ended },
        ]}
      />

      <MonitorList
        empty={{ title: 'لا مزادات هنا', description: 'حين يُنشأ مزاد يظهر هنا بمزايداته ووقته.' }}
        note="الاحتياطي سرّ البائع — تعرض الشاشة بلوغَه لا قيمته، فلا يمرّ في لقطة شاشة."
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.listingRef}
            title={
              <>
                {row.title} <ArabicNumber value={row.year} className="opacity-55" />
              </>
            }
            subtitle={row.sellerName}
            /* **الصفّ يُفتح** — وقائمةٌ لا تُفتح صفوفُها لا يُتصرَّف فيها */
            meta={
              <Link
                href={`/admin/auctions/${encodeURIComponent(row.listingRef)}`}
                dir="ltr"
                className="font-num text-start underline underline-offset-4 hover:opacity-70"
              >
                {row.listingRef}
              </Link>
            }
          >
            <div className="flex flex-col items-start gap-0.5">
              {row.topBid === null ? (
                <span className="text-2xs opacity-45">لا مزايدات</span>
              ) : (
                <Money amount={Number(row.topBid)} />
              )}
              <span className="text-3xs opacity-45">
                مزايدون ({toArabicDigits(String(row.bidderCount))}) · مزايدات (
                {toArabicDigits(String(row.bidCount))})
              </span>
            </div>

            <Badge tone={row.reserveMet ? 'accent' : 'warn'}>
              {row.reserveMet ? 'بلغ الاحتياطي' : 'لم يُبلغ'}
            </Badge>

            <span className="font-num text-2xs">{countdown(row.secondsLeft)}</span>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}
