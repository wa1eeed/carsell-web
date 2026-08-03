'use client';

import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Sheet } from '@/components/ui/Sheet';
import type { Mismatch, ReconciliationRow } from '@/lib/domain/reconciliation';

const STATUS_LABEL: Record<string, string> = {
  MATCHED: 'طوبقت',
  DIFFERS: 'فرق',
  UNAVAILABLE: 'تعذّرت القراءة',
};

const KIND_LABEL: Record<Mismatch['kind'], string> = {
  MISSING_HERE: 'عند البوابة ولا أثر لها عندنا',
  MISSING_THERE: 'عندنا ولا أثر لها عند البوابة',
  AMOUNT_DIFFERS: 'المبلغ مختلف',
};

/**
 * ═══ الفرق يُفتَح لا يُتأمَّل ═══
 *
 * والصفّ يقول «فرق ٤٢٠» ثم يفتح **قائمة المعاملات المختلفة**: مجموعٌ
 * وحده يجعل المشغّل يعرف أن ثمّة خطأً ولا يعرف أين، فيُغلق التنبيه بلا
 * معالجة.
 *
 * و«تعذّرت القراءة» ليست تطابقًا — لونها محايد لا أخضر، وبوابةٌ لم
 * تُقرأ لم تُطابَق.
 */
export function ReconciliationTable({ runs }: { runs: readonly ReconciliationRow[] }) {
  const [open, setOpen] = useState<ReconciliationRow | null>(null);
  const [rows, setRows] = useState<Mismatch[]>([]);

  const show = (run: ReconciliationRow): void => {
    setOpen(run);
    void fetch(`/api/v1/admin/payments/reconciliation/${run.gatewayKey}/${run.date}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: Mismatch[] } | null) => setRows(payload?.data ?? []))
      .catch(() => setRows([]));
  };

  return (
    <>
      <DataTable
        rows={runs}
        rowKey={(run) => `${run.gatewayKey}-${run.date}`}
        columns={[
          {
            id: 'date',
            header: 'اليوم',
            cell: (run) => (
              <span dir="ltr" className="bidi-isolate font-num">
                {run.date}
              </span>
            ),
          },
          { id: 'gateway', header: 'البوابة', cell: (run) => run.gatewayKey },
          {
            id: 'ours',
            header: 'دفترنا',
            numeric: true,
            cell: (run) => <Money amount={run.ourTotal} />,
          },
          {
            id: 'theirs',
            header: 'البوابة',
            numeric: true,
            /* الشرطة لا الصفر: «لم تُقرأ» ليست «صفرًا» */
            cell: (run) =>
              run.gatewayTotal === null ? (
                <span className="opacity-35">—</span>
              ) : (
                <Money amount={run.gatewayTotal} />
              ),
          },
          {
            id: 'diff',
            header: 'الفرق',
            numeric: true,
            cell: (run) =>
              Number(run.diff) === 0 ? (
                <span className="opacity-35">—</span>
              ) : (
                <ArabicNumber value={Number(run.diff)} decimals={2} className="font-bold" />
              ),
          },
          {
            id: 'status',
            header: 'الحالة',
            cell: (run) => (
              <Badge
                tone={
                  run.status === 'MATCHED' ? 'accent' : run.status === 'DIFFERS' ? 'warn' : 'neutral'
                }
              >
                {STATUS_LABEL[run.status] ?? run.status}
              </Badge>
            ),
          },
          {
            id: 'open',
            header: '',
            cell: (run) =>
              run.mismatchCount === 0 ? null : (
                <button
                  type="button"
                  className="text-2xs font-bold text-accent-700 hover:underline"
                  onClick={() => show(run)}
                >
                  افتح المختلفة
                </button>
              ),
          },
        ]}
      />

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title="المعاملات المختلفة"
      >
        {open === null ? null : (
          <>
            <p className="mb-3.5 text-2xs leading-loose opacity-60">
              {open.gatewayKey} ·{' '}
              <span dir="ltr" className="bidi-isolate font-num">
                {open.date}
              </span>
            </p>
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li key={row.ref} className="rounded-md border border-line p-3.5">
                  <p className="mb-1.5 flex flex-wrap items-center gap-2">
                    {/* المرجع يُقتبس ويُبحث به — لاتينيّ ومعزول */}
                    <span dir="ltr" className="bidi-isolate font-num text-2xs font-bold">
                      {row.ref}
                    </span>
                    <Badge tone="warn">{KIND_LABEL[row.kind]}</Badge>
                  </p>
                  <p className="flex flex-wrap items-center gap-3 text-2xs opacity-70">
                    <span className="flex items-center gap-1.5">
                      دفترنا
                      {row.ours === null ? (
                        <span className="opacity-40">—</span>
                      ) : (
                        <ArabicNumber value={Number(row.ours)} decimals={2} />
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      البوابة
                      {row.theirs === null ? (
                        <span className="opacity-40">—</span>
                      ) : (
                        <ArabicNumber value={Number(row.theirs)} decimals={2} />
                      )}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </>
  );
}
