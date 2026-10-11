'use client';

import { useEffect, useRef } from 'react';
import type { ServedAd } from '@/lib/domain/ad-rules';

/**
 * ═══ بطاقة الإعلان المموّل في نتائج البحث ═══
 *
 * التصميم (Wb) يضعها بين البطاقات بمقاس بطاقة سيارة، وعليها وسمُ
 * «مموّل» وزرّ «التفاصيل». والوسم ليس زينة: إعلانٌ لا يُميَّز عن نتيجةٍ
 * يجعل الترتيب كلَّه موضع شكّ.
 *
 * ═══ والظهور يُعَدّ عند الرؤية لا عند التصيير ═══
 *
 * مساحاتٌ تُسعَّر `cpm`، فالظهور بندُ فاتورة. وصفحةٌ صُيِّرت وما نزل
 * إليها أحد ليست ظهورًا — وعدُّها بيعُ ما لم يُرَ. فالعدّ عند دخول
 * البطاقة مجال الرؤية، مرّةً واحدة، وبـ`sendBeacon` فلا يحبس شيئًا.
 */
export function SponsoredCard({ ad, label }: { ad: ServedAd; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const node = box.current;
    if (node === null) return;

    /**
     * **ومتصفّحٌ بلا `IntersectionObserver` لا يُحرَم من الإعلان.**
     * يُعدّ عنده عند التصيير — والخسارة دقّةُ عدٍّ لا صفحةٌ مكسورة.
     */
    const send = (): void => {
      if (counted.current) return;
      counted.current = true;
      const path = `/api/v1/ads/${ad.id}/impression`;
      if (typeof navigator.sendBeacon === 'function') navigator.sendBeacon(path);
      else void fetch(path, { method: 'POST', keepalive: true }).catch(() => undefined);
    };

    if (typeof IntersectionObserver !== 'function') {
      send();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            send();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ad.id]);

  return (
    <div
      ref={box}
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- وجهةٌ خارجية يضبطها المعلن، ولا تمرّ بمحسّن الصور */}
        <img
          src={ad.creativeUrl}
          alt={ad.advertiserName}
          loading="lazy"
          className="aspect-4/3 w-full object-cover"
        />
        <span className="absolute top-2 start-2 rounded-md bg-ink/85 px-2 py-0.5 text-3xs font-bold text-bg">
          {label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 p-3.5">
        <span className="truncate text-xs font-bold">{ad.advertiserName}</span>
        {/*
          **و`rel="nofollow sponsored"`.** رابطٌ مدفوعٌ بلا هذا الوسم
          مخالفةٌ صريحة لإرشادات المحرّكات — وعقوبتُها على نطاقنا كلّه
          لا على الإعلان وحده.
        */}
        <a
          href={ad.clickPath}
          rel="nofollow sponsored noopener"
          target="_blank"
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-3xs font-bold"
        >
          التفاصيل
        </a>
      </div>
    </div>
  );
}
