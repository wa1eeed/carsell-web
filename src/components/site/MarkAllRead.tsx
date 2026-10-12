'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { announceNotificationsChanged } from '@/lib/notifications-signal';

/**
 * **والفعل الناجح يُتبعه تحديثُ المصدر الذي تقرأ منه الشاشة.**
 *
 * الصفحة مُصيَّرة على الخادم، فنداءٌ ينجح ولا `router.refresh()` بعده
 * يترك النقاط مرسومةً كما كانت — فيقرأ المستخدم نجاحًا ويرى شكل
 * الفشل، ويضغط ثانيةً.
 */
export function MarkAllRead({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await fetch('/api/v1/notifications/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      /* **والجرس في شجرةٍ أخرى** — `router.refresh` لا يبلغ حالتَه */
      announceNotificationsChanged();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void run()}>
      {label}
    </Button>
  );
}
