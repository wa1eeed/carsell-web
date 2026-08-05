import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ صدفة شاشات التفاصيل ═══
 *
 * اثنتا عشرة قائمةً في اللوحة **بلا صفحة تفاصيل واحدة**: من رأى صفًّا
 * لا يستطيع أن يفتحه، فيعرف أن طلبًا متعثّر ولا يعرف لماذا.
 *
 * وكتابة التخطيط اثنتي عشرة مرّة تُنتج اثني عشر تخطيطًا تتباعد أوّل
 * تعديل — كما وقع في شاشات المراقبة قبلها. فالتخطيط هنا مرّةً واحدة:
 * **رجوعٌ ومرجعٌ وحالة**، ثم عمودان: المحتوى والجانب.
 */

export function DetailHeader({
  backHref,
  backLabel,
  /** المرجع — يُنسخ ويُقارن خانةً بخانة، فلاتينيّ معزول */
  reference,
  title,
  badges,
  actions,
}: {
  backHref: string;
  backLabel: string;
  reference: string;
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 text-2xs opacity-55 hover:opacity-100"
      >
        <span aria-hidden>→</span>
        {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span dir="ltr" className="font-num text-start text-xl font-bold">
            {reference}
          </span>
          <span className="bidi-isolate text-2xs opacity-60">{title}</span>
        </div>

        {badges === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2.5">{badges}</div>
        )}
        {actions === undefined ? null : <div className="flex items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

/** عمودان: المحتوى الواسع ثم الجانب — وينهاران إلى عمودٍ على الضيّق. */
export function DetailColumns({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6">{main}</div>
      <div className="flex min-w-0 flex-col gap-6">{side}</div>
    </div>
  );
}

export function DetailCard({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-5', className)}>
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="text-sm font-bold">{title}</h2>
        {note === undefined ? null : <span className="text-3xs opacity-45">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * سطرُ حقل — **والفصل بالخطوط لا بالظلال**.
 *
 * و`ltr` لما يُقارن خانةً بخانة: المرجع والآيبان والهاتف.
 */
export function Field({
  label,
  value,
  ltr,
  strong,
}: {
  label: string;
  value: ReactNode;
  ltr?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="shrink-0 text-2xs opacity-60">{label}</span>
      <span
        dir={ltr === true ? 'ltr' : undefined}
        className={cn(
          'min-w-0 truncate text-2xs',
          ltr === true ? 'font-num text-start' : 'bidi-isolate',
          strong === true ? 'font-bold' : 'font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * سطرُ زمن — للسجلّات.
 *
 * **والنقطة على الخطّ**: الفصل بالخطوط لا بالظلال، والنقطة تربط الحدث
 * بموضعه في الزمن.
 */
export function TimelineRow({
  title,
  note,
  at,
  tone,
}: {
  title: string;
  note?: string;
  at: string;
  tone?: 'accent' | 'warn' | 'danger';
}) {
  return (
    <div className="relative flex gap-3.5 pb-4 last:pb-0">
      {/* الخيط يمتدّ خلف النقاط ويقف عند آخرها */}
      <span
        className="absolute top-1.5 bottom-0 w-px bg-line ltr:left-[3px] rtl:right-[3px] last:hidden"
        aria-hidden
      />
      <span
        className={cn(
          'relative mt-1.5 size-1.75 shrink-0 rounded-full',
          tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-accent',
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-semibold">{title}</span>
        {note === undefined ? null : <span className="text-3xs opacity-55">{note}</span>}
      </div>
      <span className="font-num shrink-0 text-3xs opacity-45">{at}</span>
    </div>
  );
}
