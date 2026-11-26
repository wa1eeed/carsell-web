'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ImageUploader, type UploadedImage } from '@/components/ui/ImageUploader';
import { Money } from '@/components/ui/Money';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { ListingType } from '@/generated/prisma/enums';
import type { StockRow } from '@/lib/domain/dealer-dashboard';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ `D2c` — تعرضُ مركبةً من مخزونها ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٦: «ضمن خيارات السياره يمكن نشرها». فالنشرُ
 * قرارٌ على صفٍّ قائم لا رحلةٌ من أوّلها: بياناتُ المركبة في المخزون
 * أصلًا، والمطلوبُ صورُها وطريقةُ بيعها وسعرُها.
 *
 * **ولا مزادَ من هنا**: للمزاد مواعيدُه واحتياطيُّه وعربونُه وشاشتُه
 * (`D4`)، وحشرُه في درجٍ يجعل أخطرَ الخيارات أسرعَها.
 */
export function PublishDrawer({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [type, setType] = useState<string>(ListingType.DIRECT);
  const [askPrice, setAskPrice] = useState('');
  const [minAccept, setMinAccept] = useState('');
  const [description, setDescription] = useState('');
  const [showPlate, setShowPlate] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const ask = Number(askPrice);
  const floor = Number(minAccept);
  const ready = images.length > 0 && Number.isFinite(ask) && ask > 0;

  const publish = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/dealer/vehicles/${row.vehicleId}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          askPrice: ask,
          minAcceptPrice:
            type === ListingType.NEGOTIATION && minAccept.trim() !== '' ? floor : null,
          description: description.trim() === '' ? undefined : description.trim(),
          showPlate,
          images: images.map((image) => image.key),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { data?: { status?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر عرض المركبة.');
        return;
      }

      /**
       * **وحالُ النشر تُقال** — فإعلانٌ أُحيل إلى المراجعة ليس منشورًا،
       * ومن قرأ «نُشرت» ثمّ لم يجدها في السوق حسب العطل فينا.
       */
      setToast(
        body?.data?.status === 'PENDING_REVIEW'
          ? 'أرسلت للمراجعة — تظهر في السوق فور اعتمادها.'
          : 'عرضت في السوق.',
      );
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet open title={`اعرض ${row.title}`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-1 text-2xs font-bold">صور المركبة</h3>
          <p className="mb-2.5 text-3xs leading-loose opacity-70">
            أول صورة هي الواجهة. ونطمس اللوحة تلقائيا في كل صورة.
          </p>
          <ImageUploader images={images} onChange={setImages} max={12} />
        </section>

        <section>
          <h3 className="mb-2.5 text-2xs font-bold">طريقة البيع</h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: ListingType.DIRECT, label: 'بيع مباشر', hint: 'سعر معلن يشتري به' },
              { key: ListingType.NEGOTIATION, label: 'تفاوض', hint: 'يقدم عرضه وتقبل أو ترفض' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setType(option.key)}
                className={
                  option.key === type
                    ? 'flex-1 rounded-md border border-ink bg-ink p-3 text-start text-bg'
                    : 'flex-1 rounded-md border border-line p-3 text-start hover:border-ink'
                }
              >
                <span className="block text-2xs font-bold">{option.label}</span>
                <span className="mt-0.5 block text-3xs opacity-70">{option.hint}</span>
              </button>
            ))}
          </div>
          {/*
            **والمزادُ يُقال أين هو لا يُخفى** — فمن لا يجده يحسبه غيرَ
            موجود، ومن يجده في درجٍ سريع يفتحه بلا إعدادات.
          */}
          <p className="mt-2 text-3xs opacity-65">
            والمزاد من شاشة المزادات — له مواعيده واحتياطيه وعربونه.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">السعر المطلوب بالريال</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={askPrice}
              onChange={(event) => setAskPrice(event.target.value)}
              placeholder="95000"
              className={`${field} font-num bidi-ltr`}
            />
          </label>

          {/*
            ═══ والأرضيّةُ تُعرض لصاحبها حيث يقرّرها ═══

            `minAcceptPrice` يُرفض ما دونه تلقائيًّا — ومن وضعه عاليًا
            يفاوض شهورًا بلا عرضٍ ولا يعرف السبب. فيُقال أثرُه هنا،
            ويُعرض في صندوق عروضه بعدها.
          */}
          {type !== ListingType.NEGOTIATION ? null : (
            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-70">أقل سعر تقبله — لا يراه المشتري</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={minAccept}
                onChange={(event) => setMinAccept(event.target.value)}
                placeholder="88000"
                className={`${field} font-num bidi-ltr`}
              />
              <span className="text-3xs opacity-65">
                كل عرض دونه يرفض تلقائيا. اتركه فارغا لتقرأ كل عرض بنفسك.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">وصف من عندك — اختياري</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="صيانة الوكالة كاملة، ضمان ساري…"
              className={field}
            />
          </label>

          <label className="flex items-center gap-2.5 text-2xs">
            <input
              type="checkbox"
              checked={showPlate}
              onChange={(event) => setShowPlate(event.target.checked)}
              className="size-4 accent-ink"
            />
            أظهر رقم اللوحة في الإعلان
          </label>
        </section>

        {row.cost === null ? null : (
          <p className="rounded-md border border-line px-3.5 py-2.5 text-3xs leading-loose">
            كلفتها المسجلة <Money amount={row.cost} /> — والفرق هو هامشك قبل العمولة.
          </p>
        )}

        <div className="flex gap-2.5">
          <Button disabled={!ready || pending} onClick={publish}>
            {pending ? 'يعرض…' : 'اعرضها في السوق'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
      {toast === null ? null : <Toast title={toast} />}
    </Sheet>
  );
}
