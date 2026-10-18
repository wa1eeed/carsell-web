import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, DetailStats, Field } from '@/components/admin/DetailShell';
import { AdminLink } from '@/components/admin/AdminLink';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminOfferDetail } from '@/lib/domain/admin-detail-readers';
import { offerTimeline } from '@/lib/domain/admin-entity-timelines';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/** حالاتُ العرض بالعربية — ولا شيفرةٌ في ترويسةٍ يقرؤها مشغّل. */
const OFFER_STATUS: Record<string, string> = {
  PENDING: 'قائم',
  COUNTERED: 'رد البائع بمقابل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  WITHDRAWN: 'سحبه المشتري',
  EXPIRED: 'سقط بانقضاء مهلته',
};

const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  ACCEPTED: 'accent',
  PENDING: 'warn',
  COUNTERED: 'warn',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

/**
 * تفاصيل العرض — والسلسلة كاملةً.
 *
 * ═══ والمُرسِل لا يُشتقّ من الدور ═══
 *
 * العرض المقابل يحتفظ بـ`buyerId` الأصليّ، فكان البائع يرى مقابلَه في
 * «واردة» وفوقه «اقبل» — يقبل عرض نفسه. والاتّجاه هنا من `parentOfferId`
 * لا من صاحب الصفّ.
 */
export default async function AdminOfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { id } = await params;
  const offer = await adminOfferDetail(id);
  if (offer === null) notFound();

  const search = await searchParams;
  /* **ويُجلَب خطُّ الزمن لتبويبته وحدها** — استعلامُه يمرّ على عدّة جداول */
  const timeline = search.tab === 'timeline';
  const events = timeline ? await offerTimeline(offer.id) : [];

  return (
    <AdminShell title="تفاصيل العرض" activeHref="/admin/offers" admin={admin}>
      <DetailHeader
        backHref="/admin/offers"
        backLabel="العروض والمفاوضات"
        reference={offer.listing.ref}
        title={`${offer.listing.title} — عرض من ${offer.buyer.name}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[offer.status] ?? 'neutral'}>
              {OFFER_STATUS[offer.status] ?? offer.status}
            </Badge>
            {/* المهلة والزمن معًا — وعرضٌ انقضت مهلتُه ليس «قائمًا» */}
            {offer.expired && offer.status === 'PENDING' ? (
              <Badge tone="danger">انقضت مهلته</Badge>
            ) : null}
            {offer.autoRejected ? <Badge tone="neutral">رفض آليا</Badge> : null}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'المبلغ', value: <Money amount={Number(offer.amount)} /> },
          {
            label: 'الحالة',
            /**
             * **والانقضاء لا يُقال إلّا على ما كان قائمًا.** عرضٌ
             * `ACCEPTED` مضى تاريخ مهلته ليس ساقطًا بالانقضاء — قُبل
             * قبلها. وكانت الشارة تقول `ACCEPTED` والشريط «سقط
             * بانقضاء مهلته» في شاشةٍ واحدة.
             */
            value:
              offer.expired && (offer.status === 'PENDING' || offer.status === 'COUNTERED')
                ? 'سقط بانقضاء مهلته'
                : (OFFER_STATUS[offer.status] ?? offer.status),
          },
          { label: 'جولات التفاوض', value: <ArabicNumber value={offer.chain.length} /> },
          { label: 'تنتهي مهلته', value: riyadh.format(new Date(offer.expiresAt)) },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/offers/${encodeURIComponent(offer.id)}`}
        param="tab"
        active={timeline ? 'timeline' : null}
        tabs={[
          { key: null, label: 'نظرة عامة' },
          { key: 'timeline', label: 'خط الزمن' },
        ]}
      />

      {timeline ? null : (
      <DetailColumns
        main={
          <DetailCard
            title="سلسلة التفاوض"
            note={<Quantity unit="steps" count={offer.chain.length} />}
          >
            {offer.chain.map((step, index) => (
              <div
                key={step.id}
                className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="font-num text-3xs opacity-65">
                    {displayDigits(String(index + 1))}
                  </span>
                  {/*
                    الاتّجاه من `parentOfferId` لا من صاحب الصفّ — والمقابل
                    يحتفظ بمعرّف المشتري الأصليّ.
                  */}
                  <Badge tone="neutral">{step.fromBuyer ? 'من المشتري' : 'مقابل من البائع'}</Badge>
                  {step.id === offer.id ? <Badge tone="accent">هذا العرض</Badge> : null}
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <Money amount={Number(step.amount)} showCurrency={false} />
                  <span className="text-3xs opacity-70">{step.status}</span>
                  <span className="font-num text-3xs opacity-65">
                    {riyadh.format(new Date(step.at))}
                  </span>
                </span>
              </div>
            ))}
          </DetailCard>
        }
        side={
          <>
            <DetailCard title="العرض">
              <Field label="المبلغ" value={<Money amount={Number(offer.amount)} />} strong />
              <Field
                label="السعر المعروض"
                value={<Money amount={Number(offer.listing.askPrice)} />}
              />
              <Field label="قدم" value={riyadh.format(new Date(offer.createdAt))} />
              <Field
                label="ينتهي"
                value={
                  <span className={offer.expired ? 'text-danger' : undefined}>
                    {riyadh.format(new Date(offer.expiresAt))}
                  </span>
                }
              />
              {/*
                **والحدّ الأدنى للقبول لا يُعرض** — كالاحتياطي: سرٌّ
                للبائع، وكشفُه في شاشةٍ يجعل المفاوضة بلا معنى.
              */}
              <p className="mt-3 text-3xs opacity-65">
                الحد الأدنى للقبول لا يعرض هنا — ولا في أي استجابة.
              </p>
            </DetailCard>

            <DetailCard title="الأطراف">
              <Field
                label="المشتري"
                value={<AdminLink href={`/admin/users/${encodeURIComponent(offer.buyer.id)}`}>{offer.buyer.name}</AdminLink>}
              />
              <Field
                label="البائع"
                value={<AdminLink href={`/admin/users/${encodeURIComponent(offer.listing.sellerId)}`}>{offer.listing.sellerName}</AdminLink>}
              />
              <Link
                href={`/admin/users/${offer.buyer.id}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
              >
                افتح ملف المشتري
              </Link>
            </DetailCard>

            <DetailCard title="الإعلان">
              <Field
                label="المرجع"
                value={<AdminLink href={`/admin/listings/${encodeURIComponent(offer.listing.ref)}`} ltr>{offer.listing.ref}</AdminLink>}
                ltr
              />
              <Field label="المركبة" value={offer.listing.title} />
              <Link
                href={`/admin/listings/${encodeURIComponent(offer.listing.ref)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
              >
                افتح الإعلان
              </Link>
            </DetailCard>
          </>
        }
      />
      )}

      {!timeline ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">خط الزمن</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-70">
            سلسلة التفاوض كاملة بين هذا المشتري وهذا الإعلان، وما انتهت إليه.
          </p>
          <Timeline events={events} />
        </section>
      )}
    </AdminShell>
  );
}
