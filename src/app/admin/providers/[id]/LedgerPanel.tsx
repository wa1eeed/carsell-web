'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Toast } from '@/components/ui/Toast';
import { displayDigits, toLatinDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import type { PendingProviderAdjustment, ProviderLedgerLine } from '@/lib/domain/provider-ledger';
import { PROVIDER_EVENT_LABEL } from '@/lib/labels/admin';

/**
 * ═══ حسابُ المزوّد — رصيدُه وكشفُه وقيدُه ═══
 *
 * **والقيد يُطلَب ولا يقع**: يوافق عليه شخصٌ ثانٍ، والشاشة تقول ذلك
 * قبل الضغط لا بعده — فمن ضغط «زِد» وانتظر رصيدًا لا يظهر يظنّ
 * النظام معطوبًا. وهو مسلكُ محفظة العميل نفسه.
 *
 * **وبالهللات**: هذا رقمٌ يُطابَق بطرفٍ خارجيّ — يقرؤه المزوّد على
 * كشفه عندنا ويقابله بما وصله. فتقريبُه إلى الريال يصنع خلافًا.
 */
const REASON_MIN = 10;

export function LedgerPanel({
  providerId,
  balance,
  credited,
  debited,
  lines,
  pending,
  canAdjust,
  meId,
}: {
  providerId: string;
  balance: string;
  credited: string;
  debited: string;
  lines: readonly ProviderLedgerLine[];
  pending: PendingProviderAdjustment | null;
  canAdjust: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ direction: 'CREDIT', amount: '', reason: '' });

  const amountNumber = Number(toLatinDigits(form.amount));
  const ready =
    Number.isFinite(amountNumber) && amountNumber > 0 && form.reason.trim().length >= REASON_MIN;

  const submit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/providers/${providerId}/ledger`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          direction: form.direction,
          amount: amountNumber,
          reason: form.reason.trim(),
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر إرسال الطلب.');
        return;
      }
      setForm({ direction: 'CREDIT', amount: '', reason: '' });
      setToast('أُرسل الطلب — ينتظر موافقة شخصٍ ثانٍ.');
      router.refresh();
    });
  };

  const approve = (): void => {
    if (pending === null) return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/provider-adjustments/${pending.id}/approve`, {
        method: 'POST',
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّرت الموافقة.');
        return;
      }
      setToast('نُفِّذ القيد وكُتب في دفتر الحسابات.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3.5">
        <span className="text-2xs opacity-70">ما له علينا الآن</span>
        <Money amount={Number(balance)} decimals={2} size="lg" />
      </div>

      <div className="mb-4 flex flex-wrap gap-x-7 gap-y-2 text-2xs">
        <span className="flex flex-col gap-0.5">
          <span className="opacity-70">استُحقّ له</span>
          <Money amount={Number(credited)} decimals={2} showCurrency={false} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="opacity-70">سُدِّد أو خُصم</span>
          <Money amount={Number(debited)} decimals={2} showCurrency={false} />
        </span>
      </div>

      {/* **الطلب المعلّق أوّلًا** — فلا يكتب أحدٌ طلبًا ثانيًا يُرفض. */}
      {pending === null ? null : (
        <div className="mb-4 rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 flex flex-wrap items-center gap-2.5 text-2xs font-bold">
            <Badge tone="warn">ينتظر موافقة</Badge>
            {pending.direction === 'CREDIT' ? 'زيادة' : 'خصم'}
            <Money amount={Number(pending.amount)} decimals={2} showCurrency={false} />
          </p>
          <p className="mb-3 text-3xs leading-loose opacity-75">{pending.reason}</p>

          {pending.requestedBy === meId ? (
            <p className="text-3xs opacity-70">
              أنت طلبتَه — ولا يوافق طالبُه على نفسه. يلزم شخصٌ ثانٍ.
            </p>
          ) : canAdjust ? (
            <Button size="sm" disabled={busy} onClick={approve}>
              {busy ? 'جارٍ…' : 'أوافق وأنفّذ'}
            </Button>
          ) : (
            <p className="text-3xs opacity-70">لا تملك صلاحية الموافقة على قيود المزوّدين.</p>
          )}
        </div>
      )}

      {canAdjust && pending === null ? (
        <div className="mb-5 rounded-lg border border-line p-4">
          <p className="mb-3 text-2xs font-bold">قيدٌ على الحساب</p>

          <div className="mb-3 flex gap-2">
            {(
              [
                ['CREDIT', 'زِد ما له علينا'],
                ['DEBIT', 'اخصم من حسابه'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, direction: key })}
                className={`rounded-btn border px-3.5 py-2 text-2xs font-bold ${
                  form.direction === key
                    ? 'border-ink bg-ink text-bg'
                    : 'border-line hover:border-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">المبلغ بالريال</span>
            {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
            <input
              dir="ltr"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="rounded-md border border-line bg-surface px-3 py-2 text-start font-num text-sm"
            />
          </label>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">السبب — إلزاميّ</span>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder="سُدِّد بحوالة بنكية بمرجع TRF-…"
              className="rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-loose"
            />
            <span className="text-3xs opacity-65">
              <Quantity unit="characters" count={REASON_MIN} /> فأكثر — ويُقرأ بعد سنة.
            </span>
          </label>

          <Button size="sm" disabled={busy || !ready} onClick={submit}>
            {busy ? 'جارٍ…' : 'أرسل الطلب'}
          </Button>

          <p className="mt-2.5 text-3xs leading-loose opacity-70">
            <b>لا يقع القيد بهذه الضغطة.</b> يُرسَل طلبٌ ويوافق عليه شخصٌ ثانٍ، ثم
            يُكتب في دفتر الحسابات.
          </p>
        </div>
      ) : null}

      <p className="mb-2.5 text-2xs font-bold opacity-70">
        كشف الحساب — <Quantity unit="ledgerLines" count={lines.length} />
      </p>

      {lines.length === 0 ? (
        <p className="text-2xs opacity-70">لا حركة على حسابه بعد.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {lines.map((line) => (
            <div key={line.id} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-2xs">
                  {PROVIDER_EVENT_LABEL[line.event] ?? line.event}
                </span>
                <span className="font-num text-3xs opacity-65">
                  {new Date(line.at).toLocaleDateString(AR_DATE_LOCALE)}
                  {line.note === null ? '' : ` · ${line.note}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {/* السالب يحتفظ بإشارته يسارًا — و`Money` تتكفّل */}
                <Money amount={Number(line.amount)} decimals={2} showCurrency={false} />
                <span className="font-num text-3xs opacity-65">
                  الرصيد {displayDigits(line.runningBalance)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
