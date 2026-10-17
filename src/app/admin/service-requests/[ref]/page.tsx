import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, DetailStats, Field } from '@/components/admin/DetailShell';
import { AdminLink } from '@/components/admin/AdminLink';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { ReviewInspection } from './ReviewInspection';
import { CompletionRecord } from '@/components/ui/CompletionRecord';
import { COMPLETION_FORM_TITLE } from '@/lib/labels/completion';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminServiceRequestDetail } from '@/lib/domain/admin-detail-readers';
import { serviceRequestTimeline } from '@/lib/domain/admin-entity-timelines';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import {
  SERVICE_CATEGORY,
  SERVICE_PAYMENT_STATUS,
  SERVICE_REQUEST_STATUS,
} from '@/lib/labels/services';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ والمال يُعرض كما هو ═══
 *
 * `Money` تُقرّب افتراضًا، فكان الرأس يقول «المبلغ ٥١٨» وبطاقةُ المال
 * «المدفوع ٥١٧٫٥٠» — **رقمان لمالٍ واحد في شاشةٍ واحدة**. ومن يطابق
 * بالبوّابة يقرأ ٥١٧٬٥٠ فيبحث عن نصف ريالٍ لا وجود له.
 *
 * وشاشةُ أرباح البائع كانت مثلها: «جاهز للصرف ٤٨٣» فوق «صافي ما
 * استُحقّ ٤٨٢٫٦٣» — ورسومُ البوّابة ١٫٧٠٪ + ريال، فالهللات هي القاعدة
 * لا الشاذّ.
 */
const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  DONE: 'accent',
  IN_PROGRESS: 'warn',
  ASSIGNED: 'warn',
  NEW: 'neutral',
  FAILED: 'danger',
  REFUNDED: 'danger',
};

/** الالتزام نصًّا — والوحدة في التسمية لا بعد الرقم (البوابة ١٨). */
function sla(hours: number | null): string {
  if (hours === null) return 'بلا التزام';
  if (hours === 0) return 'فوريّ';
  if (hours < 72) return `ساعات (${displayDigits(String(hours))})`;
  return `أيّام (${displayDigits(String(Math.round(hours / 24)))})`;
}

/**
 * تفاصيل طلب الخدمة — المزوّد والالتزام والنتيجة.
 *
 * **والتأخّر يُقاس من المهلة والزمن والحالة معًا**: طلبٌ منتهٍ فات
 * موعدُه ليس متأخّرًا — لا أحد ينتظره.
 */
export default async function AdminServiceRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'serviceRequests.handle')) redirect('/admin');

  const { ref } = await params;
  const request = await adminServiceRequestDetail(decodeURIComponent(ref));
  if (request === null) notFound();

  const search = await searchParams;
  /* **ويُجلَب خطُّ الزمن لتبويبته وحدها** — استعلامُه يمرّ على عدّة جداول */
  const timeline = search.tab === 'timeline';
  const events = timeline ? await serviceRequestTimeline(request.ref) : [];

  return (
    <AdminShell title="تفاصيل طلب الخدمة" activeHref="/admin/service-requests" admin={admin}>
      <DetailHeader
        backHref="/admin/service-requests"
        backLabel="طلبات الخدمات"
        reference={request.ref}
        title={`${request.service.nameAr} — ${request.customer.name}`}
        badges={
          <>
            {/* **والحالُ يُقرأ لا يُهجّى** — «DONE» مفتاحٌ لا جملة. */}
            <Badge tone={STATUS_TONE[request.status] ?? 'neutral'}>
              {SERVICE_REQUEST_STATUS[request.status] ?? request.status}
            </Badge>
            {request.overdue ? <Badge tone="danger">تجاوز الالتزام</Badge> : null}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'المبلغ', value: <Money amount={Number(request.amount)} decimals={2} /> },
          { label: 'الحالة', value: SERVICE_REQUEST_STATUS[request.status] ?? request.status },
          { label: 'المهلة', value: request.dueAt === null ? 'لا مهلة' : riyadh.format(new Date(request.dueAt)), ...(request.overdue ? { tone: 'danger' as const } : {}) },
          { label: 'طُلبت', value: riyadh.format(new Date(request.createdAt)) },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/service-requests/${encodeURIComponent(request.ref)}`}
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
          <>
            <DetailCard title="الخدمة">
              <Field label="الاسم" value={request.service.nameAr} />
              <Field
                label="الفئة"
                value={SERVICE_CATEGORY[request.service.category] ?? request.service.category}
              />
              <Field label="السعر" value={<Money amount={Number(request.amount)} decimals={2} />} strong />
              {/*
                رسمنا الإداريّ سطرٌ ثانٍ مستقلّ — ودمجُه في السعر يُسقط
                وصف الصرف عن المبلغ كلّه فتُستحقّ الضريبة على كامله.
              */}
              <Field label="رسمنا الإداريّ" value={<Money amount={Number(request.adminFee)} decimals={2} />} />
            </DetailCard>

            {/*
              ═══ وإثبات الإنجاز يُراجَع ═══

              **وستّةُ أصناف كانت تُنهي بلا حقلٍ واحد**: ناقلٌ يضغط
              «أنهِ» فلا نعلم رقم البوليصة — فمن سُئل «أين شحنتي؟» لا
              يملك جوابًا. والحقولُ مخطّطٌ لكل صنف تكتبه لوحةُ المزوّد.
            */}
            {request.completion.length === 0 ? null : (
              <CompletionRecord
                title={
                  request.service.providerType === null
                    ? 'إثبات الإنجاز'
                    : (COMPLETION_FORM_TITLE[request.service.providerType] ?? 'إثبات الإنجاز')
                }
                rows={request.completion}
              />
            )}

            {/*
              ═══ حالُ المال — ولم يكن على الشاشة ═══

              طلبٌ دُفع ثمنُه وصدرت فاتورتُه، والمشغّل يرى «المبلغ ٥١٨»
              ولا يرى **أدُفع أم لا** ولا رقمَ الفاتورة التي خرجت باسم
              المنصّة. فمن سُئل «أين مالي؟» يُجاب من القاعدة لا من
              الشاشة.

              **و«محجوز» غيرُ «حُصِّل»**: الأوّل يُردّ بإلغاء والثاني
              وصلنا — والفرق يُسأل عنه أوّلَ نزاع.
            */}
            <DetailCard title="المال">
              {request.payment === null ? (
                <p className="text-2xs leading-loose opacity-70">
                  لم يُدفع بعد — ولا فاتورة قبل الدفع.
                </p>
              ) : (
                <>
                  <Field
                    label="حال الدفعة"
                    value={
                      SERVICE_PAYMENT_STATUS[request.payment.status] ?? request.payment.status
                    }
                    strong
                  />
                  <Field
                    label="المدفوع"
                    value={<Money amount={Number(request.payment.amount)} decimals={2} />}
                  />
                  {request.payment.returned === null ? null : (
                    <Field
                      label="المردود"
                      value={<Money amount={Number(request.payment.returned)} decimals={2} />}
                    />
                  )}
                </>
              )}
              {/*
                **والفاتورة رقمُها ما يُقتبَس** — ومن يسأل عنها يسأل
                برقمها لا بمرجع الطلب.
              */}
              <Field
                label="الفاتورة الضريبية"
                ltr
                value={request.invoiceNumber ?? '—'}
              />
            </DetailCard>

            {/*
              ═══ ومراجعةُ الفحص حيث يُقرأ الطلب ═══

              لا طابورَ ثانيًا ولا شاشةَ ثالثة: المراجعُ يفتح الطلبَ
              ليرى مالَه ومهلتَه ومزوّدَه، فمراجعةُ تقريره معها.
            */}
            {request.pendingInspection === null ? null : (
              <DetailCard title="تقريرُ فحصٍ ينتظر المراجعة">
                <ReviewInspection
                  draftId={request.pendingInspection.draftId}
                  score={request.pendingInspection.score}
                  grade={request.pendingInspection.grade}
                  flagged={request.pendingInspection.flagged}
                  willPublish={request.pendingInspection.willPublish}
                />
              </DetailCard>
            )}

            {request.inspectionScore === null && request.resultUrl === null ? null : (
              <DetailCard title="النتيجة">
                {request.inspectionScore === null ? null : (
                  <Field
                    label="درجة الفحص"
                    value={<ArabicNumber value={request.inspectionScore} />}
                    strong
                  />
                )}
                {request.resultUrl === null ? (
                  <p className="text-2xs opacity-70">لم يُرفع تقرير بعد.</p>
                ) : (
                  <Field label="التقرير" value={request.resultUrl} ltr />
                )}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            <DetailCard title="التوقيت">
              <Field label="قُدّم" value={riyadh.format(new Date(request.createdAt))} />
              {request.dueAt === null ? (
                <Field label="الموعد" value="بلا موعد" />
              ) : (
                <Field
                  label="الموعد"
                  value={
                    <span className={request.overdue ? 'text-danger' : undefined}>
                      {riyadh.format(new Date(request.dueAt))}
                    </span>
                  }
                  strong
                />
              )}
            </DetailCard>

            <DetailCard title="المزوّد">
              {request.provider === null ? (
                <p className="text-2xs opacity-70">
                  لم يُسنَد بعد — والإسناد آليّ لمزوّدٍ مفعّل في مدينة العميل بأقلّ حِمل.
                </p>
              ) : (
                <>
                  <Field label="الاسم" value={request.provider.nameAr} />
                  <Field label="الالتزام" value={sla(request.provider.slaHours)} />
                  <Link
                    href="/admin/providers"
                    className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
                  >
                    افتح المزوّدين
                  </Link>
                </>
              )}
            </DetailCard>

            <DetailCard title="العميل والإعلان">
              <Field
                label="العميل"
                value={<AdminLink href={`/admin/users/${encodeURIComponent(request.customer.id)}`}>{request.customer.name}</AdminLink>}
              />
              {request.listingRef === null ? null : (
                <Field
                  label="الإعلان"
                  value={<AdminLink href={`/admin/listings/${encodeURIComponent(request.listingRef)}`} ltr>{request.listingRef}</AdminLink>}
                  ltr
                />
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                <Link
                  href={`/admin/users/${request.customer.id}`}
                  className="text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
                >
                  افتح ملفّه
                </Link>
                {request.listingRef === null ? null : (
                  <Link
                    href={`/admin/listings/${encodeURIComponent(request.listingRef)}`}
                    className="text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
                  >
                    افتح الإعلان
                  </Link>
                )}
              </div>
            </DetailCard>
          </>
        }
      />
      )}

      {!timeline ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">خطّ الزمن</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-70">
            طلبُ الخدمة وإسنادُها وموعدُها ونتيجتُها، وأثر الفريق.
          </p>
          <Timeline events={events} />
        </section>
      )}
    </AdminShell>
  );
}
