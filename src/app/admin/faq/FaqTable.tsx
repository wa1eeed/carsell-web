'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { FaqRow } from '@/lib/domain/admin-content';

/**
 * ═══ A33 — الأسئلة الشائعة ═══
 *
 * بنكٌ واحد ومواضع حسب طريقة البيع — والمحتوى مزروعٌ منذ البداية
 * **ولا شاشة تديره**. فسؤالٌ يُكتشف نقصُه أو خطؤه يبقى معروضًا حتى
 * نشرةٍ قادمة.
 *
 * ═══ والإخفاء يكفي اليوم ═══
 *
 * التحرير الكامل شاشةٌ أكبر (نصّان ومحرّر مواضع بشروطها). وسحبُ سؤالٍ
 * خاطئ فورًا هو ما يُحتاج في اللحظة — والتحرير يليه.
 */

const SURFACE_LABEL: Record<string, string> = {
  listing_page: 'صفحة السيارة',
  help_center: 'المساعدة',
  checkout: 'الدفع',
};

const TYPE_LABEL: Record<string, string> = {
  DIRECT: 'مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
};

const CATEGORY_LABEL: Record<string, string> = {
  buying: 'الشراء',
  selling: 'البيع',
  auction: 'المزاد',
  escrow: 'الضمان',
  services: 'الخدمات',
};

export function FaqTable({ rows }: { rows: readonly FaqRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (row: FaqRow): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/faq/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر الحفظ.');
        return;
      }

      setToast(row.active ? 'أُخفي السؤال من المنتج.' : 'عاد السؤال إلى الظهور.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-bold">{row.questionAr}</span>
              <span className="flex flex-wrap items-center gap-2 text-3xs opacity-55">
                <span>{CATEGORY_LABEL[row.category] ?? row.category}</span>
                <span aria-hidden className="opacity-40">·</span>
                <span>
                  {row.surfaces.length === 0
                    ? 'بلا موضع — لا يظهر لأحد'
                    : row.surfaces.map((s) => SURFACE_LABEL[s] ?? s).join(' · ')}
                </span>
                {row.listingTypes.length === 0 ? null : (
                  <>
                    <span aria-hidden className="opacity-40">·</span>
                    <span>{row.listingTypes.map((t) => TYPE_LABEL[t] ?? t).join(' · ')}</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/*
                **الترجمة الناقصة تُعرض ولا تُخفى**: سؤالٌ بلا إنجليزية
                يظهر بالعربية للزائر الإنجليزيّ — عطلٌ لا يراه إلا من
                يقرأ بالإنجليزية، أي ليس نحن.
              */}
              {row.missingEn ? <Badge tone="warn">بلا إنجليزية</Badge> : null}

              <span className="font-num text-3xs opacity-45">
                {toArabicDigits(String(row.sort))}
              </span>

              <Badge tone={row.active ? 'accent' : 'neutral'}>
                {row.active ? 'يظهر' : 'مخفيّ'}
              </Badge>

              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                {row.active ? 'أخفِه' : 'أظهِره'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
