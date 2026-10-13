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
/**
 * ═══ عدُّ الظهور — مشتركٌ بين الشكلين ═══
 *
 * البطاقة والصفّ واجهتان لمساحةٍ واحدة، وعدُّ الظهور بندُ فاتورة في
 * `cpm` — فنسخُه في الشكلين يجعل أحدهما يعدّ عند التصيير والآخر عند
 * الرؤية، فتختلف فاتورتان لإعلانٍ واحد بحسب نمط العرض.
 */
function useImpression(adId: string) {
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
      const path = `/api/v1/ads/${adId}/impression`;
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
  }, [adId]);

  return box;
}

export function SponsoredCard({ ad, label }: { ad: ServedAd; label: string }) {
  const box = useImpression(ad.id);

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

/**
 * ═══ ونظيرُ الصفّ — فالقائمة هي النمط الافتراضيّ ═══
 *
 * `search_inline` كانت تُعرض في **نمط الشبكة وحده**، ثمّ صار الافتراضيّ
 * القائمة بقرار المالك — فالمساحة الوحيدة الموصولة في المنتج لم يعد
 * يراها أكثرُ الزوّار. ومساحةٌ تُسعَّر ٤٫٥ للنقرة وتُباع من اللوحة
 * ولا تظهر في الشاشة التي يفتحها الناس ليست تفصيل عرض.
 *
 * والمقاس مقاسُ `CarRow` حرفًا بحرف: صورةٌ ٤:٣ بعرض ٢٨/٤٠ ثم عمودُ
 * نصّ — فإعلانٌ بمقاسٍ آخر يكسر إيقاع القائمة ويُقرأ خطأً في الصفحة.
 */
export function SponsoredRow({ ad, label }: { ad: ServedAd; label: string }) {
  const box = useImpression(ad.id);

  return (
    <article
      ref={box}
      className="flex gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3 sm:gap-4 sm:p-3.5"
    >
      <div className="relative aspect-4/3 w-28 shrink-0 overflow-hidden rounded-lg sm:w-40">
        {/* eslint-disable-next-line @next/next/no-img-element -- وجهةٌ خارجية يضبطها المعلن، ولا تمرّ بمحسّن الصور */}
        <img
          src={ad.creativeUrl}
          alt={ad.advertiserName}
          loading="lazy"
          className="size-full object-cover"
        />
        <span className="absolute top-2 start-2 rounded-md bg-ink/85 px-2 py-0.5 text-3xs font-bold text-bg">
          {label}
        </span>
      </div>

      {/* **والنصّ لا يُزاحم الزرّ.** `min-w-0` وإلّا فاضَ اسمُ معلنٍ طويل. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <span className="truncate text-sm font-bold">{ad.advertiserName}</span>
        <a
          href={ad.clickPath}
          rel="nofollow sponsored noopener"
          target="_blank"
          className="w-fit rounded-lg border border-line px-3 py-1.5 text-3xs font-bold"
        >
          التفاصيل
        </a>
      </div>
    </article>
  );
}
