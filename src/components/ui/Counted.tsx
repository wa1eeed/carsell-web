'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ عددٌ بجارِّه أو صفته — في صيغةٍ واحدة ═══
 *
 * `<Quantity>` تُصيب واحدةً من ستّ صيغ، **وما يُضَمّ إليها من خارجها
 * لا يُصيب شيئًا**: «قبل» + «شهران» تُخرج مثنًّى مرفوعًا بعد حرف جرّ،
 * و«معارض» + «موثّقًا» تُلزم الصفةَ صيغةً واحدة بينما المعدود يتغيّر.
 *
 * فهذه تأخذ **الرسالة كاملةً** — الجارّ والصفة داخلها — من مساحة
 * `counted`. والبوابة ٣١ تمنع الضمّ من خارجها.
 */
export function Counted({
  message,
  count,
  className,
}: {
  /** مفتاحٌ في `counted` — ورسالتُه تحمل الجارَّ والصفة بصيغها الستّ */
  message: string;
  count: number;
  className?: string;
}) {
  const t = useTranslations('counted');
  const locale = useLocale() as NumeralLocale;
  // `count` للاختيار النحويّ و`n` للعرض — و`#` في ICU لاتينيّ
  return (
    <span className={cn('bidi-isolate', className)}>
      {t(message, { count, n: formatNumber(count, locale) })}
    </span>
  );
}
