'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Money } from '@/components/ui/Money';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';
import { TaxStatusDialog } from './TaxStatusDialog';
import type { TaxProfile } from '@/lib/domain/tax-profile';

/**
 * ═══ أزرار الشراء — والزرّ يفعل ما يقول ═══
 *
 * كانت الثلاثة بلا `onClick`: تبدو حيّة ولا يقع بضغطها شيء. وزرٌّ حيُّ
 * المظهر ميّتُ الأثر أسوأ من زرٍّ معطَّل — المستخدم يظنّ أن العطل فيه
 * فيعيد الضغط، ثم يترك المنصّة وهو يظنّها معطّلة.
 *
 * ═══ والوضع الضريبيّ يُسأل هنا ═══
 *
 * أوّل شراءٍ هو أوّل إجراءٍ ماليّ، وهو موضع السؤال المؤجَّل. والخادم
 * يردّ `TAX_STATUS_REQUIRED` فتُفتح النافذة **وتُعاد المحاولة تلقائيًّا**
 * بعد الحفظ: من أجاب لا يُطلب منه أن يضغط ثانيةً.
 */
export function BuyActions({
  listingRef,
  price,
  type,
  isOwn,
  signedIn,
  locale,
  taxProfile,
}: {
  listingRef: string;
  price: number;
  type: 'DIRECT' | 'NEGOTIATION' | 'AUCTION';
  isOwn: boolean;
  signedIn: boolean;
  locale: string;
  taxProfile: TaxProfile | null;
}) {
  const t = useTranslations('ui');
  const tb = useTranslations('buy');
  const router = useRouter();
  const [pending, start] = useTransition();

  const [toast, setToast] = useState<string | null>(null);
  const [tax, setTax] = useState<TaxProfile | null>(taxProfile);
  const [askingTax, setAskingTax] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');

  /** بلا جلسة: إلى الدخول ومعه وجهة العودة — لا رسالة ثم طريق مسدود. */
  const requireSession = (): boolean => {
    if (signedIn) return false;
    router.push(`/${locale}/auth?next=${encodeURIComponent(window.location.pathname)}`);
    return true;
  };

  const buy = (): void => {
    if (requireSession() || pending) return;

    start(async () => {
      const response = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // مفتاحٌ لكل محاولة شراء — الضغطة المزدوجة لا تُنشئ طلبين
          'idempotency-key': `buy-${listingRef}-${String(Date.now())}`,
        },
        body: JSON.stringify({ listingRef }),
      }).catch(() => null);

      if (response === null) {
        setToast(tb('networkFailed'));
        return;
      }

      if (response.status === 428) {
        // لم يُسأل بعد — تُفتح النافذة، والحفظ يعيد المحاولة
        setAskingTax(true);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { data?: { orderRef: string }; error?: { messageAr?: string; messageEn?: string } }
        | null;

      if (!response.ok) {
        setToast(
          (locale === 'ar' ? payload?.error?.messageAr : payload?.error?.messageEn) ??
            tb('buyFailed'),
        );
        return;
      }

      const ref = payload?.data?.orderRef;
      if (ref === undefined) {
        setToast(tb('buyFailed'));
        return;
      }
      // إلى صفحة الطلب — حيث المهلة والمبالغ وما بقي من الخطوات
      router.push(`/${locale}/account/orders/${ref}`);
    });
  };

  const submitOffer = (): void => {
    const amount = Number(toLatinDigits(offerAmount).replace(/\D/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;

    start(async () => {
      const response = await fetch('/api/v1/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingRef, amount }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast(tb('offerFailed'));
        return;
      }

      const payload = (await response.json()) as { data?: { autoRejected?: boolean } };
      /**
       * **الرفض التلقائي ليس فشلًا.** العرض وصل والبائع وضع حدًّا دونه،
       * ورسالةُ فشلٍ هنا تقول للمشتري إن عرضه لم يُرسَل وهو خلاف الواقع.
       */
      setToast(payload.data?.autoRejected === true ? tb('offerBelowFloor') : tb('offerSent'));
      setOfferOpen(false);
      setOfferAmount('');
      router.refresh();
    });
  };

  if (isOwn) {
    return (
      <p className="mb-4 rounded-md border border-line px-4 py-3 text-2xs opacity-60">
        {tb('ownListing')}
      </p>
    );
  }

  return (
    <>
      <Button className="mb-2.5 w-full" onClick={buy} disabled={pending}>
        {pending ? tb('working') : t('buyViaEscrow')}
      </Button>

      <div className="mb-4 flex gap-2">
        {type !== 'NEGOTIATION' ? null : (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => (requireSession() ? undefined : setOfferOpen(true))}
          >
            {t('makeOffer')}
          </Button>
        )}
        <Button
          variant="ghost"
          className="flex-1 border border-line"
          onClick={() => (requireSession() ? undefined : setToast(tb('viewingSoon')))}
        >
          {t('requestViewing')}
        </Button>
      </div>

      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title={t('makeOffer')}>
        <p className="mb-3.5 flex flex-wrap items-center gap-2 text-2xs opacity-65">
          {tb('askingPrice')}
          <Money amount={price} />
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-60">{tb('yourOffer')}</span>
          {/* الرقم يُدخل ويُقارن — لاتينيّ، والتطبيع عند الإرسال */}
          <input
            dir="ltr"
            inputMode="numeric"
            value={offerAmount}
            onChange={(event) => setOfferAmount(event.target.value)}
            className="font-num rounded-lg border border-line bg-surface px-3.5 py-2.5 text-lg font-bold"
          />
        </label>
        <p className="mt-3 text-3xs leading-loose opacity-50">{tb('offerNote')}</p>
        <Button
          className="mt-4 w-full"
          disabled={pending || offerAmount === ''}
          onClick={submitOffer}
        >
          {pending ? tb('working') : tb('sendOffer')}
        </Button>
      </Modal>

      <TaxStatusDialog
        open={askingTax}
        onClose={() => setAskingTax(false)}
        initial={tax}
        onSaved={(profile) => {
          setTax(profile);
          setAskingTax(false);
          // أجاب ⇒ تُستأنف نيّته، ولا يُطلب منه الضغط ثانيةً
          buy();
        }}
      />

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
