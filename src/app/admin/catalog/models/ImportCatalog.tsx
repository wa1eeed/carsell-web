'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { ROW_PROBLEM_LABEL } from '@/lib/labels/admin';
import type { ImportPreview, ImportResult } from '@/lib/domain/catalog-import';

/**
 * ═══ استيراد الكتالوج — معاينةٌ ثمّ كتابة ═══
 *
 * الترميز يضع «استيراد CSV» في الترويسة. والكتالوج ٣٠٣ طرازًا و٣٦٠
 * فئة تُضاف صفًّا صفًّا، فطرحُ ماركةٍ بثلاثين طرازًا عملُ يومٍ بالفأرة.
 *
 * **ولا كتابةَ قبل معاينة.** الفئةُ تُملأ منها مواصفاتُ كلّ إعلانٍ
 * يُنشر، فملفٌّ يُكتب على عماه يُدخل ثلاثَ مئة صفٍّ لا يعرف أحدٌ ما
 * فيها. والمعاينةُ تقول — بمفردات `D3` نفسِها — كم صفًّا قُرئ، وكم
 * جديدٌ، وكم موجود، وأيُّ عمودٍ تُجوهل، وأيُّ صفٍّ رُفض ولماذا.
 */
export function ImportCatalog() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const pick = (file: File | undefined): void => {
    if (file === undefined) return;
    setPending(true);
    void file
      .text()
      .then(async (text) => {
        setCsv(text);
        setName(file.name);
        const response = await fetch('/api/v1/admin/catalog/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ csv: text, mode: 'preview' }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { data?: ImportPreview; error?: { messageAr?: string } }
          | null;
        if (!response.ok || payload?.data === undefined) {
          setToast(payload?.error?.messageAr ?? 'تعذرت قراءة الملف.');
          return;
        }
        setPreview(payload.data);
        setOpen(true);
      })
      .catch(() => setToast('تعذرت قراءة الملف.'))
      .finally(() => setPending(false));
  };

  const commit = (): void => {
    setPending(true);
    void fetch('/api/v1/admin/catalog/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv, mode: 'commit' }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { data?: ImportResult; error?: { messageAr?: string } }
          | null;
        if (!response.ok || payload?.data === undefined) {
          setToast(payload?.error?.messageAr ?? 'تعذر الاستيراد.');
          return;
        }
        const { createdModels, createdTrims } = payload.data;
        setToast(`أضيف: الطرازات ${String(createdModels)} · الفئات ${String(createdTrims)}`);
        setOpen(false);
        setPreview(null);
        router.refresh();
      })
      .catch(() => setToast('تعذر الاستيراد.'))
      .finally(() => setPending(false));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {/*
          **والقالب يُنزّل قبل أن يُملأ.** ملفٌّ يُكتب بالتخمين يُرفض
          نصفُه، والرسالة تقول «عمود مجهول» عن عمودٍ ظنّه المشغّل صحيحًا.
        */}
        {/*
          **وتنزيلُ ملفٍّ ليس تنقّلًا بين صفحات.** `<Link>` يجلب الوجهة
          مسبقًا ويُصيّرها في العميل، وهذه استجابةُ `text/csv` بترويسة
          `attachment` — فالعنصرُ الصحيح `<a download>`. والقاعدة تقرأ
          المسار حرفيًّا فتحسبه صفحة.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- تنزيل ملفّ لا تنقّل */}
        <a
          href="/api/v1/admin/catalog/import"
          download
          className="rounded-btn border border-line px-3.5 py-2.25 text-3xs font-bold hover:border-ink"
        >
          نزل القالب
        </a>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? 'جاري…' : 'استيراد CSV'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            // **ويُفرَّغ** — وإلّا لم يُطلق اختيارُ الملفّ نفسِه حدثًا ثانيًا
            event.target.value = '';
          }}
        />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="ما سيقع قبل أن يقع">
        {preview === null ? null : (
          <>
            <p className="mb-4 text-3xs opacity-70" dir="ltr">
              {name}
            </p>

            <dl className="mb-4 grid grid-cols-2 gap-3 border-b border-line pb-4 text-2xs">
              <Line label="صفوف الملف" value={preview.rows} />
              <Line label="طرازات جديدة" value={preview.newModels} />
              <Line label="فئات جديدة" value={preview.newTrims} />
              <Line label="مكررة (موجودة)" value={preview.existing} />
            </dl>

            <p className="mb-2 text-3xs opacity-70">
              مطابقة الأعمدة: <span dir="ltr">{preview.matched.join(' · ')}</span>
            </p>
            {preview.ignored.length === 0 ? null : (
              <p className="mb-2 text-3xs opacity-70">
                {/* **والمتجاهَل يُقال** — عمودٌ يُبتلع صامتًا يجعل المشغّل يحسبه وصل. */}
                تتجاهل: <span dir="ltr">{preview.ignored.join(' · ')}</span>
              </p>
            )}

            {preview.rejected.length === 0 ? null : (
              <div className="mb-4 max-h-44 overflow-y-auto rounded-md border border-line p-3">
                <p className="mb-2 text-3xs font-bold">
                  صفوف مرفوضة <ArabicNumber value={preview.rejected.length} />
                </p>
                <ul className="flex flex-col gap-1.5 text-3xs">
                  {preview.rejected.slice(0, 40).map((row) => (
                    <li key={`${String(row.line)}-${row.column ?? ''}`} className="flex gap-2">
                      <span className="font-num opacity-65" dir="ltr">
                        {row.line}
                      </span>
                      <span className="flex-1">{ROW_PROBLEM_LABEL[row.problem]}</span>
                      <span className="truncate opacity-65" dir="ltr">
                        {row.column ?? ''} {row.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-75">
              <b>لا يحدث الموجود ولا يحذف.</b> ينشأ الناقص وحده، والمكرر يترك كما هو — فملف
              واحد لا يبدل مواصفات طراز منشور عليه.
            </p>

            <Button
              className="w-full"
              disabled={pending || preview.newModels + preview.newTrims === 0}
              onClick={commit}
            >
              {pending ? 'جاري…' : 'أضف الناقص'}
            </Button>
            {preview.newModels + preview.newTrims > 0 ? null : (
              <p className="mt-2 text-center text-3xs opacity-70">لا جديد في هذا الملف.</p>
            )}
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="opacity-70">{label}</dt>
      <dd className="font-bold">
        <ArabicNumber value={value} />
      </dd>
    </div>
  );
}
