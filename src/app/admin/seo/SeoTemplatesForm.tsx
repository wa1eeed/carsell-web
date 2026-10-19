'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import type { SeoTemplateRow } from '@/lib/domain/seo';
import {
  SEO_DESCRIPTION_LIMIT,
  SEO_VARIABLES,
  countBeforeNoun,
  isSeoSurface,
  renderSeo,
  unknownPlaceholders,
} from '@/lib/seo/templates';
import { SEO_SURFACE_LABEL, SEO_SAMPLE, SEO_VARIABLE_LABEL } from '@/lib/labels/seo';

type Draft = {
  titleAr: string; titleEn: string;
  introAr: string; introEn: string;
  outroAr: string; outroEn: string;
  active: boolean;
};

const FIELDS = [
  { key: 'titleAr', label: 'العنوان (عربي)', en: false, rows: 1 },
  { key: 'titleEn', label: 'العنوان (إنجليزي)', en: true, rows: 1 },
  { key: 'introAr', label: 'المقدمة (عربي)', en: false, rows: 3 },
  { key: 'introEn', label: 'المقدمة (إنجليزي)', en: true, rows: 3 },
  { key: 'outroAr', label: 'الخاتمة (عربي)', en: false, rows: 3 },
  { key: 'outroEn', label: 'الخاتمة (إنجليزي)', en: true, rows: 3 },
] as const satisfies readonly { key: keyof Draft; label: string; en: boolean; rows: number }[];

/**
 * ═══ تحريرٌ بمعاينةٍ حيّة — لا بحقلٍ أعمى ═══
 *
 * **والشاشةُ تُري ما سيُطبع لا ما كُتب**: «{count} سيارة {brand} في
 * {city}» لا تقول ما تقوله «١٢ سيارة تويوتا معروضة في الرياض بأسعار
 * من ٨٥٬٠٠٠ إلى ٣٢٠٬٠٠٠ ريال». وهو مسلكُ شاشة شروط التمويل نفسه:
 * «نسبة الربح ٦٪» لا تقول ما يقوله «٢٬١٤٠ شهريا».
 *
 * **والمتغيّرُ المجهول يُنذَر عليه هنا ويُرفض في الخادم**: `{brnad}`
 * لا تملؤه الصفحة، و`renderSeo` تُسقط فقرتَه كاملةً — فيُحفظ النصُّ
 * ولا يُعرض، والمحرِّر لا يعرف. **وحارسٌ في العميل ليس حارسًا**،
 * فالفحصُ في الموضعين: هنا ليراه قبل الحفظ، وهناك ليمنعه.
 *
 * **والمقدّمةُ تؤدّي دورين** — فقرةً و`<meta description>` — فطولُها
 * يُعرض وحدُّ المحرّك معه: ما تجاوزه يُقتطع في نتيجة البحث. والشاشة
 * تُحذّر ولا تمنع، فالقرار تحريريّ.
 */
export function SeoTemplatesForm({
  templates,
  sampleHref,
  canEdit,
}: {
  templates: readonly SeoTemplateRow[];
  sampleHref: Record<string, string | null>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      templates.map((row) => [
        row.key,
        {
          titleAr: row.titleAr, titleEn: row.titleEn,
          introAr: row.introAr, introEn: row.introEn,
          outroAr: row.outroAr, outroEn: row.outroEn,
          active: row.active,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const field =
    'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-ink';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-70';

  async function save(key: string): Promise<void> {
    const draft = drafts[key];
    if (draft === undefined) return;
    setBusy(key);
    try {
      const response = await fetch(`/api/v1/admin/seo/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: { messageAr: string } };
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذر الحفظ.' });
        return;
      }
      setToast({ tone: 'success', text: 'حفظت النص.' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {templates.map((row) => {
          const draft = drafts[row.key];
          if (draft === undefined || !isSeoSurface(row.surface)) return null;

          const surface = row.surface;
          const sample = SEO_SAMPLE[surface];
          const href = sampleHref[surface] ?? null;
          const set = (patch: Partial<Draft>): void =>
            setDrafts((was) => ({ ...was, [row.key]: { ...draft, ...patch } }));

          return (
            <section
              key={row.key}
              className={cn(
                'rounded-xl border border-line bg-surface p-5',
                draft.active ? '' : 'opacity-70',
              )}
            >
              <header className="mb-5 flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{SEO_SURFACE_LABEL[surface]}</span>
                  {href === null ? (
                    <span className="block text-2xs opacity-65">لا صفحة قائمة الآن لهذا السطح</span>
                  ) : (
                    <Link
                      href={href}
                      target="_blank"
                      className="bidi-ltr block text-2xs underline underline-offset-2 opacity-65"
                    >
                      {href}
                    </Link>
                  )}
                </span>
                {draft.active ? null : <Badge tone="neutral">مطفأ</Badge>}
              </header>

              {/*
                **والمتغيّراتُ تُسمّى بما تعنيه** — `{priceMin}` وحدها
                لا تقول «أقل سعر معروض في هذه الصفحة».
              */}
              <div className="mb-5 flex flex-wrap gap-2">
                {SEO_VARIABLES[surface].map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-line px-3 py-1.5 text-2xs"
                  >
                    <code className="bidi-ltr font-num">{`{${name}}`}</code>
                    <span className="opacity-60"> · {SEO_VARIABLE_LABEL[name] ?? name}</span>
                  </span>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map((entry) => {
                  const value = draft[entry.key] as string;
                  const unknown = unknownPlaceholders(value, surface);
                  /** **والعددُ لا يحكم المعدود**: «{count} سيارة» تُخرج «3 سيارة». */
                  const governed = entry.en ? [] : countBeforeNoun(value);
                  const isIntro = entry.key === 'introAr' || entry.key === 'introEn';
                  const tooLong = isIntro && value.length > SEO_DESCRIPTION_LIMIT;

                  return (
                    <label key={entry.key} className={label}>
                      <span className="flex flex-wrap items-center gap-2">
                        {entry.label}
                        {!isIntro ? null : (
                          <span
                            className={cn(
                              'font-num text-2xs',
                              tooLong ? 'text-[var(--color-warn-ink)]' : 'opacity-65',
                            )}
                          >
                            {value.length}/{SEO_DESCRIPTION_LIMIT}
                          </span>
                        )}
                      </span>
                      {entry.rows === 1 ? (
                        <input
                          value={value}
                          onChange={(e) => set({ [entry.key]: e.target.value } as Partial<Draft>)}
                          disabled={!canEdit}
                          {...(entry.en ? { dir: 'ltr' as const } : {})}
                          className={cn(field, entry.en ? 'bidi-ltr' : '')}
                        />
                      ) : (
                        <textarea
                          value={value}
                          onChange={(e) => set({ [entry.key]: e.target.value } as Partial<Draft>)}
                          disabled={!canEdit}
                          rows={entry.rows}
                          {...(entry.en ? { dir: 'ltr' as const } : {})}
                          className={cn(field, entry.en ? 'bidi-ltr' : '')}
                        />
                      )}
                      {governed.length === 0 ? null : (
                        <span className="text-2xs font-semibold text-[var(--color-warn-ink)]">
                          العدد يجاور معدوده، فتخرج «٣ سيارة» لا «٣ سيارات» — اجعل
                          الرقم آخر الجملة:{' '}
                          <code className="bidi-ltr">{governed.join(' · ')}</code>
                        </span>
                      )}
                      {unknown.length === 0 ? null : (
                        <span className="text-2xs font-semibold text-[var(--color-danger-ink)]">
                          متغير لا تملؤه الصفحة، والفقرة كلها لن تظهر:{' '}
                          <code className="bidi-ltr">{unknown.join(' · ')}</code>
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/*
                ═══ المعاينةُ بقيَمٍ حقيقيّة الشكل ═══

                **وهي ما سيُطبع لا ما كُتب.** والفقرةُ التي تُحذف
                تُقال محذوفة: فراغٌ في المعاينة يُقرأ عطلًا في
                الشاشة، والحقيقةُ أنّ القاعدة عملت.
              */}
              <div className="mt-5 rounded-lg border border-line bg-bg p-4">
                <span className="mb-3 block text-2xs font-bold opacity-65">
                  المعاينة بمثال — {sample.note}
                </span>
                <PreviewLine label="العنوان" text={renderSeo(draft.titleAr, sample.values)} />
                <PreviewLine label="الوصف والمقدمة" text={renderSeo(draft.introAr, sample.values)} />
                <PreviewLine label="الخاتمة" text={renderSeo(draft.outroAr, sample.values)} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-2.5 text-2xs">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => set({ active: e.target.checked })}
                    disabled={!canEdit}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  يعمل — وإطفاؤه يعيد الصفحة إلى نصها المدمج
                </label>
                {!canEdit ? null : (
                  <Button size="sm" disabled={busy === row.key} onClick={() => void save(row.key)}>
                    احفظ
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </>
  );
}

/** سطرُ معاينة — **والمحذوفُ يُقال محذوفًا** لا يُترك فراغًا. */
function PreviewLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="mb-2.5 flex flex-wrap gap-2 text-sm leading-loose last:mb-0">
      <span className="shrink-0 text-2xs font-semibold opacity-65">{label}</span>
      {text === '' ? (
        <span className="text-2xs opacity-65">— لا تظهر: الفقرة فارغة أو ينقصها متغير</span>
      ) : (
        <span className="min-w-0">{text}</span>
      )}
    </p>
  );
}
