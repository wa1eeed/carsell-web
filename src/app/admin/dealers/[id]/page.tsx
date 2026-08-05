import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, Field } from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminDealerDetail } from '@/lib/domain/admin-detail-readers';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/**
 * تفاصيل المعرض — أعضاؤه وإعلاناته وسجلّه التجاريّ.
 *
 * ═══ وشارة التوثيق تُمنح ولا تُعرض وحدها ═══
 *
 * `verified` تُعرض على كل بطاقة معرض في المنتج. فمن يقرؤها هنا يرى
 * **على ماذا مُنحت**: سجلٌّ تجاريّ ورقمٌ ضريبيّ، أو لا شيء.
 */
export default async function AdminDealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'users.view')) redirect('/admin');

  const { id } = await params;
  const dealer = await adminDealerDetail(id);
  if (dealer === null) notFound();

  return (
    <AdminShell title="تفاصيل المعرض" activeHref="/admin/dealers" admin={admin}>
      <DetailHeader
        backHref="/admin/dealers"
        backLabel="التجار والمعارض"
        reference={dealer.slug}
        title={`${dealer.nameAr} — ${dealer.city}`}
        badges={
          <>
            <Badge tone={dealer.status === 'ACTIVE' ? 'accent' : 'neutral'}>{dealer.status}</Badge>
            {dealer.verified ? <Badge tone="accent">موثَّق</Badge> : <Badge tone="warn">بلا توثيق</Badge>}
            {dealer.marginSchemeApproved ? <Badge tone="neutral">هامش الربح</Badge> : null}
          </>
        }
      />

      <DetailColumns
        main={
          <>
            <DetailCard
              title="الأعضاء"
              note={`عضو (${toArabicDigits(String(dealer.members.length))})`}
            >
              {dealer.members.length === 0 ? (
                // معرضٌ بلا أعضاء لا ينشر شيئًا — وهو حالٌ تُقال لا تُخفى
                <p className="text-2xs opacity-50">
                  لا أعضاء — ومعرضٌ بلا عضوٍ لا ينشر إعلانًا.
                </p>
              ) : (
                dealer.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <Link
                      href={`/admin/users/${member.id}`}
                      className="bidi-isolate truncate text-2xs font-semibold underline underline-offset-4 hover:opacity-70"
                    >
                      {member.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-4 text-3xs opacity-60">
                      <span dir="ltr" className="font-num">
                        {member.phone}
                      </span>
                      <span>{member.role}</span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>

            <DetailCard
              title="الإعلانات"
              note={`المعروض آخر عشرة من ${toArabicDigits(String(dealer.counts.listings))}`}
            >
              {dealer.listings.length === 0 ? (
                <p className="text-2xs opacity-50">لا إعلانات.</p>
              ) : (
                dealer.listings.map((listing) => (
                  <div
                    key={listing.ref}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <Link
                      href={`/admin/listings/${encodeURIComponent(listing.ref)}`}
                      dir="ltr"
                      className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-70"
                    >
                      {listing.ref}
                    </Link>
                    <span className="flex shrink-0 items-center gap-4 text-3xs opacity-60">
                      <Money amount={Number(listing.askPrice)} showCurrency={false} />
                      <span>{listing.status}</span>
                    </span>
                  </div>
                ))
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="المعرض">
              <Field label="الاسم" value={dealer.nameAr} />
              <Field label="المعرّف" value={dealer.slug} ltr />
              <Field label="المدينة" value={dealer.city} />
              <Field label="الهاتف" value={dealer.phone ?? 'لم يُضف'} ltr />
              <Field label="انضمّ" value={riyadh.format(new Date(dealer.createdAt))} />
            </DetailCard>

            <DetailCard title="التوثيق">
              {/*
                **الشارة تُعرض على كل بطاقة في المنتج** — فمن يقرؤها هنا
                يرى على ماذا مُنحت، لا أنها مُنحت فحسب.
              */}
              <Field
                label="السجلّ التجاريّ"
                value={dealer.crNumber ?? 'لم يُقدَّم'}
                ltr
              />
              <Field label="الرقم الضريبيّ" value={dealer.vatNumber ?? 'لم يُقدَّم'} ltr />
              <Field label="الحالة" value={dealer.verified ? 'موثَّق' : 'بلا توثيق'} />
              {dealer.marginSchemeApproved ? (
                <Field label="مرجع هامش الربح" value={dealer.marginSchemeRef ?? '—'} ltr />
              ) : null}
            </DetailCard>

            <DetailCard title="الأرقام">
              <Field
                label="مركبات"
                value={<ArabicNumber value={dealer.counts.vehicles} />}
              />
              <Field
                label="إعلانات"
                value={<ArabicNumber value={dealer.counts.listings} />}
              />
              <Field
                label="التقييم"
                value={
                  dealer.ratingAvg === null
                    ? 'بلا تقييم'
                    : `${toArabicDigits(dealer.ratingAvg)} من ${toArabicDigits(String(dealer.ratingCount))}`
                }
              />
            </DetailCard>

            <DetailCard title="الصفحة العامة">
              <Link
                href={`/ar/dealers/${dealer.slug}`}
                className="text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح ما يراه الزائر
              </Link>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}
