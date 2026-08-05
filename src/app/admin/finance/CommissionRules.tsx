'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import type { CommissionRuleRow } from '@/lib/domain/admin-commission';

/**
 * ═══ العمولة — طرفان يديرهما المشغّل ═══
 *
 * كانت قاعدةً واحدة **تُضاف إلى إجمالي المشتري وتُخصم من صافي البائع
 * معًا**: عمولةٌ معلنة ٢٬٥٠٠ تأخذ ٥٬٠٠٠، ولا حقل يقول أيّهما قُصد.
 *
 * ═══ والأثر يُقال قبل الحفظ ═══
 *
 * «٢٫٥٪ على البائع» لا تُخبر ماذا يقع. فتحت كل بطاقةٍ **مثالٌ محسوب**
 * على سيارةٍ بمئة ألف: كم يُضاف للمشتري وكم يُخصم من البائع. ومن
 * يعدّل نسبةً يجب أن يرى أثرها بالريال لا بالنسبة.
 */

const LABEL: Record<string, { title: string; effect: string }> = {
  SELLER: { title: 'عمولة البائع', effect: 'تُخصم ممّا يستلمه البائع' },
  BUYER: { title: 'عمولة المشتري', effect: 'تُضاف إلى ما يدفعه المشتري' },
};

/** مثالٌ ثابت — والرقم المستدير يجعل الأثر يُقرأ بلا حساب. */
const SAMPLE = 100_000;

type Draft = { enabled: boolean; pct: string; fixedFee: string; minFee: string; maxFee: string };

export function CommissionRules({
  rows,
  canEdit,
}: {
  rows: readonly CommissionRuleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const draftOf = (row: CommissionRuleRow): Draft =>
    drafts[row.side] ?? {
      enabled: row.enabled,
      pct: row.pct,
      fixedFee: row.fixedFee,
      minFee: row.minFee ?? '',
      maxFee: row.maxFee ?? '',
    };

  const patch = (side: string, next: Partial<Draft>, current: Draft): void =>
    setDrafts((all) => ({ ...all, [side]: { ...current, ...next } }));

  const num = (raw: string): number => {
    const value = Number(toLatinDigits(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : 0;
  };

  const save = (row: CommissionRuleRow): void => {
    const draft = draftOf(row);
    start(async () => {
      const response = await fetch('/api/v1/admin/commission', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          side: row.side,
          enabled: draft.enabled,
          pct: num(draft.pct),
          fixedFee: num(draft.fixedFee),
          minFee: draft.minFee.trim() === '' ? null : num(draft.minFee),
          maxFee: draft.maxFee.trim() === '' ? null : num(draft.maxFee),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setDrafts((all) => {
        const { [row.side]: _dropped, ...rest } = all;
        return rest;
      });
      setToast('حُفظت. وتسري على ما يُنشأ بعدها — والطلبات القائمة على نسبتها.');
      router.refresh();
    });
  };

  return (
    <section className="mt-10">
      <h2 className="mb-1.5 text-sm font-bold">العمولة</h2>
      <p className="mb-5 max-w-xl text-2xs leading-loose opacity-60">
        لكل طرف قاعدته. والتعديل يسري على ما يُنشأ بعده — والطلبات القائمة تبقى
        على نسبتها المخزَّنة، فلا تتغيّر فاتورةٌ صدرت.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => {
          const draft = draftOf(row);
          const dirty = drafts[row.side] !== undefined;
          const label = LABEL[row.side] ?? { title: row.side, effect: '' };

          // الأثر بالريال — والحدّان يُطبَّقان كما في النطاق
          const raw = (SAMPLE * num(draft.pct)) / 100 + num(draft.fixedFee);
          const floor = draft.minFee.trim() === '' ? 0 : num(draft.minFee);
          const ceiling = draft.maxFee.trim() === '' ? Infinity : num(draft.maxFee);
          const effect = draft.enabled ? Math.min(Math.max(raw, floor), ceiling) : 0;

          return (
            <div key={row.side} className="rounded-lg border border-line bg-surface p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold">{label.title}</span>
                  <span className="text-3xs opacity-55">{label.effect}</span>
                </div>
                <Badge tone={draft.enabled ? 'accent' : 'neutral'}>
                  {draft.enabled ? 'مفعَّلة' : 'معطَّلة'}
                </Badge>
              </div>

              <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-2xs">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  disabled={!canEdit}
                  onChange={(event) => patch(row.side, { enabled: event.target.checked }, draft)}
                />
                <span>خُذ هذه العمولة</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="النسبة ٪"
                  value={draft.pct}
                  disabled={!canEdit || !draft.enabled}
                  onChange={(value) => patch(row.side, { pct: value }, draft)}
                />
                <Field
                  label="مبلغ ثابت"
                  value={draft.fixedFee}
                  disabled={!canEdit || !draft.enabled}
                  onChange={(value) => patch(row.side, { fixedFee: value }, draft)}
                />
                <Field
                  label="حدّ أدنى"
                  value={draft.minFee}
                  placeholder="بلا"
                  disabled={!canEdit || !draft.enabled}
                  onChange={(value) => patch(row.side, { minFee: value }, draft)}
                />
                <Field
                  label="حدّ أقصى"
                  value={draft.maxFee}
                  placeholder="بلا"
                  disabled={!canEdit || !draft.enabled}
                  onChange={(value) => patch(row.side, { maxFee: value }, draft)}
                />
              </div>

              {/*
                الأثر بالريال على مثالٍ ثابت — فمن يكتب «٢٫٥» يرى
                ٢٬٥٠٠ قبل أن يحفظ، لا بعد أن يشتكي بائع.
              */}
              <p className="mt-4 border-t border-line pt-3 text-2xs leading-loose opacity-70">
                على سيارةٍ بـ<span className="font-num"> ١٠٠٬٠٠٠ </span>ريال:{' '}
                <b className="font-num">
                  {effect.toLocaleString('ar-SA', { maximumFractionDigits: 2 })}
                </b>{' '}
                ريال {row.side === 'BUYER' ? 'يدفعها المشتري زيادةً' : 'تُخصم من البائع'}
              </p>

              {row.revisions > 0 ? (
                <p className="mt-2 text-3xs opacity-40">
                  سبقتها <span className="font-num">{row.revisions}</span> نسخة محفوظة
                </p>
              ) : null}

              {canEdit ? (
                <Button
                  size="sm"
                  className="mt-4 w-full"
                  disabled={pending || !dirty}
                  onClick={() => save(row)}
                >
                  {pending ? 'جارٍ…' : dirty ? 'احفظ' : 'لا تغيير'}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-55">{label}</span>
      {/* `dir="ltr"` — رقمٌ يُقارَن خانةً بخانة، وسياق RTL يقلب إشارته */}
      <input
        dir="ltr"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-2xs disabled:opacity-40"
      />
    </label>
  );
}
