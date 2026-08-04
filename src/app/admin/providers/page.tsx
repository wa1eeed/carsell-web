import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { breachedRequests, providerList, providerStats } from '@/lib/domain/admin-providers';
import { toArabicDigits } from '@/lib/arabic';
import { ProviderTable } from './ProviderTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مزوّدو الخدمات والتمويل' };

/**
 * A28 — مزوّدو الخدمات والتمويل.
 *
 * `ServiceProvider` مزروعٌ بكل ما تحتاجه الشاشة **ولا شاشة تقرؤه**:
 * فمزوّدٌ يتأخّر لا يُرى تأخّره، ومزوّدٌ يُراد إيقافه لا باب لإيقافه.
 *
 * ═══ والتجاوز يُقاس بأسمائه ═══
 *
 * «٣ طلبات تجاوزت الالتزام» رقمٌ لا يُتصرَّف فيه. فالطلبات المتجاوزة
 * معروضةٌ بمراجعها وساعات تأخّرها — ومن يقرؤها يعرف أيّها يلاحق.
 */
export default async function AdminProvidersPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const [rows, stats, breached] = await Promise.all([
    providerList(),
    providerStats(),
    breachedRequests(),
  ]);

  const writable = canWrite(admin.role, 'services.manage');

  return (
    <AdminShell title="مزوّدو الخدمات والتمويل" activeHref="/admin/providers" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        مزوّدون ({toArabicDigits(String(rows.length))}) · خدمات مرتبطة (
        {toArabicDigits(String(stats.servicesLinked))})
      </p>

      <MonitorCards
        cards={[
          {
            title: 'مزوّدون نشطون',
            value: stats.active,
            note: `يغطّون مدنًا (${toArabicDigits(String(stats.cities))})`,
          },
          { title: 'طلبات مُسنَدة', value: stats.assignedThisMonth, note: 'هذا الشهر' },
          {
            title: 'تجاوز الالتزام',
            value: stats.breached,
            note:
              stats.breached === 0
                ? 'لا تأخّر قائم'
                : `الإسقاط بعد تجاوزات (${toArabicDigits(String(stats.breachesBeforeSuspension))})`,
          },
          { title: 'خدمات مرتبطة', value: stats.servicesLinked, note: 'تصلها إسنادات' },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">المزوّدون</h2>
      <ProviderTable rows={rows} canEdit={writable} />

      {/*
        **التجاوز بأسمائه.** ومن يقرأ «٣ تجاوزات» ولا يرى أيّها لا
        يستطيع أن يلاحق شيئًا — فالرقم وحده لا يُتصرَّف فيه.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">طلبات تجاوزت الالتزام</h2>
      {breached.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-55">
          لا طلب متأخّرًا الآن. والتأخّر يُقاس من مهلة الطلب نفسها لا من راية.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {breached.map((row) => (
            <div
              key={row.ref}
              className="flex flex-col gap-2 py-3.5 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                {/* المرجع يُقارن خانةً بخانة — لاتينيّ معزول */}
                <span dir="ltr" className="font-num truncate text-2xs font-bold">
                  {row.ref}
                </span>
                <span className="bidi-isolate truncate text-3xs opacity-55">
                  {row.serviceName} — {row.providerName}
                </span>
              </div>
              <span className="font-num shrink-0 text-2xs text-danger">
                تأخّر ساعات ({toArabicDigits(String(row.overdueHours))})
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">قواعد الإسناد</p>
          <p>
            الطلب يُسنَد آليًّا للمزوّد المفعّل في مدينة العميل بأقلّ حِمل قائم.{' '}
            <b>وتعطيل مزوّد لا يمسّ طلباته الجارية</b> — يمنع الإسناد الجديد فقط.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
          <p className="mb-2 font-bold">التجاوز والإسقاط</p>
          <p>
            تجاوز الالتزام مرّات ({toArabicDigits(String(stats.breachesBeforeSuspension))}) في شهر
            يُسقط المزوّد من الإسناد الآليّ حتى مراجعته —{' '}
            <b>العميل لا يتحمّل تأخير مزوّد</b>.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
