'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';
import type { PendingAdjustment, WalletLine } from '@/lib/domain/wallet';

/**
 * ═══ محفظة العميل — والمال لا يمسّه واحد ═══
 *
 * الإضافة والخصم **يُطلبان هنا ولا يقعان**: يُنشأ طلبٌ ويوافق عليه
 * شخصٌ ثانٍ. والشاشة تقول ذلك قبل الضغط لا بعده — فمن ضغط «أضِف»
 * وانتظر رصيدًا لا يظهر يظنّ النظام معطوبًا.
 *
 * **والسبب مكتوبٌ إلزامًا**: منحةٌ بلا سبب تُقرأ بعد سنةٍ على أنها خطأ
 * — أو أسوأ.
 */

const REASON_MIN = 10;

export function WalletPanel({
  userId,
  balance,
  lines,
  pending,
  canAdjust,
  meId,
}: {
  userId: string;
  balance: string;
  lines: readonly WalletLine[];
  pending: PendingAdjustment | null;
  canAdjust: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ direction: 'CREDIT', amount: '', reason: '' });

  const amount = Number(toLatinDigits(form.amount).replace(/[^\d.]/g, ''));
  const ready = amount > 0 && form.reason.trim().length >= REASON_MIN;

  const submit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/users/${userId}/wallet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          direction: form.direction,
          amount,
          reason: form.reason.trim(),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { fields?: Record<string, string> } }
        | null;

      if (response === null || !response.ok) {
        const field = payload?.error?.fields?.wallet;
        setToast(
          field === 'INSUFFICIENT_BALANCE'
            ? 'الرصيد أقلّ من مبلغ الخصم.'
            : field === 'ALREADY_PENDING'
              ? 'يوجد طلبٌ معلّق لهذا العميل — يُبَتّ فيه أوّلًا.'
              : field === 'REASON_TOO_SHORT'
                ? 'اكتب سببًا أوضح.'
                : 'تعذّر إرسال الطلب.',
        );
        return;
      }

      setToast('أُرسل الطلب — ينتظر موافقة شخصٍ ثانٍ.');
      setForm({ direction: 'CREDIT', amount: '', reason: '' });
      router.refresh();
    });
  };

  const approve = (): void => {
    if (pending === null) return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/wallet-adjustments/${pending.id}/approve`, {
        method: 'POST',
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast(
          response?.status === 403
            ? 'لا توافق على طلبٍ أنت طلبتَه — يلزم شخصٌ ثانٍ.'
            : 'تعذّرت الموافقة.',
        );
        return;
      }

      setToast('نُفِّذ التعديل وقُيِّد في دفتر الحسابات.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3.5">
        <span className="text-2xs opacity-60">الرصيد الحالي</span>
        <Money amount={Number(balance)} size="lg" />
      </div>

      {/*
        **الطلب المعلّق أوّلًا.** ومن يفتح الشاشة ليضيف رصيدًا وهناك
        طلبٌ ينتظره يجب أن يراه قبل أن يكتب طلبًا ثانيًا يُرفض.
      */}
      {pending === null ? null : (
        <div className="mb-4 rounded-lg border border-warn-200 bg-warn-100 p-4">
          <p className="mb-2 flex flex-wrap items-center gap-2.5 text-2xs font-bold">
            <Badge tone="warn">ينتظر موافقة</Badge>
            {pending.direction === 'CREDIT' ? 'إضافة' : 'خصم'}
            <Money amount={Number(pending.amount)} showCurrency={false} />
          </p>
          <p className="mb-3 text-3xs leading-loose opacity-70">{pending.reason}</p>

          {pending.requestedBy === meId ? (
            <p className="text-3xs opacity-60">
              أنت طلبتَه — ولا يوافق طالبُه على نفسه. يلزم شخصٌ ثانٍ.
            </p>
          ) : canAdjust ? (
            <Button size="sm" disabled={busy} onClick={approve}>
              {busy ? 'جارٍ…' : 'أوافق وأنفّذ'}
            </Button>
          ) : (
            <p className="text-3xs opacity-60">لا تملك صلاحية الموافقة على تعديل الأرصدة.</p>
          )}
        </div>
      )}

      {canAdjust && pending === null ? (
        <div className="mb-5 rounded-lg border border-line p-4">
          <p className="mb-3 text-2xs font-bold">تعديل الرصيد</p>

          <div className="mb-3 flex gap-2">
            {(
              [
                ['CREDIT', 'إضافة رصيد'],
                ['DEBIT', 'خصم من الرصيد'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, direction: key })}
                className={`rounded-btn border px-3.5 py-2 text-2xs font-bold ${
                  form.direction === key ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-60">المبلغ بالريال</span>
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
            <span className="text-3xs font-bold opacity-60">السبب — إلزاميّ</span>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder="تعويض عن تأخّر الشحن في الطلب ORD-…"
              className="rounded-md border border-line bg-surface px-3 py-2 text-2xs leading-loose"
            />
            <span className="text-3xs opacity-45">
              أحرف ({toArabicDigits(String(REASON_MIN))}) فأكثر — ويُقرأ بعد سنة.
            </span>
          </label>

          <Button size="sm" disabled={busy || !ready} onClick={submit}>
            {busy ? 'جارٍ…' : 'أرسل الطلب'}
          </Button>

          <p className="mt-2.5 text-3xs leading-loose opacity-55">
            <b>لا يقع التعديل بهذه الضغطة.</b> يُرسَل طلبٌ ويوافق عليه شخصٌ ثانٍ، ثم
            يُقيَّد في دفتر الحسابات.
          </p>
        </div>
      ) : null}

      <p className="mb-2.5 text-2xs font-bold opacity-60">
        كشف المحفظة ({toArabicDigits(String(lines.length))})
      </p>

      {lines.length === 0 ? (
        <p className="text-2xs opacity-50">لا حركة على المحفظة.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {lines.map((line) => (
            <div key={line.id} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-2xs">{line.note ?? line.kind}</span>
                <span className="font-num text-3xs opacity-45">
                  {new Date(line.at).toLocaleDateString('ar-SA-u-ca-gregory')}
                  {line.orderRef === null ? '' : ` · ${line.orderRef}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {/* السالب يحتفظ بإشارته يسارًا — و`Money` تتكفّل */}
                <Money amount={Number(line.amount)} showCurrency={false} />
                <span className="font-num text-3xs opacity-45">
                  الرصيد {toArabicDigits(line.runningBalance)}
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
