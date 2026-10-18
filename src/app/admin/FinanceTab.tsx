import type { AdminUser } from '@/generated/prisma/client';
import { SectionHead } from '@/components/admin/SectionHead';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { ShareBars } from '@/components/ui/ShareBars';
import { Sparkline } from '@/components/ui/Sparkline';
import { monthlyGmv } from '@/lib/domain/admin-charts';
import { monthTick } from '@/lib/labels/charts';
import { displayDigits } from '@/lib/arabic';
import { canWrite } from '@/lib/domain/permissions';
import {
  SIMULATED_PERCENTAGES,
  financeInputs,
  financeSummary,
  indicators,
  monthKey,
  simulateCommission,
} from '@/lib/domain/admin-finance';
import { ORDER_SOURCE_LABEL, REVENUE_STREAM_LABEL } from '@/lib/labels/admin';
import { FinanceInputs } from './finance/FinanceInputs';
import { Simulator } from './finance/Simulator';


/** اثنا عشر شهرًا — كالتصميم، ويكفي لرؤية موسم. */
const GMV_MONTHS = 12;

const RANGE_DAYS = 30;

/**
 * A3 — المالية.
 *
 * **GMV ليس إيرادًا.** الأوّل قيمة البضاعة التي مرّت، والثاني ما أخذته
 * المنصّة منها. وشاشةٌ تخلطهما تجعل شركةً تظنّ أنها تربح أربعة عشر
 * مليونًا وهي تربح أربعةً وثمانين ألفًا — فهما هنا بطاقتان لا واحدة،
 * وبينهما «نسبة الأخذ» تقول كم من ذاك صار هذا.
 */
export async function FinanceTab({ admin }: { admin: AdminUser }) {

  const now = new Date();
  const from = new Date(now.getTime() - RANGE_DAYS * 86_400_000);
  const month = monthKey(now);

  const [summary, figures, inputs, months] = await Promise.all([
    financeSummary(from, now),
    indicators(month),
    financeInputs(month),
    monthlyGmv(GMV_MONTHS),
  ]);

  const scenarios = simulateCommission(
    summary.gmv.total,
    summary.revenue.total,
    SIMULATED_PERCENTAGES,
  );

  return (
    <>
      <p className="mb-4 text-2xs opacity-70">
        حركة آخر <Quantity unit="days" count={RANGE_DAYS} /> · كل رقم محسوب من صفوفه وقت فتح الصفحة
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          title="قيمة المبيعات"
          subtitle="إجمالي ما بيع عبر المنصة — قبل أي خصم (GMV)"
          amount={summary.gmv.total}
        >
          {summary.gmv.bySource.map((line) => (
            <Line key={line.key} label={ORDER_SOURCE_LABEL[line.key] ?? line.key} amount={line.amount} />
          ))}
          {/*
            كان هنا «منها ضريبة مضمَّنة ١٥/١١٥ من الإجمالي» — وهو وعدٌ
            مُخلَف: الـGMV قيمةُ مركباتٍ مورّدها البائع، وبيعُ فردٍ لفرد
            خارج النطاق فلا ضريبة فيه أصلًا. فصار السطر يقول **ضريبتنا**
            وحدها، مجموعةً من `Order.vatAmount` لا محسوبةً من الإجمالي.
          */}
          <p className="mt-2.5 border-t border-line pt-2.5 text-3xs opacity-70">
            والضريبة على عمولتنا ورسومنا <Money amount={summary.gmv.vat} /> — العمولة والرسوم
            الإدارية بنسبة{' '}
            {/* النسبة تُقرأ يسارًا-يمينًا: بلا `dir` يظهر ١٥/١١٥ مقلوبًا ١١٥/١٥ */}
            <span className="bidi-isolate" dir="ltr">
              <ArabicNumber value={summary.vatPct} grouped={false} />
              <span aria-hidden>/</span>
              <ArabicNumber value={summary.vatPct + 100} grouped={false} />
            </span>
            . وقيمة المركبة والرسوم الحكومية ليست من وعائنا.
          </p>
        </Card>

        <Card
          title="صافي الإيراد"
          subtitle="ما أخذته المنصة"
          amount={summary.revenue.total}
        >
          {summary.revenue.byStream.length === 0 ? (
            <p className="text-2xs opacity-65">لا إيراد في هذا المدى.</p>
          ) : (
            summary.revenue.byStream.map((line) => (
              <Line
                key={line.key}
                label={line.serviceName ?? REVENUE_STREAM_LABEL[line.key] ?? line.key}
                amount={line.amount}
              />
            ))
          )}
        </Card>

        <Card title="نقد الضمان" subtitle="محتجز الآن" amount={summary.escrow.total}>
          <Line label="محتجز جار" amount={summary.escrow.held} />
          <Line label="عرابين محجوزة" amount={summary.escrow.deposits} />
          <Line label="مجمد بنزاع" amount={summary.escrow.frozen} />
          <p className="mt-2.5 border-t border-line pt-2.5 text-3xs opacity-70">
            المجمد بنزاع مطروح من المحتجز الجاري لا مجموع إليه — وإلا عد مرتين.
          </p>
        </Card>

        <Card
          title="الاشتراكات"
          subtitle="نشطة الآن"
          count={summary.subscriptions.total}
        >
          {summary.subscriptions.byPlan.map((plan) => (
            <p key={plan.key} className="flex items-baseline justify-between gap-3 text-2xs">
              <span className="opacity-65">{plan.label}</span>
              <ArabicNumber value={plan.count} />
            </p>
          ))}
        </Card>
      </div>

      {/*
        المؤشّرات على **الشهر التقويمي** لا على ثلاثين يومًا: مقامها
        رواتبُ ومصروفُ تسويق يُدخَلان بالشهر. وترك المدى مبهمًا يجعل
        رقمين على شاشة واحدة يُقرآن على نافذة واحدة وهما على نافذتين.
      */}
      <SectionHead
        title="قيمة المبيعات والإيراد"
        note={<><Quantity unit="monthsRange" count={GMV_MONTHS} /> · بالريال</>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/*
          **الخطّ للـGMV والأشرطة للإيراد**: خلطُهما على محورٍ واحد يجعل
          الإيراد خطًّا ملتصقًا بالصفر — أربعةٌ وثمانون ألفًا بجانب أربعة
          عشر مليونًا لا يُريان معًا.
        */}
        <Sparkline
          points={months.map((point) => ({
            label: monthTick(point.month, point.month.endsWith('-01')),
            value: Number(point.gmv),
          }))}
          height={158}
        />

        <ShareBars
          shares={summary.revenue.byStream.map((line) => ({
            label: line.serviceName ?? REVENUE_STREAM_LABEL[line.key] ?? line.key,
            value: Number(line.amount),
          }))}
          total={Number(summary.revenue.total)}
          decimals={2}
          baseNote={`مزيج الإيراد — القاعدة ${displayDigits(Number(summary.revenue.total).toLocaleString('en-US', { maximumFractionDigits: 0 }))} ريال في المدى`}
        />
      </div>

      <p className="mt-6 mb-3 flex items-baseline gap-2 text-2xs opacity-70">
        <span className="font-bold">مؤشرات تحسب من غيرها</span>
        <span aria-hidden className="opacity-40">·</span>
        <span>شهر {monthName(month)} كاملا — لا آخر ثلاثين يوما</span>
      </p>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Indicator
          title="تكلفة جلب العميل"
          value={<Money amount={figures.cac} />}
          note={
            figures.newCustomers === 0 ? (
              'لا عملاء جدد هذا الشهر — فلا تكلفة تقسم عليهم.'
            ) : (
              <>
                ما صرف على التسويق ÷ <Quantity unit="newCustomers" count={figures.newCustomers} />
              </>
            )
          }
        />
        <Indicator
          title="ما يدره العميل"
          value={<Money amount={figures.ltv} />}
          note={
            figures.payingCustomers === 0
              ? 'لا مشترين بعد.'
              : <>إيراد المنصة ÷ <Quantity unit="buyers" count={figures.payingCustomers} /></>
          }
        />
        <Indicator
          title="حصة المنصة"
          value={
            <span className="font-num">
              <ArabicNumber value={figures.takeRatePct} decimals={2} grouped={false} />٪
            </span>
          }
          note={<>من كل ريال مبيعات يبقى للمنصة هذا القدر.</>}
        />
        <Indicator
          title="ما يدره العميل مقابل تكلفته"
          value={
            figures.ltvOverCac === null ? (
              <span className="text-base opacity-70">لا تكلفة تسويق</span>
            ) : (
              <span className="font-num">
                <ArabicNumber value={figures.ltvOverCac} decimals={1} grouped={false} />×
              </span>
            )
          }
          note="الجيد 3× فأعلى — أقل منه يعني أننا ندفع لجلب العميل أكثر مما يعطينا."
        />
        <Indicator
          /* الوحدة في العنوان لا بعد الرقم: الكسر لا يُصرَّف جمعًا في العربية */
          title="كم شهرا حتى يغطي العميل تكلفته"
          value={
            figures.paybackMonths === null ? (
              <span className="text-base opacity-70">لا ربح شهري بعد</span>
            ) : (
              <ArabicNumber value={figures.paybackMonths} decimals={1} grouped={false} />
            )
          }
          note="حتى يعيد العميل ما كلف جلبه."
        />
        <Indicator
          title="النقد يكفي"
          value={
            figures.runwayMonths === null ? (
              <span className="text-base opacity-70">لا عجز</span>
            ) : (
              <Quantity unit="months" count={figures.runwayMonths} />
            )
          }
          note={
            figures.runwayMonths === null
              ? 'الإيراد يغطي المصروف — فلا مدة تنفد بعدها.'
              : <>العجز <Money amount={figures.netBurn} /> كل شهر.</>
          }
        />
      </section>

      <Simulator scenarios={scenarios} gmv={summary.gmv.total} />

      {/*
        **ولا محرّرَ عمولةٍ في لوحة متابعة.** كان هنا، وهذا التاب
        مؤشّراتٌ تُقرأ — والعمولة قاعدةٌ تُضبط مرّةً وتحكم ما بعدها،
        فموضعُها «الإعدادات ← الباقات والعمولة».
      */}

      <FinanceInputs
        month={month}
        monthLabel={monthName(month)}
        rows={inputs}
        canEdit={canWrite(admin.role, 'finance.view')}
      />
    </>
  );
}

/**
 * `2026-08` ⇒ «أغسطس ٢٠٢٦».
 *
 * المفتاح صيغة تخزين لا صيغة قراءة، وعرضُه كما هو يضع رقمين لاتينيين
 * وشرطةً وسط جملة عربية — يُقرأ رمزًا لا شهرًا.
 */
function monthName(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (index ?? 1) - 1, 1));
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function Card({
  title,
  subtitle,
  amount,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  amount?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="mt-2 text-2xl font-bold">
        {amount === undefined ? (
          <ArabicNumber value={count ?? 0} />
        ) : (
          <Money amount={amount} />
        )}
      </p>
      <p className="mb-3 text-3xs opacity-65">{subtitle}</p>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">{children}</div>
    </section>
  );
}

function Line({ label, amount }: { label: string; amount: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-2xs">
      <span className="truncate opacity-65">{label}</span>
      <Money amount={amount} />
    </p>
  );
}

function Indicator({
  title,
  value,
  note,
}: {
  title: string;
  value: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-3xs font-bold tracking-[0.14em] opacity-65">{title}</h2>
      <p className="mt-2 mb-1.5 text-xl font-bold">{value}</p>
      <p className="text-3xs leading-relaxed opacity-70">{note}</p>
    </section>
  );
}
