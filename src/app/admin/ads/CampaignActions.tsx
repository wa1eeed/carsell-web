'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

/**
 * إيقافُ حملةٍ واستئنافُها.
 *
 * **ودالّةٌ بلا منادٍ صنعتُها في المهمّة السابقة.** بُنيت
 * `setCampaignPaused` مع الإنشاء ولم يبلغها زرّ — وهو الصنف نفسه الذي
 * فُتح من أجله ملفّ الإعلانات كلّه. فأُغلق في أوّل قياسٍ كشفه.
 *
 * **والمنتهية لا يُعرض لها زرّ**: نافذتُها مضت، واستئنافُها يردّ خطأً
 * بعد الضغط — وقولُها قبله أصدق.
 */
export function CampaignActions({
  id,
  phase,
}: {
  id: string;
  phase: 'live' | 'scheduled' | 'ended' | 'paused';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  if (phase === 'ended') return <span className="text-3xs opacity-65">—</span>;

  const paused = phase === 'paused';

  const toggle = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/ads/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused: !paused }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      setToast(paused ? 'استُؤنفت الحملة.' : 'أُوقفت الحملة — ولا تُعرض الآن.');
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={toggle}>
        {paused ? 'استأنف' : 'أوقف'}
      </Button>
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
