'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { toArabicDigits } from '@/lib/arabic';
import type { AdSlotRow } from '@/lib/domain/admin-plans';

/**
 * ═══ A30 — مساحات الإعلانات وتسعيرها ═══
 *
 * **التعطيل يُخفي المساحة ولا يُلغي حملاتها.** فمعلنٌ دفع لأسبوعٍ لا
 * يفقد مالَه بتعطيلٍ إداريّ — والعدد المعروض بجانب كل مساحة يقول
 * لمن يعطّل كم حملةً جاريةً سيوقف.
 */

const PRICING_LABEL: Record<string, string> = {
  day: 'باليوم',
  week: 'بالأسبوع',
  month: 'بالشهر',
  cpm: 'بالألف ظهور',
  cpc: 'بالنقرة',
};

export function AdSlotTable({ rows }: { rows: readonly AdSlotRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (row: AdSlotRow): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/ad-slots/${row.key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast(row.active ? 'عُطّلت المساحة — وحملاتها باقية.' : 'فُعّلت المساحة.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">المساحة</th>
              <th className="p-3 text-start font-bold">المقاس</th>
              <th className="p-3 text-start font-bold">التسعير</th>
              <th className="p-3 text-start font-bold">السعر</th>
              <th className="p-3 text-start font-bold">الموضع</th>
              <th className="p-3 text-start font-bold">حملات</th>
              <th className="p-3 text-start font-bold">الحالة</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0">
                <td className="p-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-bold">{row.nameAr}</span>
                    {/* المفتاح يُقارن خانةً بخانة — لاتينيّ معزول */}
                    <span dir="ltr" className="font-num text-3xs opacity-45">
                      {row.key}
                    </span>
                  </span>
                </td>
                {/*
                  **المقاس كما يُقرأ**: «١٦:٦» نسبةٌ و«بطاقة سيارة» شكل،
                  و`width×height` وحدهما يعرضان نسبةً على أنها بكسلات.
                */}
                <td className="font-num p-3 opacity-70">
                  {row.sizeLabel === ''
                    ? `${toArabicDigits(String(row.width))}×${toArabicDigits(String(row.height))}`
                    : row.sizeLabel}
                </td>
                <td className="p-3 opacity-70">
                  {PRICING_LABEL[row.pricingModel] ?? row.pricingModel}
                </td>
                <td className="p-3">
                  {/* «٤٫٥٠» للنقرة و«٣٬٥٠٠» للأسبوع — الكسر يُعرض حين يوجد */}
                  <ArabicNumber
                    value={Number(row.basePrice)}
                    decimals={Number.isInteger(Number(row.basePrice)) ? 0 : 2}
                  />
                </td>
                <td className="p-3 opacity-70">
                  {row.placement === '' ? <span className="opacity-40">—</span> : row.placement}
                </td>
                <td className="p-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-num">{toArabicDigits(String(row.campaignCount))}</span>
                    {row.liveCampaigns === 0 ? null : (
                      <span className="text-3xs text-accent-700">
                        جارية ({toArabicDigits(String(row.liveCampaigns))})
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3">
                  <Badge tone={row.active ? 'accent' : 'neutral'}>
                    {row.active ? 'مفعّلة' : 'معطّلة'}
                  </Badge>
                </td>
                <td className="p-3 text-end">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                    {row.active ? 'عطّلها' : 'فعّلها'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
