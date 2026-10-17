'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, fieldShell } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { MIN_DECLINE_REASON, MIN_MEETING_POINT } from '@/lib/domain/viewing-rules';

/**
 * ═══ ردُّ البائع وإلغاءُ الطرفين ═══
 *
 * **والطرفُ الثاني يُبنى مع الأوّل**: طلبٌ يُرسَل ولا يُجاب هو نصفُ
 * ميزة — وهو الصنف الذي تكرّر في هذا المستودع مرارًا.
 *
 * **ولا يُعرض زرٌّ لا تقبله الحال**: زرٌّ يردّ ٤٠٩ بعد الضغط أسوأ من
 * غيابه، فالحال تُقرأ في الخادم وتصل مقرَّرةً.
 */
export function ViewingActions({
  ref_,
  side,
  status,
}: {
  ref_: string;
  side: 'BUYER' | 'SELLER';
  status: string;
}) {
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (body: Record<string, string>): void => {
    start(async () => {
      const response = await fetch(`/api/v1/viewings/${encodeURIComponent(ref_)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر التنفيذ.');
        return;
      }
      /** تحميلٌ كامل — الحال تُقرأ في الخادم، فيُرى ما وقع لا ما قبله */
      window.location.reload();
    });
  };

  const open = status === 'REQUESTED' || status === 'CONFIRMED';
  const mustAnswer = side === 'SELLER' && status === 'REQUESTED';

  if (!open) return null;

  return (
    <>
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {!mustAnswer ? null : (
          <>
            <Button size="sm" onClick={() => setAccepting(true)} disabled={pending}>
              اقبل الموعد
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeclining(true)} disabled={pending}>
              اعتذر
            </Button>
          </>
        )}
        {/* **والإلغاء لكلا الطرفين** — ظروفُ الناس تتغيّر */}
        <Button
          size="sm"
          variant="ghost"
          className="border border-line"
          disabled={pending}
          onClick={() => send({ action: 'cancel' })}
        >
          ألغِ الموعد
        </Button>
      </div>

      <Modal open={accepting} onClose={() => setAccepting(false)} title="اقبل الموعد">
        <p className="mb-4 text-2xs leading-loose opacity-75">
          اكتب أين يقابلك. يُعرض للمشتري بعد القبول وحده — ومعه رقمُك.
        </p>
        <Field htmlFor="v-mp" label="نقطة اللقاء" required hint="مثل: محطة بترومين، طريق الملك عبدالعزيز، حيّ الملقا.">
          <input
            id="v-mp"
            value={meetingPoint}
            maxLength={300}
            onChange={(event) => setMeetingPoint(event.target.value)}
            className={fieldShell('form')}
          />
        </Field>
        <Button
          className="mt-4 w-full"
          disabled={pending || meetingPoint.trim().length < MIN_MEETING_POINT}
          onClick={() => send({ action: 'accept', meetingPoint })}
        >
          {pending ? 'يُرسَل…' : 'أكّد الموعد'}
        </Button>
      </Modal>

      <Modal open={declining} onClose={() => setDeclining(false)} title="اعتذر عن الموعد">
        <p className="mb-4 text-2xs leading-loose opacity-75">
          اكتب سببًا قصيرًا — فمن رُفض بلا سببٍ لا يعرف أيقترح موعدًا آخر أم يبحث عن غيرها.
        </p>
        <Field htmlFor="v-rs" label="السبب" required>
          <textarea
            id="v-rs"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={fieldShell('form')}
          />
        </Field>
        <Button
          className="mt-4 w-full"
          disabled={pending || reason.trim().length < MIN_DECLINE_REASON}
          onClick={() => send({ action: 'decline', reason })}
        >
          {pending ? 'يُرسَل…' : 'أرسل الاعتذار'}
        </Button>
      </Modal>

      {toast === null ? null : <Toast tone="error" title={toast} />}
    </>
  );
}
