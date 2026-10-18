'use client';

import { useState, useTransition } from 'react';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ مفاتيحُ الإشعار — بُنيت ولم يصلها أحد ═══
 *
 * `PushChannel` مزروعٌ بستّ قنوات، و`NotificationPreference` جدولٌ
 * قائم، و`setPreference` و`isChannelEnabled` مكتوبتان منذ A10 —
 * **ولا شاشة في المنتج كلّه تضبطهما**. فصفُّ تفضيلٍ واحد لم يُكتب قطّ،
 * وستّةُ مفاتيح لا يراها صاحبُها.
 *
 * (وبوابةُ «دالّةُ نطاقٍ بلا باب» لم تمسكها: تعليقٌ في شاشة الأدمن
 * يذكر `setPreference` باسمها، فحسبته نداءً. والبوابة تقرأ الشيفرة
 * بعد حذف التعليق الآن.)
 *
 * ═══ والحرِج يُعرض مقفلًا لا يُخفى ═══
 *
 * معيار A10: «الإشعارات الحرِجة لا يمكن إيقافها». وإخفاؤها يجعل
 * القارئ يظنّ أنّ ما يراه كلُّ ما يصله — فتُعرض ويُقال لماذا لا
 * تُطفأ.
 */

export type ChannelChoice = {
  key: string;
  nameAr: string;
  userControllable: boolean;
  enabled: boolean;
};

export function ChannelPreferences({ channels }: { channels: readonly ChannelChoice[] }) {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(channels.map((row) => [row.key, row.enabled])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const toggle = (key: string, next: boolean): void => {
    /** **والمفتاح يتحرّك فورًا** — ثمّ يُراجَع إن ردّ الخادم بخلافه. */
    setState((rows) => ({ ...rows, [key]: next }));

    start(async () => {
      const response = await fetch('/api/v1/me/notification-channels', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelKey: key, enabled: next }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setState((rows) => ({ ...rows, [key]: !next }));
        const payload = (await response?.json().catch(() => null)) as
          | { error?: { messageAr?: string } }
          | null;
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
      }
    });
  };

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1.5 text-sm font-bold">ما يصلك</h2>
      <p className="mb-4 max-w-xl text-2xs leading-loose opacity-70">
        أطفئ ما لا يعنيك. وما يخص مالك وصفقاتك يصلك دائما.
      </p>

      <ul className="flex flex-col">
        {channels.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-4 border-b border-line-2 py-3.5 last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block text-2xs font-semibold">{row.nameAr}</span>
              {row.userControllable ? null : (
                <span className="mt-0.5 block text-3xs opacity-70">
                  لا تطفأ — فيها مواعيد ومبالغ تخصك.
                </span>
              )}
            </span>

            {row.userControllable ? (
              <button
                type="button"
                role="switch"
                aria-checked={state[row.key] === true}
                aria-label={row.nameAr}
                disabled={busy}
                onClick={() => toggle(row.key, state[row.key] !== true)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  state[row.key] === true ? 'bg-accent' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-1 size-4 rounded-full bg-bg transition-all ${
                    state[row.key] === true ? 'start-6' : 'start-1'
                  }`}
                />
              </button>
            ) : (
              <span className="shrink-0 text-3xs font-bold opacity-65">دائما</span>
            )}
          </li>
        ))}
      </ul>

      {toast === null ? null : <Toast title={toast} tone="error" />}
    </section>
  );
}
