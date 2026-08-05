'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { ReportRow, ReportStats } from '@/lib/domain/admin-reports';
import { MIN_REPORT_NOTE } from '@/lib/domain/report-rules';

/**
 * ═══ A17 — البلاغات ═══
 *
 * البلاغ يُنشأ منذ بُنيت شاشة الإبلاغ، **ولا شاشة تقرؤه**. فمن أبلغ
 * عن احتيالٍ يجد صمتًا، وقرار ٣٣ يَعِد بمراجعةٍ بشرية لا يقوم بها أحد
 * ما لم يرَ الطابور.
 *
 * ═══ وبلاغٌ واحد لا يُحيل ═══
 *
 * قرار ٥: نقرةٌ واحدة تُزيل إعلان منافس أرخص من أي إعلان مدفوع.
 * فالعمود يقول **كم بلاغًا على الهدف نفسه** — والأدمن يقرّر على العدد
 * لا على البلاغ المفرد.
 */

const REASON_LABEL: Record<string, string> = {
  fraud: 'يبدو احتيالًا',
  wrong_data: 'بيانات غير صحيحة',
  sold_elsewhere: 'بيعت وما زالت معروضة',
  duplicate: 'مكرّر',
  offensive: 'محتوى مسيء',
  other: 'سبب آخر',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'مفتوح',
  reviewing: 'قيد التحقيق',
  actioned: 'اتُّخذ إجراء',
  dismissed: 'صُرف النظر',
};

function waitedText(minutes: number): string {
  if (minutes < 60) return `دقائق (${toArabicDigits(String(minutes))})`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.floor(hours / 24)))})`;
}

type Action = 'REVIEW_LISTING' | 'DISMISS' | 'ACTIONED';

export function ReportsQueue({
  rows,
  stats,
  status,
}: {
  rows: readonly ReportRow[];
  stats: ReportStats;
  status: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<ReportRow | null>(null);
  const [note, setNote] = useState('');

  const decide = (row: ReportRow, action: Action): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/reports/${row.ref}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() === '' ? null : note.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر حسم البلاغ.');
        return;
      }

      setOpen(null);
      setNote('');
      setToast(
        action === 'REVIEW_LISTING'
          ? 'أُحيل الإعلان إلى طابور المراجعة.'
          : action === 'DISMISS'
            ? 'صُرف النظر — والسبب مسجَّل.'
            : 'أُغلق البلاغ بعد الإجراء.',
      );
      router.refresh();
    });
  };

  const tabs = [
    { key: 'open', label: 'مفتوحة', count: stats.open },
    { key: 'reviewing', label: 'قيد التحقيق', count: stats.reviewing },
    { key: null, label: 'الكل', count: stats.open + stats.reviewing + stats.resolved },
  ];

  return (
    <>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="بلاغات تنتظر"
          value={stats.open}
          note={
            stats.oldestMinutes === null
              ? 'لا شيء ينتظر'
              : `أقدمها منذ ${waitedText(stats.oldestMinutes)}`
          }
        />
        <Card title="قيد التحقيق" value={stats.reviewing} note="أُحيلت إلى مراجعة الإعلان" />
        <Card title="حُسمت" value={stats.resolved} note="بإجراء أو بصرف نظر" />
        <div className="rounded-lg border border-line p-5">
          <p className="mb-2 text-2xs opacity-55">أكثر الأسباب</p>
          {stats.byReason.length === 0 ? (
            <p className="text-2xs opacity-45">لا بلاغات مفتوحة</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stats.byReason.slice(0, 3).map((row) => (
                <li key={row.reason} className="flex items-center justify-between text-2xs">
                  <span className="opacity-70">{REASON_LABEL[row.reason] ?? row.reason}</span>
                  <ArabicNumber value={row.count} className="font-bold" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <nav className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <a
            key={tab.key ?? 'all'}
            href={tab.key === null ? '/admin/reports?status=all' : `/admin/reports?status=${tab.key}`}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-2xs ${
              status === tab.key ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink'
            }`}
          >
            {tab.label}
            <span className="font-num opacity-60">{toArabicDigits(String(tab.count))}</span>
          </a>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="لا بلاغات هنا"
          description="حين يُبلغ مستخدم عن إعلان أو حساب يظهر بلاغه في هذا الطابور."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.ref}
              className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={`/admin/reports/${encodeURIComponent(row.ref)}`}
                  dir="ltr"
                  className="font-num text-start text-3xs underline underline-offset-4 opacity-60 hover:opacity-100"
                >
                  {row.ref}
                </Link>
                <span className="text-sm font-bold">{REASON_LABEL[row.reason] ?? row.reason}</span>
                <span className="bidi-isolate truncate text-2xs opacity-60">
                  {row.targetTitle ?? row.targetId}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.status === 'open' ? 'warn' : 'neutral'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                  {/*
                    **العدد هو ما يُقرَّر عليه لا البلاغ المفرد** — قرار ٥.
                  */}
                  <span className="text-3xs opacity-50">
                    بلاغات على الهدف ({toArabicDigits(String(row.siblingCount))})
                  </span>
                </div>

                <div className="flex flex-col items-start gap-0.5">
                  <span className="bidi-isolate text-2xs opacity-70">{row.reporterName}</span>
                  <span className="text-3xs opacity-45">منذ {waitedText(row.waitingMinutes)}</span>
                </div>

                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setOpen(row);
                    setNote('');
                  }}
                >
                  افتح
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-65">
        <b>البلاغ لا يحذف إعلانًا.</b> يُحيله إلى مراجعة بشرية — والحذف بمجرّد بلاغ يجعله
        سلاحًا بيد منافس. وصاحب الإعلان لا يعرف من أبلغ.
      </p>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === null ? '' : `البلاغ ${open.ref}`}
      >
        {open === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="السبب" value={REASON_LABEL[open.reason] ?? open.reason} />
              <Line label="الهدف" value={open.targetTitle ?? open.targetId} />
              <Line label="المبلِّغ" value={open.reporterName} />
            </dl>

            {open.details === null ? null : (
              <p className="mb-4 rounded-md border border-line bg-surface p-3.5 text-2xs leading-loose">
                {open.details}
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">ما الذي قرّرتَه ولماذا؟</span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="تُقرأ بعد شهور — اكتب ما يكفي ليفهمه غيرك."
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2">
              {open.targetType === 'listing' ? (
                <Button className="w-full" disabled={pending} onClick={() => decide(open, 'REVIEW_LISTING')}>
                  أحِل الإعلان إلى المراجعة
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_REPORT_NOTE}
                onClick={() => decide(open, 'ACTIONED')}
              >
                اتُّخذ إجراء — أغلِق
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_REPORT_NOTE}
                onClick={() => decide(open, 'DISMISS')}
              >
                صرْف النظر
              </Button>
            </div>
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Card({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <div className="rounded-lg border border-line p-5">
      <p className="mb-2 text-2xs opacity-55">{title}</p>
      <ArabicNumber value={value} className="text-3xl font-bold" />
      <p className="mt-1.5 text-3xs opacity-50">{note}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-55">{label}</dt>
      <dd className="bidi-isolate truncate">{value}</dd>
    </div>
  );
}
