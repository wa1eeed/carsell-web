import { LicensePlate } from '@/components/ui/plate/LicensePlate';
import { Year } from '@/components/ui/Year';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminListingDetail } from '@/lib/domain/admin-entity-detail';
import { listingTimeline } from '@/lib/domain/admin-listing-timeline';
import { Timeline } from '@/components/admin/Timeline';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { REVIEW_REASON_LABEL } from '@/lib/labels/review';
import { orderStateLabel } from '@/lib/labels/orders';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import { Quantity } from '@/components/ui/Quantity';
import { VIEWING_PERIOD, VIEWING_STATUS } from '@/lib/labels/viewings';

export const dynamic = 'force-dynamic';

/** **واليومُ بلا ساعة** — `onDate` تاريخٌ لا لحظة، فالمنطقة UTC */
const viewingDate = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
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
/**
 * ═══ نظرةٌ شاملة — تابزٌ لا عمودٌ طويل ═══
 *
 * كانت الصفحة ستّ بطاقاتٍ تقول **الحال**: منشور، سعرُه كذا، عليه
 * طلب. ولا تقول **كيف وصل إليها** — ومن يحقّق في شكوى («لماذا بِيعت
 * بأقلّ من سعرها؟») يحتاج التسلسل لا اللقطة، فكان يُركّبه من خمس
 * شاشاتٍ في رأسه.
 *
 * **والتابز في الرابط لا في حالة العميل**: يُشارَك ويُفتح في لسانٍ
 * جديد، ويعود إليه من ضغط «رجوع».
 */
const TABS = [
  { key: null, label: 'نظرة عامة' },
  { key: 'history', label: 'التاريخ' },
  { key: 'images', label: 'الصور' },
  { key: 'money', label: 'العروض والطلبات' },
] as const;

export default async function AdminListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'listings.review')) redirect('/admin');

  // المرجع يصل مُرمَّزًا من Next — والمقارنة بنصٍّ مفكوك تفشل صامتةً
  const { ref } = await params;
  const listing = await adminListingDetail(decodeURIComponent(ref));
  if (listing === null) notFound();

  const query = await searchParams;
  const raw = typeof query.tab === 'string' ? query.tab : null;
  const tab = TABS.find((row) => row.key === raw)?.key ?? null;

  /** التاريخ يُجلب لتبويبه وحده — ولا يُحمَّل على من فتح النظرة العامّة. */
  const events = tab === 'history' ? await listingTimeline(listing.ref) : [];

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
            <Year value={listing.vehicle.year} /> — {listing.city}
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

      {/*
        **وشريطُ الأرقام أُلحق بها.** بُنيت هذه الصفحة قبل أن يوجد
        `DetailStats`، فبقيت وحدها بين العشر بلا جوابٍ قبل التابز —
        والأوّل ما يُسأل: بكم، وكم عرضًا عليها، ومتى نُشرت.
      */}
      <DetailStats
        items={[
          { label: 'السعر المعروض', value: <Money amount={Number(listing.askPrice)} /> },
          { label: 'العروض', value: <ArabicNumber value={listing.offers.length} /> },
          { label: 'المشاهدات', value: <ArabicNumber value={listing.viewCount} /> },
          {
            label: 'نُشر',
            value: listing.publishedAt === null ? 'لم يُنشر' : riyadh.format(new Date(listing.publishedAt)),
          },
        ]}
      />

      <MonitorTabs
        // **والعدّ يقول كم فيه قبل أن يُفتح** — وتابزٌ بلا عددٍ يُفتح ليُوجد فارغًا
        tabs={TABS.map((row) => ({
          key: row.key,
          label: row.label,
          /** **ولا عددَ على «نظرة عامة»** — صفرٌ عليها يُقرأ «فارغة». */
          ...(row.key === 'images'
            ? { count: listing.images.length }
            : row.key === 'money'
              ? { count: listing.offers.length + listing.orders.length }
              : {}),
        }))}
        active={tab}
        basePath={`/admin/listings/${encodeURIComponent(listing.ref)}`}
        param="tab"
      />

      {tab !== 'history' ? null : (
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-1.5 text-sm font-bold">تاريخ الإعلان</h2>
          <p className="mb-5 max-w-2xl text-2xs leading-loose opacity-70">
            كلُّ حدثٍ وقع عليه — من إنشائه إلى آخر خطوة، مرتَّبًا من الأقدم.
            <b> وما لا سجلَّ له لا يُعرض</b>: لا سطرَ لتغيّر سعرٍ ما دام لا يُسجَّل،
            وسطرٌ مخترَعٌ في تحقيقٍ أسوأ من سطرٍ غائب.
          </p>
          <Timeline events={events} />
        </section>
      )}

      {tab !== 'images' ? null : (
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-1.5 text-sm font-bold">الصور</h2>
          <p className="mb-5 max-w-2xl text-2xs leading-loose opacity-70">
            <b>ونصفُ المراجعة بصريّ</b> — فالصورة هنا لا مفتاحُها: لوحةٌ ظاهرة أو
            صورةٌ ضبابية تُردّ قبل قراءة سطر. وكانت تُعرض مفاتيحَ نصّية.
          </p>

          {listing.images.length === 0 ? (
            <p className="text-2xs opacity-70">لا صور — وإعلانٌ بلا صورة لا يُنشر أصلًا.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {listing.images.map((image) => (
                <figure key={image.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="aspect-4/3 bg-ink/8">
                    {image.url === null ? (
                      <span className="flex size-full items-center justify-center text-3xs opacity-65">
                        لا عنوان عامّ مضبوط
                      </span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element -- مفتاحُ R2 لا يمرّ بمحسّن الصور */
                      <img
                        src={image.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <figcaption className="flex flex-wrap items-center gap-1.5 p-3">
                    {image.isCover ? <Badge tone="neutral">غلاف</Badge> : null}
                    {/*
                      **اللوحة تُطمَس أو لا تُنشر** — وصورةٌ بلا طمس تنشر
                      لوحةَ سيارةٍ لصاحبها لم يأذن بها.
                    */}
                    {image.plateBlurred ? (
                      <Badge tone="accent">طُمست اللوحة</Badge>
                    ) : (
                      <Badge tone="danger">بلا طمس</Badge>
                    )}
                    {image.hasFingerprint ? null : <Badge tone="warn">بلا بصمة</Badge>}
                    {image.qualityFlags.map((flag) => (
                      <Badge key={flag} tone="warn">
                        {flag}
                      </Badge>
                    ))}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      {tab !== 'money' ? null : (
        <div className="flex flex-col gap-5">

            {listing.offers.length === 0 ? null : (
              <DetailCard
                title="العروض"
                note={<Quantity unit="offers" count={listing.offers.length} />}
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

            {/*
              **ومواعيدُ المعاينة يُسأل عنها المشغّل**: بائعٌ يشكو أنّ
              أحدًا لا يطلب مركبته، أو مشترٍ يقول إنّ البائع لا يردّ —
              والجوابُ صفٌّ هنا لا استعلامٌ في القاعدة.
            */}
            {listing.viewings.length === 0 ? null : (
              <DetailCard title="مواعيد المعاينة">
                {listing.viewings.map((viewing) => (
                  <div
                    key={viewing.ref}
                    className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-2.5 last:border-0"
                  >
                    <span className="flex flex-wrap items-center gap-3 text-2xs">
                      <span className="font-num bidi-isolate opacity-70">{viewing.ref}</span>
                      <span className="bidi-isolate font-bold">{viewing.buyerName ?? '—'}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-3xs opacity-70">
                      <span>{VIEWING_STATUS[viewing.status] ?? viewing.status}</span>
                      <span className="bidi-isolate">
                        {viewingDate.format(new Date(viewing.onDate))}
                      </span>
                      <span>{VIEWING_PERIOD[viewing.period] ?? viewing.period}</span>
                    </span>
                  </div>
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
                      className="font-num text-start text-2xs font-bold underline underline-offset-4 hover:opacity-75"
                    >
                      {order.ref}
                    </Link>
                    <span className="flex items-center gap-3 text-3xs opacity-70">
                      {/*
                        **قراءةٌ واحدة لا قراءتان.** كانت المرحلة
                        بالعربية و`status` خامًّا بالإنجليزية بجوارها:
                        «الدفع  CANCELLED» — جملتان تتناقضان، وإحداهما
                        غير مترجمة في لوحةٍ عربية. والقرار ١٧: «أُلغي
                        عند الدفع».
                      */}
                      <span>{orderStateLabel(order.status, order.stage).text}</span>
                      <span>{riyadh.format(new Date(order.at))}</span>
                    </span>
                  </div>
                ))}
              </DetailCard>
            )}
        </div>
      )}

      {tab !== null ? null : (
      <DetailColumns
        main={
          <>
            <DetailCard title="المركبة">
              <Field
                label="الماركة والطراز"
                value={`${listing.vehicle.brandName} ${listing.vehicle.modelName}`}
              />
              <Field label="السنة" value={displayDigits(String(listing.vehicle.year))} ltr />
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

              {/*
                ═══ واللوحةُ مرسومةً لا نصًّا ═══

                المشغّلُ يطابقها باستمارةٍ أو صورةٍ أمامه، ونصٌّ «ا ب ح
                ٢٦١٣» يُقرأ حرفًا حرفًا بينما اللوحةُ المرسومة تُطابَق
                بنظرة. وتُعرض هنا بلا شرط `showPlate`: ذاك إخفاءٌ عن
                السوق لا عمّن يدير الإعلان.
              */}
              {listing.vehicle.plateLetters === null ? null : (
                <div className="mt-4 w-56">
                  <LicensePlate
                    letters={listing.vehicle.plateLetters}
                    numbers={listing.vehicle.plateNumbers}
                    size="fill"
                  />
                </div>
              )}
            </DetailCard>
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
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
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
                    label="دخل المراجعة"
                    value={riyadh.format(new Date(listing.reviewQueuedAt))}
                  />
                )}
                {listing.reviewedAt === null ? (
                  <Field label="القرار" value="ما زال قيد المراجعة" />
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
                <p className="mt-3 text-3xs opacity-65">
                  السعر الاحتياطيّ لا يُعرض هنا — ولا في أي شاشة.
                </p>
              </DetailCard>
            )}
          </>
        }
      />
      )}
    </AdminShell>
  );
}
