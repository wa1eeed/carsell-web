'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { AR_DATE_LOCALE, displayDigits } from '@/lib/arabic';
import type { PendingProviderPayout, ProviderPayoutLine } from '@/lib/domain/provider-payouts';

/**
 * ═══ حسابُه البنكيّ وما حُوِّل إليه ═══
 *
 * **والبابُ قبل القفل**: `requestProviderPayout` تردّ `NO_IBAN`، ولم
 * يكن في المنتج مسارٌ يكتب آيبان مزوّد — فكان الشرط مفروضًا بلا وسيلةٍ
 * لاستيفائه. وهذا الحقل هو البابُ، وهو في الصفحة التي يُقرأ فيها
 * المانع.
 *
 * ═══ ولا يُقرأ الآيبان كاملًا ═══
 *
 * يُعرض `SA03••••7519`: المشغّل يطابق به حوالةً فيكفيه طرفاه، والعمود
 * مشفَّر فإخراجُه كاملًا يُبطل تشفيره. والكتابةُ وحدها تعبر.
 */

const IBAN_REASON: Record<string, string> = {
  INVALID_FORMAT: 'الصيغة غير صحيحة — آيبان سعودي من ٢٤ خانة يبدأ بـSA.',
  NOT_SAUDI: 'الآيبان ليس سعوديا.',
  CHECKSUM: 'خانتا التحقق لا تطابقان الرقم — راجع خانة خانة.',
};

const PAYOUT_REASON: Record<string, string> = {
  NO_IBAN: 'لا آيبان مسجل — يدخل أولا.',
  EXCEEDS_PAYABLE: 'المبلغ أكبر من حقه القائم.',
  BAD_AMOUNT: 'المبلغ غير صحيح.',
  ALREADY_PENDING: 'له طلب مفتوح ينتظر مرجع الحوالة — يعتمد أو يلغى أولا.',
  BANK_REF_REQUIRED: 'اكتب مرجع الحوالة البنكية.',
  NOT_PENDING: 'لم يبق الطلب منتظرا.',
  EXPIRED: 'انقضت مهلة الطلب — يفتح طلب جديد.',
};

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

export function BankAccount({
  providerId,
  ibanMasked,
  payable,
  pending,
  sent,
  canSend,
  meId,
}: {
  providerId: string;
  ibanMasked: string | null;
  payable: string;
  pending: PendingProviderPayout | null;
  sent: readonly ProviderPayoutLine[];
  canSend: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [editing, setEditing] = useState(ibanMasked === null);
  /**
   * **ولا تُنسَخ الخاصّية في حالة** (البوابة ٣٠): `useState(payable)`
   * يُجمَّد الرقم على ما كان عند أوّل تصيير، فيبقى بعد `router.refresh`
   * يقول مبلغًا سُدّد نصفُه. فالحالةُ **تجاوزُ المحرّر** وحده، والقيمة
   * تُشتقّ: ما لم يُكتب شيءٌ فهي الحقُّ القائم أيًّا كان.
   */
  const [typed, setTyped] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState('');

  const amount = typed ?? payable;
  const owed = Number(payable);

  const saveIban = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/providers/${providerId}/iban`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ iban }),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as {
        error?: { details?: Record<string, string> };
      } | null;

      if (response === null || !response.ok) {
        const key = payload?.error?.details?.iban;
        setToast((key === undefined ? undefined : IBAN_REASON[key]) ?? 'تعذر الحفظ.');
        return;
      }
      setIban('');
      setEditing(false);
      setToast('حفظ الحساب البنكي.');
      router.refresh();
    });
  };

  const say = (payload: { error?: { details?: Record<string, string> } } | null): string => {
    const key = payload?.error?.details?.payout;
    return (key === undefined ? undefined : PAYOUT_REASON[key]) ?? 'تعذر تنفيذ الطلب.';
  };

  const requestPayout = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/provider-payouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId, amount }),
      }).catch(() => null);
      if (response === null || !response.ok) {
        setToast(say((await response?.json().catch(() => null)) as Parameters<typeof say>[0]));
        return;
      }
      setToast('سجل طلب التحويل. نفذ الحوالة ثم أدخل مرجعها.');
      router.refresh();
    });
  };

  const approve = (): void => {
    if (pending === null) return;
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/provider-payouts/${encodeURIComponent(pending.id)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bankRef }),
        },
      ).catch(() => null);
      if (response === null || !response.ok) {
        setToast(say((await response?.json().catch(() => null)) as Parameters<typeof say>[0]));
        return;
      }
      setBankRef('');
      setToast('سجلت الحوالة — وخصم الدين من الدفتر.');
      router.refresh();
    });
  };

  const cancel = (): void => {
    if (pending === null) return;
    start(async () => {
      const response = await fetch(
        `/api/v1/admin/provider-payouts/${encodeURIComponent(pending.id)}/reject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'ألغي من صفحة المزود' }),
        },
      ).catch(() => null);
      if (response === null || !response.ok) {
        setToast(say((await response?.json().catch(() => null)) as Parameters<typeof say>[0]));
        return;
      }
      setToast('ألغي الطلب.');
      router.refresh();
    });
  };

  return (
    <>
      {/* ═══ أين يُحوَّل ═══ */}
      <div className="flex flex-col gap-2.5 border-b border-line pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-2xs opacity-70">الآيبان</span>
          {ibanMasked === null ? (
            <Badge tone="warn">لم يدخل</Badge>
          ) : (
            <span dir="ltr" className="font-num text-sm font-bold">
              {displayDigits(ibanMasked)}
            </span>
          )}
        </div>

        {!canSend ? (
          <p className="text-3xs leading-loose opacity-65">
            تبديل وجهة المال يحتاج صلاحية التحويل.
          </p>
        ) : editing ? (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-3xs opacity-70">
                آيبان سعودي — يلصق بمسافاته كما هو من تطبيق المصرف
              </span>
              {/*
                `dir="ltr"` — يُنسخ من مصدرٍ لاتينيّ ويُقارن خانةً بخانة.
              */}
              <input
                dir="ltr"
                value={iban}
                placeholder="SA00 0000 0000 0000 0000 0000"
                onChange={(event) => setIban(event.target.value)}
                className="font-num w-full min-w-0 rounded-md border border-line bg-bg px-3 py-2 text-xs font-bold"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy || iban.trim() === ''} onClick={saveIban}>
                {busy ? 'جاري…' : 'احفظ'}
              </Button>
              {ibanMasked === null ? null : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  تراجع
                </Button>
              )}
            </div>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            بدل الحساب
          </Button>
        )}
      </div>

      {/* ═══ ما بقي له ═══ */}
      <div className="flex flex-col gap-1 border-b border-line py-4">
        <span className="text-3xs opacity-70">مستحق ولم يحول</span>
        <Money amount={owed} size="lg" decimals={2} />
        <p className="mt-1 text-3xs leading-loose opacity-70">
          من دفتر الحسابات — ينمو بكل خدمة ينجزها، وينقص بما حول إليه.
        </p>
      </div>

      {/* ═══ طلبٌ قائم ═══ */}
      {pending !== null ? (
        <div className="flex flex-col gap-3 border-b border-line py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs opacity-70">طلب تحويل ينتظر مرجع الحوالة</span>
            <Money amount={Number(pending.amount)} decimals={2} />
          </div>
          {pending.requestedBy === meId ? (
            <>
              <p className="text-3xs leading-loose opacity-70">
                أنت الطالب — يعتمده غيرك. ولك إلغاؤه.
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={cancel}>
                ألغ الطلب
              </Button>
            </>
          ) : !canSend ? (
            <p className="text-3xs leading-loose opacity-70">لا تملك صلاحية التحويل.</p>
          ) : (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-3xs opacity-70">مرجع الحوالة البنكية</span>
                <input
                  dir="ltr"
                  value={bankRef}
                  onChange={(event) => setBankRef(event.target.value)}
                  className="font-num w-full min-w-0 rounded-md border border-line bg-bg px-3 py-2 text-xs font-bold"
                />
              </label>
              <p className="text-3xs leading-loose opacity-70">
                بهذا التسجيل <b>يخصم الدين</b> — فلا تسجلها قبل أن تخرج الحوالة فعلا.
              </p>
              <Button size="sm" disabled={busy || bankRef.trim().length < 4} onClick={approve}>
                {busy ? 'جاري…' : 'سجل الحوالة'}
              </Button>
            </>
          )}
        </div>
      ) : !canSend || owed <= 0 ? null : ibanMasked === null ? (
        <div className="border-b border-line py-4">
          <p className="text-3xs leading-loose opacity-70">
            لا تحويل قبل الآيبان — أدخله أعلاه.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 border-b border-line py-4">
          <label className="flex flex-col gap-2">
            <span className="text-3xs opacity-70">المبلغ المطلوب تحويله</span>
            <input
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setTyped(event.target.value)}
              className="font-num w-full min-w-0 rounded-md border border-line bg-bg px-3 py-2 text-xs font-bold"
            />
          </label>
          <p className="text-3xs leading-loose opacity-70">
            هذه الضغطة <b>لا تحرك المبلغ</b> — تفتح الطلب فقط. نفذ الحوالة من البنك،
            ثم أدخل مرجعها هنا لتكتمل.
          </p>
          <Button size="sm" disabled={busy} onClick={requestPayout}>
            {busy ? 'جاري…' : 'اطلب التحويل'}
          </Button>
        </div>
      )}

      {/* ═══ وما وصله فعلًا ═══ */}
      <div className="pt-4">
        <h3 className="mb-2.5 text-2xs font-bold opacity-80">ما حول إليه</h3>
        {sent.length === 0 ? (
          <p className="text-3xs leading-loose opacity-65">لم تخرج حوالة بعد.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {sent.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-3xs opacity-70">
                    {riyadh.format(new Date(row.sentAt))}
                  </span>
                  <span dir="ltr" className="font-num truncate text-3xs opacity-65">
                    {row.bankRef ?? '—'}
                  </span>
                </div>
                <Money amount={Number(row.amount)} decimals={2} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
