'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';
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

  /**
   * ═══ محرّر المواضع — وكان مؤجَّلًا ═══
   *
   * `FaqPlacement` **بلا كاتبٍ في المنتج**: يقرؤه ثلاثة مواضع ويزرعه
   * الزرع، فما زُرع هو كلُّ ما سيكون. ومديرُ المحتوى يكتب سؤالًا ولا
   * يستطيع وضعه — والصفّ يقول له «بلا موضع — لا يظهر لأحد» ولا يعطيه
   * بابًا.
   *
   * **والوضع استبدالٌ لا إضافة**: المُرسَل هو الحال النهائية، وإلّا
   * تكرّرت المواضع وظهر السؤال مرّتين في صفحةٍ واحدة.
   */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ surface: string; listingType: string | null }[]>([]);

  const openEditor = (row: FaqRow): void => {
    setEditing(row.id);
    setDraft(
      row.surfaces.map((surface) => ({
        surface,
        listingType: row.listingTypes.length === 1 ? (row.listingTypes[0] ?? null) : null,
      })),
    );
  };

  const savePlacements = (id: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/faq/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ placements: draft }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر حفظ المواضع.');
        return;
      }

      setEditing(null);
      setToast(draft.length === 0 ? 'سُحب السؤال من كل المواضع.' : 'حُفظت المواضع.');
      router.refresh();
    });
  };

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
          <div key={row.id}>
          <div
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
                {displayDigits(String(row.sort))}
              </span>

              <Badge tone={row.active ? 'accent' : 'neutral'}>
                {row.active ? 'يظهر' : 'مخفيّ'}
              </Badge>

              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                {row.active ? 'أخفِه' : 'أظهِره'}
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => (editing === row.id ? setEditing(null) : openEditor(row))}
              >
                المواضع
              </Button>
            </div>
          </div>

          {editing !== row.id ? null : (
            <div className="flex flex-col gap-3 bg-surface p-4">
              <p className="text-3xs leading-loose opacity-55">
                اختر أين يظهر هذا السؤال. <b>وما لا تختاره يُحذف</b> — فالمحفوظ هو
                الحال النهائية لا إضافةٌ على ما قبلها. والسؤال بلا موضعٍ لا يظهر لأحد.
              </p>

              <div className="flex flex-wrap gap-2">
                {Object.entries(SURFACE_LABEL).map(([surface, surfaceLabel]) => {
                  const on = draft.some((entry) => entry.surface === surface);
                  return (
                    <Button
                      key={surface}
                      size="sm"
                      variant={on ? 'primary' : 'outline'}
                      onClick={() =>
                        setDraft(
                          on
                            ? draft.filter((entry) => entry.surface !== surface)
                            : [...draft, { surface, listingType: null }],
                        )
                      }
                    >
                      {surfaceLabel}
                    </Button>
                  );
                })}
              </div>

              {/*
                **وحدُّ طريقة البيع لصفحة السيارة وحدها** — «المساعدة»
                و«الدفع» لا تعرفان نوع إعلان، فخيارٌ فيهما يُحفظ ولا
                يُقرأ.
              */}
              {draft.some((entry) => entry.surface === 'listing_page') ? (
                <label className="flex flex-wrap items-center gap-2.5 text-3xs">
                  <span className="opacity-55">في صفحة السيارة — لأيّ طريقة بيع؟</span>
                  <select
                    value={draft.find((e) => e.surface === 'listing_page')?.listingType ?? ''}
                    onChange={(event) =>
                      setDraft(
                        draft.map((entry) =>
                          entry.surface === 'listing_page'
                            ? { ...entry, listingType: event.target.value === '' ? null : event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="rounded-md border border-line bg-bg px-3 py-1.5 text-3xs"
                  >
                    <option value="">كلّها</option>
                    {Object.entries(TYPE_LABEL).map(([value, typeLabel]) => (
                      <option key={value} value={value}>{typeLabel}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="sm" disabled={pending} onClick={() => savePlacements(row.id)}>
                  احفظ المواضع
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
          </div>
        ))}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
