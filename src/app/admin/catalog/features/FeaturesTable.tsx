'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { Toast } from '@/components/ui/Toast';
import type { FeatureRow } from '@/lib/domain/catalog';
import { cn } from '@/lib/cn';

const GROUP = { SAFETY: 'الأمان', COMFORT: 'الراحة', TECH: 'التقنية' } as const;

/** المواضع الأربعة المستقلة، وكل واحد يقرأه سطح مختلف. */
const PLACEMENTS = [
  ['trim_editor', 'قائمة مميّزات الفئة — A14'],
  ['search_filter', 'فلتر البحث — Wb'],
  ['listing_page', 'صفحة السيارة — Wc'],
  ['card_badge', 'شارة مميّزة على البطاقة'],
] as const;

type Draft = {
  key: string;
  isNew: boolean;
  nameAr: string;
  nameEn: string;
  group: keyof typeof GROUP;
  active: boolean;
  placements: string[];
};

export function FeaturesTable({
  features,
  canEdit,
}: {
  features: readonly FeatureRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'ALL' | keyof typeof GROUP>('ALL');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return features.filter(
      (f) =>
        (tab === 'ALL' || f.group === tab) &&
        (needle === '' ||
          f.key.includes(needle) ||
          f.nameAr.includes(query.trim()) ||
          f.nameEn.toLowerCase().includes(needle)),
    );
  }, [features, tab, query]);

  async function send(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true);
    setErrors({});
    try {
      const response = await fetch(`/api/v1/admin/features${path}`, {
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

  const columns: readonly Column<FeatureRow>[] = [
    { id: 'nameAr', header: 'الاسم العربي', cell: (f) => <span className="font-semibold">{f.nameAr}</span> },
    { id: 'nameEn', header: 'الاسم الإنجليزي', cell: (f) => <span className="bidi-ltr font-body-en">{f.nameEn}</span> },
    { id: 'key', header: 'المفتاح', cell: (f) => <span className="bidi-ltr font-num text-xs opacity-60">{f.key}</span> },
    { id: 'trims', header: 'الفئات', numeric: true, sortable: true, cell: (f) => <ArabicNumber value={f.trimCount} /> },
    { id: 'listings', header: 'الإعلانات', numeric: true, cell: (f) => <ArabicNumber value={f.listingCount} /> },
    {
      id: 'active',
      header: 'ظاهرة',
      cell: (f) => <Badge tone={f.active ? 'accent' : 'neutral'}>{f.active ? 'ظاهرة' : 'مخفية'}</Badge>,
    },
    {
      id: 'actions',
      header: '',
      cell: (f) =>
        canEdit ? (
          <span className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft({
                  key: f.key, isNew: false, nameAr: f.nameAr, nameEn: f.nameEn,
                  group: f.group, active: f.active, placements: [...f.placements],
                })
              }
            >
              تعديل
            </Button>
          </span>
        ) : null,
    },
  ];

  const field =
    'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-55';

  const orphan = draft !== null && !draft.isNew
    ? (features.find((f) => f.key === draft.key)?.trimCount ?? 0) === 0
    : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          items={[
            { id: 'ALL', label: 'الكل', count: features.length },
            ...(Object.entries(GROUP) as [keyof typeof GROUP, string][]).map(([id, l]) => ({
              id,
              label: l,
              count: features.filter((f) => f.group === id).length,
            })),
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'ALL' | keyof typeof GROUP)}
          className="flex-1"
        />
        <input
          placeholder="ابحث بالاسم أو المفتاح"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(field, 'w-56 text-sm')}
        />
        {canEdit ? (
          <Button
            onClick={() =>
              setDraft({
                key: '', isNew: true, nameAr: '', nameEn: '',
                group: 'SAFETY', active: true,
                placements: ['trim_editor', 'listing_page'],
              })
            }
          >
            أضف ميزة
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(f) => f.key}
        empty={{ title: 'لا مميّزات مطابقة', description: 'جرّب مجموعة أخرى أو امسح البحث.' }}
      />

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.isNew === true ? 'ميزة جديدة' : 'محرّر الميزة'}
        footer={
          <>
            {draft !== null && !draft.isNew && orphan ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (await send(`/${draft.key}`, 'DELETE')) {
                    setDraft(null);
                    setToast({ tone: 'success', text: 'حُذفت الميزة.' });
                  }
                }}
              >
                احذف
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setDraft(null)}>إلغاء</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (draft === null) return;
                const { key, isNew, ...rest } = draft;
                const done = isNew
                  ? await send('', 'POST', { key, ...rest })
                  : await send(`/${key}`, 'PATCH', rest);
                if (done) {
                  setDraft(null);
                  setToast({ tone: 'success', text: 'حُفظت الميزة.' });
                }
              }}
            >
              احفظ
            </Button>
          </>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3.5">
              <label className={label}>
                الاسم العربي
                <input
                  value={draft.nameAr}
                  onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                  className={cn(field, errors.nameAr !== undefined && 'border-danger')}
                />
              </label>
              <label className={label}>
                الاسم الإنجليزي
                <input
                  dir="ltr"
                  value={draft.nameEn}
                  onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                  className={cn(field, 'bidi-ltr', errors.nameEn !== undefined && 'border-danger')}
                />
              </label>
              <label className={label}>
                المفتاح — ثابت ولا يُعدَّل
                <input
                  dir="ltr"
                  readOnly={!draft.isNew}
                  placeholder="rear_camera"
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  className={cn(
                    field, 'bidi-ltr font-num',
                    !draft.isNew && 'cursor-not-allowed opacity-55',
                    errors.key !== undefined && 'border-danger',
                  )}
                />
              </label>
              <label className={label}>
                المجموعة
                <select
                  value={draft.group}
                  onChange={(e) => setDraft({ ...draft, group: e.target.value as keyof typeof GROUP })}
                  className={cn(field, 'text-sm')}
                >
                  {Object.entries(GROUP).map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="rounded-md bg-surface p-3.5 text-xs leading-loose opacity-72">
              المفتاح يستعمله الكود ولا يتغيّر أبدًا. الاسمان محتوى يُحرَّر متى شئت —
              تعديلهما يظهر فورًا في التطبيق والويب بلا نشر.
            </p>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-1.5 text-2xs font-semibold opacity-55">
                أين تظهر هذه الميزة
              </legend>
              {PLACEMENTS.map(([value, text]) => (
                <label key={value} className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.placements.includes(value)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        placements: e.target.checked
                          ? [...draft.placements, value]
                          : draft.placements.filter((p) => p !== value),
                      })
                    }
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {text}
                </label>
              ))}
            </fieldset>

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              ظاهرة
            </label>

            <p className="rounded-md bg-warn-100 p-3.5 text-xs leading-loose text-warn-900">
              إخفاء ميزة يزيلها من الفلتر وصفحة السيارة، ولا يحذفها من الفئات ولا من
              الإعلانات المنشورة. والحذف النهائي متاح فقط لميزة غير مربوطة بأي فئة.
            </p>
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
