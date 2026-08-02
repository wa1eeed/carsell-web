'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Badge } from './Badge';
import { Quantity } from './Quantity';

export type UploadedImage = {
  key: string;
  plateBlurred: boolean;
  blurredRegions: number;
  qualityFlags: string[];
  duplicateOf: string | null;
  /** معاينة محلّية — الأصل لا يُخزَّن، فالمعاينة من الملف قبل رفعه. */
  preview: string;
};

/**
 * رافع صور الإعلان.
 *
 * **يرفع إلى الخادم لا إلى التخزين**: الطمس شرط نشر، والصورة التي لا
 * يراها الخادم لا يطمسها. وهذا هو سبب بطء الرفع مقارنةً بالرفع
 * الموقَّع — وهو ثمن مقبول مقابل ألّا تُنشر لوحة مقروءة.
 *
 * وكل صورة تُعرض بنتيجة فحصها: «طُمست اللوحة» شارة يراها البائع فيثق
 * بأن العملية جرت، ولا يكتشف لاحقًا أنها لم تجرِ.
 */
export function ImageUploader({
  images,
  onChange,
  max = 10,
  className,
}: {
  images: readonly UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  max?: number;
  className?: string;
}) {
  const t = useTranslations('sell');
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null): Promise<void> => {
    if (files === null) return;
    const room = max - images.length;
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length === 0) return;

    setBusy(chosen.length);
    setError(null);
    const added: UploadedImage[] = [];

    for (const file of chosen) {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/v1/listings/images', { method: 'POST', body });
      const payload = (await response.json()) as {
        data?: Omit<UploadedImage, 'preview'>;
        error?: { messageAr: string };
      };

      if (!response.ok || payload.data === undefined) {
        setError(payload.error?.messageAr ?? t('uploadFailed'));
        continue;
      }
      added.push({ ...payload.data, preview: URL.createObjectURL(file) });
      setBusy((n) => n - 1);
    }

    setBusy(0);
    onChange([...images, ...added]);
  };

  const blurredCount = images.filter((image) => image.plateBlurred).length;
  const duplicates = images.filter((image) => image.duplicateOf !== null).length;

  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline gap-2.5">
        <h3 className="text-sm font-bold">{t('photos')}</h3>
        <span className="text-2xs opacity-50">
          <ArabicNumber value={images.length} /> {t('of')} <ArabicNumber value={max} />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((image, i) => (
          <figure key={image.key} className="relative overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- معاينة محلّية من الملف قبل رفعه */}
            <img src={image.preview} alt="" className="aspect-4/3 w-full object-cover" />

            {i === 0 ? (
              <Badge tone="ink" className="absolute top-2 start-2">
                {t('cover')}
              </Badge>
            ) : null}

            <figcaption className="flex flex-wrap gap-1.5 p-2">
              {image.plateBlurred ? <Badge tone="accent">{t('plateBlurred')}</Badge> : null}
              {image.qualityFlags.includes('BLURRY') ? (
                <Badge tone="warn">{t('blurry')}</Badge>
              ) : null}
              {image.duplicateOf === null ? null : <Badge tone="danger">{t('duplicate')}</Badge>}
            </figcaption>

            <button
              type="button"
              onClick={() => onChange(images.filter((other) => other.key !== image.key))}
              aria-label={t('remove')}
              className="absolute top-2 end-2 flex size-6 items-center justify-center rounded-full bg-ink/70 text-bg"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </figure>
        ))}

        {images.length >= max ? null : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy > 0}
            className="flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-2xs opacity-60 hover:border-ink/35 hover:opacity-100"
          >
            {busy > 0 ? (
              <Quantity unit="photos" count={busy} />
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t('addPhotos')}
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          void upload(event.target.files);
          event.target.value = '';
        }}
      />

      {error === null ? null : (
        <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3.5 py-2.5 text-2xs text-danger">
          {error}
        </p>
      )}

      {/* حصيلة الفحص الآلي — يراها البائع فيعرف ما جرى لصوره */}
      {images.length === 0 ? null : (
        <p className="mt-3.5 flex flex-wrap items-center gap-2 rounded-md bg-accent-100 px-3.5 py-2.5 text-2xs text-accent-900">
          <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
          <span className="font-bold">{t('scanDone')}</span>
          <span className="flex items-center gap-1.5">
            {t('platesBlurredCount')} <ArabicNumber value={blurredCount} />
          </span>
          <span aria-hidden className="opacity-40">·</span>
          <span>{duplicates === 0 ? t('noDuplicates') : t('hasDuplicates')}</span>
        </p>
      )}
    </div>
  );
}
