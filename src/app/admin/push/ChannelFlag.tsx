'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ الصوتُ والشارة — عمودان في ترميز A10 بلا حقلٍ يحملهما ═══
 *
 * التصميم يضع لكل قناةٍ صوتَها وشارتَها بجوار افتراضها، والحقلان لم
 * يكونا في المخطّط أصلًا — فقناةُ التسويق وقناةُ المزاد تُصدران الصوت
 * نفسه، ولا سبيل إلى التفريق.
 *
 * **وهما إعدادُ تشغيلٍ يضغطه المشغّل، لا قرارُ منتَج**: الإسكات لا
 * يمنع الإشعار ولا يُبطل حقَّ صاحبه فيه. ولذلك لهما زرّ، و
 * `userControllable` ليس لها.
 */
export function ChannelFlag({
  channelKey,
  field,
  value,
  onLabel,
  offLabel,
}: {
  channelKey: string;
  field: 'sound' | 'badge';
  value: boolean;
  onLabel: string;
  offLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/push/channels/${channelKey}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: !value }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }

      /**
       * **ويسري على ما يُرسل بعده**: إشعارٌ خرج بالإعداد القديم لا
       * يتغيّر، والنصّ يقول ذلك بدل أن يوهم بأثرٍ رجعيّ.
       */
      setToast(value ? `${offLabel} — لما يرسل بعد الآن.` : `${onLabel} — لما يرسل بعد الآن.`);
      router.refresh();
    });
  };

  return (
    <span className="flex items-center gap-2">
      <span className="opacity-70">{value ? onLabel : offLabel}</span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>
        {value ? 'أطفئه' : 'شغله'}
      </Button>
      {toast === null ? null : <Toast title={toast} />}
    </span>
  );
}
