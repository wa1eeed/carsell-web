'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ «الافتراض» — حالٌ كانت تُعرض ولا تُبدَّل ═══
 *
 * `updateChannel` مبنيّةٌ بأثرها، **ولا ينادِيها شيء**. وشاشةُ
 * الإشعارات تعرض «مفتوحة / مغلقة» نصًّا — فتبديلُ ما يصل المستخدمَ
 * الجديد افتراضًا كان يحتاج صفًّا في القاعدة بيد.
 *
 * **ولا يُعرض للحرِجة زرّ**: قناةٌ لا يستطيع المستخدم إطفاءها لا معنى
 * لإغلاقها افتراضًا — تصير قناةً لا يصلها أحد ولا يملك أحدٌ فتحها.
 */
export function ChannelDefault({
  channelKey,
  defaultOn,
  controllable,
}: {
  channelKey: string;
  defaultOn: boolean;
  controllable: boolean;
}) {
  /**
   * **ومعيار A10: التسويقيّ لا يُفتح افتراضًا.** الموافقة تُطلب لا
   * تُفترض، وفتحُه يجعل كل حسابٍ جديد موافقًا بلا أن يُسأل. والخادم
   * يمنعه — **فالزرّ لا يُعرض بدل أن يُضغط فيُردّ**.
   */
  const locked = channelKey === 'marketing';
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  if (!controllable || (locked && !defaultOn)) {
    return (
      <span className="flex items-center gap-2 opacity-70">
        {defaultOn ? 'مفتوحة' : 'مغلقة'}
        {locked ? <span className="text-3xs opacity-70">— الموافقة تُطلب</span> : null}
      </span>
    );
  }

  const toggle = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/push/channels/${channelKey}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaultOn: !defaultOn }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      /** **والتبديل لا يمسّ من اختار**: الافتراض لمن يأتي بعد اليوم. */
      setToast(
        defaultOn
          ? 'صارت مغلقةً افتراضًا — ومن فتحها يبقى عليها.'
          : 'صارت مفتوحةً افتراضًا — ومن أغلقها يبقى عليها.',
      );
      router.refresh();
    });
  };

  return (
    <span className="flex items-center gap-2.5">
      <span className="opacity-70">{defaultOn ? 'مفتوحة' : 'مغلقة'}</span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>
        {defaultOn ? 'أغلِقها' : 'افتحها'}
      </Button>
      {toast === null ? null : <Toast title={toast} />}
    </span>
  );
}
