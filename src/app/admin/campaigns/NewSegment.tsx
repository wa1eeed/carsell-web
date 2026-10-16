'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import { SEGMENT_FIELD_LABEL } from '@/lib/labels/admin';

/**
 * ═══ تعريف شريحة ═══
 *
 * `saveSegment` مبنيّةٌ كاملة — تتحقّق من القواعد، وتمنع تكرار
 * المفتاح، وتكتب الأثر — **ولا مسارَ يبلغها ولا زرّ**. فشاشة الحملات
 * تعرض الشرائح ولا تستطيع إنشاء واحدة، **والحملة بلا شريحة لا تُرسَل**.
 *
 * خامسَ عشرَ وقوعٍ لـ«مبنيٌّ لا يبلغه أحد».
 *
 * ═══ والشرط يُنفى بزرٍّ لا بقلبه يدويًّا ═══
 *
 * «ليس لديه مفضلة» شرطٌ مشروع، وكتابتُه حقلًا ثانيًا تُضاعف القائمة.
 * فكلُّ شرطٍ له ثلاث حالات: لا يُشترط · يُشترط · يُشترط نفيُه.
 */

type Field = { key: string; kind: 'bool' | 'number' };
type State = 'off' | 'on' | 'not';

export function NewSegment({ fields }: { fields: readonly Field[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [states, setStates] = useState<Record<string, State>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const chosen = fields.filter((field) => (states[field.key] ?? 'off') !== 'off');

  const save = (): void => {
    const rules = chosen.map((field) => ({
      field: field.key,
      ...(states[field.key] === 'not' ? { negate: true } : {}),
      ...(field.kind === 'number'
        ? { value: Number(toLatinDigits(values[field.key] ?? '').replace(/\D/g, '')) || 30 }
        : {}),
    }));

    start(async () => {
      const response = await fetch('/api/v1/admin/campaigns/segments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), nameAr: nameAr.trim(), rules }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast('حُفظت الشريحة — وتُحوسَب وقت الإرسال لا الآن.');
      setOpen(false);
      setKey('');
      setNameAr('');
      setStates({});
      router.refresh();
    });
  };

  const cycle = (field: string): void => {
    setStates((current) => {
      const now = current[field] ?? 'off';
      return { ...current, [field]: now === 'off' ? 'on' : now === 'on' ? 'not' : 'off' };
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        عرِّف شريحة
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="تعريف شريحة"
        className="w-[440px]"
        footer={
          <div className="flex gap-2.5">
            <Button
              size="sm"
              disabled={pending || chosen.length === 0 || key.trim() === '' || nameAr.trim() === ''}
              onClick={save}
            >
              {pending ? 'جارٍ…' : 'احفظ'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="rounded-md border border-line p-3 text-3xs leading-loose opacity-75">
            <b>الشريحة حيّة</b> — تُعاد حوسبتها وقت الإرسال لا وقت الحفظ، فلا تصل الرسالة
            لمن خرج من شرطها بين اللحظتين.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">المفتاح</span>
            {/* مفتاحٌ لاتينيّ يُكتب في التقارير — معزول يسارًا */}
            <input
              dir="ltr"
              value={key}
              placeholder="buyers_with_favorites"
              onChange={(event) => setKey(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">الاسم</span>
            <input
              value={nameAr}
              placeholder="مشترون لديهم مفضلة"
              onChange={(event) => setNameAr(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-2xs font-bold opacity-70">الشروط</span>
            {fields.map((field) => {
              const state = states[field.key] ?? 'off';
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => cycle(field.key)}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-start text-2xs ${
                      state === 'off'
                        ? 'border-line opacity-55'
                        : state === 'on'
                          ? 'border-accent-700 bg-accent-100'
                          : 'border-warn-900 bg-warn-100'
                    }`}
                  >
                    <span>{SEGMENT_FIELD_LABEL[field.key] ?? field.key}</span>
                    <span className="text-3xs font-bold">
                      {state === 'off' ? 'لا يُشترط' : state === 'on' ? 'يُشترط' : 'يُشترط نفيُه'}
                    </span>
                  </button>

                  {state === 'off' || field.kind !== 'number' ? null : (
                    <label className="flex items-center gap-2.5 ps-3.5">
                      <span className="text-3xs opacity-70">خلال كم يومًا</span>
                      <input
                        dir="ltr"
                        inputMode="numeric"
                        value={values[field.key] ?? '30'}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                        className="w-24 rounded-md border border-line bg-surface px-3 py-1.5 text-start font-num text-2xs"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
