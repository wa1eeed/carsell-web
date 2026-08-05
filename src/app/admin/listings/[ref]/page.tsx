import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminListingDetail } from '@/lib/domain/admin-entity-detail';
import { REVIEW_REASON_LABEL } from '@/lib/labels/review';
import { STAGE_LABEL } from '@/lib/labels/charts';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  PUBLISHED: 'accent',
  SOLD: 'accent',
  PENDING_REVIEW: 'warn',
  RESERVED: 'warn',
  SUSPENDED: 'danger',
};

const TYPE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
};

/**
 * تفاصيل الإعلان — والوجهة التي كان طابور المراجعة يفتقدها.
 *
 * **من رأى إعلانًا مُحالًا لم يكن يرى صوره ولا سبب إحالته**، فيقرّر بلا
 * ما يقرّر به. والصور هنا بحالة كلٍّ منها: أطُمست لوحتُها، وأله بصمة
 * تُقارَن، وما أعلامُ جودته.
 */
export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'listings.review')) redirect('/admin');

  // المرجع يصل مُرمَّزًا من Next — والمقارنة بنصٍّ مفكوك تفشل صامتةً
  const { ref } = await params;
  const listing = await adminListingDetail(decodeURIComponent(ref));
  if (listing === null) notFound();

  return (
    <AdminShell title="تفاصيل الإعلان" activeHref="/admin/all-listings" admin={admin}>
      <DetailHeader
        backHref="/admin/all-listings"
        backLabel="كل الإعلانات"
        reference={listing.ref}
        // السنة تمرّ بـ`ArabicNumber` كأي رقمٍ معروض — لا داخل سلسلة
        title={
          <>
            {listing.vehicle.brandName} {listing.vehicle.modelName}{' '}
            <ArabicNumber value={listing.vehicle.year} /> — {listing.city}
          </>
        }
        badges={
          <>
            <Badge tone={STATUS_TONE[listing.status] ?? 'neutral'}>{listing.status}</Badge>
            <Badge tone="neutral">{TYPE_LABEL[listing.type] ?? listing.type}</Badge>
            {listing.reviewReason === null ? null : (
              <Badge tone="warn">
                {REVIEW_REASON_LABEL[listing.reviewReason] ?? listing.reviewReason}
              </Badge>
            )}
          </>
        }
      />

      <DetailColumns
        main={
          <>
            <DetailCard
              title="الصور"
              note={`صور (${toArabicDigits(String(listing.images.length))})`}
            >
              {listing.images.length === 0 ? (
                <p className="text-2xs opacity-50">
                  لا صور — وإعلانٌ بلا صورة لا يُنشر أصلًا.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {listing.images.map((image) => (
                    <div key={image.id} className="flex items-center gap-3 py-2.5">
                      {/* المفتاح يُقارن خانةً بخانة — لاتينيّ معزول */}
                      <span dir="ltr" className="font-num min-w-0 flex-1 truncate text-start text-3xs opacity-60">
                        {image.r2Key}
                      </span>
                      {image.isCover ? <Badge tone="neutral">غلاف</Badge> : null}
                      {/*
                        **اللوحة تُطمَس أو لا تُنشر.** وصورةٌ بلا طمس
                        تنشر لوحةَ سيارةٍ لصاحبها لم يأذن بها.
                      */}
                      {image.plateBlurred ? (
                        <Badge tone="accent">طُمست</Badge>
                      ) : (
                        <Badge tone="danger">بلا طمس</Badge>
                      )}
                      {image.hasFingerprint ? null : <Badge tone="warn">بلا بصمة</Badge>}
                      {image.qualityFlags.map((flag) => (
                        <Badge key={flag} tone="warn">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </DetailCard>

            <DetailCard title="المركبة">
              <Field
                label="الماركة والطراز"
                value={`${listing.vehicle.brandName} ${listing.vehicle.modelName}`}
              />
              <Field label="السنة" value={toArabicDigits(String(listing.vehicle.year))} ltr />
              <Field label="الهيكل" value={listing.vehicle.bodyType} ltr />
              <Field label="ناقل الحركة" value={listing.vehicle.transmission} ltr />
              <Field label="الوقود" value={listing.vehicle.fuel} ltr />
              <Field
                label="الممشى"
                value={<ArabicNumber value={listing.vehicle.mileageKm} />}
              />
              <Field label="اللون" value={listing.vehicle.colorExterior} />
              <Field label="الحالة" value={listing.vehicle.condition} ltr />
              {/* الرقم التسلسليّ يُقارن خانةً بخانة */}
              <Field label="الرقم التسلسليّ" value={listing.vehicle.vin ?? '—'} ltr />
            </DetailCard>

            {listing.offers.length === 0 ? null : (
              <DetailCard
                title="العروض"
                note={`عروض (${toArabicDigits(String(listing.offers.length))})`}
              >
                {listing.offers.map((offer) => (
                  <Field
                    key={offer.id}
                    label={`${offer.status} · ${riyadh.format(new Date(offer.at))}`}
                    value={<Money amount={Number(offer.amount)} />}
                  />
                ))}
              </DetailCard>
            )}

            {listing.orders.length === 0 ? null : (
              <DetailCard title="الطلبات على هذا الإعلان">
                {listing.orders.map((order) => (
                  <div
                    key={order.ref}
                    className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <Link
                      href={`/admin/orders/${encodeURIComponent(order.ref)}`}
                      dir="ltr"
                      className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-70"
                    >
                      {order.ref}
                    </Link>
                    <span className="flex items-center gap-3 text-3xs opacity-60">
                      <span>{STAGE_LABEL[order.stage] ?? order.stage}</span>
                      <span>{order.status}</span>
                      <span>{riyadh.format(new Date(order.at))}</span>
                    </span>
                  </div>
                ))}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            <DetailCard title="الإعلان">
              <Field label="السعر المعروض" value={<Money amount={Number(listing.askPrice)} />} strong />
              <Field label="المدينة" value={listing.city} />
              <Field
                label="المشاهدات"
                value={<ArabicNumber value={listing.viewCount} />}
              />
              <Field
                label="نُشر"
                value={
                  listing.publishedAt === null
                    ? 'لم يُنشر بعد'
                    : riyadh.format(new Date(listing.publishedAt))
                }
              />
              {listing.closedAt === null ? null : (
                <Field label="أُغلق" value={riyadh.format(new Date(listing.closedAt))} />
              )}
              {listing.closeReason === null ? null : (
                <Field label="سبب الإغلاق" value={listing.closeReason} ltr />
              )}
            </DetailCard>

            <DetailCard title="البائع">
              <Field label="الاسم" value={listing.seller.name} />
              <Field label="الهاتف" value={listing.seller.phone} ltr />
              <Field
                label="الهوية"
                value={listing.seller.idVerified ? 'موثَّقة' : 'بلا توثيق'}
              />
              <Link
                href={`/admin/users/${listing.seller.id}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح ملفّه
              </Link>
            </DetailCard>

            {listing.reviewReason === null && listing.reviewedAt === null ? null : (
              <DetailCard title="المراجعة">
                {listing.reviewReason === null ? null : (
                  <Field
                    label="سبب الإحالة"
                    value={REVIEW_REASON_LABEL[listing.reviewReason] ?? listing.reviewReason}
                  />
                )}
                {listing.reviewQueuedAt === null ? null : (
                  <Field
                    label="دخل الطابور"
                    value={riyadh.format(new Date(listing.reviewQueuedAt))}
                  />
                )}
                {listing.reviewedAt === null ? (
                  <Field label="القرار" value="ما زال في الطابور" />
                ) : (
                  <Field label="روجِع" value={riyadh.format(new Date(listing.reviewedAt))} />
                )}
                {listing.reviewNote === null ? null : (
                  <Field label="الملاحظة" value={listing.reviewNote} />
                )}
              </DetailCard>
            )}

            {listing.auction === null ? null : (
              <DetailCard title="المزاد">
                <Field label="الحالة" value={listing.auction.status} ltr />
                <Field
                  label="سعر البداية"
                  value={<Money amount={Number(listing.auction.startPrice)} />}
                />
                <Field label="ينتهي" value={riyadh.format(new Date(listing.auction.endsAt))} />
                <Field
                  label="المزايدات"
                  value={<ArabicNumber value={listing.auction.bidCount} />}
                />
                {/* الاحتياطي لا يُعرض — ممنوعٌ في أي استجابة، والشاشة ليست استثناء */}
                <p className="mt-3 text-3xs opacity-45">
                  السعر الاحتياطيّ لا يُعرض هنا — ولا في أي شاشة.
                </p>
              </DetailCard>
            )}
          </>
        }
      />
    </AdminShell>
  );
}
