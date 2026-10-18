'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, fieldShell } from '@/components/ui/Field';
import { Toast } from '@/components/ui/Toast';
import type { ProviderType } from '@/generated/prisma/enums';
import { type CompletionField, visibleFields } from '@/lib/domain/completion-schema';
import { checkCompletion, type CompletionIssueCode } from '@/lib/domain/completion-validate';
import {
  COMPLETION_FIELD,
  COMPLETION_OPTION,
  COMPLETION_UNIT,
} from '@/lib/labels/completion';

/**
 * ═══ نموذجُ الإنجاز — واحدٌ لكل الأصناف ═══
 *
 * طلبُ المالك: «لوحة … موحَّدة لجميع المزوّدين بطريقةٍ ذكيّة … **وإذا
 * كان المزوّد نقل ملكيّة هناك حقول تناسبه** … وهكذا لباقي المزوّدين».
 *
 * **والفرقُ بياناتٌ لا شاشات**: هذا الملفّ لا يعرف صنفًا بعينه، يقرأ
 * المخطّط فيرسمه. وإضافةُ حقلٍ سطرٌ في `completion-schema.ts`.
 *
 * **والتحقّقُ هو تحقّقُ الخادم نفسه** (`checkCompletion`): شاشةٌ تُجيز
 * ما يرفضه الخادم تُشعر المزوّد أنه أخطأ وهو لم يخطئ، والعكس أسوأ —
 * فالحارس في الخادم على كل حال.
 */

/** صياغةُ العطب — والنطاق يُعيد مفاتيح (البوابة ١٧) */
const ISSUE: Record<CompletionIssueCode, string> = {
  REQUIRED: 'هذا الحقل مطلوب.',
  TOO_SHORT: 'أقصر من أن يفهم.',
  TOO_LONG: 'أطول من المسموح.',
  NOT_A_NUMBER: 'اكتب رقما.',
  NEGATIVE: 'لا يصح أن يكون سالبا.',
  NOT_A_DATE: 'اختر تاريخا صحيحا.',
  FUTURE_DATE: 'تاريخ لم يأت بعد — وأنت تثبت ما وقع.',
  PAST_DATE: 'تاريخ مضى.',
  BEFORE_OTHER: 'يسبق التاريخ الذي قبله.',
  NOT_AN_OPTION: 'اختر من القائمة.',
};

export function CompletionForm({
  ref_,
  type,
  fields,
  initial,
  locked,
}: {
  ref_: string;
  type: ProviderType;
  fields: readonly CompletionField[];
  initial: Readonly<Record<string, string>>;
  locked: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({ ...initial });
  const [issues, setIssues] = useState<Record<string, CompletionIssueCode>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /**
   * **والحقلُ المشروط يختفي بالقيمة لا بالصنف**: مبلغُ التمويل المعتمد
   * لا معنى له على رفض، وطلبُه على كل قرارٍ يُجبر المزوّد على كتابة
   * صفرٍ كاذب. والدالّة هي التي يقرؤها الخادم.
   */
  const shown = useMemo(() => visibleFields(fields, values), [fields, values]);

  const set = (key: string, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setIssues((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submit = (): void => {
    const check = checkCompletion(type, values, new Date());
    if (!check.ok) {
      const map: Record<string, CompletionIssueCode> = {};
      for (const issue of check.issues) map[issue.key] = issue.code;
      setIssues(map);
      setToast('راجع الحقول المعلمة.');
      return;
    }
    setIssues({});

    start(async () => {
      /**
       * **والحفظ ثمّ الخطوة** — لا خطوةٌ تحفظ: فلو انقطع الاتّصال بين
       * النداءين بقي الإثبات محفوظًا والطلبُ قيد التنفيذ، لا طلبًا
       * «مُنجَزًا» بلا إثبات.
       */
      const saved = await fetch(
        `/api/v1/provider/requests/${encodeURIComponent(ref_)}/completion`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ values }),
        },
      ).catch(() => null);

      const savedBody = (await saved?.json().catch(() => null)) as
        | { error?: { messageAr?: string; fields?: Record<string, CompletionIssueCode> } }
        | null;

      if (saved === null || !saved.ok) {
        const remote = savedBody?.error?.fields;
        if (remote !== undefined) setIssues(remote);
        setToast(savedBody?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }

      const done = await fetch(`/api/v1/provider/requests/${encodeURIComponent(ref_)}/step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: 'complete', reason: null }),
      }).catch(() => null);

      const doneBody = (await done?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (done === null || !done.ok) {
        setToast(doneBody?.error?.messageAr ?? 'حفظ الإثبات، وتعذر إنهاء الطلب.');
        return;
      }
      window.location.assign(`/provider/${encodeURIComponent(ref_)}`);
    });
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {shown.map((field) => {
          const id = `c-${field.key}`;
          const code = issues[field.key];
          const invalid = code !== undefined;
          return (
            <Field
              key={field.key}
              htmlFor={id}
              label={COMPLETION_FIELD[field.key] ?? field.key}
              required={field.required}
              unit={COMPLETION_UNIT[field.key]}
              error={code === undefined ? undefined : ISSUE[code]}
            >
              {field.type === 'TEXTAREA' ? (
                <textarea
                  id={id}
                  rows={4}
                  disabled={locked}
                  maxLength={field.maxLength}
                  value={values[field.key] ?? ''}
                  onChange={(event) => set(field.key, event.target.value)}
                  className={fieldShell('form', invalid)}
                />
              ) : field.type === 'SELECT' ? (
                <select
                  id={id}
                  disabled={locked}
                  value={values[field.key] ?? ''}
                  onChange={(event) => set(field.key, event.target.value)}
                  className={fieldShell('form', invalid)}
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {COMPLETION_OPTION[option] ?? option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  disabled={locked}
                  maxLength={field.maxLength}
                  /**
                   * `date` للتاريخ، و`text` لما عداه — **و`number`
                   * يرفض اللصق المنقَّط ويُظهر سهمين لا يُستعملان**،
                   * والتطبيع في `checkCompletion` يقبل كل صيغة.
                   */
                  type={field.type === 'DATE' ? 'date' : 'text'}
                  /**
                   * **و`dir="ltr"` على ما يُنسخ من مصدرٍ لاتينيّ
                   * ويُقارن خانةً بخانة** — رقمُ البوليصة واللوحة
                   * ورقمُ المعاملة.
                   */
                  dir={field.type === 'TEXT' ? undefined : 'ltr'}
                  inputMode={
                    field.type === 'NUMBER' || field.type === 'MONEY' ? 'decimal' : undefined
                  }
                  value={values[field.key] ?? ''}
                  onChange={(event) => set(field.key, event.target.value)}
                  className={`${fieldShell('form', invalid)}${
                    field.type === 'TEXT' ? '' : ' font-num'
                  }`}
                />
              )}
            </Field>
          );
        })}

        {locked ? (
          <p className="rounded-lg border border-line p-4 text-2xs leading-loose opacity-70">
            أنهي هذا الطلب، فالإثبات يقرأ ولا يعدل.
          </p>
        ) : (
          <Button onClick={submit} disabled={pending} className="w-full">
            {pending ? 'يحفظ…' : 'احفظ وأنه الطلب'}
          </Button>
        )}
      </div>

      {toast === null ? null : <Toast tone="error" title={toast} />}
    </>
  );
}
