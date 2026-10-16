import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Money } from '@/components/ui/Money';
import type { Kpi } from '@/lib/domain/admin-kpis';
import { KPI_META } from '@/lib/labels/kpis';
import { displayDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ بطاقة مؤشر — رقم ومعه ما يجعله قابلًا للتصرف ═══
 *
 * رقم وحده يُقرأ ولا يُفهم. والبطاقة تحمل أربعة:
 *
 *   · **الاختصار المتعارف عليه** (GMV · AOV · CVR) — وهو ما يُكتب في
 *     عرض المستثمر، فمن تعوّده هنا لا يحتاج ترجمة هناك.
 *   · **القيمة** بصيغتها: مال أو نسبة أو أيام أو عدد.
 *   · **المقارنة بالمدى السابق المساوي** — ورقم بلا سابقه لا يقول
 *     أصاعد هو أم هابط.
 *   · **شرح يُفتح** بما هو وكيف يُحسب وكيف يتحسن.
 *
 * ═══ والشرح بلا جافاسكربت ═══
 *
 * `group-hover` و`group-focus-within` تكفيان، فلا حالة تُدار ولا
 * مكوّن عميل. والأيقونة `tabIndex` فتُفتح بلوحة المفاتيح أيضًا — ومن
 * لا يستعمل فأرة يحتاج التعريف مثل غيره.
 */

function Value({ kpi }: { kpi: Kpi }) {
  const meta = KPI_META[kpi.key];

  /**
   * **و«لا نعرف» غير «صفر».** نسبة تكرار بلا مشترين أصلًا ليست صفرًا
   * — والصفر يُقرأ إنذارًا فيُتخذ عليه قرار.
   */
  if (kpi.unknown) return <span className="text-xl font-bold opacity-65">—</span>;

  if (meta.format === 'money') {
    return <Money amount={Math.round(kpi.value)} size="lg" showCurrency={false} />;
  }
  if (meta.format === 'percent') {
    return (
      <span className="font-num text-3xl font-bold">
        {displayDigits((kpi.value * 100).toFixed(1))}
        <span className="text-base opacity-65">٪</span>
      </span>
    );
  }
  if (meta.format === 'days') {
    return (
      <span className="flex items-baseline gap-1.5">
        <ArabicNumber value={Math.round(kpi.value)} className="text-3xl font-bold" />
        <span className="text-2xs opacity-65">يوم</span>
      </span>
    );
  }
  if (meta.format === 'decimal') {
    return <ArabicNumber value={kpi.value} decimals={1} className="text-3xl font-bold" />;
  }
  return <ArabicNumber value={kpi.value} className="text-3xl font-bold" />;
}

/**
 * الفرق عن المدى السابق — **نسبةً لا فرقًا خامًا**.
 *
 * «+٣» لا تقول شيئًا: ثلاثة من خمسة قفزة، وثلاثة من ثلاثمئة ضجيج.
 */
function Delta({ kpi }: { kpi: Kpi }) {
  const meta = KPI_META[kpi.key];
  if (kpi.previous === null || kpi.unknown) return null;
  if (kpi.previous === 0) {
    return kpi.value === 0 ? null : (
      <span className="text-3xs font-bold text-accent-700">جديد</span>
    );
  }

  const change = (kpi.value - kpi.previous) / Math.abs(kpi.previous);
  if (Math.abs(change) < 0.005) {
    return <span className="text-3xs opacity-65">بلا تغير</span>;
  }

  const up = change > 0;
  const good = up === meta.higherIsBetter;

  return (
    <span
      className={cn('text-3xs font-bold', good ? 'text-accent-700' : 'text-danger')}
      title="مقارنة بالمدى السابق المساوي"
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span> {displayDigits(Math.abs(change * 100).toFixed(0))}٪
    </span>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const meta = KPI_META[kpi.key];

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-line bg-surface p-4.5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-2xs opacity-70">{meta.name}</span>
          {meta.abbr === null ? null : (
            <span className="font-body-en text-3xs font-bold tracking-wide opacity-65">
              {meta.abbr}
            </span>
          )}
        </span>

        {/*
          أيقونة الشرح — تُفتح بالمرور وبالتركيز. و`tabIndex` لأن
          `<span>` لا يستقبل تركيزًا بنفسه، ومن لا يستعمل فأرة يحتاج
          التعريف مثل غيره.
        */}
        <span
          tabIndex={0}
          role="button"
          aria-label={`كيف يُحسب ${meta.name}`}
          className="flex size-5 shrink-0 cursor-help items-center justify-center rounded-full border border-line text-3xs font-bold opacity-65 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          ؟
        </span>

        <span className="pointer-events-none absolute top-11 z-30 hidden w-72 flex-col gap-2.5 rounded-lg border border-line bg-bg p-4 text-start shadow-2xl group-hover:flex group-focus-within:flex end-3">
          <Line title="ما هو" body={meta.what} />
          <Line title="كيف يُحسب" body={meta.how} />
          <Line title="كيف يتحسن" body={meta.improve} />
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2.5">
        <Value kpi={kpi} />
        <Delta kpi={kpi} />
      </div>
    </div>
  );
}

function Line({ title, body }: { title: string; body: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-3xs font-bold opacity-65">{title}</span>
      <span className="text-3xs leading-relaxed">{body}</span>
    </span>
  );
}
