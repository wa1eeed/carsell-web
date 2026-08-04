'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { ReviewEvidence, ReviewRow, ReviewStats } from '@/lib/domain/admin-listings';
import { MIN_REVIEW_NOTE } from '@/lib/domain/review-rules';

/**
 * ═══ A15 — مراجعة الإعلانات ═══
 *
 * قرار ٣٣ يُرشّح الإعلان آليًّا، **ولم تكن ثمّة شاشة تقرأ الطابور**.
 * فكل مرشَّح يقف بلا نهاية وصاحبه ينتظر شيئًا لن يقع.
 *
 * ═══ والسبب يُقال بدليله ═══
 *
 * «صورة مكرّرة» تسميةٌ لا حجّة. والمراجع يحتاج **مع أي إعلان**، و**كم
 * نسبة التطابق**، و**كم عمر الحساب** — وإلّا صار قراره تخمينًا سريعًا
 * على وسمٍ لا يفحصه.
 */

const REASON_LABEL: Record<string, string> = {
  DUPLICATE_IMAGE: 'صورة مكرّرة',
  PRICE_OUTLIER: 'سعر شاذّ',
  NEW_ACCOUNT_BURST: 'حساب جديد',
  USER_REPORT: 'بلاغ',
};

/** الدليل جملةً — والنطاق أعطى أرقامًا (البوابة ١٧). */
function evidenceText(evidence: ReviewEvidence): string {
  if (evidence.kind === 'DUPLICATE_IMAGE') {
    return evidence.otherRef === null
      ? 'صورة مكرّرة — والإعلان المطابق لم يعد قائمًا'
      : `تطابق ${toArabicDigits(String(evidence.matchPct))}٪ مع ${evidence.otherRef}`;
  }
  if (evidence.kind === 'PRICE_OUTLIER') {
    return evidence.marketP25 === null
      ? 'سعر شاذّ — ولا إحصاء سوق لهذا الطراز بعد'
      : `أقل ${toArabicDigits(String(evidence.belowPct))}٪ من ربع السوق الأدنى`;
  }
  if (evidence.kind === 'NEW_ACCOUNT_BURST') {
    return `عمر الحساب (${toArabicDigits(String(evidence.accountAgeDays))}) · إعلاناته (${toArabicDigits(String(evidence.listingCount))})`;
  }
  return `بلاغات: ${toArabicDigits(String(evidence.reportCount))}`;
}

/** الانتظار — دقائق ثم ساعات، فلا يُقرأ «١٤٠ دقيقة». */
function waitedText(minutes: number): string {
  if (minutes < 60) return `دقائق (${toArabicDigits(String(minutes))})`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.floor(hours / 24)))})`;
}

type Decision = 'APPROVE' | 'RETURN' | 'REJECT';

export function ReviewQueue({
  rows,
  stats,
  filter,
  canSuspend,
}: {
  rows: readonly ReviewRow[];
  stats: ReviewStats;
  filter: string | null;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<ReviewRow | null>(null);
  const [note, setNote] = useState('');

  const decide = (row: ReviewRow, decision: Decision): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/listings/${row.ref}/review`, {
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
        decision === 'APPROVE'
          ? 'اعتُمد ونُشر.'
          : decision === 'RETURN'
            ? 'أُعيد للبائع مع ملاحظتك.'
            : 'رُفض الإعلان وأُوقف الحساب.',
      );
      router.refresh();
    });
  };

  const tabs = [
    { key: null, label: 'الكل', count: stats.queued },
    ...Object.entries(stats.byReason).map(([key, count]) => ({
      key,
      label: REASON_LABEL[key] ?? key,
      count,
    })),
  ];

  return (
    <>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="في الطابور"
          value={stats.queued}
          note={
            stats.oldestMinutes === null
              ? 'الطابور فارغ'
              : `أقدمها منذ ${waitedText(stats.oldestMinutes)}`
          }
        />
        <Card
          title="اعتُمد اليوم"
          value={stats.approvedToday}
          note={`${toArabicDigits(String(stats.reviewedSharePct))}٪ من المراجَع`}
        />
        <Card title="أُعيد للبائع" value={stats.returnedToday} note="بملاحظة يقرؤها صاحبه" />
        {/*
          **النسبة مقياسُ صحّة قواعد الترشيح لا زينة.** ارتفاع الطابور
          يعني أن قاعدةً صارت واسعة، لا أن المراجعين تأخّروا.
        */}
        <Card
          title="نُشر مباشرةً بلا مراجعة"
          value={stats.publishedDirectToday}
          note={`${toArabicDigits(String(stats.directSharePct))}٪ من إعلانات اليوم`}
        />
      </section>

      <nav className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <a
            key={tab.key ?? 'all'}
            href={tab.key === null ? '/admin/listings' : `/admin/listings?reason=${tab.key}`}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-2xs ${
              (filter ?? null) === tab.key
                ? 'border-ink bg-ink text-bg'
                : 'border-line hover:border-ink'
            }`}
          >
            {tab.label}
            <span className="font-num opacity-60">{toArabicDigits(String(tab.count))}</span>
          </a>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="لا شيء ينتظر المراجعة"
          description="الطابور للمرشَّح آليًّا وحده — وأكثر الإعلانات تُنشر بلا مروره."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.ref}
              className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2.5">
                  <span className="bidi-isolate truncate text-sm font-bold">{row.title}</span>
                  <ArabicNumber value={row.year} className="text-2xs opacity-55" />
                </span>
                <span className="font-num text-3xs opacity-50">{row.ref}</span>
                <span className="bidi-isolate text-2xs opacity-60">{row.sellerName}</span>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.reason === 'USER_REPORT' ? 'warn' : 'neutral'}>
                    {REASON_LABEL[row.reason] ?? row.reason}
                  </Badge>
                  <span className="text-3xs opacity-50">{evidenceText(row.evidence)}</span>
                </div>

                <div className="flex flex-col items-start gap-0.5">
                  <Money amount={Number(row.askPrice)} />
                  <span className="text-3xs opacity-45">منذ {waitedText(row.waitingMinutes)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={pending} onClick={() => decide(row, 'APPROVE')}>
                    اعتمد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setOpen(row);
                      setNote('');
                    }}
                  >
                    أعِده
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-65">
        هذا الطابور <b>للمرشَّح آليًّا وحده</b> — ولو مرّ به كل إعلان لتوقّف السوق. راجِع
        قواعد الترشيح إن تجاوز الطابور خمسين.
      </p>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === null ? '' : `إعادة الإعلان — ${open.title}`}
      >
        {open === null ? null : (
          <>
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-70">
              يعود الإعلان مسودّةً عند صاحبه، <b>ويقرأ ملاحظتك</b>. وإعادةٌ بلا سبب تجعله
              ينشره كما هو فيعود إلى الطابور.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">ما الذي يُصلحه؟</span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="مثال: الصور مأخوذة من إعلان آخر — ارفع صورًا للمركبة نفسها."
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            <p className="mt-2 text-3xs opacity-45">
              {note.trim().length >= MIN_REVIEW_NOTE ? (
                'يكفي.'
              ) : (
                <>
                  اكتب أكثر — بقي{' '}
                  <span dir="ltr" className="font-num">
                    {MIN_REVIEW_NOTE - note.trim().length}
                  </span>
                </>
              )}
            </p>

            <Button
              className="mt-4 w-full"
              disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
              onClick={() => decide(open, 'RETURN')}
            >
              {pending ? 'جارٍ…' : 'أعِده للبائع'}
            </Button>

            {/*
              **الرفض وإيقاف الحساب لا يقع بضغطةٍ بجوار «أعِده».** هو
              أثقل قرارٍ في الشاشة، فيُفصل بخطّ ويُسمّى أثرُه.
            */}
            {canSuspend ? (
              <>
                <p className="mt-5 border-t border-line pt-4 text-3xs leading-loose opacity-55">
                  وإن كان الإعلان احتيالًا لا خطأً:
                </p>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={pending || note.trim().length < MIN_REVIEW_NOTE}
                  onClick={() => decide(open, 'REJECT')}
                >
                  ارفض وأوقف الحساب
                </Button>
              </>
            ) : null}
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
