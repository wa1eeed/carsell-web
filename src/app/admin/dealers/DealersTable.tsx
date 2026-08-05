'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { DealerRow } from '@/lib/domain/admin-dealers';
import { MIN_DEALER_NOTE } from '@/lib/domain/dealer-rules';

/**
 * ═══ A26 — التجار والمعارض ═══
 *
 * `verified` رايةٌ **بلا كاتب**: الشارة تُقرأ في صفحة المعرض العامّة
 * وفي بطاقة الإعلان، ولا شيء في المنتج يمنحها. فكل معرضٍ مسجَّل يبقى
 * `PENDING` إلى الأبد.
 *
 * ═══ ولا نُدير مخزونه ═══
 *
 * التصميم يقولها: «تمنح الشارة وتربط الباقة — ولا تدير مخزونه». فعدد
 * الإعلانات يُعرض ولا يُلمس، ولا زرّ هنا يمسّ إعلانًا.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ينتظر التحقّق',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
};

/** ما يُتحقَّق منه قبل الشارة — بشريّ بمستنداتٍ خارج المنصّة. */
const CHECKS = [
  'السجل التجاريّ ساريًا',
  'مطابقة اسم المنشأة',
  'الرقم الضريبيّ إن كانت مسجَّلة',
  'الآيبان باسم المنشأة',
  'عنوان المعرض',
];

type Decision = 'VERIFY' | 'SUSPEND' | 'REINSTATE';

export function DealersTable({ rows }: { rows: readonly DealerRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<DealerRow | null>(null);
  const [note, setNote] = useState('');

  const decide = (row: DealerRow, decision: Decision): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/dealers/${row.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note: note.trim() === '' ? null : note.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر تنفيذ القرار.');
        return;
      }

      setOpen(null);
      setNote('');
      setToast(
        decision === 'VERIFY'
          ? 'وُثّق المعرض — وصارت الشارة تظهر لمشتريه.'
          : decision === 'SUSPEND'
            ? 'أُوقف المعرض، والسبب مسجَّل.'
            : 'أُعيد المعرض إلى النشاط.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2.5">
                <Link
                  href={`/admin/dealers/${row.id}`}
                  className="bidi-isolate truncate text-sm font-bold underline underline-offset-4 hover:opacity-70"
                >
                  {row.name}
                </Link>
                {row.verified ? <Badge tone="accent">موثّق</Badge> : null}
              </span>
              <span className="text-2xs opacity-60">{row.city}</span>
              {/* الأرقام النظامية تُقارن خانةً بخانة — لاتينيّة معزولة */}
              <span dir="ltr" className="font-num text-3xs opacity-45">
                {row.crNumber ?? '—'}
                {row.vatNumber === null ? '' : ` · ${row.vatNumber}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-2xs">
                  المخزون ({toArabicDigits(String(row.inventory))})
                </span>
                <span className="text-3xs opacity-45">
                  {row.ratingAvg === null
                    ? 'بلا تقييم'
                    : `التقييم ${toArabicDigits(row.ratingAvg)} · مقيّمون (${toArabicDigits(String(row.ratingCount))})`}
                </span>
              </div>

              <Badge tone={row.status === 'ACTIVE' ? 'accent' : row.status === 'PENDING' ? 'warn' : 'neutral'}>
                {STATUS_LABEL[row.status] ?? row.status}
              </Badge>

              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  setOpen(row);
                  setNote('');
                }}
              >
                {row.status === 'PENDING' ? 'راجع' : 'افتح'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === null ? '' : open.name}
      >
        {open === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="السجل التجاريّ" value={open.crNumber ?? 'غير مسجَّل'} mono />
              <Line label="الرقم الضريبيّ" value={open.vatNumber ?? 'غير مسجَّل'} mono />
              <Line label="المدينة" value={open.city} />
              <Line label="الأعضاء" value={toArabicDigits(String(open.memberCount))} />
            </dl>

            {/*
              **الفحوص بشرية بمستنداتٍ خارج المنصّة** — فلا تُدّعى آلية.
              والقائمة تذكّر بما يجب النظر فيه قبل منح شارةٍ يقرؤها مشترٍ.
            */}
            <p className="mb-2 text-2xs font-bold opacity-60">تحقّق من هذه قبل الشارة:</p>
            <ul className="mb-4 flex flex-col gap-1.5">
              {CHECKS.map((check) => (
                <li key={check} className="flex items-center gap-2 text-2xs opacity-70">
                  <span aria-hidden className="size-1 rounded-full bg-ink/40" />
                  {check}
                </li>
              ))}
            </ul>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">ملاحظة — تلزم عند الإيقاف</span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2">
              {open.status === 'SUSPENDED' ? (
                <Button className="w-full" disabled={pending} onClick={() => decide(open, 'REINSTATE')}>
                  أعِده إلى النشاط
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={pending || open.crNumber === null}
                  onClick={() => decide(open, 'VERIFY')}
                >
                  {open.crNumber === null ? 'لا شارة بلا سجل تجاريّ' : 'وثّق المعرض'}
                </Button>
              )}

              {open.status === 'SUSPENDED' ? null : (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pending || note.trim().length < MIN_DEALER_NOTE}
                  onClick={() => decide(open, 'SUSPEND')}
                >
                  أوقِف المعرض
                </Button>
              )}
            </div>

            <p className="mt-4 text-3xs leading-loose opacity-50">
              الشارة تظهر لمشتريه في صفحة المعرض وفي كل بطاقة إعلان. ولا يُدار مخزونه من
              هنا — العدد يُقرأ ولا يُلمس.
            </p>
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-55">{label}</dt>
      <dd className={mono === true ? 'font-num' : 'bidi-isolate truncate'} dir={mono === true ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
