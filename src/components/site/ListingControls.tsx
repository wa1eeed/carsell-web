'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';

/**
 * ═══ البائع يتحكّم بإعلانه — ولم يكن يستطيع ═══
 *
 * «مركباتي» كانت قائمةً للقراءة، و`/api/v1/listings/{ref}` يصدّر `GET`
 * وحده: فمن نشر إعلانًا **لا يستطيع تغيير سعره أبدًا**، ولا حيلة له
 * إلّا أن يسحبه ويُنشئ غيره فيفقد مشاهداته وترتيبه.
 *
 * ═══ ولا يُعرض إلّا ما يُقبَل ═══
 *
 * إعلانٌ محجوزٌ بطلب، أو موقوفٌ من الأدمن، أو مباع — لا أزرار له. وزرٌّ
 * يردّ ٤٠٩ بعد الضغط أسوأ من غيابه، وهو الصنف الذي أُصلح في غيره مرارًا.
 */

const PRICE_MIN = 1000;

/** الحالات التي يملك البائع تغييرها — والمصدر في النطاق، وهذه مرآته. */
const EDITABLE = new Set(['DRAFT', 'PUBLISHED', 'PAUSED']);

export function ListingControls({
  listingRef,
  status,
  price,
  negotiable,
  hasActiveOrder,
}: {
  listingRef: string;
  status: string;
  price: number;
  negotiable: boolean;
  /** طلبٌ قائم يقفل كل شيء — والسعر لقطةٌ في الطلب لا يتبع الإعلان. */
  hasActiveOrder: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    price: String(price),
    negotiable,
  });

  if (hasActiveOrder) {
    return (
      <p className="mt-2 text-3xs leading-loose opacity-55">
        عليه طلبٌ قائم — لا يُعدَّل حتى ينتهي، والمشتري يدفع السعر الذي رآه.
      </p>
    );
  }

  if (!EDITABLE.has(status)) {
    return status === 'SUSPENDED' ? (
      <p className="mt-2 text-3xs leading-loose opacity-55">
        أوقفته الإدارة — راجعها لرفعه.
      </p>
    ) : null;
  }

  const send = (body: unknown, done: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/listings/${listingRef}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setOpen(false);
      setToast(done);
      router.refresh();
    });
  };

  const nextPrice = Number(toLatinDigits(draft.price).replace(/[^\d.]/g, ''));
  const priceOk = Number.isFinite(nextPrice) && nextPrice >= PRICE_MIN;
  const changed = nextPrice !== price || draft.negotiable !== negotiable;

  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {status === 'PAUSED' ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => send({ paused: false }, 'عاد الإعلان معروضًا.')}
          >
            أعِد عرضه
          </Button>
        ) : status === 'PUBLISHED' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send({ paused: true }, 'أُوقف الإعلان — لا يراه الزوّار.')}
          >
            أوقفه مؤقّتًا
          </Button>
        ) : null}

        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(!open)}>
          {open ? 'إغلاق' : 'عدّل السعر'}
        </Button>
      </div>

      {!open ? null : (
        <div className="mt-2.5 rounded-lg border border-line bg-surface p-4">
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-60">السعر المطلوب بالريال</span>
            {/* رقمٌ يُقارن خانةً بخانة — لاتينيّ معزول */}
            <input
              dir="ltr"
              inputMode="numeric"
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              className="rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-sm"
            />
            {priceOk ? null : (
              <span className="text-3xs text-danger">
                أقلّ سعر مقبول {toArabicDigits(String(PRICE_MIN))} ريال.
              </span>
            )}
          </label>

          <label className="mb-3.5 flex cursor-pointer items-center gap-2.5 text-2xs">
            <input
              type="checkbox"
              checked={draft.negotiable}
              onChange={(event) => setDraft({ ...draft, negotiable: event.target.checked })}
              className="size-4 accent-ink"
            />
            <span>قابل للتفاوض — يستطيع المشتري أن يعرض سعرًا</span>
          </label>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !priceOk || !changed}
              onClick={() =>
                send(
                  { askPrice: nextPrice, negotiable: draft.negotiable },
                  'حُفظ السعر — ويظهر للزوّار في الحال.',
                )
              }
            >
              {busy ? 'جارٍ…' : 'احفظ'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({ price: String(price), negotiable });
                setOpen(false);
              }}
            >
              تراجع
            </Button>
          </div>
        </div>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
