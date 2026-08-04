'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ المزايدة — الزرّ الذي كان بلا `onClick` ═══
 *
 * `placeBid` و`holdDeposit` مبنيّتان ومختبَرتان منذ المهمة ١٩، والمسار
 * كان يصدّر `GET` وحده، والزرّ معطَّلًا بلا معالج. فالمزاد **يُعرَض
 * ولا يُزايَد فيه** — يراه الزائر حيًّا بعدّاده وسعره ولا يستطيع دخوله.
 *
 * ═══ والعربون يُقال قبل الضغط ═══
 *
 * القاعدة ٩: لا مزايدة بلا عربون محجوز. واكتشافُه بعد إدخال المبلغ
 * أسوأ توقيت — فالمبلغ يُذكر في النافذة قبل أن يكتب المزايد شيئًا.
 */
export function BidPanel({
  listingRef,
  live,
  minimumNext,
  depositAmount,
  buyNowPrice,
  signedIn,
  isOwn,
  locale,
  onPlaced,
}: {
  listingRef: string;
  live: boolean;
  minimumNext: string;
  depositAmount: string;
  buyNowPrice: string | null;
  signedIn: boolean;
  isOwn: boolean;
  locale: string;
  /**
   * لقطةٌ فورية بعد المزايدة.
   *
   * **والشاشة تحفظ حال المزاد في حالتها**، فـ`router.refresh` لا يمسّها:
   * كانت مزايدتك تنجح ولا تظهر حتى يصل بثٌّ أو تمرّ ثلاثون ثانية —
   * فيقرأ المزايد نجاحًا ويرى سعرًا لم يتغيّر، وهو شكل الفشل تمامًا.
   */
  onPlaced: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  /** بلا جلسة: إلى الدخول ومعه وجهة العودة — لا رسالة ثم طريق مسدود. */
  const requireSession = (): boolean => {
    if (signedIn) return false;
    router.push(`/${locale}/auth?next=${encodeURIComponent(window.location.pathname)}`);
    return true;
  };

  const submit = (): void => {
    const value = Number(toLatinDigits(amount).replace(/\D/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;

    start(async () => {
      const response = await fetch(`/api/v1/auctions/${listingRef}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: value }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّرت المزايدة.');
        return;
      }

      setToast('سُجّلت مزايدتك.');
      setOpen(false);
      setAmount('');
      onPlaced();
    });
  };

  if (isOwn) {
    return (
      <p className="rounded-md border border-line px-4 py-3 text-2xs opacity-60">
        مزادك — لا تزايد على مركبتك.
      </p>
    );
  }

  return (
    <>
      <Button
        className="mb-2.5 w-full"
        disabled={!live || pending}
        onClick={() => (requireSession() ? undefined : setOpen(true))}
      >
        زايد الآن
      </Button>

      <p className="mb-4 flex flex-wrap items-center justify-center gap-1.5 text-2xs opacity-55">
        يلزم عربون <Money amount={Number(depositAmount)} />
      </p>

      {/* ═══ القاعدة ١٠ ═══ يختفي متى بلغت المزايدات الاحتياطي */}
      {buyNowPrice === null ? null : (
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => (requireSession() ? undefined : setToast('الشراء الفوري قريبًا.'))}
        >
          اشترِ الآن بـ <Money amount={Number(buyNowPrice)} />
        </Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="مزايدة">
        <p className="mb-3.5 flex flex-wrap items-center gap-2 text-2xs opacity-65">
          أقلّ مزايدة مقبولة <Money amount={Number(minimumNext)} />
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">مبلغك</span>
          {/* الرقم يُدخل ويُقارن — لاتينيّ، والتطبيع عند الإرسال */}
          <input
            dir="ltr"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="font-num rounded-lg border border-line bg-surface px-3.5 py-2.5 text-lg font-bold"
          />
        </label>
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-3xs leading-loose opacity-50">
          يُحجز عربون <Money amount={Number(depositAmount)} /> مرّةً واحدة، ويُردّ إن لم ترسُ عليك.
        </p>
        <Button className="mt-4 w-full" disabled={pending || amount === ''} onClick={submit}>
          {pending ? 'جارٍ…' : 'أرسل المزايدة'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
