'use client';

import { cn } from '@/lib/cn';

/**
 * ═══ قطعُ لوحة إعدادات البيع — Wh3 وWh3b ═══
 *
 * **وُلدت من عطل**: من اختار «مزاد» في المعالج نشر إعلانًا نوعُه
 * `AUCTION` بلا صفّ `Auction` — ولا شيء في المنتج كلّه يُنشئه إلّا
 * البذرة. فصفحة المزاد ٤٠٤، وصفحة المركبة تعرض «اشترِ الآن» تحت وسم
 * «مزاد».
 *
 * ═══ وفي ملفّها لا في المعالج ═══
 *
 * المعالج تدفّقٌ من ثلاث خطوات، وهذه لوحةٌ بأربعة أقسام — وخلطُهما
 * يجعل ملفًّا لا يُراجَع. **والقطعة في ملفّها تُعرض في `/dev/ui` إلى
 * جانب بطاقة التصميم**، وهو ما لا يُفعل بجزءٍ مخبوء داخل خطوة.
 */

/** يحذف الكسور الصفرية من مبلغٍ مُنسَّق: «٥٠٠٠٫٠٠» ← «٥٠٠٠». */
export function trimZeros(amount: string): string {
  return amount.replace(/\.00$/, '');
}

/**
 * ═══ كتلةُ إعدادات — والفصل بالخطوط لا بالظلال ═══
 *
 * التصميم يقسم خطوة المزاد أقسامًا معنونة، وكلُّ قسمٍ صندوقٌ مستقلّ
 * يفصله خطّ. والحاوية `gap-px` على خلفية الخطّ: فاصلٌ بعرض بكسل بلا
 * حدودٍ مزدوجة بين كتلتين متجاورتين.
 */
export function SettingsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface p-5.5">
      <h3 className="mb-4 text-base font-bold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** قيمةٌ تُقال ولا تُسأل — شرطُ المنصّة أو رقمٌ كُتب في خطوةٍ سابقة. */
export function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-60">{label}</span>
      <span className="bidi-isolate font-num text-sm font-bold">{value}</span>
      {hint === undefined ? null : (
        <span className="text-3xs leading-loose opacity-45">{hint}</span>
      )}
    </div>
  );
}

/** شرحٌ يمتدّ على عرض الكتلة — فالقاعدة تُقرأ قبل الحقل لا بعده. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-line bg-bg px-4 py-3 text-3xs leading-loose opacity-65 sm:col-span-2">
      {children}
    </p>
  );
}

/** اختيارٌ من شرائح — وواحدةٌ منها مختارة دائمًا، فلا حالة فراغ. */
export function Choice({
  options,
  active,
  onSelect,
}: {
  options: readonly { key: string; label: React.ReactNode }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 sm:col-span-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === active}
          onClick={() => onSelect(option.key)}
          className={cn(
            'rounded-btn border px-4 py-2 text-2xs font-bold',
            option.key === active
              ? 'border-ink bg-ink text-bg'
              : 'border-line hover:border-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** مفتاحٌ يكشف حقلًا — والشرح تحته لأنه يصف ما سيقع لا ما وقع. */
export function Toggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-start sm:col-span-2',
        on ? 'border-ink' : 'border-line hover:border-ink',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
          on ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-bg transition-transform',
            on ? '-translate-x-4 rtl:translate-x-4' : '',
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xs font-bold">{label}</span>
        <span className="mt-1 block text-3xs leading-loose opacity-55">{hint}</span>
      </span>
    </button>
  );
}

/**
 * حقل مبلغ — **يقبل كل صيغة لصق ويطبّعها**، و`dir="ltr"` لأنه يُقارن
 * خانةً بخانة. والتلميح تحته لا بجانبه: الشرطُ يُقرأ قبل الكتابة.
 */
export function PriceField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-60">{label}</span>
      <input
        dir="ltr"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-sm"
      />
      <span className="text-3xs leading-loose opacity-45">{hint}</span>
    </label>
  );
}
