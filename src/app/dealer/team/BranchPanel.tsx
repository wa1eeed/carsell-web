'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import type { BranchRow } from '@/lib/domain/dealer-branches';

export function BranchPanel({ rows }: { rows: readonly BranchRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const call = (body: unknown, method: 'POST' | 'PATCH'): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/branches', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;
      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر التنفيذ.');
        return;
      }
      setAdding(false);
      setName('');
      setCity('');
      setToast(method === 'POST' ? 'أضيف الفرع.' : 'حدث الفرع.');
      router.refresh();
    });
  };

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <div className="mb-5 flex justify-end">
        <Button onClick={() => setAdding(true)}>أضف فرعا</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="لا فروع بعد"
          description="الفرع يحمل مركباته وفريقه — ومعرض بفرع واحد لا يحتاجه حتى يفتح الثاني."
        />
      ) : (
        <div className="no-scrollbar overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-xl border-collapse text-2xs">
            <thead>
              <tr className="border-b border-line bg-surface text-3xs opacity-70">
                <th className="p-3 text-start font-bold">الفرع</th>
                <th className="p-3 text-start font-bold">المدينة</th>
                <th className="p-3 text-start font-bold">المدير</th>
                <th className="p-3 text-end font-bold">المركبات</th>
                <th className="p-3 text-end font-bold">الأعضاء</th>
                <th className="p-3 text-start font-bold">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line-2 last:border-b-0">
                  <td className="p-3 font-bold">{row.name}</td>
                  <td className="p-3">{row.city}</td>
                  <td className="p-3">
                    {row.managerName ?? <span className="opacity-50">لم يسند</span>}
                  </td>
                  <td className="p-3 text-end">
                    <ArabicNumber value={row.vehicleCount} />
                  </td>
                  <td className="p-3 text-end">
                    <ArabicNumber value={row.memberCount} />
                  </td>
                  <td className="p-3">
                    <Badge tone={row.active ? 'accent' : 'neutral'} size="sm">
                      {row.active ? 'نشط' : 'معطل'}
                    </Badge>
                  </td>
                  <td className="p-3 text-end">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => call({ branchId: row.id, active: !row.active }, 'PATCH')}
                      className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-ink disabled:opacity-50"
                    >
                      {row.active ? 'عطل' : 'فعل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="فرع جديد">
        <p className="mb-3.5 text-2xs leading-loose opacity-75">
          الفرع يحمل مركباته وفريقه، وبائع الفرع يرى مركبات فرعه وعروضه وحدها.
        </p>
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">اسم الفرع</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              placeholder="الملقا"
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">المدينة</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              maxLength={40}
              placeholder="الرياض"
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
            />
          </label>
          <Button
            className="mt-1.5 w-full"
            disabled={pending || name.trim() === '' || city.trim() === ''}
            onClick={() => call({ name: name.trim(), city: city.trim() }, 'POST')}
          >
            {pending ? 'يضيف…' : 'أضف الفرع'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
