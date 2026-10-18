'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, fieldShell } from '@/components/ui/Field';
import { Quantity } from '@/components/ui/Quantity';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { MAX_DAYS_AHEAD, PERIOD_HOURS } from '@/lib/domain/viewing-rules';
import { VIEWING_PERIOD, VIEWING_PERIOD_HINT } from '@/lib/labels/viewings';

/**
 * ═══ طلبُ معاينة — وكان الزرّ يقول «قريبًا» ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «افعل ما تراه احترافيًّا ويناسب السوق
 * السعودي». **والمعاينةُ لقاءٌ بين طرفي الصفقة**، لا خدمةَ مزوّدٍ —
 * فكانت صفًّا في `Service` بلا صنفٍ يردّ كلَّ طلبٍ بـ«لا تغطية».
 *
 * ═══ واليومُ وفترتُه لا ساعةٌ بالدقيقة ═══
 *
 * **المواعيد هنا تُضبط على الصلوات**: «بعد العصر» و«بعد المغرب» هما
 * ما يقوله الناس ويتّفقون عليه. ومن يُطلَب منه اختيار ٤:٣٧ يختار
 * رقمًا لا يعنيه، ثمّ يتّفقان بمكالمةٍ على كل حال.
 */
const PERIODS = Object.keys(PERIOD_HOURS);

export function RequestViewing({
  listingRef,
  locale,
  label,
  className,
  variant = 'outline',
}: {
  listingRef: string;
  locale: string;
  label: string;
  className?: string;
  variant?: 'outline' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const [onDate, setOnDate] = useState('');
  const [period, setPeriod] = useState('AFTERNOON');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** **ولا يُعرض ما مضى في المُنتقي أصلًا** — المنعُ بعد الضغط أسوأ */
  const today = new Date();
  const min = isoDay(today);
  const max = isoDay(new Date(today.getTime() + MAX_DAYS_AHEAD * 86_400_000));

  const send = (): void => {
    if (onDate === '') {
      setError('اختر يوما.');
      return;
    }
    setError(null);
    start(async () => {
      const response = await fetch('/api/v1/viewings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingRef, onDate, period, note: note === '' ? null : note }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setError(payload?.error?.messageAr ?? 'تعذر إرسال الطلب.');
        return;
      }
      setOpen(false);
      setToast('أرسل طلبك. ستصلك رسالة حين يرد البائع.');
      /** **والوجهةُ تُفتح** — فلا ينتهي الطلب بلا شاشةٍ يتابعه فيها */
      window.location.assign(`/${locale}/account/viewings`);
    });
  };

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <p className="mb-4 text-2xs leading-loose opacity-75">
          اختر يوما وفترة، ويرد البائع بالقبول أو الاعتذار. ولا يكشف مكان اللقاء إلا بعد
          تأكيد الموعد.
        </p>

        <div className="flex flex-col gap-4">
          <Field htmlFor="v-date" label="اليوم" required>
            <input
              id="v-date"
              type="date"
              min={min}
              max={max}
              value={onDate}
              onChange={(event) => setOnDate(event.target.value)}
              className={`${fieldShell('form')} font-num`}
            />
          </Field>

          {/*
            **والمدّةُ تُقال بـ`Quantity`** — فلا يحكم العددُ المعدود،
            و«21 يومًا» مكتوبةً بيد تُخرج رقمًا لاتينيًّا وجمعًا يُصيب
            حالةً من ستّ.
          */}
          <p className="-mt-2.5 text-3xs opacity-65">
            المدة المتاحة للحجز: <Quantity unit="days" count={MAX_DAYS_AHEAD} />
          </p>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-2xs font-semibold opacity-70">
              الفترة
              <span aria-hidden className="text-danger"> *</span>
              <span className="sr-only"> (مطلوب)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              {PERIODS.map((key) => (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-3.5 py-2.5 ${
                    period === key ? 'border-ink bg-surface' : 'border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name="v-period"
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

          <Field htmlFor="v-note" label="ملاحظة للبائع" hint="اختيارية — مثل: أصل من الدمام، أفضل نهاية الأسبوع.">
            <textarea
              id="v-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={fieldShell('form')}
            />
          </Field>

          {error === null ? null : (
            <p className="text-3xs font-semibold text-danger">{error}</p>
          )}

          <Button onClick={send} disabled={pending} className="w-full">
            {pending ? 'يرسل…' : 'أرسل الطلب'}
          </Button>
        </div>
      </Modal>

      {toast === null ? null : <Toast tone="success" title={toast} />}
    </>
  );
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
