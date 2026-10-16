'use client';

import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import {} from '@/lib/arabic';
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
/**
 * مضاعفات الخطوة للزيادات السريعة — **صفرٌ أوّلًا**: أكثر المزايدات
 * بأقلّ مقبول، فجعلُه زرًّا يوفّر الكتابة كلّها.
 */
const STEPS = [0, 1, 3] as const;

export function BidPanel({
  listingRef,
  live,
  minimumNext,
  increment,
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
  /** خطوة المزايدة — منها تُبنى الزيادات السريعة. */
  increment: string;
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
  /**
   * **اختياريّة — ومكوّنُ الخادم لا يُمرّر دالّة.** تمريرُها من مكوّن
   * خادم يردّ ٥٠٠ كاملة لا لوحةً ناقصة (البوابة ١٨). فصفحةُ المركبة
   * تُركّب اللوحة بلا رادّ، وتقع التحديثة على `router.refresh`.
   *
   * ومن يملك لقطةً حيّة يُمرّرها ليحدّثها بنفسه: `router.refresh` لا
   * يمسّ حالةً يحفظها العميل، فتنجح المزايدة ويبقى السعر كما هو —
   * وهو شكل الفشل تمامًا.
   */
  onPlaced?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  /**
   * ═══ وسيلة الدفع — تُسأل عند أوّل مزايدة وحدها ═══
   *
   * الحجز صار ماليًّا (المهمّة ٦٦)، فأوّل مزايدة تحتاج بطاقة.
   * **ولا تُسأل مقدّمًا**: أكثر من يفتح الصفحة لا يزايد، وطلبُ بطاقةٍ
   * قبل أن يقرّر يطرده. فتُفتح حين يردّ الخادم `DEPOSIT_METHOD_REQUIRED`
   * — وهو يعرف وحده أللمزايد عربونٌ سابق أم لا.
   */
  const [method, setMethod] = useState<string | null>(null);
  const [needsCard, setNeedsCard] = useState(false);
  const [confirm, setConfirm] = useState(false);

  /** بلا جلسة: إلى الدخول ومعه وجهة العودة — لا رسالة ثم طريق مسدود. */
  const requireSession = (): boolean => {
    if (signedIn) return false;
    router.push(`/${locale}/auth?next=${encodeURIComponent(window.location.pathname)}`);
    return true;
  };

  /**
   * **والنجاح يذهب إلى الدفع لا يُخبر عنه.** الطلب يُنشأ في مرحلة
   * «دفع» بمهلةٍ تجري — فتركُ المشتري على شاشة المزاد بعد نجاحٍ يجعله
   * يبحث عمّا يدفع به، والمهلة تنقضي وهو يبحث.
   */
  const buyNowSubmit = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/auctions/${listingRef}/buy-now`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { next?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setConfirm(false);
        setToast(payload?.error?.messageAr ?? 'تعذّر الشراء الفوري.');
        return;
      }

      const next = payload?.data?.next;
      if (typeof next === 'string' && next !== '') {
        window.location.href = `/${locale}${next}`;
        return;
      }

      setConfirm(false);
      setToast('تمّ الشراء — وطلبك في مرحلة الدفع.');
      router.refresh();
    });
  };

  const submit = (): void => {
    const value = Number(toLatinDigits(amount).replace(/\D/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;

    start(async () => {
      const response = await fetch(`/api/v1/auctions/${listingRef}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: value,
          ...(method === null
            ? {}
            : { method, returnUrl: `${window.location.origin}${window.location.pathname}` }),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { code?: string; messageAr?: string; fields?: Record<string, string> } }
        | null;

      if (response === null || !response.ok) {
        const code = payload?.error?.code;

        /** «يلزم بطاقة» خطوةٌ لا خطأ — فتُفتح الوسائل ولا يُقال «تعذّرت». */
        if (code === 'DEPOSIT_METHOD_REQUIRED') {
          setNeedsCard(true);
          setToast(payload?.error?.messageAr ?? null);
          return;
        }

        /** تحدّي التحقّق: يُذهب به إلى وجهته ليُكمل. */
        if (code === 'DEPOSIT_REQUIRES_ACTION') {
          const url = payload?.error?.fields?.actionUrl ?? '';
          if (url !== '') {
            window.location.href = url;
            return;
          }
        }

        setToast(payload?.error?.messageAr ?? 'تعذّرت المزايدة.');
        return;
      }

      setNeedsCard(false);

      setToast('سُجّلت مزايدتك.');
      setOpen(false);
      setAmount('');
      if (onPlaced === undefined) router.refresh();
      else onPlaced();
    });
  };

  if (isOwn) {
    return (
      <p className="rounded-md border border-line px-4 py-3 text-2xs opacity-70">
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

      <p className="mb-4 flex flex-wrap items-center justify-center gap-1.5 text-2xs opacity-70">
        يلزم عربون <Money amount={Number(depositAmount)} />
      </p>

      {/* ═══ القاعدة ١٠ ═══ يختفي متى بلغت المزايدات الاحتياطي */}
      {/*
        ═══ «اشترِ الآن» — وكان يقول «قريبًا» ═══

        الزرّ معروضٌ منذ بُنيت هذه اللوحة، والبائع يضبط سعره في معالج
        البيع ويُخزَّن، والقاعدة ١٠ تحكم ظهوره — **وضغطُه يُخرج رسالة
        «الشراء الفوري قريبًا»**. فبائعٌ يضبط سعرًا فوريًّا يُوعَد ببيعٍ
        لا يقع، ومشترٍ يراه يُوعَد بشراءٍ لا يقع.

        **ويُسأل قبل أن يقع**: الشراء الفوري يُنهي المزاد ولا رجعة فيه،
        وزرٌّ واحد بينه وبين المال كثير.
      */}
      {buyNowPrice === null ? null : (
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => (requireSession() ? undefined : setConfirm(true))}
        >
          اشترِ الآن بـ <Money amount={Number(buyNowPrice)} />
        </Button>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="الشراء الفوري">
        <p className="mb-4 text-2xs leading-loose opacity-75">
          تشتري المركبة الآن بـ{' '}
          <b>
            <Money amount={Number(buyNowPrice ?? 0)} />
          </b>{' '}
          وينتهي المزاد فورًا — ولا رجعة فيه. ويُنشأ طلبٌ في مرحلة الدفع بمهلته.
        </p>
        <Button className="w-full" disabled={pending} onClick={buyNowSubmit}>
          {pending ? 'يُنفَّذ…' : 'أكّد الشراء'}
        </Button>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="مزايدة">
        <p className="mb-3.5 flex flex-wrap items-center gap-2 text-2xs opacity-75">
          أقلّ مزايدة مقبولة <Money amount={Number(minimumNext)} />
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold opacity-70">مبلغك</span>
          {/* الرقم يُدخل ويُقارن — لاتينيّ، والتطبيع عند الإرسال */}
          <input
            dir="ltr"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="font-num rounded-lg border border-line bg-surface px-3.5 py-2.5 text-lg font-bold"
          />
        </label>

        {/*
          ═══ الزيادات السريعة — والمزاد يُكسب بثوانٍ ═══

          التصميم يضع ثلاث خطوات فوق الحقل. وكتابةُ ستّ خانات بيدٍ على
          هاتف في آخر دقيقة هي الفرق بين مزايدةٍ تصل وأخرى تتأخّر —
          **والمزاد يمتدّ بالمزايدة الأخيرة**، فبطءُ الإدخال يغيّر
          النتيجة لا الراحة وحدها.

          والخطوات **مبنيّة على أقلّ مزايدة مقبولة** لا أرقامًا ثابتة:
          رقمٌ ثابت على مزادٍ بمئتي ألف يزيد جزءًا من الألف، وعلى مزادٍ
          بثلاثين ألفًا يقفز عشرها.
        */}
        <div className="mt-3 flex flex-wrap gap-2">
          {STEPS.map((factor) => {
            const value = Math.round(Number(minimumNext) + Number(increment) * factor);
            return (
              <button
                key={factor}
                type="button"
                onClick={() => setAmount(String(value))}
                className="rounded-full border border-line px-3.5 py-2 text-3xs font-bold hover:border-ink"
              >
                {/*
                  **والرقم يُجمَّع كجيرانه.** كان `displayDigits` يبدّل
                  الخانات ولا يفصل الآلاف، فتقرأ النافذة «أقلّ مزايدة
                  مقبولة ٦٩٬٦٢٥» ثمّ ثلاثة أزرارٍ تحتها «69625» —
                  صيغتان لرقمٍ واحد في نافذةٍ واحدة، وفي اللحظة التي
                  يُقرأ فيها الرقم بأسرع نظرة.
                */}
                <ArabicNumber value={value} />
              </button>
            );
          })}
        </div>
        {/*
          ═══ وسيلة العربون — تظهر عند أوّل مزايدة وحدها ═══

          والمبلغ **يُحجز ولا يُخصم**: يُفرَج فورًا لغير الفائزين،
          ويُخصم من مطلوب الفائز، ولا يُقبض إلّا ممّن رسا عليه ثم انسحب.
          وهذا هو ما يجعل المزايدة التزامًا لا نيّة.
        */}
        {!needsCard ? null : (
          <div className="mt-3.5 rounded-lg border border-ink p-4">
            <p className="mb-2.5 text-2xs font-bold">اختر بطاقةً لحجز العربون</p>
            <div className="mb-2.5 flex flex-wrap gap-2">
              {(
                [
                  ['mada', 'مدى'],
                  ['visa', 'فيزا'],
                  ['mastercard', 'ماستركارد'],
                  ['applepay', 'Apple Pay'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={
                    method === key
                      ? 'rounded-btn border border-ink bg-ink px-3.5 py-2 text-3xs font-bold text-bg'
                      : 'rounded-btn border border-line px-3.5 py-2 text-3xs font-bold hover:border-ink'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-3xs leading-loose opacity-70">
              يُحجز <Money amount={Number(depositAmount)} /> ولا يُخصم. ويُفرَج عنه فور
              انتهاء المزاد إن لم يرسُ عليك.
            </p>
          </div>
        )}

        {/*
          ═══ والشرط يُقال عند الالتزام لا بعده ═══

          كان النصّ يقول «يُحجز ولا يُخصم، ويُفرَج عنه إن لم يرسُ
          عليك» — **ويسكت عن الحالة الثالثة**: من رسا عليه ولم يدفع
          يُقبض عربونه. وهي الحالة الوحيدة التي يخسر فيها مالًا،
          فذكرُها بعد المزايدة اكتشافٌ في أسوأ توقيت.

          (وشروط المزاد أسفل الصفحة تقولها، لكنّ من يزايد يزايد من
          هنا — والتذكير يسبق لحظة الحاجة.)
        */}
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-3xs leading-loose opacity-70">
          يُحجز عربون <Money amount={Number(depositAmount)} /> على بطاقتك مرّةً واحدة ولا
          يُخصم، ويُفرَج عنه إن لم يرسُ عليك — ويُخصم من المطلوب إن رسا.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-warn-200 bg-warn-100 p-2.5 text-3xs leading-loose text-warn-900">
          وإن رسا عليك ولم تُكمل الشراء، يُقبض العربون ولا يُردّ.
        </p>
        <Button
          className="mt-4 w-full"
          disabled={pending || amount === '' || (needsCard && method === null)}
          onClick={submit}
        >
          {pending ? 'جارٍ…' : 'أرسل المزايدة'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
