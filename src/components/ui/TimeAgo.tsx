'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AR_DATE_LOCALE, formatNumber, type NumeralLocale } from '@/lib/arabic';

/**
 * ═══ «منذ كم» — والصفر ليس عددًا هنا ═══
 *
 * `Quantity` تصوغ الصفر نفيًا: «لا دقائق». و«منذ لا دقائق» جملةٌ لا
 * معنى لها — **وتقع في اللحظة الأولى بالضبط**، أي حين يفتح صاحب
 * الشأن الشاشة أوّل مرّة بعد وصول الإشعار. فالصفر في سياق الزمن
 * جملةٌ خاصّة: «الآن».
 *
 * **والجارّ داخل صيغة الجمع** (البوابة ١٨): «منذ» قبل عددٍ يُبقي
 * المثنّى مرفوعًا — «منذ ساعتان». فكلّ فرعٍ من الجمع يحمل جارَّه،
 * والمثنّى يُكتب مجرورًا «منذ ساعتين».
 *
 * ═══ و`now` يصل من الخادم ثم يتحرّك ═══
 *
 * حسابُ «الآن» في التصيير يُنتج نصًّا على الخادم وآخر في المتصفّح
 * فتشتكي الإماهة. فاللحظة تصل خاصّيةً — الخادم والعميل يبدآن من
 * القيمة نفسها — ثم تُحدَّث بعد التركيب.
 */
export function TimeAgo({
  at,
  now,
  className,
}: {
  at: string;
  /** لحظةُ التصيير على الخادم — ISO. */
  now: string;
  className?: string;
}) {
  const t = useTranslations('notificationCenter');
  const locale = useLocale() as NumeralLocale;
  const [reference, setReference] = useState(now);

  useEffect(() => {
    const tick = (): void => {
      setReference(new Date().toISOString());
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const minutes = Math.max(
    0,
    Math.floor((new Date(reference).getTime() - new Date(at).getTime()) / 60_000),
  );

  if (minutes < 1) return <span className={className}>{t('now')}</span>;

  const say = (key: 'agoMinutes' | 'agoHours' | 'agoDays', count: number): string =>
    t(key, { count, n: formatNumber(count, locale) });

  if (minutes < 60) return <span className={className}>{say('agoMinutes', minutes)}</span>;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <span className={className}>{say('agoHours', hours)}</span>;

  const days = Math.floor(hours / 24);
  /**
   * **وبعد شهرٍ يُقال التاريخ.** «منذ ٤٧ يومًا» رقمٌ يُعاد حسابه في
   * الرأس، والتاريخ يُقرأ مرّة — والقديم يُراجَع لا يُستعجَل.
   */
  if (days <= 30) return <span className={className}>{say('agoDays', days)}</span>;

  return (
    <span className={className}>
      {new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(at))}
    </span>
  );
}
