import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { MonitorCards } from '@/components/admin/MonitorShell';
import { Badge } from '@/components/ui/Badge';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { entitlementList, overrideList, planList, planStats } from '@/lib/domain/admin-plans';
import { listCommissionRules } from '@/lib/domain/admin-commission';
import { toArabicDigits } from '@/lib/arabic';
import { CommissionSimulator } from './CommissionSimulator';
import { PlanTable } from './PlanTable';
import { ENTITLEMENT_LABEL, TYPE_LABEL, pctLabel } from './labels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الباقات والعمولة' };

/**
 * A29 — الباقات والعمولة.
 *
 * عنوان التصميم حرفيًّا: **«الباقة حزمة قيَم للخصائص، لا منطق»**. فما
 * تفعله الباقة ضبطُ قيمة خاصّيةٍ يقرؤها الكود، لا إضافةُ سلوكٍ جديد —
 * والكود يسأل عن **الخاصّية** لا عن الباقة.
 *
 * ═══ والعمولة تُعرض هنا وتُحرَّر في «المالية» ═══
 *
 * شاشتان تكتبان قاعدة مالٍ واحدة تتباعدان أوّل تغيير. فهنا المحاكاة
 * والعرض، والكتابة هناك حيث نصاب العضوين وسجلّ التغييرات.
 */
export default async function AdminPlansPage() {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const [plans, stats, overrides, commission, entitlements] = await Promise.all([
    planList(),
    planStats(),
    overrideList(),
    listCommissionRules(),
    entitlementList(),
  ]);

  const seller = commission.find((rule) => rule.side === 'SELLER');
  const writable = canWrite(admin.role, 'finance.view');
  const defaults = plans.filter((plan) => plan.key === 'free').length;

  return (
    <AdminShell title="الباقات والعمولة" activeHref="/admin/plans" admin={admin}>
      <p className="mb-7 max-w-xl text-sm leading-loose opacity-60">
        باقات ({toArabicDigits(String(stats.plans))}) ·{' '}
        {stats.paidPlans === 0 ? 'كلها مجانية اليوم' : `مدفوعة (${toArabicDigits(String(stats.paidPlans))})`}{' '}
        · العمولة{' '}
        {seller?.enabled !== true || Number(seller.pct) === 0
          ? 'صفر'
          : `${toArabicDigits(pctLabel(seller.pct))}٪`}
      </p>

      <MonitorCards
        cards={[
          {
            title: 'باقات',
            value: stats.plans,
            note: `افتراضية (${toArabicDigits(String(defaults))})`,
          },
          { title: 'خصائص', value: stats.entitlements, note: 'ثابتة في الكود' },
          { title: 'تجاوزات لعملاء', value: stats.overrides, note: 'بسبب مكتوب' },
          {
            // **العمولة تُعرض ولا تُحرَّر هنا** — تحريرها في «المالية».
            title: 'العمولة النافذة',
            value: `${toArabicDigits(pctLabel(seller?.enabled === true ? seller.pct : '0'))}٪`,
            note: seller?.enabled === true ? 'على كل الباقات' : 'معطّلة على البائع',
          },
        ]}
      />

      <h2 className="mb-3.5 text-sm font-bold">الباقات — حزمة قيَم للخصائص، لا منطق</h2>
      {/* القراءة للجميع، والتعديل لمن يملك الكتابة — وحارسُه في المسار أيضًا. */}
      <PlanTable plans={plans} entitlements={entitlements} canEdit={writable} />

      {/*
        **مصفوفة الخصائص تُعرض لأن الكود يسأل عنها.** ومن يريد أن يعرف
        لماذا لا يرى تاجرٌ زرّ الرفع الجماعي يقرؤها هنا لا في الشيفرة.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">الخصائص — مفاتيح ثابتة يعرفها الكود</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">المفتاح</th>
              <th className="p-3 text-start font-bold">النوع</th>
              {plans.map((plan) => (
                <th key={plan.id} className="p-3 text-center font-bold">
                  {plan.nameAr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entitlements.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0">
                <td className="p-3">
                  <span className="flex flex-col gap-0.5">
                    {/* المفتاح يُقارن خانةً بخانة — لاتينيّ معزول */}
                    <span dir="ltr" className="font-num text-start">
                      {row.key}
                    </span>
                    <span className="text-3xs opacity-45">
                      {ENTITLEMENT_LABEL[row.key] ?? row.key}
                    </span>
                  </span>
                </td>
                <td className="p-3 opacity-70">{TYPE_LABEL[row.type] ?? row.type}</td>
                {plans.map((plan) => {
                  const value = plan.entitlements.find((e) => e.key === row.key);
                  if (value === undefined) return <td key={plan.id} className="p-3 text-center opacity-15">—</td>;

                  if (row.type === 'bool') {
                    return (
                      <td key={plan.id} className="p-3 text-center">
                        {value.value === 'true' ? (
                          <span className="text-accent-700" title="متاح">●</span>
                        ) : (
                          <span className="opacity-15" title="غير متاح">—</span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={plan.id} className="font-num p-3 text-center">
                      {value.value === '-1'
                        ? 'بلا حد'
                        : row.type === 'percent'
                          ? `${toArabicDigits(pctLabel(value.value))}٪`
                          : toArabicDigits(value.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <CommissionSimulator
          defaultPct={seller?.pct ?? '0.00'}
          defaultFixed={seller?.fixedFee ?? '0.00'}
          defaultMin={seller?.minFee ?? null}
          defaultMax={seller?.maxFee ?? null}
        />
      </div>

      {/*
        **التجاوز يُعرض بسببه.** استثناءٌ مُنح لعميلٍ بلا سببٍ مكتوب
        يُقرأ بعد سنةٍ على أنه خطأ — أو أسوأ.
      */}
      <h2 className="mt-10 mb-3.5 text-sm font-bold">تجاوزات لعملاء</h2>
      {overrides.length === 0 ? (
        <p className="rounded-lg border border-line border-dashed p-6 text-2xs opacity-55">
          لا تجاوزات. وكل تجاوزٍ يُمنح يظهر هنا بسببه ومدّته.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {overrides.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 py-3.5 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="bidi-isolate truncate text-2xs font-bold">{row.subject}</span>
                <span className="text-3xs opacity-55">{row.reason}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-3xs">
                <span className="font-num opacity-70">
                  {ENTITLEMENT_LABEL[row.entitlementKey] ?? row.entitlementKey} = {row.value}
                </span>
                {row.expiresAt === null ? (
                  <Badge tone="warn">بلا انتهاء</Badge>
                ) : (
                  <span className="opacity-55">
                    ينتهي {new Date(row.expiresAt).toLocaleDateString('ar-SA-u-ca-gregory')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-70">
        <p className="mb-2 font-bold">قاعدتان لا تُخترقان</p>
        <p>
          الكود يسأل عن <b>الخاصّية</b> لا عن الباقة. والعمولة تُثبَّت لقطةً في الطلب وقت
          إنشائه — فتعديلها اليوم لا يمسّ طلبًا قائمًا. وسحب خاصّية من مستخدم قائم يمرّ
          بتجاوزٍ مؤقّت بسببه ومدّته، لا بقطعٍ فوريّ.
        </p>
      </div>
    </AdminShell>
  );
}
