'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import type { BrandRow } from '@/lib/domain/catalog';
import { cn } from '@/lib/cn';

type Draft = { id?: string; nameAr: string; nameEn: string; slug: string; logoUrl: string | null };

const EMPTY: Draft = { nameAr: '', nameEn: '', slug: '', logoUrl: null };

/** الشعار، أو الحرف الأول حتى يُرفع — قاعدة A12. */
function Logo({ brand }: { brand: BrandRow }) {
  if (brand.logoUrl !== null && brand.logoUrl !== '') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt="" className="size-8 rounded-sm object-contain" />;
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-sm border border-dashed border-line text-md font-bold opacity-45">
      {brand.nameAr.charAt(0)}
    </span>
  );
}

export function BrandsTable({
  brands,
  canEdit,
  canUploadLogo,
  uploadsReady,
}: {
  brands: readonly BrandRow[];
  canEdit: boolean;
  canUploadLogo: boolean;
  uploadsReady: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    setErrors({});
    try {
      const response = await fetch(`/api/v1/admin/brands${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await response.json()) as {
        error?: { messageAr: string; fields?: Record<string, string> };
      };
      if (json.error !== undefined) {
        setErrors(json.error.fields ?? {});
        setToast({ tone: 'error', text: json.error.messageAr });
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File): Promise<string | null> {
    const signed = await fetch('/api/v1/admin/uploads/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'brand-logo',
        contentType: file.type,
        contentLength: file.size,
        fileName: file.name,
      }),
    });
    const json = (await signed.json()) as {
      data?: { uploadUrl: string; publicUrl: string };
      error?: { messageAr: string };
    };
    if (json.data === undefined) {
      setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذّر الرفع.' });
      return null;
    }
    // الملف يذهب إلى R2 مباشرةً — لا يمرّ بخادم Next
    await fetch(json.data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    return json.data.publicUrl;
  }

  const columns: readonly Column<BrandRow>[] = [
    { id: 'logo', header: 'الشعار', cell: (b) => <Logo brand={b} /> },
    {
      id: 'nameAr',
      header: 'الاسم العربي',
      sortable: true,
      cell: (b) => <span className="font-semibold">{b.nameAr}</span>,
    },
    {
      id: 'nameEn',
      header: 'الاسم الإنجليزي',
      cell: (b) => <span className="bidi-ltr font-body-en">{b.nameEn}</span>,
    },
    {
      id: 'models',
      header: 'الطرازات',
      numeric: true,
      sortable: true,
      cell: (b) => <ArabicNumber value={b.modelCount} />,
    },
    {
      id: 'listings',
      header: 'الإعلانات',
      numeric: true,
      sortable: true,
      cell: (b) => <ArabicNumber value={b.listingCount} />,
    },
    {
      id: 'status',
      header: 'الحالة',
      cell: (b) => (
        <Badge tone={b.visible ? 'accent' : 'neutral'}>
          {b.visible ? 'ظاهر' : 'مخفي'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (b) =>
        canEdit ? (
          <span className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft({ id: b.id, nameAr: b.nameAr, nameEn: b.nameEn, slug: b.slug, logoUrl: b.logoUrl })
              }
            >
              تعديل
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void send(`/${b.id}`, 'PATCH', { visible: !b.visible })}
            >
              {b.visible ? 'إخفاء' : 'إظهار'}
            </Button>
          </span>
        ) : null,
    },
  ];

  const field =
    'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex-1" />
        {/* استيراد CSV في ترميز A12 وخارج نطاق المهمة ٧ */}
        <Button variant="outline" disabled title="قريبًا — خارج نطاق هذه المهمة">
          استيراد CSV
        </Button>
        {canEdit ? (
          <Button onClick={() => setDraft({ ...EMPTY })}>أضف ماركة</Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={brands}
        rowKey={(b) => b.id}
        empty={{ title: 'لا ماركات بعد', description: 'ابدأ بإضافة أول ماركة.' }}
      />

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === undefined ? 'ماركة جديدة' : 'تعديل الماركة'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (draft === null) return;
                const done =
                  draft.id === undefined
                    ? await send('', 'POST', draft)
                    : await send(`/${draft.id}`, 'PATCH', draft);
                if (done) {
                  setDraft(null);
                  setToast({ tone: 'success', text: 'حُفظت الماركة.' });
                }
              }}
            >
              احفظ
            </Button>
          </>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-55">
                الاسم العربي — إلزامي
              </span>
              <input
                value={draft.nameAr}
                onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                className={cn(field, errors.nameAr !== undefined && 'border-danger')}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-55">
                الاسم الإنجليزي — إلزامي
              </span>
              <input
                dir="ltr"
                value={draft.nameEn}
                onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.nameEn !== undefined && 'border-danger')}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold opacity-55">
                المعرّف في الرابط
              </span>
              <input
                dir="ltr"
                placeholder="toyota"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.slug !== undefined && 'border-danger')}
              />
            </label>

            {canUploadLogo ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-semibold opacity-55">
                  الشعار — PNG أو SVG بخلفية شفافة
                </span>
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  disabled={!uploadsReady}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file === undefined) return;
                    const url = await uploadLogo(file);
                    if (url !== null) setDraft({ ...draft, logoUrl: url });
                  }}
                  className={cn(field, 'text-xs')}
                />
                {uploadsReady ? null : (
                  <span className="text-3xs text-warn-700">
                    تخزين الوسائط غير مضبوط في هذه البيئة — احفظ الماركة بلا شعار.
                  </span>
                )}
              </label>
            ) : null}
          </div>
        )}
      </Modal>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </div>
  );
}
