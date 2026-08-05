import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { exportLog, exportStats } from '@/lib/domain/admin-reports-export';
import { REPORTS, REPORT_SCHEDULING_RUNS } from '@/lib/domain/report-catalog';
import { REPORT_CONTENT, REPORT_NAME, REPORT_SCHEDULE_LABEL } from '@/lib/labels/reports';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'التقارير والتصدير' };

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * A36 — التقارير والتصدير.
 *
 * **لا تُبنى التقارير من الشاشات.** كل تقرير استعلامٌ مسمّى على القراءة
 * بأعمدةٍ ثابتة — فما يُصدَّر لا يتغيّر بترتيبٍ في جدولٍ ولا بترشيحٍ
 * تركه أحدهم مفتوحًا، ويُقرأ بعد سنةٍ فيُعطي الشكل نفسه.
 *
 * ═══ ولا تُعرض إلا التقارير التي يفتحها دورُك ═══
 *
 * زرٌّ يُعرض ثم يردّ ٤٠٣ يجعل من ضغطه يظنّ أن النظام معطوب. والحارس
 * في المسار أيضًا — والشاشة ترشيحٌ لا حراسة.
 */
export default async function AdminExportsPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'dashboard.view')) redirect('/admin/login');

  const [stats, log] = await Promise.all([exportStats(), exportLog()]);

  const mine = REPORTS.filter((report) => can(admin.role, report.permission));
  const hidden = REPORTS.length - mine.length;

  return (
    <AdminShell title="التقارير والتصدير"
      subtitle="استعلامات مسمّاة على القراءة" activeHref="/admin/exports" admin={admin}>
      <p className="mb-5 max-w-xl text-sm leading-loose opacity-60">
        تقارير جاهزة ({toArabicDigits(String(stats.reports))}) — كلٌّ منها{' '}
        <b>استعلامٌ مسمّى على القراءة</b>، لا لقطةُ شاشة.
      </p>

      {/*
        **الجدولة معلَنة ولا تعمل.** وقولُ «أسبوعيًّا — الأحد» بلا وظيفةٍ
        تُولّده يجعل من يعتمد عليه ينتظر ملفًّا لن يصل.
      */}
      {REPORT_SCHEDULING_RUNS ? null : (
        <p className="mb-7 max-w-2xl rounded-lg border border-line border-dashed p-4 text-2xs leading-loose opacity-70">
          <b>التوليد المجدوَل لم يبدأ بعد.</b> عمود «الجدولة» يقول ما هو مقصود، والتنزيل
          اليوم عند الطلب من هنا — ولا يصل ملفٌّ إلى أحد من تلقاء نفسه.
        </p>
      )}

      <MonitorCards
        cards={[
          {
            title: 'تقارير جاهزة',
            value: stats.reports,
            note: `يفتحها دورك (${toArabicDigits(String(mine.length))})`,
          },
          { title: 'تصديرات هذا الشهر', value: stats.exportsThisMonth, note: 'المسجَّلة منها' },
          {
            title: 'تحتوي بيانات شخصية',
            value: stats.personalReports,
            note: 'تحتاج صلاحية · وتُقيَّد',
          },
          {
            title: 'حدّ الصفوف',
            value: stats.rowLimit,
            note: 'لكل تصدير',
          },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">التقارير</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">التقرير</th>
              <th className="p-3 text-start font-bold">المحتوى</th>
              <th className="p-3 text-start font-bold">الصيغة</th>
              <th className="p-3 text-start font-bold">الجدولة</th>
              <th className="p-3 text-start font-bold">يفتحه</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {mine.map((report) => (
              <tr key={report.key} className="border-b border-line last:border-0">
                <td className="p-3">
                  <span className="flex items-center gap-2.5">
                    <span className="font-bold">{REPORT_NAME[report.key]}</span>
                    {report.personal ? <Badge tone="warn">بيانات شخصية</Badge> : null}
                  </span>
                </td>
                <td className="p-3 opacity-70">{REPORT_CONTENT[report.key]}</td>
                <td className="font-num p-3 opacity-70">CSV</td>
                <td className="p-3 opacity-70">{REPORT_SCHEDULE_LABEL[report.schedule]}</td>
                <td className="font-num p-3 opacity-70">{report.permission}</td>
                <td className="p-3 text-end">
                  {/*
                    رابطٌ لا زرّ: التنزيل تصفّحٌ إلى ملف، وزرٌّ بـ`fetch`
                    يحمّل الملف في الذاكرة قبل حفظه بلا سبب.
                  */}
                  <a
                    href={`/api/v1/admin/exports/${report.key}`}
                    download
                    className="rounded-md border border-line px-3.5 py-1.5 text-2xs hover:border-ink"
                  >
                    نزّل
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hidden === 0 ? null : (
        <p className="mt-3 text-3xs opacity-50">
          وتقارير ({toArabicDigits(String(hidden))}) لا يفتحها دورك — فلا تُعرض.
        </p>
      )}

      {/*
        **سجلّ التصديرات من سجلّ التدقيق نفسه** — لا من جدولٍ ثانٍ
        يتباعد عنه أوّل تغيير.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">سجلّ التصديرات</h2>
      {log.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-55">
          لا تصدير مسجَّلًا. والتقارير المجمَّعة لا تُقيَّد — التقييد لما يحمل بيانات
          شخصية وحده.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {log.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 py-3">
              <span className="truncate text-2xs font-bold">
                {REPORT_NAME[row.reportKey as keyof typeof REPORT_NAME] ?? row.reportKey}
              </span>
              <span className="flex shrink-0 items-center gap-5 text-3xs opacity-60">
                <span className="font-num">صفوف ({toArabicDigits(String(row.rows))})</span>
                <span>{riyadh.format(new Date(row.at))}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">أي تصدير يحمل بيانات شخصية يُسجَّل</p>
          <p>
            اسم من صدّر ووقته وعدد الصفوف — في سجل التدقيق. <b>والملف يُنزَّل مباشرةً
            ولا يُرسَل بالبريد</b>، ولا يُخزَّن نسخةً على الخادم تنتظر من يجدها.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">لا تُبنى التقارير من الشاشات</p>
          <p>
            كل تقرير <b>استعلامٌ مسمّى على القراءة</b> بأعمدةٍ ثابتة، وحدّه صفٌّ
            ({toArabicDigits(String(stats.rowLimit))}) — فلا يُبطئ تقريرٌ ثقيل مزادًا
            جاريًا.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
