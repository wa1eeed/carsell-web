/**
 * ═══ الأرقام — التخزين Latin، والعرض بمفتاحٍ واحد ═══
 *
 * كان العرض عربيًّا-هنديًّا في كل مكان. **وقرار المالك: تُوحَّد
 * لاتينيّة** — أوضح للمشغّل، وأقرب لما يراه في فاتورةٍ أو كشف بنك،
 * ويقرؤه الناطق بالعربية والإنجليزية سواءً.
 *
 * والتبديل هنا وحده: `DISPLAY_NUMERALS` يقلب المنصّة كلّها —
 * ثمانيةٌ وستّون ملفًّا تنادي `displayDigits`، وواحدٌ وتسعون تستعمل
 * `ArabicNumber`، وكلُّها تمرّ من هذا الملفّ.
 *
 * ═══ وثمنُه عزلٌ لا يُنسى ═══
 *
 * رقمٌ لاتينيّ داخل نصٍّ عربيّ **مقطعٌ معاكس الاتّجاه**: بلا عزلٍ
 * ينزلق ما حوله («٣ ريال» تصير «ريال 3»)، وبلا `dir="ltr"` تسقط
 * إشارةُ السالب إلى اليمين فيُرسم «892−». فكلُّ رقمٍ معروضٍ يمرّ
 * بـ`ArabicNumber` وهي تعزل وتُثبّت الاتّجاه دائمًا.
 *
 * والتخزين والحساب Latin كما كانا. ولا تُستدعى هذه الدوال إلا في
 * طبقة العرض — لا في `domain/` ولا في الـAPI.
 */

/**
 * **مفتاحُ العرض الوحيد.** `'arabic'` يعيد المنصّة إلى الأرقام
 * العربية-الهندية في سطرٍ واحد.
 */
export const DISPLAY_NUMERALS: 'latin' | 'arabic' = 'latin';

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** فاصلة الألوف العربية U+066C والفاصلة العشرية U+066B */
const ARABIC_GROUP = '٬';
const ARABIC_DECIMAL = '٫';

/**
 * أرقامُ العرض — **لاتينية بالمفتاح الحاليّ**.
 *
 * وكان اسمُها `displayDigits`: دالّةٌ بهذا الاسم تُخرج لاتينيًّا
 * تكذب على كل من يقرأ موضع استدعائها، فيظنّ أنّ الشاشة عربية الأرقام
 * وهي ليست. **والاسم يتبع ما تفعله لا ما كانت تفعله.**
 */
export function displayDigits(value: string): string {
  if (DISPLAY_NUMERALS === 'latin') return value;
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

/**
 * ═══ لغةُ التاريخ العربيّ — وأرقامُها تتبع المفتاح ═══
 *
 * `Intl.DateTimeFormat('ar-SA')` تُخرج أرقامًا عربية-هندية من تلقائها
 * مهما فعلنا بأرقامنا — **فتُخرج الشاشة «1,234 ريال» و«١١ أكتوبر» في
 * سطرٍ واحد**. والوسم `-nu-latn` يُوحّدها.
 *
 * وكانت السلسلة مكتوبةً في ثلاثةٍ وثلاثين ملفًّا — فثابتٌ واحد يتبع
 * `DISPLAY_NUMERALS` يقلبها جميعًا.
 */
export const AR_DATE_LOCALE =
  DISPLAY_NUMERALS === 'latin' ? 'ar-SA-u-ca-gregory-nu-latn' : 'ar-SA-u-ca-gregory';

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

  if (locale === 'en' || DISPLAY_NUMERALS === 'latin') return latin;

  return displayDigits(latin)
    .replace(/,/g, ARABIC_GROUP)
    .replace(/\./g, ARABIC_DECIMAL);
}

/**
 * نصٌّ رقميّ بفواصله العربية — **لِما ليس عددًا يُحسب**.
 *
 * رقم النسخة «1.1» سلسلةٌ لا عدد: تمريره على `formatNumber` يجعله
 * `1.10` أو `1.1` بحسب الكسور المطلوبة، وهو ليس كمّيّة أصلًا. وكان
 * يُعرض بـ`displayDigits` وحدها فيخرج «١.١» بنقطةٍ لاتينية بين
 * رقمين عربيّين — والتصميم يكتب «٣٫١»، وكل عددٍ آخر في المنصّة
 * يمرّ على `ARABIC_DECIMAL` نفسها.
 */
export function displayNumeric(value: string): string {
  if (DISPLAY_NUMERALS === 'latin') return value;
  return displayDigits(value).replace(/\./g, ARABIC_DECIMAL);
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
 *
 * ═══ والإشارة للفرق لا للمستوى ═══
 *
 * كانت `+` تُكتب دائمًا للموجب، فقرأ صاحب الحساب **«+٥٠٪ اكتمال
 * الملف»** — ونصفُ ملفٍ ليس زيادةً على شيء. وقِيس: موضعان من ثلاثة
 * مستويات لا فروق (اكتمال الملف · نِسَب فتح الحملات ونقرها)، والثالث
 * وحده فرق (`StatCard.delta`).
 *
 * والتصميم يفرّق بينهما حرفيًّا: «+١٤٪» و«−٣٪» للفروق، و«٩٤٪» و«٥٨٪»
 * للمستويات. فالافتراضيّ مستوًى، والإشارة تُطلب — وافتراضُها إشارةً
 * يجعل الخطأ صامتًا.
 */
export function formatPercent(
  value: number,
  locale: NumeralLocale,
  options: { signed?: boolean } = {},
): string {
  const sign = options.signed !== true ? '' : value > 0 ? '+' : value < 0 ? '\u2212' : '';
  const digits = formatNumber(Math.abs(value), locale, { grouped: false });
  return locale === 'ar' ? `${sign}${digits}٪` : `${sign}${digits}%`;
}
