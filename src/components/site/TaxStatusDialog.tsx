'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import type { TaxProfile, VatFailure } from '@/lib/domain/tax-profile';

/**
 * ═══ نافذة الوضع الضريبيّ — مرّة واحدة، عند أوّل إجراء ═══
 *
 * التسجيل بالجوال وحده، ولا يُسأل أحدٌ عن ضريبةٍ قبل أن يكون لها أثر.
 * فتُفتح عند أوّل نشر إعلان أو أوّل شراء، ثم لا تُفتح ثانيةً أبدًا.
 *
 * **وإغلاقها مسموح.** حبسُ المستخدم في نافذة يجعله يترك المنصّة لا
 * يجيبها؛ والإغلاق يُلغي الإجراء وحده، والنافذة تعود حين يعود إليه.
 */
export function TaxStatusDialog({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (profile: TaxProfile) => void;
  initial?: TaxProfile | null;
}) {
  const t = useTranslations('tax');

  const [choice, setChoice] = useState<'INDIVIDUAL' | 'VAT_REGISTERED' | null>(
    initial?.status ?? null,
  );
  const [vatNumber, setVatNumber] = useState(initial?.vatNumber ?? '');
  const [error, setError] = useState<VatFailure | 'SAVE' | null>(null);
  const [saving, setSaving] = useState(false);

  /** الزرّ معطَّل حتى يختار — واختيار «منشأة» يستلزم رقمًا. */
  const ready = choice === 'INDIVIDUAL' || (choice === 'VAT_REGISTERED' && vatNumber.trim() !== '');

  const save = (): void => {
    if (choice === null || saving) return;
    setSaving(true);
    setError(null);

    void (async () => {
      const response = await fetch('/api/v1/account/tax-status', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: choice, vatNumber }),
      }).catch(() => null);

      setSaving(false);
      if (response === null || !response.ok) {
        const payload = (await response?.json().catch(() => null)) as
          | { error?: { fields?: { vatNumber?: VatFailure } } }
          | null;
        setError(payload?.error?.fields?.vatNumber ?? 'SAVE');
        return;
      }

      const payload = (await response.json()) as { data: TaxProfile };
      onSaved(payload.data);
    })();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('title')}>
      <p className="mb-4 text-xs leading-loose">{t('prompt')}</p>

      <div className="flex flex-col gap-2.5">
        {(
          [
            ['INDIVIDUAL', t('individual')],
            ['VAT_REGISTERED', t('registered')],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-xs leading-relaxed ${
              choice === value ? 'border-ink' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="taxStatus"
              className="mt-0.5"
              checked={choice === value}
              onChange={() => {
                setChoice(value);
                setError(null);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {/*
        الحقل يظهر **فورًا** عند اختيار «منشأة» — لا بعد ضغطة حفظٍ تفشل.
        و`dir="ltr"` لأنه يُنسخ من شهادة ويُقارن خانةً بخانة، والتطبيع في
        النطاق فيقبل المسافات والشرطات والأرقام العربية-الهندية.
      */}
      {choice !== 'VAT_REGISTERED' ? null : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          <label className="text-2xs font-bold opacity-60" htmlFor="vatNumber">
            {t('vatLabel')}
          </label>
          <input
            id="vatNumber"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t('vatPlaceholder')}
            value={vatNumber}
            onChange={(event) => {
              setVatNumber(event.target.value);
              setError(null);
            }}
            className="font-num rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
          />
        </div>
      )}

      {error === null ? null : (
        <p className="mt-3 text-2xs text-warn-900">{t(`error.${error}`)}</p>
      )}

      <p className="mt-4 text-3xs leading-loose opacity-50">{t('once')}</p>

      <Button className="mt-4 w-full" disabled={!ready || saving} onClick={save}>
        {saving ? t('saving') : t('save')}
      </Button>
    </Modal>
  );
}
