'use client';

import { useState } from 'react';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/cn';
import type { AdSlotRow } from '@/lib/domain/admin-plans';

/**
 * ═══ معاينةُ المساحة — A30 ═══
 *
 * الترميز يضع «معاينة في التطبيق» زرًّا في الترويسة. والمشغّل يبيع هذه
 * المساحات، **فيحتاج أن يُري المعلن ما اشتراه**: الإطار بمقاسه، وصورةُ
 * الحملة الجارية فيه، وموضعُه في الشاشة.
 *
 * وبلا الصورة تكون المعاينة إطارًا رماديًّا يقول «١٦:٦» — وهو ما يقوله
 * الجدول أصلًا.
 *
 * ═══ و«في التطبيق» تُقال «في الشاشة» ═══
 *
 * لا تطبيق بعد، والمساحاتُ تُصيَّر في الويب (والبوابة ٤٤ تحرس أنّ لكلّ
 * مساحةٍ مبيعة موضعًا ينادي مفتاحَها). فالمعاينةُ معاينةُ ما يُعرض
 * فعلًا، والانحرافُ مسجَّل في `DESIGN-DEVIATIONS.md`.
 *
 * ═══ ولا تُبذَر الحالةُ من القائمة (البوابة ٤٧) ═══
 */
export function SlotPreview({ slots }: { slots: readonly AdSlotRow[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const shown = slots.find((row) => row.key === picked) ?? slots[0] ?? null;

  if (shown === null) return null;

  return (
    <section className="mb-5 grid gap-5 rounded-lg border border-line bg-surface p-5.5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <h2 className="mb-3 text-3xs font-bold tracking-[0.16em] opacity-65">معاينة المساحة</h2>
        <ul className="max-h-64 overflow-y-auto border-y border-line">
          {slots.map((row) => {
            const on = row.key === shown.key;
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
                  <span className="min-w-0 flex-1 truncate">{row.nameAr}</span>
                  <span className="shrink-0 text-3xs opacity-70">{row.sizeLabel}</span>
                  {row.active ? null : <span className="shrink-0 text-3xs opacity-70">معطلة</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-2.5 text-3xs opacity-70">{shown.placement}</p>
        {/*
          **والإطار بنسبة المساحة لا بمقاسٍ ثابت.** مساحةٌ ١٦:٦ تُعرض
          مربّعةً تكذب على من يشتريها، وهو ما وُضعت المعاينة لمنعه.
        */}
        <div
          className="overflow-hidden rounded-md border border-line bg-bg"
          style={{ aspectRatio: `${String(shown.width)} / ${String(shown.height)}` }}
        >
          {shown.creativeUrl === null ? (
            <p className="flex h-full items-center justify-center p-4 text-center text-3xs opacity-70">
              شاغرة — ولا حملة جارية عليها
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- صورةُ معلنٍ بمقاسها، ولا تُحسَّن
            <img
              src={shown.creativeUrl}
              alt={`إعلان ${shown.nameAr}`}
              className="size-full object-cover"
            />
          )}
        </div>
        <p className="mt-2.5 flex items-baseline justify-between gap-3 text-3xs">
          <span className="opacity-70">{shown.sizeLabel}</span>
          <Money amount={shown.basePrice} size="sm" />
        </p>
      </div>
    </section>
  );
}
