'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/cn';

/**
 * ═══ قلبُ المفضّلة ═══
 *
 * **ولم يكن في المنتج قلبٌ واحد.** الصفحة تعرض المفضّلة، والحساب
 * يعدّها، وترشيحُ الحملات يستهدفها — وكلُّ ما يُعرض مصدرُه الزرع.
 *
 * ═══ والزائر يُدعى لا يُمنع ═══
 *
 * من لم يدخل يُؤخذ إلى الدخول **ومعه موضعُه** فيعود إلى حيث كان —
 * ورسالةُ «سجّل دخولك» بلا رابط تُنهي الرحلة عند أوّل رغبة.
 */
export function FavoriteButton({
  listingRef,
  initial,
  signedIn,
  signInHref,
  className,
}: {
  listingRef: string;
  initial: boolean;
  signedIn: boolean;
  signInHref: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  /**
   * ═══ القلب يُشتقّ من المركبة لا يُنسخ مرّة ═══
   *
   * **تفاؤليّ**: يمتلئ قبل أن يردّ الخادم ويعود إن فشل — فالقلب الذي
   * ينتظر الشبكة يُضغط مرّتين.
   *
   * وكان `useState(initial)`، وهو يُقرأ **عند التركيب وحده**: الانتقال
   * من مركبةٍ إلى أخرى داخل الصفحة لا يُعيد تركيب الزرّ، فيحمل قلبُ
   * الثانية حالَ الأولى — ممتلئًا على ما لم يُحفظ، أو فارغًا على
   * محفوظ. والبديل اشتقاقٌ بلا مزامنة: نحفظ **أيّ مركبةٍ** قُلبت،
   * فتصدُق على مركبتها وحدها.
   */
  const [flipped, setFlipped] = useState<{ ref: string; on: boolean } | null>(null);
  const on = flipped !== null && flipped.ref === listingRef ? flipped.on : initial;
  const setOn = (value: boolean): void => setFlipped({ ref: listingRef, on: value });

  const toggle = (): void => {
    if (!signedIn) {
      router.push(signInHref);
      return;
    }

    const next = !on;
    setOn(next);

    start(async () => {
      const response = await fetch(`/api/v1/listings/${listingRef}/favorite`, {
        method: 'POST',
      }).catch(() => null);

      if (response === null || !response.ok) {
        setOn(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? 'أزِلها من المفضّلة' : 'أضِفها إلى المفضّلة'}
      className={cn(
        'flex size-9 items-center justify-center rounded-full border transition-colors',
        on ? 'border-danger bg-danger text-bg' : 'border-line bg-bg/85 hover:border-ink',
        className,
      )}
    >
      {/* القلب ممتلئ أو مفرَّغ — والفرق يُرى بلا قراءة */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-4.5"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}
