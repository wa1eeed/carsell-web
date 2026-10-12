'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { splitDuration } from '@/lib/arabic';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

export type CountdownTone = 'ink' | 'warn' | 'plain';

/**
 * البطاقة **تُمسَح** بالعين وصفحة السيارة **تُقرأ**، فالصيغتان تختلفان:
 * `compact` «٤ أيام ١ س» — شارة صغيرة بين شارات أخرى.
 * `full`    «٤ أيام و١ ساعة» — للمساحة التي تحتمل القراءة الكاملة.
 * ودون ٢٤ ساعة `HH:MM:SS` في الموضعين.
 */
export type CountdownFormat = 'compact' | 'full';

const TONE: Record<CountdownTone, string> = {
  ink: 'bg-ink text-bg px-2.5 py-1 rounded-sm',
  warn: 'bg-warn-200 text-warn-900 px-2.5 py-1 rounded-sm',
  plain: '',
};

/**
 * عدّاد `HH:MM:SS`.
 *
 * · دون ٢٤ ساعة: `HH:MM:SS` **Latin في اللغتين** (HANDOFF §١٢).
 * · فوقها: أيام وساعات. ساعات بالآلاف (`634796:04:20`) رقم صحيح
 *   حسابيًا وبلا معنى للقارئ، فلا تُعرض أبدًا.
 * · يتوقّف عند إخفاء الصفحة ويعيد الحساب عند العودة، فلا مؤقّت
 *   يعمل في تبويب مخفي ولا انحراف تراكمي.
 * · الوقت المتبقّي يُحسب من فارق زمني لا من عدّ تنازلي — تكبيرة
 *   واحدة في الثانية بلا تراكم خطأ.
 */
export function Countdown({
  endsAt,
  tone = 'ink',
  format = 'compact',
  onEnd,
  className,
}: {
  endsAt: Date | string;
  tone?: CountdownTone;
  format?: CountdownFormat;
  onEnd?: () => void;
  className?: string;
}) {
  const t = useTranslations('ui');
  const target = useMemo(
    () => (typeof endsAt === 'string' ? new Date(endsAt) : endsAt),
    [endsAt],
  ) as Date | null;
  /**
   * ═══ وتاريخٌ لا يُقرأ لا يُسقط الصفحة ═══
   *
   * وصلها `null` من بطاقةٍ ظنّت أنها حذفت الحقل، **فسقطت صفحة الهبوط
   * كلُّها ٥٠٠** على `target.getTime()`. والسبب أُصلح في مصدره
   * (`toCardData`)، وهذا حارسُ العمق: عدّادٌ بلا موعدٍ صالح يختفي —
   * ولا يأخذ معه ما حوله.
   *
   * و`NaN` كـ`null`: `new Date('ليس تاريخًا')` لا ترمي، تُعيد تاريخًا
   * غير صالح يُنتج `NaN` فيُعرض عدّادٌ فارغ.
   */
  const at = target === null || Number.isNaN(target.getTime()) ? null : target.getTime();

  /**
   * ═══ والخادم والعميل يرسمان ثانيتين مختلفتين ═══
   *
   * `Date.now()` في مُهيّئ الحالة تُقرأ **مرّتين**: مرّةً في الخادم
   * وقت التصيير، ومرّةً في المتصفّح وقت الترطيب. وبينهما جزءٌ من
   * ثانيةٍ يكفي لأن يُرسم `03:10:43` هناك و`03:10:44` هنا — فيرمي
   * React «Hydration failed» **ويُعيد بناء الشجرة كلّها في العميل**.
   *
   * وقِيس: الخطأ يقع في كل صفحة مزاد وفي الرئيسية (`LiveBar`) — أي
   * في أكثر صفحتين يصلهما الزائر، ومعه ومضةٌ وإعادةُ رسم.
   *
   * **و`suppressHydrationWarning` هو جواب React لهذا بعينه**: النصّ
   * المتغيّر بالزمن يُستثنى من المطابقة، ويُعتمد ما في العميل. وأوّل
   * نبضةٍ في `useEffect` تصحّحه فورًا — فلا يُرى الفرق أصلًا.
   */
  const [remaining, setRemaining] = useState(() =>
    at === null ? 0 : Math.max(0, Math.floor((at - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (at === null) return;
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = (): void => {
      const next = Math.max(0, Math.floor((at - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
        onEnd?.();
      }
    };

    const start = (): void => {
      if (timer !== undefined) return;
      tick();
      timer = setInterval(tick, 1000);
    };

    const stop = (): void => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = (): void => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [at, onEnd]);

  const parts = splitDuration(remaining);

  /** **وبلا موعدٍ صالح لا يُعرض شيء** — عدّادٌ فارغ يُقرأ عطلًا. */
  if (at === null) return null;

  if (parts.isLong) {
    const days = <Quantity unit="days" count={parts.days} />;

    /**
     * صفر الساعات لا يُنطق في مدّة مركّبة: «٤ أيام ولا ساعات» صحيحة
     * نحويًا وسخيفة قراءةً. صيغة الصفر في `units` تخدم عدًّا مستقلًّا
     * («لا مزايدين»)، لا جزءًا ثانيًا من مدّة.
     */
    if (parts.hours === 0) {
      return (
        <span
          suppressHydrationWarning
          className={cn('inline-flex items-center font-bold', TONE[tone], className)}
        >
          {days}
        </span>
      );
    }

    // الواو خارج المقطعين المعزولين لا داخلهما، والمسافات حولها
    // في ملف الترجمة لأنها تختلف بين «و١ ساعة» و«and 1 hour».
    if (format === 'full') {
      return (
        /*
          **و`inline-flex` تبتلع المسافة بين المقطعين.** العناصر في
          تخطيط flex تصير عناصرَ مرنة، والعقدة النصّية التي ليس فيها
          إلّا فراغٌ تُسقَط — فتُقرأ «يومانو٢٣ ساعة» ملتصقة، والمسافة
          موجودةٌ في ملفّ الترجمة.

          وهذا سطرٌ من نصّ لا صفٌّ من عناصر، فالتدفّق الطبيعيّ أصحّ.
        */
        <span suppressHydrationWarning className={cn('font-bold', TONE[tone], className)}>
          {t.rich('durationFull', {
            d: () => days,
            h: () => <Quantity unit="hours" count={parts.hours} />,
          })}
        </span>
      );
    }

    // مقطعان معزولان بفراغ تخطيطي — لا فاصل نصّي بينهما
    return (
      <span
        suppressHydrationWarning
        className={cn('inline-flex items-center gap-1.5 font-bold', TONE[tone], className)}
      >
        {days}
        <Quantity unit="hoursShort" count={parts.hours} />
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      suppressHydrationWarning
      className={cn('font-num inline-block font-bold tabular-nums', TONE[tone], className)}
    >
      {parts.clock}
    </span>
  );
}
