'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Toast } from '@/components/ui/Toast';

export type BodyTypeRow = {
  key: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  sort: number;
  visible: boolean;
  listingCount: number;
};

/**
 * تحرير أنواع الهياكل.
 *
 * **العدّاد يقول ما لا يقوله الظهور**: نوع ظاهر بلا إعلان منشور لا
 * يصل إلى الرئيسية، فيراه المحرّر هنا ولا يبحث عنه هناك.
 */
export function BodyTypesTable({
  bodyTypes,
  canEdit,
  canUpload,
  uploadsReady,
}: {
  bodyTypes: readonly BodyTypeRow[];
  canEdit: boolean;
  canUpload: boolean;
  uploadsReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<BodyTypeRow>>>({});

  const patch = (key: string, body: Partial<BodyTypeRow>): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/body-types/${key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setToast('تعذّر الحفظ — تحقّق من الحقول.');
        return;
      }
      setDraft((current) => ({ ...current, [key]: {} }));
      setToast('حُفظ.');
      router.refresh();
    });
  };

  const field = (row: BodyTypeRow, name: 'nameAr' | 'nameEn'): string =>
    (draft[row.key]?.[name] as string | undefined) ?? row[name];

  return (
    <>
      <DataTable
        rows={bodyTypes}
        rowKey={(row) => row.key}
        columns={[
          { id: 'key', header: 'المفتاح', cell: (row) => <span className="font-num text-2xs opacity-60">{row.key}</span> },
          {
            id: 'nameAr',
            header: 'الاسم العربي',
            cell: (row) =>
              canEdit ? (
                <input
                  value={field(row, 'nameAr')}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [row.key]: { ...current[row.key], nameAr: event.target.value },
                    }))
                  }
                  className="w-32 rounded-sm border border-line bg-bg px-2 py-1 text-sm outline-none"
                />
              ) : (
                row.nameAr
              ),
          },
          {
            id: 'nameEn',
            header: 'الاسم الإنجليزي',
            cell: (row) =>
              canEdit ? (
                <input
                  value={field(row, 'nameEn')}
                  dir="ltr"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [row.key]: { ...current[row.key], nameEn: event.target.value },
                    }))
                  }
                  className="w-32 rounded-sm border border-line bg-bg px-2 py-1 text-sm outline-none"
                />
              ) : (
                row.nameEn
              ),
          },
          {
            id: 'image',
            header: 'الصورة',
            cell: (row) =>
              row.imageUrl === null ? (
                <Badge tone={uploadsReady && canUpload ? 'neutral' : 'warn'}>
                  {uploadsReady ? 'بلا صورة' : 'الرفع غير مهيّأ'}
                </Badge>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- معاينة إدارية صغيرة من R2
                <img src={row.imageUrl} alt="" width={48} height={24} className="h-6" />
              ),
          },
          {
            id: 'count',
            header: 'إعلانات منشورة',
            numeric: true,
            sortable: true,
            cell: (row) => <ArabicNumber value={row.listingCount} />,
          },
          {
            id: 'sort',
            header: 'الترتيب',
            numeric: true,
            sortable: true,
            cell: (row) => <ArabicNumber value={row.sort} grouped={false} />,
          },
          {
            id: 'visible',
            header: 'الظهور',
            cell: (row) => (
              <Badge tone={row.visible ? 'accent' : 'neutral'}>
                {row.visible ? 'ظاهر' : 'مخفي'}
              </Badge>
            ),
          },
          {
            id: 'actions',
            header: '',
            cell: (row) =>
              !canEdit ? null : (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      patch(row.key, {
                        nameAr: field(row, 'nameAr'),
                        nameEn: field(row, 'nameEn'),
                      })
                    }
                  >
                    حفظ
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => patch(row.key, { visible: !row.visible })}
                  >
                    {row.visible ? 'إخفاء' : 'إظهار'}
                  </Button>
                </span>
              ),
          },
        ]}
      />

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
