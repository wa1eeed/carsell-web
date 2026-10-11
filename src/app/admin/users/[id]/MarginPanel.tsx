'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ هامشُ الربح — ولم يكن يُمنح من مكان ═══
 *
 * `grantMarginScheme` مبنيّةٌ بمرجعها الإلزاميّ وأثرها، ولا ينادِيها
 * شيء. فبائعٌ مسجَّلٌ يستحقّ احتساب الضريبة على الهامش تُحتسب عليه على
 * **كامل السعر** إلى الأبد — فرقٌ يخرج من جيبه في كل بيعة. وصفحةُ
 * المعرض تعرض «مرجع هامش الربح» متى مُنح: تعرض ما لا سبيل إلى منحه.
 *
 * ═══ والمرجع يُكتب قبل المنح لا بعده ═══
 *
 * اعتمادٌ بلا مستندٍ يُشار إليه لا يُدافَع عنه أمام مدقّق. فالزرّ
 * لا يعمل حتى يُكتب المرجع — ولا يُطلب بعد الضغط.
 */
export function MarginPanel({
  userId,
  approved,
  reference,
  registered,
}: {
  userId: string;
  approved: boolean;
  reference: string | null;
  /** مسجَّلٌ ضريبيًّا — والهامش يتبع التسجيل لا صفة المعرض */
  registered: boolean;
}) {
  const router = useRouter();
  /**
   * **ولا تُنسخ `reference` إلى حالة.** النسخُ يتقادم عند التنقّل بين
   * العملاء داخل التطبيق (البوابة ٣٠) — والحقل لا يُعرض أصلًا إلّا
   * حين لا يكون الهامش ممنوحًا، وحينها المرجع `null` دائمًا: النطاق
   * يمسحه عند السحب.
   */
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const send = (next: boolean): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/users/${userId}/margin-scheme`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: next, ref: next ? value.trim() : null }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast(next ? 'مُنح هامش الربح — ويُسجَّل بمرجعه.' : 'سُحب هامش الربح.');
      router.refresh();
    });
  };

  if (approved) {
    return (
      <div className="flex flex-col gap-2.5">
        <Badge tone="accent">هامش الربح ممنوح</Badge>
        <p className="font-num text-3xs opacity-60" dir="ltr">
          {reference ?? '—'}
        </p>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => send(false)}>
          اسحب المنح
        </Button>
        {toast === null ? null : <Toast title={toast} />}
      </div>
    );
  }

  /**
   * **وغيرُ المسجَّل لا يُعرض له حقل.** الخادم يردّه، وحقلٌ يُملأ ثمّ
   * يُرفض أسوأ من سببٍ مكتوبٍ قبله.
   */
  if (!registered) {
    return (
      <p className="text-3xs leading-loose opacity-55">
        الهامش يتبع التسجيل الضريبيّ — ولا رقم ضريبيّ لهذا الحساب.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-3xs font-bold opacity-60">مرجع مستند الهيئة</span>
        {/* مرجعٌ لاتينيّ يُنسخ من مستند ويُقارن خانةً بخانة */}
        <input
          dir="ltr"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="font-num rounded-md border border-line bg-bg px-3 py-1.5 text-2xs"
        />
      </label>
      <Button
        size="sm"
        disabled={pending || value.trim() === ''}
        onClick={() => send(true)}
      >
        {pending ? 'يُحفظ…' : 'امنح هامش الربح'}
      </Button>
      <p className="text-3xs leading-loose opacity-50">
        يُحتسب على الفرق بين الشراء والبيع لا على كامل السعر — ولا يُطبَّق تلقائيًّا أبدًا.
      </p>
      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
