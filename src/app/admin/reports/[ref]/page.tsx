import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { DetailCard, DetailColumns, DetailHeader, DetailStats, Field } from '@/components/admin/DetailShell';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { Timeline } from '@/components/admin/Timeline';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { adminReportDetail } from '@/lib/domain/admin-detail-readers';
import { reportTimeline } from '@/lib/domain/admin-entity-timelines';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/** والمفاتيح كما يكتبها `fileReport` — صغيرةً. */
const TARGET_LABEL: Record<string, string> = {
  listing: 'إعلان',
  user: 'مستخدم',
};

/**
 * تفاصيل البلاغ — نصُّه ومرفقاته وهدفه.
 *
 * ═══ والمعرّف الخام لا يُتصرَّف به ═══
 *
 * من يقرأ بلاغًا على `cm7f…` لا يعرف على ماذا بُلِّغ. فمرجعُ الهدف
 * يُقرأ ويُعرض، ويُربط إلى شاشته.
 */
export default async function AdminReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'reports.handle')) redirect('/admin');

  const { ref } = await params;
  const report = await adminReportDetail(decodeURIComponent(ref));
  if (report === null) notFound();

  const search = await searchParams;
  /* **ويُجلَب خطُّ الزمن لتبويبته وحدها** — استعلامُه يمرّ على عدّة جداول */
  const timeline = search.tab === 'timeline';
  const events = timeline ? await reportTimeline(report.ref) : [];

  const targetHref =
    report.targetType === 'listing' && report.targetRef !== null
      ? `/admin/listings/${encodeURIComponent(report.targetRef)}`
      : report.targetType === 'user'
        ? `/admin/users/${report.targetId}`
        : null;

  return (
    <AdminShell title="تفاصيل البلاغ" activeHref="/admin/reports" admin={admin}>
      <DetailHeader
        backHref="/admin/reports"
        backLabel="البلاغات"
        reference={report.ref}
        title={`${TARGET_LABEL[report.targetType] ?? report.targetType} — ${report.reason}`}
        badges={
          <Badge tone={report.status === 'open' ? 'warn' : 'neutral'}>{report.status}</Badge>
        }
      />

      <DetailStats
        items={[
          { label: 'الحالة', value: report.status },
          { label: 'الهدف', value: report.targetRef ?? report.targetId },
          { label: 'قدم', value: riyadh.format(new Date(report.createdAt)) },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/reports/${encodeURIComponent(report.ref)}`}
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
          <>
            <DetailCard title="نص البلاغ">
              {report.details === null || report.details === '' ? (
                <p className="text-2xs opacity-70">
                  بلا تفصيل — والمبلغ اختار سببا ولم يكتب شيئا.
                </p>
              ) : (
                <p className="text-2xs leading-loose">{report.details}</p>
              )}
            </DetailCard>

            {report.attachments.length === 0 ? null : (
              <DetailCard
                title="المرفقات"
                note={<Quantity unit="attachments" count={report.attachments.length} />}
              >
                {report.attachments.map((attachment) => (
                  // المفتاح يُقارن خانةً بخانة — لاتينيّ معزول
                  <Field key={attachment} label="ملف" value={attachment} ltr />
                ))}
              </DetailCard>
            )}
          </>
        }
        side={
          <>
            <DetailCard title="البلاغ">
              <Field label="المرجع" value={report.ref} ltr />
              <Field label="السبب" value={report.reason} ltr />
              <Field label="الحالة" value={report.status} ltr />
              <Field label="قدم" value={riyadh.format(new Date(report.createdAt))} />
            </DetailCard>

            <DetailCard title="الهدف">
              <Field
                label="النوع"
                value={TARGET_LABEL[report.targetType] ?? report.targetType}
              />
              {/* المرجع لا المعرّف — والمعرّف الخام لا يُتصرَّف به */}
              <Field label="المرجع" value={report.targetRef ?? report.targetId} ltr />
              {targetHref === null ? (
                <p className="mt-3 text-3xs opacity-65">
                  لا شاشة لهذا النوع بعد — والمعرف أعلاه.
                </p>
              ) : (
                <Link
                  href={targetHref}
                  className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
                >
                  افتح الهدف
                </Link>
              )}
            </DetailCard>

            <DetailCard title="المبلغ">
              <Field label="الاسم" value={report.reporter.name} />
              <Link
                href={`/admin/users/${report.reporter.id}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
              >
                افتح ملفه
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
            تقديم البلاغ وما فعله الفريق به.
          </p>
          <Timeline events={events} />
        </section>
      )}
    </AdminShell>
  );
}
