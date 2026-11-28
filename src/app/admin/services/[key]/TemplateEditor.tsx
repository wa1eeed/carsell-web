'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { ServiceTemplateView } from '@/lib/domain/service-template';
import { SERVICE_FIELD_KIND, SERVICE_FIELD_PURPOSE } from '@/lib/labels/services';

const field = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs';
const label = 'mb-1 block text-3xs font-bold opacity-70';

const KINDS = ['TEXT', 'LATIN', 'NUMBER', 'MONEY', 'DATE', 'SELECT', 'CHECKBOX', 'NOTE'] as const;

type Draft = {
  key: string;
  labelAr: string;
  hintAr: string;
  kind: (typeof KINDS)[number];
  purpose: 'REQUEST' | 'ACTION';
  required: boolean;
  priceDelta: string;
  options: string;
};

const EMPTY: Draft = {
  key: '',
  labelAr: '',
  hintAr: '',
  kind: 'TEXT',
  purpose: 'REQUEST',
  required: false,
  priceDelta: '',
  options: '',
};

/**
 * ═══ محرّرُ قالب الخدمة ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٨: «يمكن إعداد قالب لكل خدمة بشكل مرن وسهل من
 * خلال إضافة حقول … وحقول لاتخاذ إجراء وحقول للسعر». وكان الفحصُ
 * وحده قابلًا للتحرير.
 *
 * **ويُرى أثرُ السعر قبل أن يُحفظ** (قاعدةٌ مسجَّلة): «زيادة ٢٠٠» لا
 * تقول ما يقوله «السعر يصير ١١٠٠ لمن يختارها».
 */
export function TemplateEditor({ template }: { template: ServiceTemplateView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  /**
   * خياراتٌ تُكتب سطرًا سطرًا: `القيمة | التسمية | الزيادة` — وثلاثةُ
   * حقولٍ لكل خيار في شاشةٍ واحدة تجعل إضافةَ خمسة خياراتٍ عشرين نقرة.
   */
  const parseOptions = (
    text: string,
  ): { value: string; labelAr: string; priceDelta: string | null }[] =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [value = '', labelAr = '', delta = ''] = line.split('|').map((part) => part.trim());
        return {
          value,
          labelAr: labelAr === '' ? value : labelAr,
          priceDelta: delta === '' ? null : delta,
        };
      });

  const preview = ((): string | null => {
    const base = Number(template.basePrice);
    const extra = Number(draft.priceDelta);
    if (draft.kind === 'SELECT') {
      const highest = parseOptions(draft.options)
        .map((option) => Number(option.priceDelta ?? 0))
        .reduce((max, value) => (value > max ? value : max), 0);
      return highest > 0 ? (base + highest).toFixed(2) : null;
    }
    if (!Number.isFinite(extra) || extra <= 0) return null;
    return (base + extra).toFixed(2);
  })();

  const save = (): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/services/${encodeURIComponent(template.serviceKey)}/template`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            key: draft.key.trim(),
            labelAr: draft.labelAr.trim(),
            hintAr: draft.hintAr.trim() === '' ? null : draft.hintAr.trim(),
            kind: draft.kind,
            purpose: draft.purpose,
            required: draft.required,
            maxLength: null,
            priceDelta: draft.priceDelta.trim() === '' ? null : draft.priceDelta.trim(),
            options: draft.kind === 'SELECT' ? parseOptions(draft.options) : [],
          }),
        },
      ).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر حفظ الحقل.');
        return;
      }
      setDraft(EMPTY);
      setOpen(false);
      router.refresh();
    });
  };

  const remove = (key: string): void => {
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/services/${encodeURIComponent(template.serviceKey)}/template?field=${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      ).catch(() => null);
      if (response === null || !response.ok) {
        setToast('تعذر حذف الحقل.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      {template.fields.length === 0 ? (
        <p className="mb-4 text-2xs leading-loose opacity-70">
          لا حقول بعد. يطلب العميل هذه الخدمة بسعرها الثابت، وينهيها المزود بلا بيانات.
        </p>
      ) : (
        <ul className="mb-4">
          {template.fields.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-2 py-2.5 last:border-b-0"
            >
              <span className="text-2xs font-semibold">{row.labelAr}</span>
              <span dir="ltr" className="font-num text-3xs opacity-65">{row.key}</span>
              <span className="text-3xs opacity-70">{SERVICE_FIELD_KIND[row.kind]}</span>
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-3xs',
                  row.purpose === 'REQUEST' ? 'bg-accent-100 text-accent-700' : 'bg-ink/8',
                )}
              >
                {SERVICE_FIELD_PURPOSE[row.purpose]}
              </span>
              {row.required ? <span className="text-3xs text-danger">مطلوب</span> : null}
              {row.priceDelta === null ? null : (
                <span className="text-3xs opacity-70">
                  يزيد <Money amount={row.priceDelta} decimals={2} size="sm" />
                </span>
              )}
              {row.options.length === 0 ? null : (
                <span className="text-3xs opacity-70">
                  {row.options
                    .map((option) =>
                      option.priceDelta === null
                        ? option.labelAr
                        : `${option.labelAr} (+${option.priceDelta})`,
                    )
                    .join(' · ')}
                </span>
              )}
              <span className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() => remove(row.key)}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          أضف حقلا
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className={label}>اسم الحقل كما يراه العميل</span>
              <input
                value={draft.labelAr}
                onChange={(event) => set('labelAr', event.target.value)}
                className={field}
              />
            </label>
            <label>
              <span className={label}>المفتاح — لاتيني، يخزن مع الإجابة</span>
              <input
                dir="ltr"
                value={draft.key}
                onChange={(event) => set('key', event.target.value)}
                className={field}
              />
            </label>
            <label>
              <span className={label}>نوع الحقل</span>
              <select
                value={draft.kind}
                onChange={(event) => set('kind', event.target.value as Draft['kind'])}
                className={field}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SERVICE_FIELD_KIND[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>من يملؤه</span>
              <select
                value={draft.purpose}
                onChange={(event) => set('purpose', event.target.value as Draft['purpose'])}
                className={field}
              >
                <option value="REQUEST">{SERVICE_FIELD_PURPOSE.REQUEST}</option>
                <option value="ACTION">{SERVICE_FIELD_PURPOSE.ACTION}</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className={label}>سطر تحت الحقل — اختياري</span>
              <input
                value={draft.hintAr}
                onChange={(event) => set('hintAr', event.target.value)}
                className={field}
              />
            </label>
          </div>

          {draft.kind !== 'SELECT' ? null : (
            <label>
              <span className={label}>الخيارات — سطر لكل خيار: القيمة | التسمية | الزيادة</span>
              <textarea
                rows={4}
                dir="auto"
                value={draft.options}
                onChange={(event) => set('options', event.target.value)}
                className={field}
              />
            </label>
          )}

          {draft.purpose === 'ACTION' ? (
            <p className="text-3xs leading-loose opacity-70">
              حقل يملؤه المزود عند الإنهاء — يسجل في الطلب، ولا يضيف على السعر: العميل دفع قبله.
            </p>
          ) : (
            <label className={draft.kind === 'SELECT' ? 'hidden' : ''}>
              <span className={label}>
                يزيد على السعر — اتركه فارغا لحقل لا يسعر
                {draft.kind === 'NUMBER' ? ' (لكل وحدة)' : ''}
              </span>
              <input
                dir="ltr"
                inputMode="decimal"
                value={draft.priceDelta}
                onChange={(event) => set('priceDelta', event.target.value)}
                className={field}
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-2xs">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(event) => set('required', event.target.checked)}
            />
            مطلوب
          </label>

          {/*
            **ويُرى أثرُ الرقم قبل حفظه** — فمن يكتب «٢٠٠» يرى السعر
            الذي سيدفعه العميل، لا يكتشفه بعد أن يراه الناس.
          */}
          {/*
            **والمثالُ يقول ما يراه العميل فعلًا.** و«يصير ٩٠٢٫٥٠» عن
            حقلٍ بالوحدة تُقرأ سعرًا نهائيًّا وهي سعرُ وحدةٍ واحدة —
            فيُقال العددُ في الجملة.
          */}
          {preview === null ? null : (
            <p className="text-2xs leading-loose">
              مثال: <Money amount={template.basePrice} decimals={2} size="sm" /> أساس ← يصير{' '}
              <b>
                <Money amount={preview} decimals={2} size="sm" />
              </b>{' '}
              {draft.kind === 'NUMBER' ? 'لمن كتب وحدة واحدة' : 'لمن اختاره'}.
            </p>
          )}

          <div className="flex gap-2.5">
            <Button
              size="sm"
              disabled={pending || draft.key.trim() === '' || draft.labelAr.trim() === ''}
              onClick={save}
            >
              احفظ الحقل
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
