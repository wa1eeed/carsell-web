import type {
  BodyType, Drivetrain, FuelType, ListingType, Transmission, VehicleCondition, VehicleSpec,
} from '@/generated/prisma/enums';

/**
 * ═══ معجم البحث بالجملة ═══
 *
 * **وهو مفرداتُ الإدخال لا نصُّ العرض.** البوابة ١٧ تمنع الحرف العربي
 * في `src/lib/domain` لأن النطاق لا يستطيع الصياغة: لا يعرف اللغة ولا
 * يملك `Quantity`. وهذا ليس صياغة — هو ما يطابقه المحلّل في جملة
 * الزائر، كقيم التعداد سواء.
 *
 * فالفصل يحفظ الاثنين: المعجم هنا بيانًا يُزاد عليه، والخوارزمية في
 * `domain/query-parse.ts` بلا حرفٍ عربيّ واحد.
 */

export type LexiconChip =
  | { field: 'condition'; value: VehicleCondition }
  | { field: 'transmission'; value: Transmission }
  | { field: 'fuel'; value: FuelType }
  | { field: 'bodyType'; value: BodyType }
  | { field: 'drivetrain'; value: Drivetrain }
  | { field: 'spec'; value: VehicleSpec }
  | { field: 'type'; value: ListingType }
  | { field: 'inspected'; value: true };

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * **والتطبيع يسبق كل مطابقة.** «الريّاض» و«الرياض» و«ﺍﻟﺮﻳﺎﺽ» مدينةٌ
 * واحدة، ومن يكتب بلوحةٍ عربية قد يُدخل تطويلًا أو همزةً أو تاءً
 * مربوطة — ومطابقةٌ حرفيّة تردّ «لم نفهم» على كتابةٍ صحيحة.
 */
export function normalize(text: string): string {
  let out = '';
  for (const char of text) {
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic !== -1) { out += String(arabic); continue; }
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian !== -1) { out += String(persian); continue; }
    out += char;
  }

  return out
    .toLowerCase()
    // التشكيل والتطويل يُحذفان — لا يميّزان كلمةً عن أخرى
    .replace(/[ـً-ْٰ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    // الفاصلة العربية والعشرية وفواصل الآلاف لا تفرّق رقمًا عن رقم
    .replace(/[،,٬]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ═══════════════════ المعجم ═══════════════════ */

/**
 * كلماتٌ مفردة تُسند قيمةً — **وكلُّ صيغةٍ يكتبها الناس**.
 *
 * «أوتوماتيك» و«اوتوماتك» و«قير اوتوماتيك» ثلاثتها واحدة، ومن يحذف
 * واحدةً منها يردّ «لم نفهم» على أكثر الصيغ شيوعًا. والمعجم يُكتب
 * مطبَّعًا (بلا همزات ولا تاء مربوطة) فيُطابق ما يصله مطبَّعًا.
 */
export const WORDS: readonly { words: readonly string[]; chip: LexiconChip }[] = [
  { words: ['جديده', 'جديد', 'زيرو', 'صفر ممشي'], chip: { field: 'condition', value: 'NEW' } },
  { words: ['مستعمله', 'مستعمل', 'نظيفه', 'وكاله'], chip: { field: 'condition', value: 'USED' } },

  { words: ['اوتوماتيك', 'اوتوماتك', 'اتوماتيك', 'قير عادي', 'automatic'], chip: { field: 'transmission', value: 'AUTOMATIC' } },
  { words: ['مانيوال', 'عادي قير', 'قير مانيوال', 'manual'], chip: { field: 'transmission', value: 'MANUAL' } },
  { words: ['cvt'], chip: { field: 'transmission', value: 'CVT' } },

  { words: ['بنزين', 'petrol'], chip: { field: 'fuel', value: 'PETROL' } },
  { words: ['ديزل', 'diesel'], chip: { field: 'fuel', value: 'DIESEL' } },
  { words: ['هايبرد', 'هجين', 'hybrid'], chip: { field: 'fuel', value: 'HYBRID' } },
  { words: ['كهربايي', 'كهربا', 'كهربايه', 'electric'], chip: { field: 'fuel', value: 'ELECTRIC' } },

  { words: ['سيدان', 'صالون'], chip: { field: 'bodyType', value: 'SEDAN' } },
  { words: ['جيب', 'دفع رباعي', 'suv'], chip: { field: 'bodyType', value: 'SUV' } },
  { words: ['ونيت', 'بيكب', 'وانيت'], chip: { field: 'bodyType', value: 'PICKUP' } },
  { words: ['هاتشباك'], chip: { field: 'bodyType', value: 'HATCHBACK' } },
  { words: ['كوبيه'], chip: { field: 'bodyType', value: 'COUPE' } },
  { words: ['فان', 'عايليه'], chip: { field: 'bodyType', value: 'VAN' } },

  { words: ['دبل', 'فور ويل', '4wd'], chip: { field: 'drivetrain', value: 'FOUR_WD' } },

  { words: ['سعودي', 'سعوديه', 'وارد السعوديه'], chip: { field: 'spec', value: 'SAUDI' } },
  { words: ['خليجي', 'خليجيه', 'وارد الخليج'], chip: { field: 'spec', value: 'GCC' } },

  { words: ['مزاد', 'مزايده'], chip: { field: 'type', value: 'AUCTION' } },
  { words: ['تفاوض', 'قابل للتفاوض'], chip: { field: 'type', value: 'NEGOTIATION' } },

  { words: ['مفحوصه', 'مفحوص', 'بفحص', 'مع فحص'], chip: { field: 'inspected', value: true } },
];

/* ═══════════════════ الأرقام ═══════════════════ */

export const THOUSAND = /^(الف|ألف|k)$/;
export const MILLION = /^(مليون|m)$/;

/**
 * «١٠٠ ألف» مئةُ ألف، و«١٠٠٬٠٠٠» مثلها — **والرقم يُقرأ مع مضاعِفه**.
 *
 * ومن يكتب «تحت ١٠٠» يقصد مئة ألفٍ لا مئة ريال، فرقمٌ صغير في سياق
 * سعرٍ يُضرب في ألف. والحدّ عند ألفٍ لأن سيارةً بألف ريال لا تُعرض،
 * وسيارةً بـ«١٥٠٠» قد تعني ألفًا وخمسمئة ألف.
 */
export function priceOf(digits: string, next: string | undefined): number {
  const raw = Number(digits);
  if (next !== undefined && THOUSAND.test(next)) return raw * 1_000;
  if (next !== undefined && MILLION.test(next)) return raw * 1_000_000;
  return raw < 1_000 ? raw * 1_000 : raw;
}

export const BELOW = ['تحت', 'اقل من', 'باقل من', 'لين', 'حتي', 'ما يتجاوز', 'بحدود', 'في حدود', 'الي'];
export const ABOVE = ['فوق', 'اكثر من', 'باكثر من', 'من فوق', 'يزيد عن'];
/** «من ٢٠٢٠» أرضيةُ سنة، و«قبل ٢٠٢٠» سقفُها — وهما سابقتان لا لاحقتان. */
export const SINCE = ['من', 'بعد', 'موديل'];
export const UNTIL = ['قبل'];

export const NEWER = ['وفوق', 'واحدث', 'فما فوق', 'او احدث'];
export const OLDER = ['واقدم', 'ونزول', 'او اقدم'];


/**
 * حروف الوصل وألفاظ الطلب — **ليست عجزًا عن الفهم**، فلا تُعدّ فيما
 * لم يُفهم. و«أبغى سيارة في الرياض» فُهمت كلّها.
 */
export const FILLER: ReadonlySet<string> = new Set(['في', 'من', 'الي', 'او', 'و', 'علي', 'مع', 'ب', 'بـ', 'سياره', 'سيارات', 'ابي', 'ابغي', 'اريد', 'ودي']);
