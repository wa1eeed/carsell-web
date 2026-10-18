/**
 * ═══ لوحةُ المركبة السعودية — الخريطةُ والتطبيع ═══
 *
 * منقولةٌ عن مواصفة المالك (`plate-rendering.md` في مشروعه الآخر) بلا
 * تغييرٍ في القاعدة: الحروفُ السبعةَ عشرَ ومقابلُها اللاتينيّ، وأشكالُ
 * الإدخال البديلة، وتطبيعُ الأرقام.
 *
 * **وملفٌّ بلا `db`**: تقرؤه الشاشةُ والخادمُ والبذرةُ والاختبار —
 * واستيرادٌ ساكنٌ لوحدةٍ تجرّ Prisma يُسقط الزرعَ وحزمةَ المتصفّح معًا.
 *
 * خريطة تحويل حروف وأرقام لوحات المركبات السعودية.
 *
 * ملاحظة مهمة: هذه ليست transliteration لغويًا عامًا، بل خريطة مخصّصة
 * للوحات المركبات حيث تُقابل بعض الحروف العربية أحرفًا لاتينية غير متوقعة
 * لغويًا (مثل: ص → X ، م → Z ، ع → E). عدّل هذا الملف وحده عند الحاجة.
 */

export type PlateLetterEntry = {
  /** الحرف العربي كما يظهر على اللوحة */
  ar: string
  /** الحرف اللاتيني المقابل كما يظهر على اللوحة */
  en: string
  /** أشكال إدخال بديلة تُطبّع إلى الحرف العربي المعتمد */
  aliases?: string[]
}

/** الحروف السبعة عشر المعتمدة في لوحات المركبات السعودية. */
export const SAUDI_PLATE_LETTERS: readonly PlateLetterEntry[] = [
  { ar: 'ا', en: 'A', aliases: ['أ', 'إ', 'آ', 'ٱ', 'A', 'a'] },
  { ar: 'ب', en: 'B', aliases: ['B', 'b'] },
  { ar: 'ح', en: 'J', aliases: ['J', 'j'] },
  { ar: 'د', en: 'D', aliases: ['D', 'd'] },
  { ar: 'ر', en: 'R', aliases: ['R', 'r'] },
  { ar: 'س', en: 'S', aliases: ['S', 's'] },
  { ar: 'ص', en: 'X', aliases: ['X', 'x'] },
  { ar: 'ط', en: 'T', aliases: ['T', 't'] },
  { ar: 'ع', en: 'E', aliases: ['E', 'e'] },
  { ar: 'ق', en: 'G', aliases: ['G', 'g'] },
  { ar: 'ك', en: 'K', aliases: ['K', 'k'] },
  { ar: 'ل', en: 'L', aliases: ['L', 'l'] },
  { ar: 'م', en: 'Z', aliases: ['Z', 'z'] },
  { ar: 'ن', en: 'N', aliases: ['N', 'n'] },
  { ar: 'ه', en: 'H', aliases: ['هـ', 'ة', 'ھ', 'H', 'h'] },
  { ar: 'و', en: 'U', aliases: ['ؤ', 'U', 'u'] },
  { ar: 'ى', en: 'V', aliases: ['ي', 'ئ', 'V', 'v'] },
] as const

const AR_TO_EN = new Map<string, string>()
const NORMALIZE = new Map<string, string>()

for (const entry of SAUDI_PLATE_LETTERS) {
  AR_TO_EN.set(entry.ar, entry.en)
  NORMALIZE.set(entry.ar, entry.ar)
  for (const alias of entry.aliases ?? []) NORMALIZE.set(alias, entry.ar)
}

/** الأرقام العربية الشرقية (الهندية) المستخدمة في الصف العلوي من اللوحة. */
export const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const

const DIGIT_NORMALIZE = new Map<string, string>()
ARABIC_INDIC_DIGITS.forEach((arabic, i) => {
  const western = String(i)
  DIGIT_NORMALIZE.set(western, western)
  DIGIT_NORMALIZE.set(arabic, western) // ٠-٩
  DIGIT_NORMALIZE.set(String.fromCharCode(0x06f0 + i), western) // الفارسية ۰-۹
})

/** يحوّل حرفًا عربيًا واحدًا إلى مقابله اللاتيني على اللوحة، أو `null` إن لم يكن مدعومًا. */
export function letterToLatin(char: string): string | null {
  const normalized = NORMALIZE.get(char)
  if (normalized === undefined) return null
  return AR_TO_EN.get(normalized) ?? null
}

/**
 * يطبّع سلسلة حروف مُدخلة إلى حروف لوحة عربية معتمدة.
 * يتجاهل المسافات والرموز غير المدعومة، ويقبل الإدخال اللاتيني أيضًا.
 */
export function normalizeArabicLetters(input: string, maxLetters = 3): string {
  const out: string[] = []
  for (const char of Array.from(input ?? '')) {
    const normalized = NORMALIZE.get(char)
    if (normalized) out.push(normalized)
    if (out.length >= maxLetters) break
  }
  return out.join('')
}

/**
 * يولّد الحروف اللاتينية المقابلة.
 * ترتيب الأحرف يبقى كما أُدخل؛ الاتجاه البصري تتكفّل به الواجهة
 * (الصف العربي RTL والصف اللاتيني LTR) تمامًا كما في اللوحة الحقيقية.
 */
export function lettersToLatin(arabicLetters: string): string {
  return Array.from(arabicLetters ?? '')
    .map((c) => letterToLatin(c))
    .filter((c): c is string => Boolean(c))
    .join('')
}

/** يطبّع أرقام اللوحة: أرقام غربية فقط، بلا مسافات، بحد أقصى `maxDigits`. */
export function normalizePlateNumbers(input: string, maxDigits = 4): string {
  const out: string[] = []
  for (const char of Array.from(input ?? '')) {
    const digit = DIGIT_NORMALIZE.get(char)
    if (digit === undefined) continue
    out.push(digit)
    if (out.length >= maxDigits) break
  }
  return out.join('')
}

/** يحوّل الأرقام الغربية إلى أرقام عربية شرقية (للصف العلوي من اللوحة). */
export function toArabicIndicDigits(input: string): string {
  return Array.from(input ?? '')
    .map((c) => {
      const digit = DIGIT_NORMALIZE.get(c)
      return digit === undefined ? c : ARABIC_INDIC_DIGITS[Number(digit)]
    })
    .join('')
}

/** يحوّل الأرقام العربية الشرقية إلى أرقام غربية. */
export function toWesternDigits(input: string): string {
  return Array.from(input ?? '')
    .map((c) => DIGIT_NORMALIZE.get(c) ?? c)
    .join('')
}

/** هل الحرف مدعوم في لوحات المركبات السعودية؟ */
export function isSupportedPlateLetter(char: string): boolean {
  return NORMALIZE.has(char)
}
