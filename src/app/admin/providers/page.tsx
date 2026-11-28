import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ListFooter } from '@/components/admin/ListFooter';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { MonitorTabs, type MonitorTab } from '@/components/admin/MonitorShell';
import { PROVIDER_TYPE_LABEL, PROVIDER_TYPES } from '@/lib/labels/providers';
import { breachedRequests, providerList, providerStats } from '@/lib/domain/admin-providers';
import { coverageGaps } from '@/lib/domain/assignment';
import { ProviderTable } from './ProviderTable';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Duration } from '@/components/ui/Duration';
import { Quantity } from '@/components/ui/Quantity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مزودو الخدمات والتمويل' };

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
/**
 * ═══ شرائح A28 — من التعداد نفسِه لا من نسخةٍ له ═══
 *
 * كان التعليقُ يقول «من التعداد لا مكتوبةً بيد» **والقائمةُ مكتوبةٌ
 * بيد** — فسقط منها `TRANSFER`: مزوّدو نقل الملكية بلا شريحةٍ تفتحهم،
 * وعددُ «الكل» يشملهم ولا تبلغهم شريحة. وهو صنفُ «قائمةٌ تحاكي تعدادًا
 * تُشتقّ منه لا تُكتب بجواره» المسجَّل في هذا المستودع — **وتعليقٌ
 * يكذب أسوأ من غيابه**.
 */
const TYPES = PROVIDER_TYPES;

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'services.manage')) redirect('/admin');

  const [all, stats, breached, coverage] = await Promise.all([
    providerList(),
    providerStats(),
    breachedRequests(),
    coverageGaps(),
  ]);

  /**
   * **والمعروضُ ما ينقص وحده.** شبكةُ (صنف × مدينة) كاملةً مئاتُ
   * الصفوف يقرؤها المشغّل ولا يتصرّف — والنقصُ هو ما يُتصرَّف فيه.
   */
  const gaps = coverage.filter((cell) => cell.eligible === 0);

  const search = await searchParams;
  const raw = typeof search.type === 'string' ? search.type : null;
  const active = (TYPES as readonly string[]).includes(raw ?? '') ? raw : null;

  const rows = active === null ? all : all.filter((row) => row.type === active);

  const tabs: MonitorTab[] = [
    { key: null, label: 'الكل', count: all.length },
    ...TYPES.map((type) => ({
      key: type,
      label: PROVIDER_TYPE_LABEL[type] ?? type,
      count: all.filter((row) => row.type === type).length,
    })),
  ];

  const writable = canWrite(admin.role, 'services.manage');

  return (
    <AdminShell title="مزودو الخدمات والتمويل"
      subtitle="المزودون والتزامهم" activeHref="/admin/providers" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-70">
        <Quantity unit="providers" count={rows.length} /> ·{' '}
        <Quantity unit="linkedServices" count={stats.servicesLinked} />
      </p>

      <MonitorTabs tabs={tabs} active={active} basePath="/admin/providers" param="type" />

      <MonitorCards
        cards={[
          {
            title: 'مزودون نشطون',
            value: stats.active,
            note: <>يغطون <Quantity unit="cities" count={stats.cities} /></>,
          },
          { title: 'طلبات مسندة', value: stats.assignedThisMonth, note: 'هذا الشهر' },
          {
            title: 'تجاوز الالتزام',
            value: stats.breached,
            note:
              stats.breached === 0 ? (
                'لا تأخر قائم'
              ) : (
                <>
                  حد الإسقاط <Quantity unit="breaches" count={stats.breachesBeforeSuspension} />
                </>
              ),
          },
          { title: 'خدمات مرتبطة', value: stats.servicesLinked, note: 'تصلها إسنادات' },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">المزودون</h2>
      <ProviderTable rows={rows} canEdit={writable} />

      {/*
        ═══ من يغطي ماذا وأين — ومجموعةُ الإسناد تُشتقّ ولا تُخزَّن ═══

        سأل المالك ٢٠٢٦-١١-٢٨: «كيف يُحدَّد أيُّ المزوّدين وفي أيّ
        مدينة؟». والجوابُ **(صنفٌ × مدينة)**: من يغطّي هذه المدينة بهذا
        الصنف. وجدولٌ يُخزّن ذلك نسخةٌ ثانيةٌ من تغطية المزوّد تتباعد
        أوّلَ تعديل — فيُحسب من `cities` عند السؤال.

        **والمعروضُ ما لا أحدَ فيه**: خليّةٌ بلا مزوّدٍ أهلٍ تعني أنّ كلّ
        طلبٍ يصلها يبقى معلّقًا حتى تنقضي مهلتُه. والمشغّلُ كان يراها
        طلبًا طلبًا ولا يرى النمط.
      */}
      <h2 className="mt-10 mb-1 text-sm font-bold">التغطية — ومن ينقصه مزود</h2>
      <p className="mb-3.5 max-w-xl text-3xs leading-loose opacity-70">
        لكل نوع خدمة في كل مدينة: كم مزودا يغطيها، وكم منهم يقبل الإسناد الآن. والمزود
        بلا مدن محددة يغطي كل المدن.
      </p>
      {gaps.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-70">
          لا نقص — كل مدينة لها مزود يقبل الإسناد في كل نوع خدمة.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-3xl border-collapse text-start text-2xs">
            <thead>
              <tr className="border-b border-line bg-surface text-3xs opacity-70">
                <th scope="col" className="px-4 py-2.5 text-start font-bold">نوع الخدمة</th>
                <th scope="col" className="px-4 py-2.5 text-start font-bold">المدينة</th>
                <th scope="col" className="px-4 py-2.5 text-start font-bold">يغطيها</th>
                <th scope="col" className="px-4 py-2.5 text-start font-bold">يقبل الإسناد</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((cell) => (
                <tr key={`${cell.type}-${cell.city}`} className="border-b border-line-2 last:border-b-0">
                  <td className="px-4 py-2.5 font-semibold">
                    {PROVIDER_TYPE_LABEL[cell.type] ?? cell.type}
                  </td>
                  <td className="px-4 py-2.5">{cell.city}</td>
                  <td className="px-4 py-2.5 font-num">
                    <ArabicNumber value={cell.providers} />
                  </td>
                  <td className="px-4 py-2.5">
                    {/*
                      **وصفرٌ هنا ليس رقمًا بل إنذار**: طلبٌ يصل هذه
                      الخلية لا يلتقطه أحد ولا يُسنَد إليه أحد.
                    */}
                    {cell.eligible === 0 ? (
                      <span className="font-bold text-danger">لا أحد</span>
                    ) : (
                      <span className="font-num">
                        <ArabicNumber value={cell.eligible} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        **التجاوز بأسمائه.** ومن يقرأ «٣ تجاوزات» ولا يرى أيّها لا
        يستطيع أن يلاحق شيئًا — فالرقم وحده لا يُتصرَّف فيه.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">طلبات تجاوزت الالتزام</h2>
      {breached.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-70">
          لا طلب متأخرا الآن. والتأخر يقاس من مهلة الطلب نفسها لا من راية.
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
                <span className="bidi-isolate truncate text-3xs opacity-70">
                  {row.serviceName} — {row.providerName}
                </span>
              </div>
              <span className="font-num shrink-0 text-2xs text-danger">
                تأخر <Duration hours={row.overdueHours} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
          {/*
            ═══ والقاعدة المعروضة هي التي تقع ═══

            كُتب هذا النصّ مرّتين كاذبًا: قال أوّلًا «يُسنَد آليًّا بأقلّ
            حِمل» ولا حِملَ يُحسب، ثمّ صُحّح إلى «مزوّد الكتالوج بلا مدينة»
            — **وقد صار يُختار بالمدينة** يوم بُني طابورُها
            (`cityPool`). فالنصّ يتبع القاعدة لا العكس، ويُعاد قياسه
            كلّما تغيّر مسارُ الطلب.
          */}
          <p className="mb-2 font-bold">كيف توزع الطلبات على المزودين</p>
          <p>
            الطلب المدفوع يعرض على <strong>كل مزودي صنفه في مدينة المركبة</strong>،
            ومن يقبله أولا يأخذه وحده. «المزود المرتبط بالخدمة» في الكتالوج مفضل
            لا حصري. <b>ولا اختيار بالحمل بعد:</b> من سبق أخذ.
            <br />
            ومزود بلا حساب دفع مفعل لا تصله الطلبات، فلو أداها لما وصله مستحقه.
            وتعطيل مزود يمنع الإسناد الجديد ولا يمس طلباته الجارية.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
          <p className="mb-2 font-bold">التجاوز والإسقاط</p>
          <p>
            تجاوز الالتزام <Quantity unit="breaches" count={stats.breachesBeforeSuspension} /> في شهر
            يسقط المزود من الإسناد الآلي حتى مراجعته —{' '}
            <b>العميل لا يتحمل تأخير مزود</b>.
          </p>
        </div>
      </div>
    
      <ListFooter
        shown={rows.length}
        total={null}
        note="المزودون وتغطيتهم والتزامهم"
        can="إضافة مزود وتعديل بياناته وربط خدماته به، وإيقافه عن الإسناد."
        cannot="حذف مزود له طلبات قائمة. تاريخ الطلب يشير إليه، وحذفه يترك طلبا بلا منفذ."
      />
    </AdminShell>
  );
}
