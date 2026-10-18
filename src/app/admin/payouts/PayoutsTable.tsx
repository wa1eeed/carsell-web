'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { displayDigits } from '@/lib/arabic';
import type { PayableSeller, PayoutRow } from '@/lib/domain/payouts';

/**
 * ═══ تحويل المستحقّات — الشاشة التي لم تكن ═══
 *
 * ═══ والزرّ يقول ما يفعله ═══
 *
 * «اطلب التحويل» لا «حوِّل»: الضغطة الأولى **لا تُحرّك ريالًا** — تفتح
 * طلبًا ينتظر عضوًا ثانيًا. و«سجّل الحوالة» عند الاعتماد لا «اعتمد»:
 * فالمعتمِد يُقرّ أن الحوالة **خرجت فعلًا** من البنك ويكتب مرجعها،
 * وهو ما يُصفّر حقّ البائع في الدفتر.
 */

const STATUS: Record<PayoutRow['status'], { label: string; tone: 'accent' | 'warn' | 'neutral' }> = {
  PENDING: { label: 'ينتظر اعتمادا', tone: 'warn' },
  SENT: { label: 'حول', tone: 'accent' },
  FAILED: { label: 'تعذر', tone: 'warn' },
  CANCELLED: { label: 'ألغي', tone: 'neutral' },
};

const REASON: Record<string, string> = {
  NO_IBAN: 'البائع لم يدخل آيبانه بعد — ولا تحويل بلا آيبان.',
  EXCEEDS_PAYABLE: 'المبلغ أكبر من حقه القائم.',
  BAD_AMOUNT: 'المبلغ غير صحيح.',
  ALREADY_PENDING: 'له طلب ينتظر اعتمادا — يعتمد أو يلغى أولا.',
  BANK_REF_REQUIRED: 'اكتب مرجع الحوالة البنكية — وبه تطابق بكشف البنك.',
  NOT_PENDING: 'لم يبق الطلب منتظرا — أعتمد أو ألغي.',
  EXPIRED: 'انقضت مهلة الطلب — يفتح طلب جديد.',
};

export function PayoutsTable({
  owed,
  history,
  adminId,
  canSend,
}: {
  owed: readonly PayableSeller[];
  history: readonly PayoutRow[];
  adminId: string;
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<PayableSeller | null>(null);
  const [amount, setAmount] = useState('');
  const [approving, setApproving] = useState<PayoutRow | null>(null);
  const [bankRef, setBankRef] = useState('');

  const say = (payload: { error?: { messageAr?: string; details?: Record<string, string> } } | null): string => {
    const key = payload?.error?.details?.payout;
    return (key === undefined ? undefined : REASON[key]) ?? payload?.error?.messageAr ?? 'تعذر تنفيذ الطلب.';
  };

  const request = (): void => {
    const seller = requesting;
    if (seller === null) return;
    start(async () => {
      const response = await fetch('/api/v1/admin/payouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sellerId: seller.sellerId, amount }),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as Parameters<typeof say>[0];

      if (response === null || !response.ok) {
        setToast(say(payload));
        return;
      }
      setRequesting(null);
      setToast('فتح طلب التحويل. ينتظر اعتماد عضو ثاني بعد تنفيذ الحوالة.');
      router.refresh();
    });
  };

  const approve = (): void => {
    const row = approving;
    if (row === null) return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/payouts/${row.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bankRef }),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as Parameters<typeof say>[0];

      if (response === null || !response.ok) {
        setToast(say(payload));
        return;
      }
      setApproving(null);
      setBankRef('');
      setToast('سجلت الحوالة — وصفر حق البائع في الدفتر.');
      router.refresh();
    });
  };

  const cancel = (row: PayoutRow): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/payouts/${row.id}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'ألغي من الشاشة' }),
      }).catch(() => null);
      if (response === null || !response.ok) {
        setToast(say((await response?.json().catch(() => null)) as Parameters<typeof say>[0]));
        return;
      }
      setToast('ألغي الطلب.');
      router.refresh();
    });
  };

  const waiting = history.filter((row) => row.status === 'PENDING');
  const done = history.filter((row) => row.status !== 'PENDING');

  if (owed.length === 0 && history.length === 0) {
    return (
      <EmptyState
        title="لا مستحقات"
        description="حين يكتمل بيع ويفرج عن ضمانه يظهر حق البائع هنا حتى يحول."
      />
    );
  }

  return (
    <>
      {/* ═══ ينتظر الاعتماد أوّلًا — فهو ما يحتاج فعلًا الآن ═══ */}
      {waiting.length === 0 ? null : (
        <Section title="ينتظر اعتماد عضو ثاني" count={waiting.length} tone="warn">
          {waiting.map((row) => {
            const isRequester = row.requestedBy === adminId;
            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/admin/users/${encodeURIComponent(row.sellerId)}`}
                    /* **ومساحةُ اللمس ليست مساحةَ النصّ** (WCAG 2.2): حشوٌ رأسيّ
                      وهامشٌ سالب — يتّسع الهدف ولا يتحرّك سطر. */
                    className="bidi-isolate -my-1 block truncate py-1 text-sm underline underline-offset-4 hover:opacity-75"
                  >
                    {row.sellerName ?? '—'}
                  </Link>
                  <span className="text-3xs opacity-65">
                    {row.ibanLast4 === null ? (
                      'لا آيبان'
                    ) : (
                      <>
                        آيبان ينتهي بـ
                        {/* الأرقام اللاتينية تُعزل ويُقلَب اتجاهها — فلا تُقرأ معكوسة */}
                        <span dir="ltr" className="font-num mx-1">
                          {displayDigits(row.ibanLast4)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <Money amount={Number(row.amount)} decimals={2} />
                  {isRequester ? (
                    <div className="flex items-center gap-3">
                      <span className="text-3xs opacity-65">أنت الطالب — يعتمده غيرك</span>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(row)}>
                        ألغ
                      </Button>
                    </div>
                  ) : !canSend ? (
                    <span className="text-3xs opacity-65">لا تملك صلاحية التحويل</span>
                  ) : (
                    <Button size="sm" disabled={pending} onClick={() => setApproving(row)}>
                      سجل الحوالة
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {owed.length === 0 ? null : (
        <Section title="مستحق ولم يحول" count={owed.length} tone="ok">
          {owed.map((row) => (
            <div
              key={row.sellerId}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={`/admin/users/${encodeURIComponent(row.sellerId)}`}
                  /* **ومساحةُ اللمس ليست مساحةَ النصّ** (WCAG 2.2): حشوٌ رأسيّ
                      وهامشٌ سالب — يتّسع الهدف ولا يتحرّك سطر. */
                    className="bidi-isolate -my-1 block truncate py-1 text-sm underline underline-offset-4 hover:opacity-75"
                >
                  {row.name === '' ? '—' : row.name}
                </Link>
                {/*
                  **وغياب الآيبان يُقال في الصفّ لا عند الضغط**: التذكير
                  يسبق لحظة الحاجة، ومن اكتشف المانع بعد الضغط يظنّ أنه
                  أخطأ وهو لم يخطئ.
                */}
                <span className="text-3xs opacity-65">
                  {row.ibanLast4 === null ? (
                    'لم يدخل آيبانه — لا تحويل قبله'
                  ) : (
                    <>
                      آيبان ينتهي بـ
                      <span dir="ltr" className="font-num mx-1">
                        {displayDigits(row.ibanLast4)}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <Money amount={Number(row.payable)} decimals={2} />
                {row.pendingPayoutId !== null ? (
                  <Badge tone="warn">طلب قائم</Badge>
                ) : !canSend ? (
                  <span className="text-3xs opacity-65">لا تملك صلاحية التحويل</span>
                ) : row.ibanLast4 === null ? (
                  <Button size="sm" variant="outline" disabled>
                    بانتظار آيبانه
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setRequesting(row);
                      setAmount(row.payable);
                    }}
                  >
                    اطلب التحويل
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {done.length === 0 ? null : (
        <Section title="سجل التحويلات" count={done.length} tone="neutral">
          {done.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="bidi-isolate truncate text-sm">{row.sellerName ?? '—'}</span>
                <span dir="ltr" className="font-num text-3xs opacity-65">
                  {row.bankRef ?? '—'}
                </span>
              </div>
              <div className="flex items-center gap-5">
                <Money amount={Number(row.amount)} decimals={2} />
                <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/*
        النافذة تقول **ما يخرج وإلى أين** قبل الضغط، ولا تكتفي
        بـ«هل أنت متأكّد؟» — الرقم هو ما يُراجَع لا العزم.
      */}
      <Modal
        open={requesting !== null}
        onClose={() => setRequesting(null)}
        title="طلب تحويل مستحقات"
      >
        {requesting === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="البائع" value={requesting.name === '' ? '—' : requesting.name} />
              <Line label="حقه القائم" value={requesting.payable} mono />
              <Line label="آيبان ينتهي بـ" value={requesting.ibanLast4 ?? '—'} mono />
            </dl>
            <label className="mb-4 flex flex-col gap-2">
              <span className="text-2xs opacity-70">المبلغ المحول</span>
              <input
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="font-num w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
              />
            </label>
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-75">
              هذه الضغطة <b>لا تحرك المبلغ</b> — تفتح طلبا يعتمده عضو ثاني بعد تنفيذ
              الحوالة من البنك. ولا يعتمده الطالب.
            </p>
            <Button className="w-full" disabled={pending} onClick={request}>
              {pending ? 'جاري…' : 'افتح الطلب'}
            </Button>
          </>
        )}
      </Modal>

      <Modal open={approving !== null} onClose={() => setApproving(null)} title="تسجيل الحوالة">
        {approving === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="البائع" value={approving.sellerName ?? '—'} />
              <Line label="المبلغ" value={approving.amount} mono />
              <Line label="آيبان ينتهي بـ" value={approving.ibanLast4 ?? '—'} mono />
            </dl>
            <label className="mb-4 flex flex-col gap-2">
              <span className="text-2xs opacity-70">مرجع الحوالة البنكية</span>
              {/*
                `dir="ltr"` — مرجعٌ يُنسخ من كشف البنك ويُقارن خانةً بخانة.
              */}
              <input
                dir="ltr"
                value={bankRef}
                onChange={(event) => setBankRef(event.target.value)}
                className="font-num w-full min-w-0 rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
              />
            </label>
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-75">
              بهذا التسجيل <b>يصفر حق البائع</b> في دفتر الحسابات — فلا تسجلها قبل أن
              تخرج الحوالة فعلا من البنك.
            </p>
            <Button className="w-full" disabled={pending} onClick={approve}>
              {pending ? 'جاري…' : 'سجل الحوالة'}
            </Button>
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'ok' | 'warn' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-bold">
        {title}
        {/* العدد داخل الشارة لا في الجملة — فلا يحكم المعدودُ صيغةَ الجمع */}
        <Badge tone={tone === 'ok' ? 'accent' : tone === 'warn' ? 'warn' : 'neutral'}>
          {displayDigits(String(count))}
        </Badge>
      </h2>
      <div className="flex flex-col divide-y divide-line border-y border-line">{children}</div>
    </section>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-70">{label}</dt>
      <dd className={mono === true ? 'font-num' : 'bidi-isolate truncate'} {...(mono === true ? { dir: 'ltr' } : {})}>
        {mono === true ? displayDigits(value) : value}
      </dd>
    </div>
  );
}
