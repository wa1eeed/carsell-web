'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';

/**
 * صفُّ بحثٍ محفوظ.
 *
 * ═══ و«الجديد» يُختم عند الفتح لا عند العرض ═══
 *
 * لو خُتم عند عرض القائمة لاختفى العدد الذي جاء صاحبه لأجله قبل أن
 * يقرأه: يفتح الصفحة فيرى «٣ جديدة»، ويعود فيجد صفرًا ولم يفتح شيئًا.
 * فالختم يقع **مع النقر** على الرابط، وسبقُه بالتصفّح مقصود: من نقر
 * فقد رأى.
 */
export function SavedSearchRow({
  row,
  locale,
}: {
  row: { id: string; name: string | null; query: string; notify: boolean; fresh: number; summary: string[] };
  locale: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [notify, setNotify] = useState(row.notify);
  const [gone, setGone] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const patch = (body: Record<string, boolean>): void => {
    void fetch(`/api/v1/me/searches/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
  };

  const remove = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/me/searches/${row.id}`, { method: 'DELETE' }).catch(
        () => null,
      );
      if (response === null || !response.ok) {
        setToast('تعذّر الحذف.');
        return;
      }
      setGone(true);
      router.refresh();
    });
  };

  if (gone) return null;

  const href = `/${locale}/cars${row.query === '' ? '' : `?${row.query}`}`;

  const named = row.name !== null && row.name !== '';
  const title = named ? row.name : (row.summary[0] ?? 'بحث محفوظ');
  const detail = named ? row.summary : row.summary.slice(1);

  return (
    <>
      <article className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Link
            href={href}
            onClick={() => patch({ seen: true })}
            className="group min-w-0 flex-1"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold underline-offset-4 group-hover:underline">
                {title}
              </h2>
              {/*
                **والعدد داخل الشارة لا في الجملة** — فلا يحكم المعدودُ
                صيغةَ الجمع. و«٠ جديد» لا تُعرض أصلًا: لا خبر خبرٌ.
              */}
              {row.fresh === 0 ? null : (
                <Badge tone="accent">{toArabicDigits(String(row.fresh))} جديدة</Badge>
              )}
            </div>
            {/*
              **والعنوان لا يُعاد في سطره.** كان العنوان «نيسان»
              والسطر تحته «نيسان · مستعملة · حتى ١٠٠٬٠٠٠» — فأوّل
              كلمةٍ يقرؤها صاحبه مرّتين. فما صار عنوانًا يُطرح من
              التفصيل، وبحثٌ سمّاه صاحبه يعرض تفصيله كاملًا.
            */}
            {detail.length === 0 ? null : (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs opacity-55">
                {detail.map((part, at) => (
                  <span key={part} className="bidi-isolate">
                    {at === 0 ? '' : '· '}
                    {part}
                  </span>
                ))}
              </p>
            )}
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            {/*
              جرسٌ يُطفأ ولا يُحذف البحث — **فمن أراد الصمت لا يفقد
              بحثه**، ومن حذف البحث لم يكن يريد صمتًا بل انتهى منه.
            */}
            <button
              type="button"
              aria-pressed={notify}
              onClick={() => {
                setNotify(!notify);
                patch({ notify: !notify });
              }}
              className="rounded-md border border-line px-2.5 py-1.5 text-3xs font-semibold"
            >
              {notify ? 'التنبيه مفعّل' : 'التنبيه مُطفأ'}
            </button>
            <button
              type="button"
              onClick={remove}
              className="text-3xs opacity-50 underline underline-offset-4 hover:opacity-80"
            >
              احذف
            </button>
          </div>
        </div>
      </article>
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
