import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { MonitorCards, MonitorList, MonitorRow, MonitorTabs } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { allListings, listingCounts } from '@/lib/domain/admin-monitors';
import type { ListingStatus } from '@/generated/prisma/enums';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'كل الإعلانات' };

const FILTERS: readonly string[] = ['PUBLISHED', 'PENDING_REVIEW', 'RESERVED', 'SOLD', 'SUSPENDED'];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودّة',
  PENDING_REVIEW: 'في المراجعة',
  PUBLISHED: 'نشط',
  RESERVED: 'محجوز',
  SOLD: 'مبيع',
  SUSPENDED: 'موقوف',
  EXPIRED: 'منتهٍ',
};

const TYPE_LABEL: Record<string, string> = {
  DIRECT: 'مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
};

/**
 * A27 — كل الإعلانات.
 *
 * الجرد الكامل — والمراجعة في A15 وحدها. وشاشةٌ تجمع الجرد بالقرار
 * تجعل المراجع يقرّر وهو يتصفّح، والتصفّح غير المراجعة.
 */
export default async function AdminAllListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'listings.review')) redirect('/admin');

  const { filter } = await searchParams;
  const active = filter !== undefined && FILTERS.includes(filter) ? filter : null;

  const [rows, counts] = await Promise.all([
    allListings(active as ListingStatus | null),
    listingCounts(),
  ]);

  return (
    <AdminShell title="كل الإعلانات" activeHref="/admin/all-listings" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        الجرد الكامل بحالاته. والمراجعة والقرار في{' '}
        <Link href="/admin/listings" className="font-bold underline underline-offset-2">
          طابور المراجعة
        </Link>
        .
      </p>

      <MonitorCards
        cards={[
          {
            title: 'نشطة',
            value: counts.published,
            note: `${toArabicDigits(String(counts.activeSharePct))}٪ من الإجمالي`,
          },
          { title: 'في المراجعة', value: counts.pendingReview, note: 'طابور A15' },
          { title: 'مبيعة', value: counts.sold, note: 'اكتمل نقل ملكيتها' },
          { title: 'محجوزة', value: counts.reserved, note: 'عليها طلب قائم' },
        ]}
      />

      <MonitorTabs
        basePath="/admin/all-listings"
        active={active}
        tabs={[
          { key: null, label: 'الكل', count: counts.total },
          { key: 'PUBLISHED', label: 'نشطة', count: counts.published },
          { key: 'PENDING_REVIEW', label: 'مراجعة', count: counts.pendingReview },
          { key: 'RESERVED', label: 'محجوزة', count: counts.reserved },
          { key: 'SOLD', label: 'مبيعة', count: counts.sold },
          { key: 'SUSPENDED', label: 'موقوفة', count: counts.suspended },
        ]}
      />

      <MonitorList
        empty={{ title: 'لا إعلانات بهذه الحالة', description: 'جرّب حالةً أخرى من التابز.' }}
      >
        {rows.map((row) => (
          <MonitorRow
            key={row.ref}
            title={
              <>
                {row.title} <ArabicNumber value={row.year} className="opacity-55" />
              </>
            }
            subtitle={`${row.sellerName} · ${row.city}`}
            meta={row.ref}
          >
            <div className="flex flex-col items-start gap-0.5">
              <Money amount={Number(row.askPrice)} />
              <span className="text-3xs opacity-45">
                عروض ({toArabicDigits(String(row.offerCount))}) · مشاهدات (
                {toArabicDigits(String(row.viewCount))})
              </span>
            </div>

            <Badge tone={row.status === 'PUBLISHED' ? 'accent' : 'neutral'}>
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>

            <span className="text-2xs opacity-60">{TYPE_LABEL[row.type] ?? row.type}</span>
          </MonitorRow>
        ))}
      </MonitorList>
    </AdminShell>
  );
}
