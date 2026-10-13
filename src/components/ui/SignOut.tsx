'use client';

import { useState, useTransition } from 'react';
import { Button } from './Button';
import { Modal } from './Sheet';

/**
 * ═══ بابُ الخروج — ولم يكن في المنتج ═══
 *
 * قِيس: لا زرّ ولا مسار في الموقع كلّه، ومسارُ الأدمن مبنيٌّ **ولا شيء
 * يناديه** (الصنف نفسه: طرفٌ بُني بلا طرفه الثاني). فمن دخل من جهازٍ
 * مشترك يبقى داخلًا ثلاثين يومًا، ومن يجلس بعده يفتح طلباته وآيبانه.
 *
 * **والتأكيد قبله.** الخروج لا رجعة فيه بنقرةٍ واحدة: من خرج سهوًا
 * يعيد الدخول برمزِ تحقّقٍ على جواله — وهو ثمنٌ غالٍ لزرٍّ يُلمس عرَضًا
 * في درجٍ على الهاتف.
 */
export function SignOut({
  path,
  next,
  label = 'تسجيل الخروج',
  className,
}: {
  /** مسار الخروج — للموقع أو للوحة، وكلٌّ يمحو كعكته */
  path: string;
  /** إلى أين بعده */
  next: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const leave = (): void => {
    start(async () => {
      const response = await fetch(path, { method: 'POST' }).catch(() => null);
      if (response === null || !response.ok) {
        setError('تعذّر تسجيل الخروج — حاول مرّة أخرى.');
        return;
      }
      /**
       * **تحميلٌ كامل لا `router.push`.** الجلسة تُقرأ في الخادم،
       * وتنقّلٌ داخل العميل يُبقي ما صُيّر قبله في الذاكرة — فيُعرض
       * اسمُ من خرج في الترويسة بعد خروجه.
       */
      window.location.assign(next);
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="تسجيل الخروج"
        footer={
          <>
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ابقَ
            </Button>
            <Button variant="danger" disabled={pending} onClick={leave}>
              اخرج
            </Button>
          </>
        }
      >
        <p className="text-sm leading-loose opacity-72">
          ستحتاج رمز تحقّق على جوالك لتدخل مرّة أخرى. وبياناتك وطلباتك تبقى كما هي.
        </p>
        {error === null ? null : (
          <p className="mt-3 text-2xs text-danger">{error}</p>
        )}
      </Modal>
    </>
  );
}
