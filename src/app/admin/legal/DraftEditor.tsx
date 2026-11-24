'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Quantity } from '@/components/ui/Quantity';
import { cn } from '@/lib/cn';
import { displayDigits } from '@/lib/arabic';
import type { EditorDraft, LegalSection } from '@/lib/domain/admin-legal';

/**
 * ═══ محرّرُ المسوّدة — A34 ═══
 *
 * زرُّ «تعديل» في الترميز، وما يفتحه. **والمنشورُ لا يُحرَّر فوق
 * نفسه**: ما يُحفَظ هنا نسخةٌ جديدة بحالة `DRAFT`، والمنشورُ لا يُمَسّ
 * حتى تُنشر.
 *
 * ═══ والمسوّدةُ تُولد من المنشور ═══
 *
 * محرّرٌ يُفتح فارغًا يجعل تصحيحَ سطرٍ إعادةَ كتابةِ مستندٍ كامل —
 * فيُنسخ نصُّ المنشور بنوده كلّها، ويُعدَّل فيه ما يُعدَّل.
 */

const field =
  'w-full rounded-md border border-line bg-bg px-3 py-2.25 text-2xs outline-none focus:border-ink';

const FIELD_ERROR: Record<string, string> = {
  REQUIRED: 'هذا الحقل مطلوب',
  INVALID: 'القيمة غير صحيحة',
  TOO_SOON: 'التعديل الجوهري يخطر قبل أربعة عشر يوما على الأقل',
  SECTION_TITLE: 'كل بند يحتاج عنوانا',
  SECTION_BODY: 'كل بند يحتاج نصا',
  RESERVED: 'هذا المفتاح محجوز لمسار في اللوحة',
  TAKEN: 'المفتاح مستعمل لمستند آخر',
};

export function DraftEditor({
  docKey,
  draft: initial,
  hasDraft,
  creating,
  publishedVersion,
  draftVersion,
  acceptances,
}: {
  /** فارغٌ عند الإنشاء — يكتبه المشغّل. */
  docKey: string;
  draft: EditorDraft;
  hasDraft: boolean;
  creating: boolean;
  publishedVersion: string | null;
  draftVersion: string | null;
  acceptances: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<EditorDraft>(initial);
  const [key, setKey] = useState(docKey);
  const [required, setRequired] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(hasDraft);

  const patch = (next: Partial<EditorDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };

  const setSection = (index: number, next: Partial<LegalSection>): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, i) =>
        i === index ? { ...section, ...next } : section,
      ),
    }));
  };

  const addSection = (): void => {
    setDraft((current) => ({
      ...current,
      sections: [
        ...current.sections,
        { n: current.sections.length + 1, titleAr: '', titleEn: '', bodyAr: '', bodyEn: '' },
      ],
    }));
  };

  const removeSection = (index: number): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.filter((_, i) => i !== index),
    }));
  };

  async function send(
    url: string,
    method: 'PUT' | 'POST' | 'DELETE',
    body?: unknown,
  ): Promise<{ ok: boolean; fields?: Record<string, string> }> {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as {
      error?: { fields?: Record<string, string> };
    } | null;
    return { ok: response.ok, fields: json?.error?.fields };
  }

  const save = (): void => {
    start(async () => {
      setErrors({});
      const payload = {
        titleAr: draft.titleAr,
        titleEn: draft.titleEn,
        summaryAr: draft.summaryAr,
        summaryEn: draft.summaryEn,
        sections: draft.sections,
        material: draft.material,
        effectiveAt: draft.effectiveAt === '' ? null : draft.effectiveAt,
      };

      const result = creating
        ? await send('/api/v1/admin/legal', 'POST', { ...payload, key, requiredAtSignup: required })
        : await send(`/api/v1/admin/legal/${docKey}`, 'PUT', payload);

      if (!result.ok) {
        setErrors(result.fields ?? {});
        setToast({ tone: 'err', text: 'لم تحفظ المسودة' });
        return;
      }

      setSaved(true);
      setToast({ tone: 'ok', text: creating ? 'أنشئ المستند بمسودته' : 'حفظت المسودة' });
      if (creating) router.push(`/admin/legal/${key}`);
      else router.refresh();
    });
  };

  const publish = (): void => {
    start(async () => {
      const result = await send(`/api/v1/admin/legal/${docKey}/publish`, 'POST');
      if (!result.ok) {
        setToast({ tone: 'err', text: 'لم تنشر النسخة' });
        return;
      }
      setToast({ tone: 'ok', text: 'نشرت النسخة، والسابقة محفوظة بتاريخها' });
      router.push('/admin/legal');
    });
  };

  const discard = (): void => {
    start(async () => {
      const result = await send(`/api/v1/admin/legal/${docKey}`, 'DELETE');
      if (!result.ok) {
        setToast({ tone: 'err', text: 'لا مسودة تسقط' });
        return;
      }
      setToast({ tone: 'ok', text: 'أسقطت المسودة' });
      router.push('/admin/legal');
    });
  };

  const err = (name: string): string | null =>
    errors[name] === undefined ? null : (FIELD_ERROR[errors[name]] ?? errors[name]);

  return (
    <>
      <div className="flex flex-col gap-5">
        {creating ? (
          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="mb-3 text-2xs font-bold">المفتاح والعنوان</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-3xs opacity-70">المفتاح — يظهر في الرابط</span>
                {/*
                  **و`dir="ltr"` على كل حقلٍ يُقارن خانةً بخانة.** المفتاح
                  لاتينيّ يصير `/legal/<المفتاح>`، فيُكتب ويُقرأ يسارًا.
                */}
                <input
                  dir="ltr"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="returns"
                  className={cn(field, 'font-num')}
                />
                {err('key') === null ? null : (
                  <span className="text-3xs text-danger">{err('key')}</span>
                )}
              </label>
              <label className="flex items-center gap-2.5 self-end py-2.25">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(event) => setRequired(event.target.checked)}
                  className="size-3.5 accent-ink"
                />
                <span className="text-2xs">إلزامي للتسجيل</span>
              </label>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-3 text-2xs font-bold">العنوان والملخص</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs opacity-70">العنوان بالعربية</span>
              <input
                value={draft.titleAr}
                onChange={(event) => patch({ titleAr: event.target.value })}
                className={field}
              />
              {err('titleAr') === null ? null : (
                <span className="text-3xs text-danger">{err('titleAr')}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs opacity-70">العنوان بالإنجليزية</span>
              <input
                dir="ltr"
                value={draft.titleEn}
                onChange={(event) => patch({ titleEn: event.target.value })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs opacity-70">ملخص بالعربية</span>
              <textarea
                rows={3}
                value={draft.summaryAr}
                onChange={(event) => patch({ summaryAr: event.target.value })}
                className={cn(field, 'resize-y leading-loose')}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs opacity-70">ملخص بالإنجليزية</span>
              <textarea
                dir="ltr"
                rows={3}
                value={draft.summaryEn}
                onChange={(event) => patch({ summaryEn: event.target.value })}
                className={cn(field, 'resize-y leading-loose')}
              />
            </label>
          </div>
        </div>

        {/*
          ═══ والجوهريُّ قرارٌ يُؤخَذ هنا لا راية تُنسى ═══

          وسمُها يفرض تاريخَ سريانٍ بعد أربعةَ عشرَ يومًا — فلا تُنشر
          نسخةٌ جوهريّة اليوم ويُطلب القبولُ غدًا.
        */}
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-3 text-2xs font-bold">السريان</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs opacity-70">يسري من</span>
              <input
                type="date"
                dir="ltr"
                value={draft.effectiveAt}
                onChange={(event) => patch({ effectiveAt: event.target.value })}
                className={cn(field, 'font-num')}
              />
              {err('effectiveAt') === null ? null : (
                <span className="text-3xs text-danger">{err('effectiveAt')}</span>
              )}
            </label>
            <label className="flex items-start gap-2.5 py-2.25">
              <input
                type="checkbox"
                checked={draft.material}
                onChange={(event) => patch({ material: event.target.checked })}
                className="mt-0.5 size-3.5 accent-ink"
              />
              <span className="text-2xs leading-loose">
                تعديل جوهري
                <span className="block text-3xs opacity-70">
                  يخطر كل المستخدمين قبل أربعة عشر يوما من النفاذ، ويطلب قبولا
                  جديدا عند أول فتح بعده.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-2xs font-bold">
              البنود{' '}
              <span className="font-num opacity-70">
                (<ArabicNumber value={draft.sections.length} />)
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={addSection} disabled={busy}>
              أضف بندا
            </Button>
          </div>

          {err('sections') === null ? null : (
            <p className="mb-3 text-3xs text-danger">{err('sections')}</p>
          )}

          <div className="flex flex-col gap-4">
            {draft.sections.length === 0 ? (
              <p className="text-3xs opacity-70">لا بنود — أضف الأول.</p>
            ) : (
              draft.sections.map((section, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2.5 border-t border-line pt-4 first:border-0 first:pt-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-num text-3xs font-bold opacity-65">
                      <ArabicNumber value={index + 1} />
                    </span>
                    <input
                      value={section.titleAr}
                      onChange={(event) => setSection(index, { titleAr: event.target.value })}
                      placeholder="عنوان البند"
                      /* **و`min-w-0` مع `flex-1`**: حقلٌ بلا انكماشٍ يفيض بعنوانٍ طويل */
                      className={cn(field, 'min-w-0 flex-1 font-bold')}
                    />
                    <button
                      type="button"
                      onClick={() => removeSection(index)}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-3xs hover:bg-bg"
                    >
                      احذف
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={section.bodyAr}
                    onChange={(event) => setSection(index, { bodyAr: event.target.value })}
                    placeholder="نص البند"
                    className={cn(field, 'resize-y leading-loose')}
                  />
                  <input
                    dir="ltr"
                    value={section.titleEn}
                    onChange={(event) => setSection(index, { titleEn: event.target.value })}
                    placeholder="English title"
                    className={field}
                  />
                  <textarea
                    dir="ltr"
                    rows={3}
                    value={section.bodyEn}
                    onChange={(event) => setSection(index, { bodyEn: event.target.value })}
                    placeholder="English body"
                    className={cn(field, 'resize-y leading-loose')}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/*
          ═══ والنشرُ يقول ما يترتّب عليه قبل أن يقع ═══

          «انشر» تحت سطرٍ يسمّي النسخةَ الذاهبة إلى الأرشيف وعددَ من
          قبِلها — فمن ينشر يعرف ماذا يُستبدل، ولا يكتشفه بعدها.
        */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface p-5">
          <div className="min-w-48 flex-1">
            <p className="text-2xs font-bold">
              {!saved || draftVersion === null ? (
                'احفظ المسودة أولا'
              ) : publishedVersion === null ? (
                /*
                  **وأوّلُ نشرٍ لا سابقةَ له.** كانت الجملة تقول «والنسخة
                  — تحفظ بتاريخها» على مستندٍ لم يُنشر قطّ: شَرطةٌ مكان
                  رقمٍ، ووعدٌ بحفظ ما لا وجود له.
                */
                <>أول نشر لهذا المستند — ويصير مرئيا للزوار فور نشره</>
              ) : (
                <>
                  النشر يسري فورا، والنسخة{' '}
                  <span className="font-num">{displayDigits(publishedVersion)}</span> تحفظ
                  بتاريخها
                </>
              )}
            </p>
            <p className="mt-0.5 text-3xs opacity-70">
              {acceptances === 0 ? (
                'لا سجل قبول على النسخة الحالية.'
              ) : (
                <>
                  {/*
                    **والعددُ يحكم المعدود** (البوابة ١٦): «٢ حساب»
                    خطأ وصوابُه «حسابان». فالصياغة من `Quantity` لا
                    من يدٍ تكتب الوحدة بعد الرقم.
                  */}
                  قبل النسخة الحالية <Quantity unit="accounts" count={acceptances} />، وسجلهم
                  يشير إليها فلا تمس.
                </>
              )}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={save} disabled={busy}>
            {busy ? 'جاري…' : creating ? 'أنشئ المسودة' : 'احفظ المسودة'}
          </Button>

          {creating || !saved || draftVersion === null ? null : (
            <>
              <Button variant="ghost" size="sm" onClick={discard} disabled={busy}>
                أسقط المسودة
              </Button>
              <Button size="sm" onClick={publish} disabled={busy}>
                انشر النسخة
              </Button>
            </>
          )}
        </div>
      </div>

      {toast === null ? null : (
        <Toast tone={toast.tone === 'ok' ? 'success' : 'error'} title={toast.text} />
      )}
    </>
  );
}
