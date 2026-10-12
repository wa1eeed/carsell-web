import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, DetailStats, Field } from '@/components/admin/DetailShell';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminDisputeDetail } from '@/lib/domain/admin-detail-readers';
import { disputeTimeline } from '@/lib/domain/admin-entity-timelines';
import { STAGE_LABEL } from '@/lib/labels/charts';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * حالاتُ النزاع بالعربية — **ومن التعداد لا من الذاكرة**: لا
 * `RESOLVED` فيه، بل بمن حُسم لصالحه.
 */
const DISPUTE_STATUS: Record<string, string> = {
  OPEN: 'مفتوح',
  INVESTIGATING: 'قيد التحقيق',
  RESOLVED_BUYER: 'حُسم للمشتري',
  RESOLVED_SELLER: 'حُسم للبائع',
  CLOSED: 'مُغلق',
};

/* **ومفتاحٌ لا وجود له يسقط إلى محايد**: كان `RESOLVED` هنا والتعداد لا يعرفه */
const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  OPEN: 'danger',
  INVESTIGATING: 'warn',
  RESOLVED_BUYER: 'accent',
  RESOLVED_SELLER: 'accent',
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  const { id } = await params;
  const dispute = await adminDisputeDetail(id);
  if (dispute === null) notFound();

  const search = await searchParams;
  /* **ويُجلَب خطُّ الزمن لتبويبته وحدها** — استعلامُه يمرّ على عدّة جداول */
  const timeline = search.tab === 'timeline';
  const events = timeline ? await disputeTimeline(dispute.id) : [];

  return (
    <AdminShell title="تفاصيل النزاع" activeHref="/admin/disputes" admin={admin}>
      <DetailHeader
        backHref="/admin/disputes"
        backLabel="النزاعات"
        reference={dispute.order.ref}
        title={`${dispute.reason} — فتحه ${dispute.openedByName}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[dispute.status] ?? 'neutral'}>
              {DISPUTE_STATUS[dispute.status] ?? dispute.status}
            </Badge>
            {/* المهلة والزمن معًا — ونزاعٌ فات موعدُه وهو مفتوح متجاوز */}
            {dispute.slaBreached ? <Badge tone="danger">تجاوز المهلة</Badge> : null}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'الحالة', value: DISPUTE_STATUS[dispute.status] ?? dispute.status },
          {
            label: 'مهلة الردّ',
            value: dispute.slaDueAt === null ? 'لا مهلة' : riyadh.format(new Date(dispute.slaDueAt)),
            ...(dispute.slaBreached ? { tone: 'danger' as const } : {}),
          },
          { label: 'الطلب', value: dispute.order.ref },
          { label: 'فُتح', value: riyadh.format(new Date(dispute.openedAt)) },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/disputes/${encodeURIComponent(dispute.id)}`}
        param="tab"
        active={timeline ? 'timeline' : null}
        tabs={[
          { key: null, label: 'نظرة عامة' },
          { key: 'timeline', label: 'خطّ الزمن' },
        ]}
      />

      {timeline ? null : (
      <DetailColumns
        main={
          <DetailCard
            title="الرسائل"
            note={`رسائل (${displayDigits(String(dispute.messages.length))})`}
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
      )}

      {!timeline ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">خطّ الزمن</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-55">
            الطلبُ الذي نشأ عنه، وفتحُ النزاع، ورسائلُه، وقرارُه، وأثر الفريق.
          </p>
          <Timeline events={events} />
        </section>
      )}
    </AdminShell>
  );
}
