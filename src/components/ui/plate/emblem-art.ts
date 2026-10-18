/**
 * سجلّ الشعارات الوسطية للوحة — كلّها اليوم صورٌ مخبوزة الشفافية.
 *
 * كانت رؤية ٢٠٣٠ والزخرفة التراثية مسارات SVG نرسمها بأنفسنا: أقواسٌ ودرجاتٌ
 * تُشبه المعنى ولا تُشبه الشعار، فبدت مشوّهةً إلى جانب النخلة والسيفين. وقد
 * حلّت محلّها صور الشعارات الحقيقية، تمرّ على `scripts/bake-logo.py` فيسقط
 * بياضها ويُقصّ هامشها، ثمّ تُرسم كما هي بلا قناعٍ ولا مرشِّح.
 *
 * ملاحظة: تُعرض داخل المزاد تمييزًا بصريًا للوحات، لا تمثيلًا حكوميًا.
 */

export type EmblemRole = 'primary' | 'accent'

export type EmblemShape =
  | { kind: 'path'; d: string; role: EmblemRole; opacity?: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; role: EmblemRole; letterSpacing?: number }

export type EmblemGroup = { transform?: string; shapes: EmblemShape[] }

/**
 * شعار مبني على صورة نقطية.
 * الصورة سوداء على خلفية بيضاء، ويُسقط البياض ويُلوَّن السواد عبر مصفوفة
 * ألوان (`feColorMatrix`) فتظهر بخلفية شفافة وبأي لون مطلوب.
 * `content` يصف صندوق الرسم داخل الصورة بنسب من أبعادها، حتى نضعه بدقّة
 * داخل اللوحة بلا هوامش بيضاء.
 */
export type EmblemImageArt = {
  kind: 'image'
  href: string
  title: string
  tint: string
  /** صندوق الرسم داخل الصورة: نسب من العرض والارتفاع */
  content: { x: number; y: number; width: number; height: number }
  /** نسبة أبعاد الصورة الكاملة (العرض ÷ الارتفاع) */
  imageRatio: number
}

export type EmblemVectorArt = {
  kind?: 'vector'
  viewBox: string
  title: string
  colors: { primary: string; accent: string }
  groups: EmblemGroup[]
}

export type EmblemArt = EmblemVectorArt | EmblemImageArt

export function isImageArt(art: EmblemArt): art is EmblemImageArt {
  return (art as EmblemImageArt).kind === 'image'
}

/**
 * النخلة والسيفان — صورةٌ شفّافة مقصوصة على حدّ الرسم.
 *
 * كان الأصل `palm.jpeg`: رسمٌ أسود على **أبيض** بلا شفافية، يُنتزع بياضه في
 * المتصفّح — قناعًا يُعكَس بـ`filter: invert(1)` أوّلًا، ثمّ مرشِّح
 * `feColorMatrix`. والحيلتان تعملان في Chromium وتسقطان في WebKit بعيبين
 * متعاقبين: مربّعٌ **أسود** خلف الشعار، ثمّ **إطارٌ أبيض** حوله — في كل لوحة
 * على iOS، بلا خطأ في أي سجلّ.
 *
 * والعلاج ليس حيلةً ثالثة: الشفافية تُخبز في الملفّ نفسه. `scripts/bake-emblem.py`
 * يقرأ الأصل، ويجعل الألفا من الإضاءة بعتبةٍ تُذيب الهالة الرمادية التي يخلّفها
 * ضغط JPEG، ويقصّ على حدود الرسم فلا تبقى حوله مساحة أصلًا، ويكتب نسخةً لكل
 * لون. فما يصل المتصفّح صورةٌ جاهزة يرسمها كما هي — لا قناع ولا مرشِّح ولا
 * محرّك يختلف عن محرّك.
 */
const PALM_IMAGE = {
  kind: 'image' as const,
  // مقصوصة على الرسم: الصندوق هو الصورة كلّها
  content: { x: 0, y: 0, width: 1, height: 1 },
  imageRatio: 368 / 390,
}

/**
 * شعارٌ صوريّ مقصوصٌ على حدّ رسمه.
 *
 * `content` يملأ الصندوق كلّه لأنّ `bake-logo.py` قصّ الهامش أصلًا، و`tint`
 * لونٌ يمثّله في القوائم المصغّرة لا يُصبغ به الرسم.
 */
const photo = (
  href: string,
  title: string,
  tint: string,
  imageRatio: number,
): EmblemImageArt => ({
  kind: 'image',
  href,
  title,
  tint,
  content: { x: 0, y: 0, width: 1, height: 1 },
  imageRatio,
})

// ------------------------------------------------------------------ التصدير

export const EMBLEM_ART: Record<string, EmblemArt> = {
  'palm-swords-black': {
    ...PALM_IMAGE,
    href: '/plate-emblems/palm-black.png',
    title: 'النخلة والسيفان',
    tint: 'var(--plate-ink)',
  },
  'palm-swords-gold': {
    ...PALM_IMAGE,
    href: '/plate-emblems/palm-gold.png',
    title: 'النخلة والسيفان — ذهبي',
    tint: 'var(--plate-gold)',
  },
  'vision-2030': photo(
    '/plate-emblems/vision-2030.png',
    'رؤية السعودية 2030',
    'var(--plate-vision)',
    383 / 384,
  ),
  dereyah: photo('/plate-emblems/dereyah.png', 'الدرعية', 'var(--plate-dereyah)', 160 / 165),
  madaen: photo('/plate-emblems/madaen.png', 'مدائن صالح', 'var(--plate-madaen)', 133 / 162),
}

/** الشعار الصغير المستخدم داخل الشريط الرأسي (رمز الدولة). */
export const STRIP_SYMBOL: EmblemArt = {
  ...PALM_IMAGE,
  href: '/plate-emblems/palm-black.png',
  title: 'رمز الشريط',
  tint: 'var(--plate-ink)',
}

export const EMBLEM_KEYS = Object.keys(EMBLEM_ART)
