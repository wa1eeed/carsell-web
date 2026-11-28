'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

type Row = {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  region: string;
  sort: number;
  visible: boolean;
  listings: number;
};

type Draft = Omit<Row, 'listings' | 'id'> & { id?: string };

const EMPTY: Draft = { nameAr: '', nameEn: '', slug: '', region: '', sort: 0, visible: true };

/**
 * ═══ المدن — قائمةٌ يُديرها المشغّل ═══
 *
 * **والاسمُ العربيّ هو المفتاح**: `Vehicle.city` يخزّنه نصًّا، فتغييرُه
 * بعد أن كُتب في إعلانات **يفصلها عن مدينتها** — تبقى معروضةً ولا
 * يصلها مرشّح. ولذلك يُقال عددُ الإعلانات بجواره.
 */
export function CitiesTable({ rows, mayWrite }: { rows: readonly Row[]; mayWrite: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (method: 'POST' | 'DELETE', payload: object, done: string): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/cities', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);

      const data = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(data?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }
      setDraft(null);
      setToast(done);
      router.refresh();
    });
  };

  const field = 'rounded-md border border-line bg-bg px-3 py-2 text-sm';

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      {!mayWrite ? null : (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
            أضف مدينة
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-180 border-collapse text-start">
          <thead>
            <tr className="border-b border-line bg-surface text-3xs opacity-70">
              <th scope="col" className="px-5 py-3 text-start font-bold">المدينة</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">بالإنجليزية</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">المقطع</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">المنطقة</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">إعلانات</th>
              <th scope="col" className="px-5 py-3 text-start font-bold">الحال</th>
              {!mayWrite ? null : <th scope="col" className="px-5 py-3 text-start font-bold" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line-2 last:border-b-0">
                <td className="px-5 py-3 text-2xs font-semibold">{row.nameAr}</td>
                <td dir="ltr" className="px-5 py-3 text-start text-2xs opacity-75">{row.nameEn}</td>
                <td dir="ltr" className="px-5 py-3 text-start font-num text-3xs opacity-75">{row.slug}</td>
                <td className="px-5 py-3 text-2xs opacity-75">{row.region}</td>
                <td className="px-5 py-3 font-num text-2xs">
                  <ArabicNumber value={row.listings} />
                </td>
                <td className="px-5 py-3">
                  {row.visible ? <Badge tone="accent">معروضة</Badge> : <Badge>مخفية</Badge>}
                </td>
                {!mayWrite ? null : (
                  <td className="px-5 py-3">
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...row })}
                        className="text-3xs font-bold hover:underline"
                      >
                        عدل
                      </button>
                      {/*
                        **ومدينةٌ عليها إعلانات لا يُعرض حذفُها**: الخادمُ
                        يردّه، وزرٌّ يُعرض ليُردّ يجعل صاحبَه يحاول مرّة
                        بعد مرّة.
                      */}
                      {row.listings > 0 ? null : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => send('DELETE', { id: row.id }, 'حذفت المدينة.')}
                          className="text-3xs font-bold text-danger hover:underline"
                        >
                          احذف
                        </button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === undefined ? 'مدينة جديدة' : 'تعديل مدينة'}
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs font-bold opacity-70">الاسم بالعربية</span>
              <input
                value={draft.nameAr}
                onChange={(event) => setDraft({ ...draft, nameAr: event.target.value })}
                className={field}
              />
            </label>
            {draft.id === undefined ? null : (
              <p className="rounded-lg border border-warn-200 bg-warn-100 p-3 text-3xs leading-loose text-warn-900">
                الاسم العربي هو ما يخزن في كل إعلان — وتغييره يفصل إعلانات هذه المدينة عن
                مرشحها: تبقى معروضة ولا يصلها أحد.
              </p>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs font-bold opacity-70">الاسم بالإنجليزية</span>
              <input
                dir="ltr"
                value={draft.nameEn}
                onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs font-bold opacity-70">المقطع — عنوان صفحتها</span>
              <input
                dir="ltr"
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                className={`${field} font-num`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-3xs font-bold opacity-70">المنطقة</span>
              <input
                value={draft.region}
                onChange={(event) => setDraft({ ...draft, region: event.target.value })}
                className={field}
              />
            </label>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={draft.visible}
                onChange={(event) => setDraft({ ...draft, visible: event.target.checked })}
              />
              <span className="text-2xs">معروضة في المرشحات وفي معالج البيع</span>
            </label>

            <Button
              className="mt-2"
              disabled={pending || draft.nameAr.trim() === '' || draft.slug.trim() === ''}
              onClick={() => send('POST', draft, 'حفظت المدينة.')}
            >
              {pending ? 'يحفظ…' : 'احفظ'}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
