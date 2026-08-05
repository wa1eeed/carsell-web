import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import {
  MonitorCards, MonitorList, MonitorRow, MonitorTabs, elapsed,
} from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { offerCounts, offerMonitor } from '@/lib/domain/admin-monitors';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'العروض والمفاوضات' };

const FILTERS = ['active', 'countered', 'accepted', 'auto'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'بانتظار البائع',
  COUNTERED: 'عرض مقابل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  WITHDRAWN: 'مسحوب',
  EXPIRED: 'انتهت مهلته',
};

/**
 * A23 — العروض والمفاوضات.
 *
 * **مراقبة لا تدخّل** — عنوان التصميم حرفيًّا. ولا زرّ يقبل عرضًا
 * أو يرفضه: المفاوضة بين طرفين، ومن يملك زرًّا فيها يملك ترجيح أحدهما.
 */
export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { filter } = await searchParams;
  const active = FILTERS.includes(filter as Filter) ? (filter as Filter) : null;

  const [rows, counts] = await Promise.all([offerMonitor(active), offerCounts()]);

  return (
    <AdminShell title="العروض والمفاوضات" activeHref="/admin/offers" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        ما يجري بين المشترين والبائعين. تُقرأ ولا تُغيَّر — والمفاوضة بين طرفيها.
      </p>

      <MonitorCards
        cards={[
          { title: 'عروض نشطة', value: counts.active, note: 'حالتها نشطة ومهلتها قائمة' },
          { title: 'عروض مقابلة', value: counts.countered, note: 'ردّ البائع بسعر' },
          { title: 'بلا ردّ أكثر من يوم', value: counts.stale, note: 'تسقط تلقائيًّا بانقضاء المهلة' },
          {
            title: 'نسبة القبول',
            value: `${toArabicDigits(String(counts.acceptancePct))}٪`,
            note: 'ممّا نظر فيه البائع',
          },
        ]}
      />

      <MonitorTabs
        basePath="/admin/offers"
        active={active}
        tabs={[
          {
            key: null,
            label: 'الكل',
            count: counts.active + counts.countered + counts.accepted + counts.autoRejected,
          },
          { key: 'active', label: 'بانتظار البائع', count: counts.active },
          { key: 'countered', label: 'عرض مقابل', count: counts.countered },
          { key: 'accepted', label: 'مقبولة', count: counts.accepted },
          { key: 'auto', label: 'مرفوضة تلقائيًّا', count: counts.autoRejected },
        ]}
      />

      <MonitorList
        empty={{ title: 'لا عروض هنا', description: 'حين يقدّم مشترٍ عرضًا يظهر هنا بحاله.' }}
        note="لا زرّ في هذه الشاشة عمدًا: المفاوضة بين طرفين، ومن يملك زرًّا فيها يملك ترجيح أحدهما."
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.id}
            title={row.title}
            subtitle={`${row.buyerName} ← ${row.sellerName}`}
            /* **الصفّ يُفتح** — وقائمةٌ لا تُفتح صفوفُها لا يُتصرَّف فيها */
            meta={
              <Link
                href={`/admin/offers/${row.id}`}
                dir="ltr"
                className="font-num text-start underline underline-offset-4 hover:opacity-70"
              >
                {row.listingRef}
              </Link>
            }
          >
            <div className="flex flex-col items-start gap-0.5">
              <Money amount={Number(row.amount)} />
              <span className="text-3xs opacity-45">
                المطلوب <Money amount={Number(row.askPrice)} showCurrency={false} />
              </span>
            </div>

            <div className="flex flex-col items-start gap-1">
              <Badge
                tone={
                  row.autoRejected ? 'neutral' : row.status === 'ACCEPTED' ? 'accent' : 'warn'
                }
              >
                {row.autoRejected
                  ? 'رُفض تلقائيًّا'
                  : (STATUS_LABEL[row.status] ?? row.status)}
              </Badge>
              {/*
                **الحالة المخزَّنة وانقضاء الوقت معًا**: عرضٌ `PENDING`
                فاتت مهلته ليس بانتظار أحد — والوظيفة تمرّ كل خمس دقائق.
              */}
              {row.lapsed && row.status === 'PENDING' ? (
                <span className="text-3xs opacity-50">انقضت مهلته — يُسقَط قريبًا</span>
              ) : null}
            </div>

            <span className="text-3xs opacity-45">منذ {elapsed(row.waitingMinutes)}</span>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}
