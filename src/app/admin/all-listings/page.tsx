import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { MonitorCards, MonitorList, MonitorRow, MonitorTabs } from '@/components/admin/MonitorShell';
import { ListSearch } from '@/components/admin/ListSearch';
import { ListFooter } from '@/components/admin/ListFooter';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { allListings, listingCounts } from '@/lib/domain/admin-monitors';
import type { ListingStatus } from '@/generated/prisma/enums';
import { displayDigits } from '@/lib/arabic';

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
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'listings.review')) redirect('/admin');

  const { filter, q } = await searchParams;
  const term = (q ?? '').trim() === '' ? null : (q ?? '').trim();
  const active = filter !== undefined && FILTERS.includes(filter) ? filter : null;

  const [rows, counts] = await Promise.all([
    allListings(active as ListingStatus | null, 100, term),
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
            note: `${displayDigits(String(counts.activeSharePct))}٪ من الإجمالي`,
          },
          { title: 'في المراجعة', value: counts.pendingReview, note: 'طابور A15' },
          { title: 'مبيعة', value: counts.sold, note: 'اكتمل نقل ملكيتها' },
          { title: 'محجوزة', value: counts.reserved, note: 'عليها طلب قائم' },
        ]}
      />

      {/* البحث قبل الشرائح — والشريحة تُحمل معه فلا يُرجعه إلى «الكل» */}
      {/*
        **والتصدير من مكان القائمة.** شاشةٌ جامعة صحيحةٌ للمراجعة
        الدورية، لكن من يقف على طابورٍ مرشَّح يريد تصديره الآن.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
        <ExportLink reportKey="inventory_aging" allowed={can(admin.role, 'listings.review')} />
      </div>

      <ListSearch
        action="/admin/all-listings"
        value={term}
        placeholder="مرجع الإعلان · المركبة · المدينة · البائع"
        keep={{ filter: active }}
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
            /* **المرجع يفتح الإعلان** — والقائمة كانت تعرض ولا تُفتح */
            meta={
              <Link
                href={`/admin/listings/${encodeURIComponent(row.ref)}`}
                dir="ltr"
                className="font-num text-start underline underline-offset-4 hover:opacity-70"
              >
                {row.ref}
              </Link>
            }
          >
            <div className="flex flex-col items-start gap-0.5">
              <Money amount={Number(row.askPrice)} />
              <span className="text-3xs opacity-45">
                عروض ({displayDigits(String(row.offerCount))}) · مشاهدات (
                {displayDigits(String(row.viewCount))})
              </span>
            </div>

            <Badge tone={row.status === 'PUBLISHED' ? 'accent' : 'neutral'}>
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>

            <span className="text-2xs opacity-60">{TYPE_LABEL[row.type] ?? row.type}</span>
          </MonitorRow>
        ))}
      </MonitorList>

      <ListFooter
        shown={rows.length}
        total={active === null && term === null ? counts.total : null}
        note="الجرد كامل بحالاته — والمراجعة والقرار في طابور المراجعة"
        can="فتح الإعلان لقراءة تفاصيله وتاريخه، والانتقال إلى بائعه أو إلى طابور المراجعة."
        cannot="تعديل سعر إعلانٍ أو وصفه — ذلك لصاحبه وحده من «إعلاناتي». وإيقاف الإدارة يُرفع من هنا لا يرفعه البائع."
      />
    </AdminShell>
  );
}
