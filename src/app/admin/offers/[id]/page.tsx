import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, Field } from '@/components/admin/DetailShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminOfferDetail } from '@/lib/domain/admin-detail-readers';
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
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { id } = await params;
  const offer = await adminOfferDetail(id);
  if (offer === null) notFound();

  return (
    <AdminShell title="تفاصيل العرض" activeHref="/admin/offers" admin={admin}>
      <DetailHeader
        backHref="/admin/offers"
        backLabel="العروض والمفاوضات"
        reference={offer.listing.ref}
        title={`${offer.listing.title} — عرض من ${offer.buyer.name}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[offer.status] ?? 'neutral'}>{offer.status}</Badge>
            {/* المهلة والزمن معًا — وعرضٌ انقضت مهلتُه ليس «قائمًا» */}
            {offer.expired && offer.status === 'PENDING' ? (
              <Badge tone="danger">انقضت مهلته</Badge>
            ) : null}
            {offer.autoRejected ? <Badge tone="neutral">رُفض آليًّا</Badge> : null}
          </>
        }
      />

      <DetailColumns
        main={
          <DetailCard
            title="سلسلة التفاوض"
            note={`خطوات (${toArabicDigits(String(offer.chain.length))})`}
          >
            {offer.chain.map((step, index) => (
              <div
                key={step.id}
                className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="font-num text-3xs opacity-40">
                    {toArabicDigits(String(index + 1))}
                  </span>
                  {/*
                    الاتّجاه من `parentOfferId` لا من صاحب الصفّ — والمقابل
                    يحتفظ بمعرّف المشتري الأصليّ.
                  */}
                  <Badge tone="neutral">{step.fromBuyer ? 'من المشتري' : 'مقابلٌ من البائع'}</Badge>
                  {step.id === offer.id ? <Badge tone="accent">هذا العرض</Badge> : null}
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <Money amount={Number(step.amount)} showCurrency={false} />
                  <span className="text-3xs opacity-55">{step.status}</span>
                  <span className="font-num text-3xs opacity-45">
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
              <Field label="قُدّم" value={riyadh.format(new Date(offer.createdAt))} />
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
              <p className="mt-3 text-3xs opacity-45">
                الحدّ الأدنى للقبول لا يُعرض هنا — ولا في أي استجابة.
              </p>
            </DetailCard>

            <DetailCard title="الأطراف">
              <Field label="المشتري" value={offer.buyer.name} />
              <Field label="البائع" value={offer.listing.sellerName} />
              <Link
                href={`/admin/users/${offer.buyer.id}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح ملفّ المشتري
              </Link>
            </DetailCard>

            <DetailCard title="الإعلان">
              <Field label="المرجع" value={offer.listing.ref} ltr />
              <Field label="المركبة" value={offer.listing.title} />
              <Link
                href={`/admin/listings/${encodeURIComponent(offer.listing.ref)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح الإعلان
              </Link>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}
