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
import type { IdentityRow, IdentityStats } from '@/lib/domain/admin-identity';
import { MIN_IDENTITY_NOTE } from '@/lib/domain/identity-rules';

/**
 * ═══ A18 — توثيق الهوية ═══
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` بلا كاتب، ولا شاشة تعرض
 * من قدّم هويته — وحارس الشراء يقرؤه. فكل حساب ممنوع من كل معاملة،
 * والباب الذي يُستوفى منه غير موجود.
 *
 * ═══ والرقم لا يُعرض هنا ═══
 *
 * القائمة تعرض الاسم والجوال والطريقة. وكشفُ رقم الهوية فعلٌ مستقلّ
 * بسببٍ مكتوب — فلا يمرّ الاطّلاع عرَضًا لأن مراجعًا فتح شاشة.
 */

const METHOD_LABEL: Record<string, string> = {
  manual: 'إدخال يدوي',
  nafath: 'النفاذ الوطني',
  commercial_register: 'سجل تجاري',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ينتظر',
  CLARIFICATION: 'مُعلَّق للتوضيح',
  VERIFIED: 'موثّق',
  REJECTED: 'مرفوض',
};

function waitedText(minutes: number): string {
  if (minutes < 60) return `دقائق (${toArabicDigits(String(minutes))})`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.floor(hours / 24)))})`;
}

type Decision = 'VERIFY' | 'CLARIFY' | 'REJECT';

export function IdentityQueue({
  rows,
  stats,
}: {
  rows: readonly IdentityRow[];
  stats: IdentityStats;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<IdentityRow | null>(null);
  const [note, setNote] = useState('');

  const decide = (row: IdentityRow, decision: Decision): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/identity/${row.userId}`, {
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
          ? 'وُثّق الحساب — وصار يستطيع النشر والشراء.'
          : decision === 'CLARIFY'
            ? 'طُلب التوضيح — يبقى في الطابور.'
            : 'رُفض التوثيق، والسبب مسجَّل.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="ينتظر مراجعة يدوية"
          value={stats.waiting}
          note={
            stats.oldestMinutes === null
              ? 'الطابور فارغ'
              : `أقدمها منذ ${waitedText(stats.oldestMinutes)}`
          }
        />
        <Card title="مُعلَّق للتوضيح" value={stats.clarification} note="ينتظر ردّ صاحبه" />
        <Card title="موثّق" value={stats.verifiedTotal} note="عبر التاريخ" />
        {/*
          **النسبة مقياسٌ لطول الطابور لا زينة**: كلّما ارتفعت قلّ ما
          ينتظر إنسانًا — والتصميم يقولها في العنوان.
        */}
        <div className="rounded-lg border border-line p-5">
          <p className="mb-2 text-2xs opacity-55">نسبة النفاذ الوطني</p>
          <span className="font-num text-3xl font-bold">
            {toArabicDigits(String(stats.nafathSharePct))}٪
          </span>
          <p className="mt-1.5 text-3xs opacity-50">كلّما ارتفعت قلّ الطابور</p>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState
          title="لا أحد ينتظر التوثيق"
          description="النفاذ الوطني يُوثَّق آليًّا — وما يصل هنا هو الإدخال اليدويّ والسجلّ التجاريّ."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="bidi-isolate truncate text-sm font-bold">
                  {/*
                    **ولا صفحةَ توثيقٍ منفصلة**: ملفّ العميل فيه حالة
                    التوثيق وتاريخُها — **والرقم يبقى خلف مساره المُقيَّد**
                    الذي يكتب أثرًا بكل قراءة، لا في صفحةٍ تُفتح عرَضًا.
                  */}
                  <Link
                    href={`/admin/users/${row.userId}`}
                    className="underline underline-offset-4 hover:opacity-70"
                  >
                    {row.name ?? 'بلا اسم'}
                  </Link>
                </span>
                {/* الجوال يُقارن خانةً بخانة — لاتينيّ معزول */}
                <span dir="ltr" className="font-num text-2xs opacity-60">
                  {row.phone}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={row.status === 'CLARIFICATION' ? 'warn' : 'neutral'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                  <span className="text-3xs opacity-50">
                    {row.method === null ? '—' : (METHOD_LABEL[row.method] ?? row.method)}
                  </span>
                </div>

                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-2xs opacity-70">
                    إعلاناته ({toArabicDigits(String(row.listingCount))})
                  </span>
                  <span className="text-3xs opacity-45">منذ {waitedText(row.waitingMinutes)}</span>
                </div>

                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setOpen(row);
                    setNote(row.note ?? '');
                  }}
                >
                  راجع
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-65">
        <b>ما يفتحه التوثيق:</b> نشر إعلان · تقديم عرض · المزايدة · استلام مبالغ. والتصفّح
        والمفضّلة متاحان بلا توثيق.
      </p>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === null ? '' : `مراجعة — ${open.name ?? open.phone}`}
      >
        {open === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="الاسم" value={open.name ?? 'بلا اسم'} />
              <Line label="الجوال" value={open.phone} mono />
              <Line
                label="الطريقة"
                value={open.method === null ? '—' : (METHOD_LABEL[open.method] ?? open.method)}
              />
            </dl>

            {/*
              **رقم الهوية لا يُعرض هنا.** كشفُه فعلٌ مستقلّ بسببٍ
              مكتوب من شاشة العملاء — فلا يمرّ الاطّلاع عرَضًا مع كل قرار.
            */}
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-3xs leading-loose opacity-65">
              رقم الهوية لا يُعرض في هذه الشاشة. كشفُه من شاشة العملاء بسببٍ مكتوب،
              وكل اطّلاع مسجَّل.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">
                ما الذي ينقص أو يمنع؟ — يقرؤه صاحبه
              </span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="مثال: صورة الهوية غير واضحة — أعِد رفعها بإضاءة أفضل."
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2">
              <Button className="w-full" disabled={pending} onClick={() => decide(open, 'VERIFY')}>
                وثّق الحساب
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_IDENTITY_NOTE}
                onClick={() => decide(open, 'CLARIFY')}
              >
                اطلب توضيحًا — يبقى في الطابور
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={pending || note.trim().length < MIN_IDENTITY_NOTE}
                onClick={() => decide(open, 'REJECT')}
              >
                ارفض بسبب مكتوب
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
