'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, fieldShell } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { Quantity } from '@/components/ui/Quantity';
import {
  MAX_DAYS_AHEAD,
  MIN_DECLINE_REASON,
  MIN_MEETING_POINT,
  PERIOD_HOURS,
} from '@/lib/domain/viewing-rules';
import { VIEWING_PERIOD, VIEWING_PERIOD_HINT } from '@/lib/labels/viewings';

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
  const [countering, setCountering] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [reason, setReason] = useState('');
  const [onDate, setOnDate] = useState('');
  const [period, setPeriod] = useState('AFTERNOON');
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

  const open = status === 'REQUESTED' || status === 'COUNTERED' || status === 'CONFIRMED';
  const mustAnswer = side === 'SELLER' && status === 'REQUESTED';
  /** **والدورُ ينتقل بالاقتراح** — فالقبولُ على المشتري لا البائع */
  const mustDecide = side === 'BUYER' && status === 'COUNTERED';

  if (!open) return null;

  const today = new Date();
  const minDay = today.toISOString().slice(0, 10);
  const maxDay = new Date(today.getTime() + MAX_DAYS_AHEAD * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <>
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {!mustAnswer ? null : (
          <>
            <Button size="sm" onClick={() => setAccepting(true)} disabled={pending}>
              اقبل الموعد
            </Button>
            {/*
              **واقتراحٌ مضادّ بدل اعتذارٍ يُنهي الحوار**: من لا يستطيع
              السبت ويستطيع الأحد كان يُضطرّ إلى الرفض، ثمّ ينتظر أن
              يعيد المشتري الطلب — وأكثرُهم لا يعيد.
            */}
            <Button size="sm" variant="outline" onClick={() => setCountering(true)} disabled={pending}>
              اقترح موعدًا آخر
            </Button>
            <Button size="sm" variant="ghost" className="border border-line" onClick={() => setDeclining(true)} disabled={pending}>
              اعتذر
            </Button>
          </>
        )}

        {!mustDecide ? null : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => send({ action: 'accept-counter' })}
          >
            اقبل اقتراح البائع
          </Button>
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

      <Modal open={countering} onClose={() => setCountering(false)} title="اقترح موعدًا آخر">
        <p className="mb-4 text-2xs leading-loose opacity-75">
          اختر ما يناسبك واكتب نقطة اللقاء. يصل المشتري اقتراحُك، فإن قبله تأكّد الموعد — ولا
          يُكشف مكانُك قبل قبوله.
        </p>

        <div className="flex flex-col gap-4">
          <Field htmlFor="v-cd" label="اليوم" required>
            <input
              id="v-cd"
              type="date"
              min={minDay}
              max={maxDay}
              value={onDate}
              onChange={(event) => setOnDate(event.target.value)}
              className={`${fieldShell('form')} font-num`}
            />
          </Field>
          <p className="-mt-2.5 text-3xs opacity-65">
            المدّة المتاحة للحجز: <Quantity unit="days" count={MAX_DAYS_AHEAD} />
          </p>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-2xs font-semibold opacity-70">
              الفترة
              <span aria-hidden className="text-danger"> *</span>
              <span className="sr-only"> (مطلوب)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              {Object.keys(PERIOD_HOURS).map((key) => (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3.5 py-2.5 ${
                    period === key ? 'border-ink bg-surface' : 'border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name="v-cperiod"
                      value={key}
                      checked={period === key}
                      onChange={() => setPeriod(key)}
                      className="accent-ink"
                    />
                    {VIEWING_PERIOD[key] ?? key}
                  </span>
                  <span className="font-num ps-6 text-3xs opacity-65">
                    {VIEWING_PERIOD_HINT[key] ?? ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field htmlFor="v-cmp" label="نقطة اللقاء" required>
            <input
              id="v-cmp"
              value={meetingPoint}
              maxLength={300}
              onChange={(event) => setMeetingPoint(event.target.value)}
              className={fieldShell('form')}
            />
          </Field>

          <Button
            disabled={pending || onDate === '' || meetingPoint.trim().length < MIN_MEETING_POINT}
            onClick={() => send({ action: 'counter', onDate, period, meetingPoint })}
          >
            {pending ? 'يُرسَل…' : 'أرسل الاقتراح'}
          </Button>
        </div>
      </Modal>

      {toast === null ? null : <Toast tone="error" title={toast} />}
    </>
  );
}
