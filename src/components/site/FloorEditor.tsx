'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ «عدّل الحد الأدنى» — ولم يكن لها باب ═══
 *
 * `minAcceptPrice` أرضيّةُ البائع المخفيّة: يرفض ما دونها تلقائيًّا.
 * **ويكتبها مرّةً في معالج البيع ثمّ لا يراها أبدًا** — لا شاشةَ تعرضها
 * ولا مسارَ يُنادى لتغييرها، وقد بُني كلاهما (`updateSellerListing`
 * و`PATCH /api/v1/listings/{ref}`) ولا زرَّ يبلغهما.
 *
 * فبائعٌ وضع أرضيّةً عاليةً في يومٍ متفائل يفاوض شهورًا ولا يفهم لماذا
 * لا يصله عرض — **والسبب رقمٌ كتبه هو ولا أحد يراه، ولا هو**.
 *
 * ═══ والمحوُ حالةٌ صريحة ═══
 *
 * «بلا حدّ» ليست حقلًا فارغًا يُحفظ: الفراغُ في الاستمارات يُقرأ «لا
 * تمسّه». فزرٌّ باسمه، والنطاق يقبل `null` صراحةً.
 */
export function FloorEditor({
  listingRef,
  askPrice,
  floor,
}: {
  listingRef: string;
  askPrice: number;
  floor: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(floor === null ? '' : String(floor));
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, start] = useTransition();

  const send = (next: number | null): void => {
    start(async () => {
      const response = await fetch(`/api/v1/listings/${listingRef}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minAcceptPrice: next }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast({ tone: 'error', text: payload?.error?.messageAr ?? 'تعذر الحفظ.' });
        return;
      }

      setOpen(false);
      setToast({
        tone: 'success',
        text: next === null ? 'رفع الحد الأدنى — كل عرض يصلك.' : 'حفظ الحد الأدنى.',
      });
      router.refresh();
    });
  };

  const submit = (): void => {
    const clean = toLatinDigits(value).replace(/[^\d]/g, '');
    if (clean === '') {
      setToast({ tone: 'error', text: 'اكتب مبلغا، أو ارفع الحد.' });
      return;
    }
    send(Number(clean));
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setValue(floor === null ? '' : String(floor));
            setOpen(true);
          }}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-3xs font-bold hover:bg-ink/5"
        >
          عدل الحد الأدنى
        </button>
        {toast === null ? null : <Toast tone={toast.tone} title={toast.text} />}
      </>
    );
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        {/*
          **والحقل يقبل كل صيغة لصق ويطبّعها** — والفواصلُ والأرقام
          العربية تُمحى عند الحفظ لا عند الكتابة.
        */}
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="لا حد"
          className="font-num w-28 min-w-0 rounded-lg border border-line bg-bg px-3 py-1.5 text-2xs outline-none focus:border-ink"
        />
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? 'جاري…' : 'احفظ'}
        </Button>
        {floor === null ? null : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => send(null)}>
            ارفع الحد
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          إلغاء
        </Button>
        {/*
          **والسقفُ يُقال قبل أن يُرفض.** حدٌّ فوق السعر المطلوب يرفض
          كلَّ عرضٍ بما فيه العرضُ بالسعر نفسه — فيقوله النطاق خطأً،
          ويقوله هذا قبل أن يُكتب.
        */}
        <span className="basis-full text-3xs opacity-70">
          لا يتجاوز السعر المطلوب <Money amount={askPrice} showCurrency={false} />
        </span>
      </form>
      {toast === null ? null : <Toast tone={toast.tone} title={toast.text} />}
    </>
  );
}
