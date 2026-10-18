'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { displayDigits, toLatinDigits } from '@/lib/arabic';

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

/**
 * ═══ وما لم يره أحدٌ يُحذف ═══
 *
 * البائع كان يملك الإيقاف والتعديل ولا يملك الحذف — فمسودّةٌ بدأها
 * ثمّ عدل عنها تبقى في «إعلاناتي» وفي عدّاد «تنتظرك» إلى الأبد،
 * تقول له كلّ مرّة إنّ عليه عملًا لا يريده.
 *
 * وما نُشر يُوقَف ولا يُمحى: من رآه أو تفاوض عليه يبقى سجلُّه.
 * والقائمةُ هنا مرآةُ `DELETABLE` في النطاق — والخادم يفحصها ثانيةً.
 */
const DELETABLE = new Set(['DRAFT', 'PENDING_REVIEW']);

export function ListingControls({
  listingRef,
  status,
  price,
  negotiable,
  description,
  hasActiveOrder,
}: {
  listingRef: string;
  status: string;
  price: number;
  negotiable: boolean;
  /** وصف البائع — والفراغ يمحوه. */
  description: string;
  /** طلبٌ قائم يقفل كل شيء — والسعر لقطةٌ في الطلب لا يتبع الإعلان. */
  hasActiveOrder: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState({
    price: String(price),
    negotiable,
    description,
  });

  if (hasActiveOrder) {
    return (
      <p className="mt-2 text-3xs leading-loose opacity-70">
        عليه طلب قائم — لا يعدل حتى ينتهي، والمشتري يدفع السعر الذي رآه.
      </p>
    );
  }

  const remove = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/listings/${listingRef}`, { method: 'DELETE' }).catch(
        () => null,
      );
      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setConfirming(false);
        setToast(payload?.error?.messageAr ?? 'تعذر الحذف.');
        return;
      }

      setConfirming(false);
      setToast('حذف الإعلان.');
      router.refresh();
    });
  };

  /**
   * ═══ وحوارُ التأكيد — لأن الحذف لا رجعة فيه ═══
   *
   * ويقول **ما يُحذف وما يبقى**: الإعلان يذهب والمركبة تبقى في
   * «سياراتي»، فلا يظنّ البائع أنه يمحو سيارته من المنصّة.
   */
  const confirmDialog = (
    <Modal
      open={confirming}
      onClose={() => setConfirming(false)}
      title="حذف الإعلان"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
            تراجع
          </Button>
          <Button variant="danger" size="sm" onClick={remove} disabled={busy}>
            {busy ? 'يحذف…' : 'نعم، احذفه'}
          </Button>
        </>
      }
    >
      <p className="text-xs leading-loose">
        يحذف الإعلان وصوره نهائيا ولا يسترجع. و<b>المركبة تبقى في «سياراتي»</b>، فتستطيع
        عرضها من جديد متى شئت.
      </p>
    </Modal>
  );

  if (!EDITABLE.has(status)) {
    /**
     * ═══ و«قيد المراجعة» كان بلا زرٍّ واحد ═══
     *
     * لا تعديلَ ولا إيقاف ولا حذف — صفٌّ يقول «قيد المراجعة» وحسب.
     * فمن أرسل إعلانًا ثمّ عدل عنه ينتظر مراجعتَه ليُوقفه بعدها.
     * والتعديل يبقى مغلقًا — المراجع ينظر فيه الآن — **والسحب يُفتح**.
     */
    if (DELETABLE.has(status)) {
      return (
        <>
          <p className="mt-2 text-3xs leading-loose opacity-70">
            قيد المراجعة — لا يعدل حتى تنتهي، ولك سحبه.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
              اسحبه واحذفه
            </Button>
          </div>
          {confirmDialog}
          {toast === null ? null : <Toast title={toast} />}
        </>
      );
    }

    return status === 'SUSPENDED' ? (
      <p className="mt-2 text-3xs leading-loose opacity-70">
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
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }

      setOpen(false);
      setToast(done);
      router.refresh();
    });
  };

  const nextPrice = Number(toLatinDigits(draft.price).replace(/[^\d.]/g, ''));
  const priceOk = Number.isFinite(nextPrice) && nextPrice >= PRICE_MIN;
  const changed =
    nextPrice !== price ||
    draft.negotiable !== negotiable ||
    draft.description.trim() !== description.trim();

  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {status === 'PAUSED' ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => send({ paused: false }, 'عاد الإعلان معروضا.')}
          >
            أعد عرضه
          </Button>
        ) : status === 'PUBLISHED' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => send({ paused: true }, 'أوقف الإعلان — لا يراه الزوار.')}
          >
            أوقفه مؤقتا
          </Button>
        ) : null}

        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(!open)}>
          {open ? 'إغلاق' : 'عدل الإعلان'}
        </Button>

        {/* **والمسودّة تُحذف** — وما نُشر يُوقَف، فسجلُّه لمن تفاوض عليه. */}
        {!DELETABLE.has(status) ? null : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            احذف المسودة
          </Button>
        )}
      </div>

      {!open ? null : (
        <div className="mt-2.5 rounded-lg border border-line bg-surface p-4">
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">السعر المطلوب بالريال</span>
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
                أقل سعر مقبول {displayDigits(String(PRICE_MIN))} ريال.
              </span>
            )}
          </label>

          {/*
            **الوصف — وكان لا حقل له في المخطّط أصلًا.** المواصفات تصف
            المصنع، والوصف يصف هذه النسخة: لماذا يبيعها وما أصلحه وما
            فيها من أثر. وسوقٌ بلا وصفٍ يجعل كل إعلانٍ نسخةً من جاره
            ويدفع السؤال إلى محادثةٍ خارج المنصّة.
          */}
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-3xs font-bold opacity-70">وصف السيارة</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="مالك واحد · صيانة الوكالة · سبب البيع…"
              className="rounded-md border border-line bg-bg px-3 py-2 text-2xs leading-loose"
            />
            <span className="text-3xs opacity-65">
              اذكر ما لا تقوله المواصفات — والصدق هنا يوفر أسئلة ونزاعا لاحقا.
            </span>
          </label>

          <label className="mb-3.5 flex cursor-pointer items-center gap-2.5 text-2xs">
            <input
              type="checkbox"
              checked={draft.negotiable}
              onChange={(event) => setDraft({ ...draft, negotiable: event.target.checked })}
              className="size-4 accent-ink"
            />
            <span>قابل للتفاوض — يستطيع المشتري أن يعرض سعرا</span>
          </label>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !priceOk || !changed}
              onClick={() =>
                send(
                  {
                    askPrice: nextPrice,
                    negotiable: draft.negotiable,
                    description: draft.description,
                  },
                  'حفظ — ويظهر للزوار في الحال.',
                )
              }
            >
              {busy ? 'جاري…' : 'احفظ'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({ price: String(price), negotiable, description });
                setOpen(false);
              }}
            >
              تراجع
            </Button>
          </div>
        </div>
      )}

      {/* **والحوار يُصيَّر في الفرعين** — وُضع في فرع المراجعة وحده أوّلًا، فزرّ المسودّة يُضغط ولا يُفتح شيء. */}
      {confirmDialog}
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
