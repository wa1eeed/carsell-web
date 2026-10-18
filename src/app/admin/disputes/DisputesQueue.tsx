'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import { Money } from '@/components/ui/Money';
import { RESOLUTION_LABEL } from '@/lib/labels/admin';
import { DisputeCard } from '@/components/admin/DisputeCard';
import type { DisputeRow } from '@/lib/domain/disputes';

const RESOLUTIONS = ['FULL_REFUND', 'PARTIAL_SETTLEMENT', 'RELEASE_TO_SELLER'] as const;

/** المنتهية — والحسم لصالح أحدهما حالتان لا حالة. */
const SETTLED: readonly string[] = ['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'];

/**
 * ═══ طابور النزاعات — والوحيد الذي يحرّك مال الضمان بقرار بشريّ ═══
 *
 * النطاق كان مبنيًّا كاملًا — فتحٌ واقتراحٌ وموافقةٌ بعضوين وتنفيذٌ تلقائيّ
 * — **ولا شاشة تبلغه**. فالنزاع يُفتح ويبقى، ومالُ الضمان محجوزًا بلا
 * قرار، ولا يعرف الفريق أن عليه شيئًا.
 *
 * **والاقتراح منفصل عن الاعتماد** في الشاشة كما هو في النطاق: من يقترح
 * لا يجد زرًّا يعتمد به، فلا يبدو النصاب إجراءً شكليًّا يضغطه واحد مرّتين.
 */
export function DisputesQueue({
  disputes,
  adminId,
  canResolve,
}: {
  disputes: readonly DisputeRow[];
  adminId: string;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [target, setTarget] = useState<DisputeRow | null>(null);
  const [resolution, setResolution] = useState<string>('FULL_REFUND');
  const [amount, setAmount] = useState('');

  const propose = (): void => {
    if (target === null) return;
    const value = Number(toLatinDigits(amount).replace(/\D/g, ''));

    start(async () => {
      const response = await fetch(`/api/v1/admin/disputes/${target.id}/propose`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resolution,
          ...(resolution === 'PARTIAL_SETTLEMENT' ? { amount: value } : {}),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر تسجيل الاقتراح.');
        return;
      }
      setToast('سجل الاقتراح — ينتظر موافقة عضو ثاني، ولم ينفذ بعد.');
      setTarget(null);
      setAmount('');
      router.refresh();
    });
  };

  const approve = (row: DisputeRow): void => {
    const approval = row.approval;
    if (approval === null) return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/disputes/${row.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId: approval.id }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { data?: { executed?: boolean }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر اعتماد القرار.');
        return;
      }
      setToast(
        body?.data?.executed === true
          ? 'نفذ القرار — وحرك مال الضمان بموجبه.'
          : 'سجلت موافقتك — ما زال ينتظر عضوا آخر.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {disputes.map((row) => {
          const isProposer = row.approval?.requestedBy === adminId;
          return (
            <DisputeCard key={row.id} row={row}>
              {!canResolve || SETTLED.includes(row.status) ? null : row.approval === null ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTarget(row);
                    setResolution('FULL_REFUND');
                    setAmount('');
                  }}
                >
                  اقترح قرارا
                </Button>
              ) : (
                /*
                  **والاقتراح منفصل عن الاعتماد** كما هو في النطاق: من
                  اقترح لا يجد زرًّا يعتمد به، فلا يبدو النصاب إجراءً
                  شكليًّا يضغطه واحدٌ مرّتين.
                */
                <span className="flex flex-col items-start gap-1.5 sm:items-end">
                  <span className="text-3xs opacity-70">
                    {RESOLUTION_LABEL[row.approval.resolution] ?? row.approval.resolution}
                    <span aria-hidden className="mx-1 opacity-40">
                      ·
                    </span>
                    <span className="font-num">
                      <ArabicNumber value={row.approval.approvals} grouped={false} />
                    </span>{' '}
                    من{' '}
                    <span className="font-num">
                      <ArabicNumber value={row.approval.required} grouped={false} />
                    </span>
                  </span>
                  <Button size="sm" disabled={pending || isProposer} onClick={() => approve(row)}>
                    {isProposer ? 'اقترحته — ينتظر عضوا آخر' : 'اعتمد القرار'}
                  </Button>
                </span>
              )}
            </DisputeCard>
          );
        })}
      </div>

      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title="اقتراح قرار في نزاع"
        className="w-[460px]"
        footer={
          <div className="flex gap-2.5">
            <Button
              size="sm"
              onClick={propose}
              disabled={pending || (resolution === 'PARTIAL_SETTLEMENT' && amount === '')}
            >
              اطلب الموافقة الثانية
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
              إلغاء
            </Button>
          </div>
        }
      >
        {target === null ? null : (
          <div className="flex flex-col gap-4">
            <p className="rounded-md border border-warn-200 bg-warn-100 p-3 text-2xs leading-loose text-warn-900">
              القرار لا ينفذ بضغطك: يسجل طلبا ينتظر عضوا ثانيا، وينفذ
              تلقائيا حين يكتمل النصاب — ولا تحويل يدوي بعده.
            </p>

            <p className="flex items-baseline gap-2 text-2xs">
              <span className="opacity-70">إجمالي الطلب</span>
              <Money amount={target.orderTotal} />
            </p>

            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold opacity-70">القرار</span>
              {RESOLUTIONS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-line p-3 text-2xs"
                >
                  <input
                    type="radio"
                    name="resolution"
                    checked={resolution === key}
                    onChange={() => setResolution(key)}
                  />
                  <span>{RESOLUTION_LABEL[key] ?? key}</span>
                </label>
              ))}
            </div>

            {resolution !== 'PARTIAL_SETTLEMENT' ? null : (
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs font-bold opacity-70">
                  مبلغ التسوية — دون الإجمالي
                </span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
                />
              </label>
            )}
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
