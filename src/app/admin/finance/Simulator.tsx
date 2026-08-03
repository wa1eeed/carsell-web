'use client';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Chip } from '@/components/ui/Chip';
import { Money } from '@/components/ui/Money';
import type { CommissionScenario } from '@/lib/domain/admin-finance';

/**
 * ═══ محاكي العمولة ═══ **تغيير بلا نشر** (ترميز A3).
 *
 * لا يكتب شيئًا ولا يستدعي مسارًا: السيناريوهات كلّها محسوبة على
 * الخادم ومُرسَلة معًا، والاختيار هنا عرضٌ لا طلب. والرقم الذي يقرّر
 * تفعيل عمولة على السوق كلّه يجب أن يُرى قبل أن يقع لا بعده.
 */
export function Simulator({
  scenarios,
  gmv,
}: {
  scenarios: readonly CommissionScenario[];
  gmv: string;
}) {
  const [chosen, setChosen] = useState(scenarios[0]?.pct ?? 0);
  const scenario = scenarios.find((entry) => entry.pct === chosen) ?? scenarios[0];

  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-5.5">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-bold">محاكي العمولة</h2>
        <span className="rounded-sm border border-line px-2 py-0.5 text-3xs opacity-60">
          تغيير بلا نشر
        </span>
        <span className="flex-1" />
        <span className="text-3xs opacity-45">
          على GMV الحالي <Money amount={gmv} />
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {scenarios.map((entry) => (
          <Chip key={entry.pct} active={entry.pct === chosen} onClick={() => setChosen(entry.pct)}>
            <span className="font-num">
              <ArabicNumber value={entry.pct} decimals={entry.pct % 1 === 0 ? 0 : 1} grouped={false} />٪
            </span>
          </Chip>
        ))}
      </div>

      {scenario === undefined ? null : (
        <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-3">
          <Figure label="إيراد العمولة" value={<Money amount={scenario.commissionRevenue} />} />
          <Figure label="الإيراد الكلي" value={<Money amount={scenario.totalRevenue} />} />
          <Figure
            label="نسبة الأخذ"
            value={
              <span className="font-num">
                <ArabicNumber value={scenario.takeRatePct} decimals={2} grouped={false} />٪
              </span>
            }
          />
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-3xs leading-relaxed opacity-50">
        هذه أرقام مشتقّة من حركة آخر ثلاثين يومًا — لا وعدٌ بما سيقع. وتفعيل العمولة
        فعليًّا يكون من «الباقات والعمولة»، ويُجرَّب على باقة واحدة أولًا.
      </p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-3xs font-bold tracking-[0.14em] opacity-45">{label}</p>
      <p className="mt-1.5 text-lg font-bold">{value}</p>
    </div>
  );
}
