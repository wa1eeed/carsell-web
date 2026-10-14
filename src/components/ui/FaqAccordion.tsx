'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export type FaqRow = { id: string; question: string; answer: string };

/**
 * الأسئلة الشائعة — **واحد مفتوح فقط** (قرار ٣١).
 *
 * فتحُ سؤال يغلق الآخر: القارئ يقارن جوابًا واحدًا في كل مرّة، وأعمدة
 * تنفتح كلها تُطيل الصفحة وتُفقد الترتيب.
 *
 * `<details>` أصلي: يفتح بلا JS ويُقرأ في HTML المُقدَّم — وهذا شرط
 * `FAQPage` في JSON-LD، إذ يجب أن يكون الجواب في المصدر لا في تفاعل.
 *
 * ═══ والمفتوحُ يُشتقّ من القائمة لا يُنسخ منها مرّة ═══
 *
 * كان `useState(rows[0]?.id)` — يُقرأ عند التركيب وحده. وصفحة المساعدة
 * تبدّل المواضيع بالتنقّل داخل التطبيق **بلا إعادة تركيب**، فيبقى
 * المعرّف القديم ولا يطابق صفًّا في القائمة الجديدة: **فلا سؤال مفتوح
 * بعد أوّل نقرة على موضوع** — والتصميم يفتح الأوّل. قِيس بالنقر.
 *
 * فالاختيار يُحفظ **مختومًا بالقائمة التي وقع فيها**، ويسقط إلى
 * الافتراضيّ حين تتبدّل. وهو علاج البوابة ٣٠ نفسه: الهوية مع القيمة.
 */
export function FaqAccordion({
  rows,
  columns = 1,
  className,
  openId,
  baseHref,
}: {
  rows: readonly FaqRow[];
  columns?: 1 | 2;
  className?: string;
  /**
   * السؤال المفتوح ابتداءً — يصل من العنوان (`?a=`) فيُصيَّر مفتوحًا
   * **في الخادم**. ورابطٌ يُشارَك يجب أن يُظهر جوابه لمن يفتحه بلا JS
   * ولمن يقرأ المصدر — ولا يفعل ذلك تمريرٌ عبر `location.hash`.
   */
  openId?: string | undefined;
  /**
   * أصلُ رابط المشاركة — نصّ لا دالّة: الدالّة لا تعبر حدّ الخادم
   * (البوابة ٢٢)، وتمريرُها من مكوّن خادم يردّ ٥٠٠ كاملة.
   */
  baseHref?: string | undefined;
}) {
  /** مفتاحُ القائمة — تبدّلُه يُسقط اختيارًا لم يعد له صفّ. */
  const key = rows.map((row) => row.id).join('|');
  const [picked, setPicked] = useState<{ key: string; id: string | null } | null>(null);

  const fallback = openId !== undefined && rows.some((row) => row.id === openId)
    ? openId
    : (rows[0]?.id ?? null);
  const open = picked !== null && picked.key === key ? picked.id : fallback;

  const [copied, setCopied] = useState<string | null>(null);

  const share = (id: string): void => {
    if (baseHref === undefined) return;
    const url = `${window.location.origin}${baseHref}${baseHref.includes('?') ? '&' : '?'}a=${encodeURIComponent(id)}#q-${encodeURIComponent(id)}`;
    /** **والفشل يُقال لا يُبتلع**: متصفّحٌ يمنع الحافظة ليس عطلًا فينا. */
    navigator.clipboard.writeText(url).then(
      () => setCopied(id),
      () => setCopied(`fail:${id}`),
    );
  };

  return (
    <div
      className={cn(
        'grid gap-x-14',
        columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {rows.map((row) => (
        <details
          key={row.id}
          id={`q-${row.id}`}
          open={open === row.id}
          onToggle={(event) => {
            if (event.currentTarget.open) setPicked({ key, id: row.id });
            else if (open === row.id) setPicked({ key, id: null });
          }}
          className="scroll-mt-24 border-b border-line-2"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3.5 py-4 text-base font-bold [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{row.question}</span>
            <svg
              viewBox="0 0 24 24"
              className={cn(
                'size-3.5 shrink-0 opacity-45 transition-transform',
                open === row.id && 'rotate-180',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="pb-4.5">
            <p className="max-w-2xl text-sm leading-loose opacity-70">{row.answer}</p>
            {/*
              ═══ ورابطٌ لكل جواب ═══

              من يسأل الدعم يُجاب برابطٍ يفتح الجواب نفسه، لا بصفحةٍ
              يبحث فيها. والرابط يحمل `?a=` فيُصيَّر مفتوحًا في الخادم،
              و`#q-` فيقف عليه المتصفّح.
            */}
            {baseHref === undefined ? null : (
              <button
                type="button"
                onClick={() => share(row.id)}
                className="mt-3 inline-flex items-center gap-1.5 text-3xs opacity-45 transition-opacity hover:opacity-90"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                </svg>
                {copied === row.id
                  ? 'نُسخ الرابط'
                  : copied === `fail:${row.id}`
                    ? 'تعذّر النسخ — انسخه من شريط العنوان'
                    : 'انسخ رابط الجواب'}
              </button>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
