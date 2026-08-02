'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

/**
 * معرض صور الإعلان.
 *
 * الصورة الرئيسية ١٦:٩ وشريط مصغّرات تحتها. عدّاد الموضع أسفل الصورة
 * وزرّ الشاشة الكاملة مقابله، كما في Wc.
 *
 * **بلا صور**: نمط الخطوط المائلة نفسه بلا عدّاد ولا مصغّرات — إعلان
 * بلا صورة حالة قائمة، لا خطأ يُخفى بمربّع رمادي.
 */
export function Gallery({
  images,
  alt,
  className,
}: {
  images: readonly { key: string }[];
  alt: string;
  className?: string;
}) {
  const t = useTranslations('ui');
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);

  const count = images.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const strip = images.slice(0, 6);
  const rest = count - strip.length;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="washed relative aspect-16/9 overflow-hidden rounded-xl">
        {/* الصور من R2 تأتي في المهمة ٢٠ — النمط هنا حتى ذلك الحين */}
        <span className="sr-only">{alt}</span>

        {count === 0 ? null : (
          <>
            <span className="absolute bottom-3.5 inline-flex items-center gap-1 rounded-sm bg-ink/70 px-3 py-1.5 text-2xs font-semibold text-bg end-3.5">
              <ArabicNumber value={current + 1} grouped={false} />
              <span aria-hidden className="opacity-60">
                /
              </span>
              <ArabicNumber value={count} grouped={false} />
            </span>
            <button
              type="button"
              onClick={() => setFull(true)}
              className="absolute bottom-3.5 rounded-sm bg-ink/70 px-3.5 py-2 text-2xs font-semibold text-bg start-3.5 hover:bg-ink/85"
            >
              {t('fullscreen')}
            </button>
          </>
        )}
      </div>

      {count === 0 ? null : (
        <div className="flex gap-2">
          {strip.map((image, i) => (
            <button
              key={image.key}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}`}
              className={cn(
                'washed h-16 flex-1 rounded-md',
                i === current && 'outline-2 outline-offset-2 outline-accent',
              )}
            />
          ))}
          {rest <= 0 ? null : (
            <span className="flex h-16 flex-1 items-center justify-center rounded-md border border-line text-sm font-bold opacity-55">
              <ArabicNumber value={rest} />
            </span>
          )}
        </div>
      )}

      {!full ? null : (
        <div
          role="dialog"
          aria-modal
          aria-label={alt}
          className="fixed inset-0 z-50 flex flex-col bg-ink/92 p-6"
        >
          <div className="flex items-center gap-3 text-bg">
            <Quantity unit="photos" count={count} className="text-sm font-bold" />
            <span className="flex-1" />
            <button type="button" onClick={() => setFull(false)} aria-label={t('close')}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="washed mt-4 flex-1 rounded-xl" />
        </div>
      )}
    </div>
  );
}
