'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Counted } from '@/components/ui/Counted';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import type { ImportPreview, ImportResult } from '@/lib/domain/dealer-import';
import { IMPORT_COLUMN_AR, IMPORT_SEVERITY_AR, importNoteAr } from '@/lib/labels/dealer';

const TONE = {
  ERROR: 'danger',
  WARNING: 'warn',
  INFO: 'neutral',
} as const;



/**
 * **والمعاينةُ تسبق الكتابة بالقارئ نفسِه** — فما عُرض هو ما يقع.
 *
 * **والمتجاهَلُ يُقال**: عمودٌ في الملفّ لا نقرؤه يُبتلع صامتًا،
 * فيحسب المشغّل أنّ ما كتبه فيه وصل.
 */
export function ImportPanel({ templateHref }: { templateHref: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (apply: boolean): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, apply }),
      }).catch(() => null);

      const data = (await response?.json().catch(() => null)) as
        | { data?: unknown; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(data?.error?.messageAr ?? 'تعذر قراءة الملف.');
        return;
      }

      if (apply) {
        setResult(data?.data as ImportResult);
        setPreview(null);
        router.refresh();
      } else {
        setPreview(data?.data as ImportPreview);
        setResult(null);
      }
    });
  };

  const read = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <section className="mb-6 rounded-xl border border-line p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="file"
            className="cursor-pointer rounded-lg border border-line px-4 py-2.5 text-2xs font-bold hover:border-ink"
          >
            اختر ملف CSV
          </label>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) read(file);
            }}
          />
          <a
            href={templateHref}
            className="text-2xs font-bold hover:underline"
          >
            نزل القالب
          </a>
          <span className="flex-1" />
          <Button size="sm" disabled={pending || text === ''} onClick={() => send(false)}>
            {pending ? 'يقرأ…' : 'اعرض التقرير'}
          </Button>
        </div>
      </section>

      {preview === null ? null : preview.missingColumn !== null ? (
        <p className="rounded-xl border border-danger/40 bg-danger/6 p-5 text-2xs leading-loose">
          {/*
            **والعمودُ الناقص يُسمّى.** «ملف غير صالح» تجعل من رفعه
            يفتحه يبحث عمّا لا يعرفه.
          */}
          عمود «{IMPORT_COLUMN_AR[preview.missingColumn]}» غير موجود في الملف — ولا يقرأ الملف بدونه.
        </p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'صفوف الملف', value: preview.totals.lines },
              { label: 'جاهزة للاستيراد', value: preview.totals.ready },
              { label: 'تحتاج مراجعة', value: preview.totals.needsReview },
              { label: 'موجودة — ستحدث', value: preview.totals.duplicates },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-line p-4">
                <p className="text-3xs opacity-70">{card.label}</p>
                <p className="mt-1.5 font-num text-xl font-bold">
                  <ArabicNumber value={card.value} />
                </p>
              </div>
            ))}
          </div>

          {preview.ignoredColumns.length === 0 ? null : (
            <p className="mb-5 rounded-xl border border-line bg-surface p-4 text-2xs leading-loose opacity-75">
              أعمدة في ملفك لا تقرأ ولا تمنع الاستيراد:{' '}
              <span dir="ltr" className="font-num">{preview.ignoredColumns.join(' · ')}</span>
            </p>
          )}

          {preview.rows.filter((row) => row.severity !== null).length === 0 ? (
            <p className="mb-5 rounded-xl border border-accent-700/40 bg-accent-100 p-4 text-2xs">
              كل الصفوف سليمة.
            </p>
          ) : (
            <div className="mb-5 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-start">
                <thead>
                  <tr className="border-b border-line bg-surface text-3xs opacity-70">
                    <th scope="col" className="px-5 py-3 text-start font-bold">السطر</th>
                    <th scope="col" className="px-5 py-3 text-start font-bold">الرقم التسلسلي</th>
                    <th scope="col" className="px-5 py-3 text-start font-bold">الحال</th>
                    <th scope="col" className="px-5 py-3 text-start font-bold">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((row) => row.severity !== null)
                    .map((row) => (
                      <tr key={row.line} className="border-b border-line-2 last:border-b-0">
                        <td className="px-5 py-3 font-num text-2xs">
                          <ArabicNumber value={row.line} grouped={false} />
                        </td>
                        <td dir="ltr" className="px-5 py-3 text-start font-num text-3xs">{row.vin}</td>
                        <td className="px-5 py-3">
                          <Badge tone={TONE[row.severity ?? 'INFO']} size="sm">
                            {IMPORT_SEVERITY_AR[row.severity ?? 'INFO']}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-2xs">{row.note === null ? '' : importNoteAr(row.note)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <Button disabled={pending || preview.totals.ready === 0} onClick={() => send(true)}>
            {pending ? 'يستورد…' : 'استورد الصفوف السليمة'}
          </Button>
        </>
      )}

      {result === null ? null : (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-3xs font-bold tracking-wide opacity-70">نتيجة الاستيراد</h2>
          {/*
            **والفعلُ يحكمه العدد**: «أضيفت ١» و«أضيفت ٣» و«أضيفت ١١»
            ثلاثُ صيغ، ونصٌّ مكتوبٌ بيد يصيب واحدة. (البوابة ١٨.)
          */}
          <p className="flex flex-wrap items-center gap-2 text-2xs leading-loose">
            <Counted message="importCreated" count={result.created} />
            <span aria-hidden className="opacity-65">·</span>
            <Counted message="importUpdated" count={result.updated} />
            <span aria-hidden className="opacity-65">·</span>
            <Counted message="importSkipped" count={result.skipped.length} />
          </p>
          {result.skipped.length === 0 ? null : (
            <ul className="mt-3">
              {result.skipped.map((row) => (
                <li key={row.line} className="border-b border-line-2 py-2 text-3xs last:border-b-0">
                  السطر <ArabicNumber value={row.line} grouped={false} /> ·{' '}
                  <span dir="ltr" className="font-num">{row.vin}</span> — {importNoteAr(row.note)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
