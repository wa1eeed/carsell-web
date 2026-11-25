import { redirect } from 'next/navigation';
import { currentDealer } from '@/lib/auth/dealer-session';
import { dealerReports } from '@/lib/domain/dealer-reports';
import { DealerShell } from '@/components/dealer/DealerShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { ORDER_SOURCE_LABEL } from '@/lib/labels/admin';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'التقارير — المعرض', robots: { index: false, follow: false } };

/**
 * شريطٌ بنسبته.
 *
 * **ونسبةٌ دون الواحد لا تُقرَّب إلى صفر**: ثلاثَ عشرةَ مزايدةً من
 * ثمانية آلاف مشاهدة تُطبع «٠٪»، فيقرأ صاحبُها أنّ **لا أحد** تفاعل
 * — وهي الحالُ الطبيعية في قمعٍ عريض. وهو صنفُ «الشارة تُحسب من
 * الرقم المعروض لا من الدقيق» مقلوبًا: الرقمُ المعروض يكذب.
 */
function Bar({ part, whole }: { part: number; whole: number }) {
  const exact = whole === 0 ? 0 : (part / whole) * 100;
  const pct = Math.round(exact);
  const tiny = part > 0 && pct === 0;

  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="h-1.5 w-24 shrink-0 rounded-full bg-ink/10">
        <span
          className="block h-full rounded-full bg-accent-700"
          style={{ width: `${Math.max(exact, part > 0 ? 1 : 0)}%` }}
        />
      </span>
      <span className="text-3xs font-bold">
        {tiny ? (
          <>أقل من <ArabicNumber value={1} percent /></>
        ) : (
          <ArabicNumber value={pct} percent />
        )}
      </span>
    </span>
  );
}

/**
 * ═══ `D11` — التقارير ═══
 *
 * **ويُعرض ما يُقاس باسمه الصحيح.** الترميزُ يرسم «مصدر الطلب» بسطوحٍ
 * (نتائج البحث · صفحة المعرض · الرئيسية) **ولا إسنادَ لها في المنتج**،
 * والمخزَّن آليّةُ الطلب لا سطحُه. وقمعُ التحويل أربعُ مراحل لا خمس:
 * «المشاهدة» و«فتح التفاصيل» حدثٌ واحد عندنا، **ومرحلةٌ مخترَعة تُنتج
 * تسرّبًا وهميًّا** يُرسل صاحبَه يصلح ما ليس معطوبًا.
 */
export default async function DealerReports() {
  const actor = await currentDealer();
  if (actor === null) redirect('/dealer/enter');
  if (actor.role === 'SALES') redirect('/dealer');

  const { brands, sources, funnel } = await dealerReports(actor.dealerId, actor.branchId);
  const totalOrders = sources.reduce((sum, row) => sum + row.orders, 0);

  const steps = [
    { label: 'مشاهدة الإعلان', value: funnel.views },
    { label: 'عرض أو مزايدة', value: funnel.engaged },
    { label: 'طلب', value: funnel.orders },
    { label: 'صفقة مكتملة', value: funnel.completed },
  ];

  return (
    <DealerShell
      actor={actor}
      activeHref="/dealer/reports"
      title="التقارير"
      subtitle={actor.branchId === null ? 'كل الفروع' : 'فرعك'}
      actions={
        <LinkButton href="/api/v1/dealer/orders/export" variant="outline" size="sm">
          تصدير
        </LinkButton>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-4 text-3xs font-bold tracking-wide opacity-70">المبيعات حسب الماركة</h2>
          {brands.length === 0 ? (
            <p className="py-3 text-2xs opacity-70">لا صفقة مكتملة بعد — والجدول يملأ بأول بيع.</p>
          ) : (
            <ul>
              {brands.map((brand) => (
                <li
                  key={brand.brand}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-2 py-2.5 last:border-b-0"
                >
                  <span className="text-2xs font-semibold">{brand.brand}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-3xs opacity-70">
                      <Quantity unit="deals" count={brand.deals} />
                    </span>
                    <Money amount={brand.total} decimals={2} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-1 text-3xs font-bold tracking-wide opacity-70">آلية الطلب</h2>
          {/*
            **والعنوانُ يقول ما يُقاس.** كتابتُه «مصدر الطلب» تجعل
            القارئ يحسبه السطحَ الذي جاء منه الزائر، وهو ليس كذلك.
          */}
          <p className="mb-4 text-3xs leading-loose opacity-70">
            كيف أنشئ الطلب — لا من أي صفحة وصل المشتري. وإسناد الصفحات لم يبن بعد.
          </p>
          {sources.length === 0 ? (
            <p className="py-3 text-2xs opacity-70">لا طلبات بعد.</p>
          ) : (
            <ul>
              {sources.map((row) => (
                <li
                  key={row.source}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 py-2.5 last:border-b-0"
                >
                  <span className="text-2xs font-semibold">
                    {ORDER_SOURCE_LABEL[row.source] ?? row.source}
                  </span>
                  <Bar part={row.orders} whole={totalOrders} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-3xs font-bold tracking-wide opacity-70">قمع التحويل</h2>
        <p className="mb-4 text-3xs leading-loose opacity-70">
          أربع مراحل — والمشاهدة وفتح التفاصيل حدث واحد عندنا، فلا تفصلان.
        </p>
        {funnel.views === 0 ? (
          <EmptyState
            title="لا قياس بعد"
            description="يبدأ القمع بأول مشاهدة لإعلان من إعلاناتك."
          />
        ) : (
          <ul>
            {steps.map((step) => (
              <li
                key={step.label}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 py-2.5 last:border-b-0"
              >
                <span className="text-2xs font-semibold">{step.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-num text-2xs font-bold">
                    <ArabicNumber value={step.value} />
                  </span>
                  <Bar part={step.value} whole={funnel.views} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-5 rounded-xl border border-line bg-surface p-5 text-2xs leading-loose opacity-75">
        التقارير تحترم صلاحيات الدور: من له فرع يرى أرقام فرعه وحده. والتقرير الدوري
        بالبريد لم يبن بعد.
      </p>
    </DealerShell>
  );
}
