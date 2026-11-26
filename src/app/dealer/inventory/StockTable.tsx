'use client';

import { LinkButton } from '@/components/ui/Button';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import type { StockRow } from '@/lib/domain/dealer-dashboard';
import { CostDrawer } from './CostDrawer';

const LISTING_AR: Record<string, string> = {
  PUBLISHED: 'معروضة',
  PENDING_REVIEW: 'قيد المراجعة',
  DRAFT: 'مسودة',
};

/**
 * **وعمودُ الكلفة يقول «لم تسجل» لا صفرًا.** صفرٌ يعني «اشتُريت بلا
 * ثمن»، والفرقُ بينهما هو الفرقُ بين هامشٍ يساوي السعرَ كلَّه وهامشٍ
 * لا يُحسب — وأحدُهما يُصلَح بإدخال رقم.
 */
export function StockTable({ rows, canEdit }: { rows: readonly StockRow[]; canEdit: boolean }) {
  const [open, setOpen] = useState<StockRow | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا مركبات في مخزونك"
        description="أضف مركبة ليبدأ حساب الكلفة والهامش وأيام البيع."
        action={<LinkButton href="/dealer/inventory/new" size="sm">أضف مركبة</LinkButton>}
      />
    );
  }

  const missing = rows.filter((row) => row.cost === null).length;

  return (
    <>
      {missing === 0 ? null : (
        /*
          **والنقصُ يُقال بعدده في رأس الجدول.** عمودٌ فيه «لم تسجل»
          موزّعٌ على مئتي صفّ لا يُرى، والهامشُ في لوحة القيادة يبقى
          ناقصًا بلا أن يعرف أحدٌ لماذا.
        */
        <p className="mb-4 rounded-lg border border-warn-200 bg-warn-100 p-3.5 text-2xs leading-loose text-warn-900">
          <Quantity unit="cars" count={missing} /> بلا كلفة شراء مسجلة — ولا تدخل حساب
          الهامش ولا ضريبة هامش الربح حتى تسجل.
        </p>
      )}

      <div className="no-scrollbar overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface text-3xs opacity-70">
              <th className="p-3 text-start font-bold">المركبة</th>
              <th className="p-3 text-start font-bold">اللوحة</th>
              <th className="p-3 text-start font-bold">الفرع</th>
              <th className="p-3 text-start font-bold">العرض</th>
              <th className="p-3 text-end font-bold">السعر</th>
              <th className="p-3 text-end font-bold">الكلفة</th>
              <th className="p-3 text-end font-bold">العمر</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.vehicleId} className="border-b border-line-2 last:border-b-0">
                <td className="p-3">
                  <span className="block font-bold">{row.title}</span>
                  <span className="block text-3xs opacity-65">
                    <ArabicNumber value={row.year} grouped={false} />
                  </span>
                </td>
                <td className="p-3">
                  {row.plate === null ? (
                    <span className="opacity-50">—</span>
                  ) : (
                    <span dir="ltr" className="font-num">{row.plate}</span>
                  )}
                </td>
                <td className="p-3">{row.branchName ?? <span className="opacity-50">—</span>}</td>
                <td className="p-3">
                  {row.listingStatus === null ? (
                    <span className="opacity-65">في المخزون فقط</span>
                  ) : (
                    <Badge tone={row.listingStatus === 'PUBLISHED' ? 'accent' : 'neutral'} size="sm">
                      {LISTING_AR[row.listingStatus] ?? row.listingStatus}
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-end">
                  {row.askPrice === null ? (
                    <span className="opacity-50">—</span>
                  ) : (
                    <Money amount={Number(row.askPrice)} showCurrency={false} size="sm" />
                  )}
                </td>
                <td className="p-3 text-end">
                  {row.cost === null ? (
                    <span className="text-warn-900">لم تسجل</span>
                  ) : (
                    <Money amount={Number(row.cost)} showCurrency={false} size="sm" />
                  )}
                </td>
                <td className="p-3 text-end">
                  {/*
                    **وصفرٌ في الزمن جملةٌ خاصّة.** `Quantity` تصوغ الصفرَ
                    نفيًا — «لا أيام» — وهي صحيحةٌ في العدّ وكاذبةٌ في
                    العمر: مركبةٌ دخلت اليوم عمرُها يومُها لا «لا شيء».
                    وكشفَته أوّلُ مركبةٍ تُضاف من اللوحة، إذ لم يكن في
                    المخزون صفٌّ عمرُه صفر. (القاعدةُ مكتوبةٌ في
                    `CLAUDE.md` عن «منذ» و«قبل»، وهذا موضعُها الثالث.)
                  */}
                  {row.ageDays === 0 ? 'اليوم' : <Quantity unit="days" count={row.ageDays} />}
                </td>
                <td className="p-3 text-end">
                  <button
                    type="button"
                    onClick={() => setOpen(row)}
                    className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-ink"
                  >
                    {canEdit ? 'الكلفة' : 'اعرض الكلفة'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open === null ? null : (
        <CostDrawer row={open} canEdit={canEdit} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
