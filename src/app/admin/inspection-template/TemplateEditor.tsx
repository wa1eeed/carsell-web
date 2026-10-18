'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';
import type { TemplateView } from '@/lib/domain/admin-inspection-template';

/**
 * ═══ محرّرُ قالب الفحص ═══
 *
 * **والحذفُ يُرفض بعدده لا بـ«لا يمكن»**: بندٌ أجاب عنه فاحصٌ يُمحى
 * جوابُه بالسلسلة، ومسودّةٌ جارية تصير ناقصةً بلا أن يعرف صاحبُها
 * لماذا. فالزرُّ يختفي حيث لا يصحّ، والسببُ مكتوبٌ بجواره.
 */
export function TemplateEditor({ template }: { template: TemplateView }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(template.categories[0]?.id ?? null);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ nameAr: '', isCritical: false });
  /** `null` تعني «لا استمارة مفتوحة» — ونصًّا فارغًا تعني مفتوحةً فارغة. */
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const send = (body: unknown, done: string): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/inspection-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { fields?: Record<string, string> } }
        | null;

      if (response === null || !response.ok) {
        const count = payload?.error?.fields?.count;
        setToast(
          count === undefined
            ? 'تعذّر الحفظ.'
            : `لا يُحذف بندٌ أُجيب عنه — أجوبةٌ قائمة (${displayDigits(count)})`,
        );
        return;
      }
      setToast(done);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-7 gap-y-2 rounded-lg border border-line bg-surface p-4 text-2xs">
        <span className="flex flex-col gap-0.5">
          <span className="opacity-70">الإصدار</span>
          <ArabicNumber value={template.version} className="text-base font-bold" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="opacity-70">البنود</span>
          <ArabicNumber value={template.totalItems} className="text-base font-bold" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="opacity-70">الحرجة</span>
          <ArabicNumber value={template.criticalItems} className="text-base font-bold" />
        </span>
        <span className="flex-1" />
        <p className="max-w-md text-3xs leading-loose opacity-70">
          كلُّ تغييرٍ يرفع الإصدار — وبه يُعرف أيُّ نصٍّ رآه الفاحص يوم ملأ تقريره.
          <b> والتقاريرُ الصادرة لا تتغيّر</b>: لقطتُها محفوظةٌ فيها.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {template.categories.map((category) => {
          const isOpen = open === category.id;
          return (
            <section key={category.id} className="rounded-lg border border-line">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : category.id)}
                  className="flex flex-1 items-center gap-3 text-start"
                >
                  <span className="text-sm font-bold">{category.nameAr}</span>
                  <ArabicNumber value={category.items.length} className="text-2xs opacity-70" />
                  <span aria-hidden className="text-2xs opacity-50">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/*
                  **واسمُ القسم يُحرَّر حيث يُقرأ.** كان الوزنُ وحده
                  قابلًا للتحرير، والاسمُ نصًّا — فتصحيحُ تسميةٍ يحتاج
                  نشرًا، وهو عينُ ما نُقل القالبُ إلى الجداول لأجله.
                */}
                <input
                  defaultValue={category.nameAr}
                  aria-label="اسم القسم"
                  onBlur={(event) => {
                    const nameAr = event.target.value.trim();
                    if (nameAr === '' || nameAr === category.nameAr) return;
                    send({ action: 'category', categoryId: category.id, nameAr }, 'حُفظ اسم القسم.');
                  }}
                  className="w-44 rounded-md border border-line bg-surface px-2.5 py-1.5 text-2xs"
                />

                <label className="flex items-center gap-2 text-3xs opacity-75">
                  الوزن
                  {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
                  <input
                    dir="ltr"
                    type="number"
                    min={1}
                    defaultValue={category.weight}
                    onBlur={(event) => {
                      const weight = Number(event.target.value);
                      if (weight === category.weight || weight < 1) return;
                      send(
                        { action: 'category', categoryId: category.id, weight },
                        'حُفظ الوزن.',
                      );
                    }}
                    className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-start font-num text-2xs"
                  />
                </label>

                {/*
                  **ولا يُحذف قسمٌ فيه بند.** حذفُه يمحو بنودَه بالسلسلة
                  ومعها كلُّ جوابٍ عنها في كل مسودّة — بلا رقمٍ يراه
                  المشغّل. فيُفرَّغ بندًا بندًا، وكلُّ بندٍ يُرفض حذفُه
                  إن أُجيب عنه. والزرُّ يغيب حيث لا يصحّ، وسببُه بجواره.
                */}
                {category.items.length > 0 ? (
                  <span className="text-3xs opacity-65">يُفرَّغ قبل حذفه</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      send({ action: 'removeCategory', categoryId: category.id }, 'حُذف القسم.')
                    }
                  >
                    احذف القسم
                  </Button>
                )}
              </div>

              {!isOpen ? null : (
                <div className="flex flex-col divide-y divide-line border-t border-line">
                  {category.items.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <input
                        defaultValue={item.nameAr}
                        onBlur={(event) => {
                          const nameAr = event.target.value.trim();
                          if (nameAr === '' || nameAr === item.nameAr) return;
                          send({ action: 'item', itemId: item.id, nameAr }, 'حُفظ البند.');
                        }}
                        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-2xs"
                      />
                      {item.unit === null ? null : (
                        <span className="text-3xs opacity-65">{item.unit}</span>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          send(
                            { action: 'item', itemId: item.id, isCritical: !item.isCritical },
                            item.isCritical ? 'لم يعد حرجًا.' : 'صار حرجًا.',
                          )
                        }
                        className={cn(
                          'rounded-btn border px-3 py-1.5 text-3xs font-bold',
                          item.isCritical
                            ? 'border-danger text-danger'
                            : 'border-line opacity-70 hover:opacity-100',
                        )}
                      >
                        حرج
                      </button>
                      {item.answers > 0 ? (
                        <Badge tone="neutral">
                          أُجيب <ArabicNumber value={item.answers} />
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          disabled={busy}
                          onClick={() => send({ action: 'remove', itemId: item.id }, 'حُذف البند.')}
                        >
                          حذف
                        </Button>
                      )}
                    </div>
                  ))}

                  <div className="px-4 py-3">
                    {adding === category.id ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <input
                          autoFocus
                          value={draft.nameAr}
                          onChange={(event) => setDraft({ ...draft, nameAr: event.target.value })}
                          placeholder="اسم البند"
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-2xs"
                        />
                        <Button
                          size="sm"
                          disabled={busy || draft.nameAr.trim() === ''}
                          onClick={() => {
                            send(
                              {
                                action: 'add',
                                categoryId: category.id,
                                nameAr: draft.nameAr.trim(),
                                isCritical: draft.isCritical,
                              },
                              'أُضيف البند.',
                            );
                            setDraft({ nameAr: '', isCritical: false });
                            setAdding(null);
                          }}
                        >
                          أضِفه
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                          إلغاء
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setAdding(category.id)}>
                        أضف بندًا
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {/* ═══ وقسمٌ جديد — والمفتاحُ يُولَّد في النطاق لا يكتبه مشغّل ═══ */}
        <section className="rounded-lg border border-dashed border-line p-4">
          {newCategory === null ? (
            <Button size="sm" variant="outline" onClick={() => setNewCategory('')}>
              أضف قسمًا
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                autoFocus
                value={newCategory}
                placeholder="اسم القسم — «الزجاج والمرايا»"
                onChange={(event) => setNewCategory(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-2xs"
              />
              <Button
                size="sm"
                disabled={busy || newCategory.trim() === ''}
                onClick={() => {
                  send({ action: 'addCategory', nameAr: newCategory.trim() }, 'أُضيف القسم.');
                  setNewCategory(null);
                }}
              >
                أضف
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewCategory(null)}>
                تراجع
              </Button>
            </div>
          )}
          <p className="mt-2.5 text-3xs leading-loose opacity-65">
            القسمُ يُضاف فارغًا ثم تُضاف بنودُه — ووزنُه الافتراضيّ واحد، يُعدَّل من رأسه.
          </p>
        </section>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
