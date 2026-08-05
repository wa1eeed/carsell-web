import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, Field } from '@/components/admin/DetailShell';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminDisputeDetail } from '@/lib/domain/admin-detail-readers';
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
  OPEN: 'danger',
  INVESTIGATING: 'warn',
  RESOLVED: 'accent',
  CLOSED: 'neutral',
};

/**
 * تفاصيل النزاع — رسائله وطرفاه ومهلته وقراره.
 *
 * ═══ والقرار لا يُتَّخذ من هنا ═══
 *
 * حسمُ نزاعٍ يمسّ مالًا محجوزًا، ويمرّ بنصاب عضوين في شاشة النزاعات.
 * وزرٌّ هنا يجعل قراءةَ الملف وحسمَه فعلًا واحدًا — وهما فعلان.
 */
export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { id } = await params;
  const dispute = await adminDisputeDetail(id);
  if (dispute === null) notFound();

  return (
    <AdminShell title="تفاصيل النزاع" activeHref="/admin/disputes" admin={admin}>
      <DetailHeader
        backHref="/admin/disputes"
        backLabel="النزاعات"
        reference={dispute.order.ref}
        title={`${dispute.reason} — فتحه ${dispute.openedByName}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[dispute.status] ?? 'neutral'}>{dispute.status}</Badge>
            {/* المهلة والزمن معًا — ونزاعٌ فات موعدُه وهو مفتوح متجاوز */}
            {dispute.slaBreached ? <Badge tone="danger">تجاوز المهلة</Badge> : null}
          </>
        }
      />

      <DetailColumns
        main={
          <DetailCard
            title="الرسائل"
            note={`رسائل (${toArabicDigits(String(dispute.messages.length))})`}
          >
            {dispute.messages.length === 0 ? (
              <p className="text-2xs opacity-50">لا رسائل — فُتح النزاع بلا شرح.</p>
            ) : (
              dispute.messages.map((message) => (
                <div key={message.index} className="border-b border-line py-3 last:border-0">
                  <div className="mb-1.5 flex items-baseline justify-between gap-4">
                    <span className="bidi-isolate text-2xs font-bold">
                      {message.authorSide === 'buyer'
                        ? dispute.order.buyerName
                        : message.authorSide === 'seller'
                          ? dispute.order.sellerName
                          : 'الإدارة'}
                    </span>
                    <span className="font-num shrink-0 text-3xs opacity-45">
                      {message.at === '' ? '—' : riyadh.format(new Date(message.at))}
                    </span>
                  </div>
                  <p className="text-2xs leading-loose opacity-75">{message.body}</p>
                </div>
              ))
            )}
          </DetailCard>
        }
        side={
          <>
            <DetailCard title="النزاع">
              <Field label="السبب" value={dispute.reason} />
              <Field label="فُتح" value={riyadh.format(new Date(dispute.openedAt))} />
              <Field label="فتحه" value={dispute.openedByName} />
              {dispute.slaDueAt === null ? null : (
                <Field
                  label="مهلة الحسم"
                  value={
                    <span className={dispute.slaBreached ? 'text-danger' : undefined}>
                      {riyadh.format(new Date(dispute.slaDueAt))}
                    </span>
                  }
                  strong
                />
              )}
            </DetailCard>

            {dispute.resolvedAt === null ? (
              <DetailCard title="القرار">
                <p className="text-2xs leading-loose opacity-60">
                  لم يُحسم بعد. <b>ويحتاج القرار موافقة شخصين</b> في شاشة النزاعات — لا من هنا.
                </p>
                <Link
                  href="/admin/disputes"
                  className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                >
                  اذهب إلى النزاعات
                </Link>
              </DetailCard>
            ) : (
              <DetailCard title="القرار">
                <Field label="القرار" value={dispute.resolution ?? '—'} ltr />
                {dispute.resolutionAmount === null ? null : (
                  <Field
                    label="المبلغ"
                    value={<Money amount={Number(dispute.resolutionAmount)} />}
                    strong
                  />
                )}
                <Field label="حُسم" value={riyadh.format(new Date(dispute.resolvedAt))} />
              </DetailCard>
            )}

            <DetailCard title="الطلب">
              <Field label="المرجع" value={dispute.order.ref} ltr />
              <Field
                label="المرحلة"
                value={STAGE_LABEL[dispute.order.stage] ?? dispute.order.stage}
              />
              <Field
                label="السعر المتّفق"
                value={<Money amount={Number(dispute.order.agreedPrice)} />}
              />
              <Field label="المشتري" value={dispute.order.buyerName} />
              <Field label="البائع" value={dispute.order.sellerName} />
              <Link
                href={`/admin/orders/${encodeURIComponent(dispute.order.ref)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح الطلب
              </Link>
            </DetailCard>
          </>
        }
      />
    </AdminShell>
  );
}
