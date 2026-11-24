'use client';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Quantity } from '@/components/ui/Quantity';
import { PushPreview } from '@/components/admin/PushPreview';
import { cn } from '@/lib/cn';
import type { PushTemplateFit } from '@/lib/domain/push-channels';

/**
 * ═══ قوالبُ الدفع — تُختار فتُعايَن ═══
 *
 * كانت المعاينة مثبَّتةً على `templates[0]`، **والترتيب يضع المتجاوز
 * أوّلًا ثمّ الأطول** — فالمشغّل يرى قالبًا واحدًا لا يختاره، ولا سبيل
 * له إلى معاينة القالب الذي يوشك أن يحرّره.
 *
 * **والقائمةُ كانت ثمانيةً من واحدٍ وخمسين** (`slice(0, 8)`) تحت عنوانٍ
 * يقول «قوالب الدفع مقيسة بالحد» — فثلاثةٌ وأربعون قالبًا لا تُرى،
 * والعنوانُ يَعِد بقياسٍ شاملٍ لا يعرضه. واقتطاعٌ بلا بابٍ يُخفي ما له
 * نتيجة: اليومَ لا متجاوزَ فيها، وأوّلُ قالبٍ يتجاوز يسبق إلى الصدر —
 * لكنّ من يحرّر قالبًا بعينه لا يجده.
 *
 * فالقائمة كاملةٌ بمحضرٍ يمرّر، وكلُّ صفٍّ يفتح معاينتَه.
 *
 * ═══ ولا تُبذَر الحالةُ من القائمة (البوابة ٤٧) ═══
 *
 * `useState(templates[0]?.key)` تتقادم: تتبدّل القائمة بالتحرير فيبقى
 * مفتاحٌ لا يطابق صفًّا. فالحالةُ `null` ابتداءً، **والقالبُ يُشتقّ**
 * — فإن زال المختار عاد إلى الأوّل من تلقائه.
 */
export function TemplatePicker({
  templates,
  titleLimit,
  bodyLimit,
}: {
  templates: readonly PushTemplateFit[];
  titleLimit: number;
  bodyLimit: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const shown = templates.find((row) => row.key === picked) ?? templates[0] ?? null;
  const over = templates.filter((row) => row.titleOver || row.bodyOver);

  return (
    <section className="mb-5 grid gap-5 rounded-lg border border-line bg-surface p-5.5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <h2 className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-65">معاينة على الجهاز</h2>
        <PushPreview template={shown} titleLimit={titleLimit} bodyLimit={bodyLimit} />
      </div>

      <div className="min-w-0">
        <h2 className="mb-3 flex flex-wrap items-center gap-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
          قوالب الدفع مقيسة بالحد
          {over.length === 0 ? null : (
            <Badge tone="warn">
              {/* **والعدد لا يحكم المعدود بيدٍ** — ستّ صيغ جمعٍ لا تُكتب نصًّا */}
              <Quantity unit="truncatedTemplates" count={over.length} />
            </Badge>
          )}
        </h2>

        {templates.length === 0 ? (
          <p className="text-2xs opacity-70">لا قوالب دفع مفعلة.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto border-y border-line">
            {templates.map((row) => {
              const on = row.key === shown?.key;
              return (
                <li key={row.key} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setPicked(row.key)}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 px-2 py-2.5 text-start text-2xs',
                      on ? 'bg-ink/6 font-bold' : 'hover:bg-ink/4',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.titleAr}</span>
                    <span dir="ltr" className="font-num shrink-0 opacity-70">
                      <ArabicNumber value={row.titleChars} grouped={false} />
                      <span className="opacity-65"> · </span>
                      <ArabicNumber value={row.bodyChars} grouped={false} />
                    </span>
                    {row.titleOver || row.bodyOver ? (
                      <Badge tone="warn">سيختصر</Badge>
                    ) : (
                      <span aria-hidden className="shrink-0 text-accent-700">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-2.5 text-3xs leading-loose opacity-65">
          {/* **والمقام يُقال** — «مقيسة بالحد» فوق ثمانيةٍ من واحدٍ وخمسين وعدٌ ناقص. */}
          <Quantity unit="pushTemplates" count={templates.length} /> — العنوان ثم المتن
          بالحروف، والحد <Quantity unit="characters" count={titleLimit} /> و
          <Quantity unit="characters" count={bodyLimit} />.
        </p>
      </div>
    </section>
  );
}
