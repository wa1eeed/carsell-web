import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ExportLink } from '@/components/admin/ExportLink';
import { MonitorCards, MonitorTabs } from '@/components/admin/MonitorShell';
import { ListSearch } from '@/components/admin/ListSearch';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListingCard } from '@/components/admin/ListingCard';
import { ListFooter } from '@/components/admin/ListFooter';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { allListings, listingCounts } from '@/lib/domain/admin-monitors';
import type { ListingStatus } from '@/generated/prisma/enums';
import { displayDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'كل الإعلانات' };

/**
 * ═══ الشرائح تُعرَّف مرّة، والمرشّح يُشتقّ منها ═══
 *
 * المفتاحُ غيرُ المدرَج في قائمة المقبول يسقط إلى «الكل» **صامتًا** —
 * فشريحة «مسودّة ٣» كانت تفتح ستّين صفًّا. وقائمتان تُكتبان بيد
 * تتباعدان أوّل شريحةٍ تُضاف، وقد تباعدتا.
 *
 * فالوسوم والمفاتيح هنا، و`FILTERS` مشتقّةٌ منها — فشريحةٌ بلا مرشّحها
 * لا تُكتب أصلًا.
 */
const SEGMENTS = [
  { key: 'PUBLISHED', label: 'نشطة' },
  { key: 'PENDING_REVIEW', label: 'مراجعة' },
  { key: 'RESERVED', label: 'محجوزة' },
  { key: 'SOLD', label: 'مبيعة' },
  { key: 'SUSPENDED', label: 'موقوفة' },
  { key: 'DRAFT', label: 'مسودة' },
] as const;

const FILTERS: readonly string[] = SEGMENTS.map((row) => row.key);

/** عدّادُ كل شريحة — بالمفتاح نفسه الذي تُرشَّح به. */
const COUNT_OF = {
  PUBLISHED: 'published',
  PENDING_REVIEW: 'pendingReview',
  RESERVED: 'reserved',
  SOLD: 'sold',
  SUSPENDED: 'suspended',
  DRAFT: 'draft',
} as const;



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
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-70">
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
          ...SEGMENTS.map((row) => ({
            key: row.key as string,
            label: row.label,
            count: counts[COUNT_OF[row.key]],
          })),
        ]}
      />

      {/*
        ═══ كروتٌ لا أسطر ═══

        **ومن يراجع إعلانًا يحتاج أن يعرف قبل أن يفتحه**: أيُّ مركبةٍ
        هي (صورة)، ومن يبيعها وبأيّ صفة، وأمشترِكٌ هو، ومتى نُشر.
        فمراجعةُ عشرين إعلانًا كانت عشرين فتحًا ورجوعًا.
      */}
      {rows.length === 0 ? (
        <EmptyState
          title="لا إعلانات بهذه الحالة"
          description="جرب حالة أخرى من التابز، أو امسح البحث."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ListingCard key={row.ref} row={row} />
          ))}
        </div>
      )}

      <ListFooter
        shown={rows.length}
        total={active === null && term === null ? counts.total : null}
        note="الجرد كامل بحالاته — والمراجعة والقرار في طابور المراجعة"
        can="فتح الإعلان لقراءة تفاصيله وتاريخه، والانتقال إلى بائعه أو إلى طابور المراجعة."
        cannot="تعديل سعر إعلان أو وصفه — ذلك لصاحبه وحده من «إعلاناتي». وإيقاف الإدارة يرفع من هنا لا يرفعه البائع."
      />
    </AdminShell>
  );
}
