/**
 * الأرقام: التخزين والحساب Latin دائمًا، والعرض عربي-هندي.
 * لا تُستدعى هذه الدوال إلا في طبقة العرض — لا في `domain/` ولا في الـAPI.
 */

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** فاصلة الألوف العربية U+066C والفاصلة العشرية U+066B */
const ARABIC_GROUP = '٬';
const ARABIC_DECIMAL = '٫';

/** يحوّل الأرقام اللاتينية وحدها إلى عربية-هندية، ويترك ما عداها. */
export function toArabicDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)] as string);
}

/** العكس — لتطبيع مدخلات المستخدم قبل التخزين. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(new RegExp(ARABIC_GROUP, 'g'), '')
    .replace(new RegExp(ARABIC_DECIMAL, 'g'), '.');
}

export type NumeralLocale = 'ar' | 'en';

type FormatOptions = {
  /** خانات عشرية ثابتة. الافتراضي: بلا كسور. */
  decimals?: number;
  /** فاصل الألوف. الافتراضي مفعّل. */
  grouped?: boolean;
};

/**
 * يصوغ رقمًا للعرض بحسب اللغة.
 * `ar` ⇒ أرقام عربية-هندية بفواصل عربية · `en` ⇒ Latin بفواصل لاتينية.
 */
export function formatNumber(
  value: number | string,
  locale: NumeralLocale,
  { decimals = 0, grouped = true }: FormatOptions = {},
): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return '';

  const latin = numeric.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  });

  if (locale === 'en') return latin;

  return toArabicDigits(latin)
    .replace(/,/g, ARABIC_GROUP)
    .replace(/\./g, ARABIC_DECIMAL);
}

/** عدّاد `HH:MM:SS` — **Latin في اللغتين** (HANDOFF §١٢: أوضح وأسرع قراءة). */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const SECONDS_PER_DAY = 86_400;

/**
 * ما فوق ٢٤ ساعة لا يُعرض ساعاتٍ بالآلاف.
 * `634796:04:20` رقم صحيح حسابيًا وبلا معنى للقارئ.
 * فوق يوم: أيام وساعات. دون يوم: `HH:MM:SS`.
 */
export function splitDuration(totalSeconds: number): {
  days: number;
  hours: number;
  clock: string;
  isLong: boolean;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(safe / SECONDS_PER_DAY),
    hours: Math.floor((safe % SECONDS_PER_DAY) / 3600),
    clock: formatDuration(safe),
    isLong: safe >= SECONDS_PER_DAY,
  };
}

/**
 * نسبة مئوية في **مقطع نصّي واحد**: الإشارة والرقم والعلامة معًا.
 * تقسيمها إلى ثلاثة عناصر يجعل الاتجاه يفرّقها فتُقرأ «٪ ٤٠ −».
 */
export function formatPercent(value: number, locale: NumeralLocale): string {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  const digits = formatNumber(Math.abs(value), locale, { grouped: false });
  return locale === 'ar' ? `${sign}${digits}٪` : `${sign}${digits}%`;
}
