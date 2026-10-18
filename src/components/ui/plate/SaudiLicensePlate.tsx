import { cn } from '@/lib/cn'
import type { PlateEmblem, PlateFormat, PlateSize, PlateType } from './types'
import { toArabicIndicDigits } from '@/lib/plate'
import { EMBLEM_ART, EmblemShapes, STRIP_SYMBOL } from './EmblemGraphic'
import {
  ARABIC_DIGIT_INK,
  ARABIC_LETTER_INK,
  LATIN_CAP_INK,
  LATIN_DIGIT_INK,
  inkOf,
  layoutRow,
  arabicAdvance,
  fitFontSize,
  ARABIC_SEPARATOR,
  ARABIC_SEPARATOR_ADVANCE,
} from '@/lib/plate-metrics'

export type SaudiLicensePlateProps = {
  plateType?: PlateType
  /** نوع الإصدار — الطويلة افتراضًا لما لم يُحدَّد */
  plateFormat?: PlateFormat
  arabicLetters: string
  latinLetters: string
  /** الأرقام الغربية — تُشتق منها الأرقام العربية تلقائيًا */
  plateNumbers?: string
  arabicNumbers?: string
  latinNumbers?: string
  emblem?: PlateEmblem
  customEmblemUrl?: string | null
  size?: PlateSize
  animated?: boolean
  showReflection?: boolean
  className?: string
  /** الجهة التي يظهر فيها شريط KSA */
  stripSide?: 'right' | 'left'
  title?: string
}

/** أبعاد الحاوية لكل حجم — النسبة محفوظة دائمًا عبر viewBox الخاص بـ SVG. */
// اللوحة الطويلة مسطّحة (نحو 4.6:1)، فتحتاج عرضًا أكبر لتبقى مقروءة
const SIZE_CLASS: Record<PlateSize, string> = {
  thumbnail: 'w-[190px]',
  card: 'w-[340px]',
  stage: 'w-[760px] max-w-full',
  fullscreen: 'w-full',
  // تملأ حاويتها بالكامل، وSVG يتوسّط نفسه داخلها بنسبته المحفوظة
  fill: 'h-full w-full',
}

function stableUid(parts: string[]): string {
  const source = parts.join('|')
  let hash = 5381
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0
  return `plt${hash.toString(36)}`
}

/**
 * يفصل الحروف العربية حتى تظهر بأشكالها المنفصلة كما على اللوحة.
 *
 * والفاصل من `arial-metrics` لا مكتوبًا هنا: من يصل به هو من يقيس به، وقد
 * افترقا مرّةً — وُصلت الحروف بمسافةٍ عرضُها `0.2778em` وقيست على `0.06em`.
 */
function isolateArabic(letters: string): string {
  return Array.from(letters).join(ARABIC_SEPARATOR)
}

/**
 * حجمٌ واحد للحرف والرقم، ولا يصغر إلّا إذا ضاق به عرضه.
 *
 * كانت الأحجام سلالمَ حسب عدد المحارف: حرفٌ واحد يأخذ الأساس كاملًا، وثلاثةٌ
 * تأخذ ٦٠٪ منه. فتخرج لوحةُ «A» بحرفٍ ضخم ولوحةُ «NTU» بحروفٍ صغيرة، ويختلف
 * الرقم عن الحرف في اللوحة الواحدة — وهو ما لا يقع في المصنوعة: مقاس الحرف
 * فيها ثابت، وإنّما تتّسع اللوحة لما تحمل.
 *
 * فصار الحجم واحدًا يُقاس، ولا يُنقص إلّا حين يتجاوز النصُّ عرض خانته. والعرض
 * يُقدَّر بمتوسّط تقدّم المحرف — لا حاجة إلى دقّةٍ أكثر، فالغرض حارسٌ لا مقياس.
 */
const ADVANCE = {
  /** أرقام لاتينية وعربية — عرضها ثابت في خطوط اللوحات */
  digits: 0.6,
  /** حروف لاتينية كبيرة بمتوسّط A–Z */
  latin: 0.72,
  /*
   * ولا متوسّط للعربية بعد اليوم — لكلّ حرفٍ عرضُه في
   * `ARABIC_LETTER_ADVANCE`. والمتوسّط كان يُفيض «ص» ويُضيّق «ا».
   */
} as const


/*
 * لا توجد هنا «معاملات تعويض» بعد اليوم.
 *
 * كانت اللوحة تضرب حجم الخط العربي بمعامل ثابت ليقارب اللاتيني، وتضع الصفّين
 * على خطَّي قاعدة ثابتين. وهذا يفشل حتميًا: حرف «أ» ارتفاعه 0.876em بينما
 * الحرف اللاتيني 0.728em، فمع المعامل يتجاوز الصفّ ويخرج من الإطار — وقد كان
 * يخرج فعلًا. الآن يقاس التخطيط بحبر المحارف نفسها عبر `arial-metrics`،
 * فتتساوى الارتفاعات المرئية ولا يلامس شيء الحافة.
 */

type Geometry = {
  viewBox: string
  width: number
  height: number
  frameRadius: number
  inset: number
  strip: { x: number; width: number }
  main: { x: number; width: number }
  numbers: { center: number; from: number; to: number }
  emblem: { center: number; from: number; to: number; size: number }
  letters: { center: number; from: number; to: number }
  /** شريطا الصفّين: العربي أعلى واللاتيني أسفل، بينهما فجوة */
  rows: { topBand: number; bottomBand: number; bandHeight: number }
  fonts: { numbers: number; letters: number }
  /**
   * خطوطٌ فاصلة بين الخانات — مواضع `x`.
   *
   * الطويلة بلا فواصل داخلية: الشعار الأوسط يفصل بصريًّا. والاعتيادية
   * والرياضية تُقسَّمان خاناتٍ بحدودٍ ظاهرة كما في اللوحة المصنوعة.
   */
  dividers?: number[]
  /**
   * صفٌّ واحد لاتينيّ فقط، والدولة في خانةٍ وسطى لا شريطٍ جانبيّ (الرياضية).
   */
  singleRow?: boolean
  /**
   * خاناتٌ منفصلة بأرضيّةٍ سوداء بينها — لا خطوطٌ رفيعة على وجهٍ واحد.
   *
   * الاعتيادية المصنوعة أربع لوحاتٍ صغيرة مركّبة داخل إطار: بينها فراغٌ أسود
   * ولكلٍّ حوافّها المستديرة. ورسمها بخطٍّ فاصلٍ على وجهٍ واحد يعطي شكلًا
   * آخر — أقرب إلى جدولٍ منه إلى لوحة.
   */
  cells?: { x: number; y: number; width: number; height: number }[]
  cellRadius?: number
  /**
   * كتلة الدولة — شعارٌ و«السعودية» و«KSA»، وأرضيّتها زرقاء في لوحات النقل.
   *
   * موضعها يختلف بالإصدار: وسطى في الطويلة والرياضية، وجانبيّة في الاعتيادية.
   * وشكلها يحكم ترتيب ما فيها — الضيّقة تُكدّس K S A رأسيًّا، والعريضة تكتب
   * «KSA» كلمةً واحدة.
   */
  countryBox?: { x: number; y: number; width: number; height: number }
}

/*
 * سُمك الإطار نسبةٌ من عرض اللوحة لا مقدارٌ ثابت.
 *
 * كلّ اللوحات تُعرض بعرضٍ واحد في بطاقات السوق، فالمقادير الثابتة تُكبَّر
 * بتكبير اللوحة: سبعُ وحداتٍ في الطويلة (٩٣٠) خيطٌ رفيع، وسبعٌ في الاعتيادية
 * (٤٦٠) شريطٌ عريض ضِعفَه. والنسبة تُخرجها كلَّها بسُمكٍ واحدٍ على الشاشة.
 */
const FRAME_SHARE = 7 / 930
const frameOf = (width: number) => Math.round(width * FRAME_SHARE * 10) / 10

/*
 * وتنتهي الخانات عند الإطار، فلا سوادَ بينها وبينه.
 *
 * السواد المرئيّ حول الخانات ليس الإطار وحده: أرضيّةٌ سوداء تُطلى من الإطار
 * إلى حدّ الخانة، وكانت الخانات على بُعد تسع وحدات من الحافّة. فخرج الشريط
 * الأسود في الاعتيادية ٩ وحدات من ٤٦٠ — ١٫٩٦٪ من العرض — مقابل ٠٫٧٥٪ في
 * الطويلة ذات الوجه المتّصل، وهو ما يُرى إطارًا عريضًا لا فرقًا في البناء.
 * وحين تنتهي الخانة عند الإطار يبقى المرئيّ إطارًا واحدًا في اللوحات كلّها،
 * وتبقى الفواصل بين الخانات كما هي.
 */
const STANDARD_FRAME = frameOf(460)
const MOTO_FRAME = frameOf(430)
const SPORT_FRAME = frameOf(760)
const LONG_FRAME = frameOf(930)

const LONG_GEOMETRY: Geometry = {
  viewBox: '0 0 930 200',
  width: 930,
  height: 200,
  frameRadius: 20,
  inset: LONG_FRAME,
  strip: { x: 858, width: 65 },
  main: { x: 7, width: 851 },
  numbers: { center: 210, from: 90, to: 330 },
  emblem: { center: 460, from: 360, to: 560, size: 132 },
  letters: { center: 700, from: 600, to: 800 },
  rows: { topBand: 20, bottomBand: 100, bandHeight: 80 },
  fonts: { numbers: 96, letters: 96 },
  // وجهٌ واحد متّصل بلا خانات — الشعار الأوسط يفصل بصريًّا
  countryBox: { x: 858, y: LONG_FRAME, width: 65, height: 200 - LONG_FRAME * 2 },
}

/**
 * الطويلة للنقل الخاصّ.
 *
 * تختلف عن أختها في بنيتها لا في لونها وحده: خاناتٌ منفصلة، والدولة كتلةٌ
 * **وسطى** زرقاء لا شريطٌ على الحافّة — كما في المصنوعة. ولا شعار أوسط فيها:
 * موضعه شغلته الدولة.
 *
 * ولذلك لا يجوز جعل الطويلة كلّها خانات: الشعار الأوسط في الخصوصية يقع في
 * موضع كتلة الدولة، فيجتمع في الوسط شعاران — والسيفان والنخلة يتكرّران إن
 * كان هو المختار.
 */
const LONG_TRANSPORT_GEOMETRY: Geometry = {
  viewBox: '0 0 930 200',
  width: 930,
  height: 200,
  frameRadius: 20,
  inset: LONG_FRAME,
  strip: { x: 0, width: 0 },
  main: { x: 7, width: 916 },
  numbers: { center: 199, from: 9, to: 389 },
  // لا شعار أوسط — الدولة تشغل الوسط
  emblem: { center: 466, from: 394, to: 539, size: 0 },
  letters: { center: 732, from: 544, to: 921 },
  rows: { topBand: 14, bottomBand: 109.5, bandHeight: 76 },
  fonts: { numbers: 96, letters: 96 },
  cellRadius: 10,
  cells: [
    { x: LONG_FRAME, y: LONG_FRAME, width: 389 - LONG_FRAME, height: 97 - LONG_FRAME },
    { x: 544, y: LONG_FRAME, width: 930 - LONG_FRAME - 544, height: 97 - LONG_FRAME },
    { x: LONG_FRAME, y: 102, width: 389 - LONG_FRAME, height: 200 - LONG_FRAME - 102 },
    { x: 544, y: 102, width: 930 - LONG_FRAME - 544, height: 200 - LONG_FRAME - 102 },
  ],
  countryBox: { x: 394, y: LONG_FRAME, width: 145, height: 200 - LONG_FRAME * 2 },
}

/**
 * اللوحة الاعتيادية — مستطيلة قريبة من المربّع.
 *
 * صفّان كالطويلة، لكن بلا شعارٍ أوسط: عرضها لا يتّسع لثلاث كتل، فالشعار فيها
 * يزاحم الرقم والحرف. والدولة في شريطها الجانبيّ وحدها، وخطٌّ يفصل خانة
 * الأرقام عن خانة الحروف كما في اللوحة المصنوعة.
 */
const STANDARD_GEOMETRY: Geometry = {
  viewBox: '0 0 460 230',
  width: 460,
  height: 230,
  frameRadius: 20,
  inset: STANDARD_FRAME,
  strip: { x: 0, width: 0 },
  main: { x: 7, width: 379 },
  // خانة الأرقام أوسع من خانة الحروف — ٥٨٪ إلى ٤٢٪ كما في المصنوعة
  numbers: { center: 118, from: 9, to: 227 },
  emblem: { center: 240, from: 235, to: 245, size: 0 },
  letters: { center: 309, from: 232, to: 386 },
  rows: { topBand: 13.75, bottomBand: 127.75, bandHeight: 88 },
  fonts: { numbers: 170, letters: 170 },
  cellRadius: 10,
  cells: [
    { x: STANDARD_FRAME, y: STANDARD_FRAME, width: 227 - STANDARD_FRAME, height: 112 - STANDARD_FRAME },
    { x: 232, y: STANDARD_FRAME, width: 154, height: 112 - STANDARD_FRAME },
    { x: STANDARD_FRAME, y: 117, width: 227 - STANDARD_FRAME, height: 230 - STANDARD_FRAME - 117 },
    { x: 232, y: 117, width: 154, height: 230 - STANDARD_FRAME - 117 },
  ],
  countryBox: {
    x: 391,
    y: STANDARD_FRAME,
    width: 460 - STANDARD_FRAME - 391,
    height: 230 - STANDARD_FRAME * 2,
  },
}

/**
 * اللوحة الرياضية — صفٌّ واحد لاتينيّ.
 *
 * لا عربية فيها أصلًا: لا رقمًا ولا حرفًا. والدولة في **خانةٍ وسطى** لا في
 * شريطٍ جانبيّ — شعارٌ فوقه «السعودية» و«KSA» — فتنقسم اللوحة ثلاث خانات
 * بحدودٍ ظاهرة. ونسبتها أقصر من الطويلة: ٣٫٨ لا ٤٫٦٥.
 */
const SPORT_GEOMETRY: Geometry = {
  viewBox: '0 0 760 200',
  width: 760,
  height: 200,
  frameRadius: 20,
  inset: SPORT_FRAME,
  strip: { x: 0, width: 0 },
  main: { x: 7, width: 746 },
  numbers: { center: 154, from: 9, to: 299 },
  /*
   * لا شعار أوسط: الدولة تشغل الوسط.
   *
   * كان بحجمٍ غير صفر، فيُرسم الشعار المختار في موضع كتلة الدولة ويجتمع
   * فيها شعاران — والسيفان والنخلة يتكرّران إن كان هو المختار. وهو ما وقع
   * في الرياضية بعد أن صُحّح في الطويلة.
   */
  emblem: { center: 369, from: 304, to: 434, size: 0 },
  letters: { center: 594, from: 439, to: 749 },
  // صفٌّ واحد يشغل الوسط
  rows: { topBand: 0, bottomBand: 35, bandHeight: 130 },
  fonts: { numbers: 152, letters: 152 },
  cellRadius: 10,
  cells: [
    { x: SPORT_FRAME, y: SPORT_FRAME, width: 299 - SPORT_FRAME, height: 200 - SPORT_FRAME * 2 },
    { x: 439, y: SPORT_FRAME, width: 760 - SPORT_FRAME - 439, height: 200 - SPORT_FRAME * 2 },
  ],
  countryBox: { x: 304, y: SPORT_FRAME, width: 130, height: 200 - SPORT_FRAME * 2 },
  singleRow: true,
}

/**
 * لوحة الدراجة النارية.
 *
 * نسبتها 2.2:1 لا 1.43:1 — أقرب إلى اللوحة الطويلة فتستقرّ بطاقات السوق على
 * ارتفاع واحد. وبلا شعار أوسط: مساحتها الأفقية ضيّقة أصلًا، والشعار فيها يزاحم
 * الأرقام والحروف بدل أن يزيّنها.
 */
const MOTO_GEOMETRY: Geometry = {
  viewBox: '0 0 430 195',
  width: 430,
  height: 195,
  frameRadius: 16,
  inset: MOTO_FRAME,
  strip: { x: 0, width: 0 },
  main: { x: 6, width: 348 },
  numbers: { center: 92, from: 8, to: 176 },
  // لا شعار أوسط — الحجم صفر يُسقط رسمه
  emblem: { center: 215, from: 205, to: 225, size: 0 },
  letters: { center: 265, from: 181, to: 349 },
  /*
   * شريطٌ أضيق من أختها بنسبة صغرها.
   *
   * كلّ اللوحات تُعرض بعرضٍ واحد في البطاقات، والدراجة أصغرها إطارًا (٤٣٠)
   * فيُكبَّر ما فيها أكثر من غيرها. وشريطٌ بنسبة الاعتيادية نفسها يخرج على
   * الشاشة أضخم منها، فيملأ الحرفُ خانته حتى يلامس حدّها. والنسبة هنا
   * مضروبةٌ في ٤٣٠/٤٦٠ فيستوي المرئيّ لا المقيس.
   */
  rows: { topBand: 17.5, bottomBand: 109.5, bandHeight: 68 },
  fonts: { numbers: 145, letters: 145 },
  cellRadius: 8,
  cells: [
    { x: MOTO_FRAME, y: MOTO_FRAME, width: 176 - MOTO_FRAME, height: 95 - MOTO_FRAME },
    { x: 181, y: MOTO_FRAME, width: 168, height: 95 - MOTO_FRAME },
    { x: MOTO_FRAME, y: 100, width: 176 - MOTO_FRAME, height: 195 - MOTO_FRAME - 100 },
    { x: 181, y: 100, width: 168, height: 195 - MOTO_FRAME - 100 },
  ],
  countryBox: {
    x: 354,
    y: MOTO_FRAME,
    width: 430 - MOTO_FRAME - 354,
    height: 195 - MOTO_FRAME * 2,
  },
}

/**
 * الهندسة من صنف المركبة ونوع الإصدار.
 *
 * محوران مستقلّان إلّا في الدراجة: مقاسٌ واحد لا تصدر طويلةً ولا رياضية.
 * وفي موضعٍ واحد لئلّا يفترق ما يرسمه الراسم عمّا يعرضه النموذج.
 */
function geometryOf(plateType: PlateType, plateFormat: PlateFormat): Geometry {
  if (plateType === 'motorcycle') return MOTO_GEOMETRY
  if (plateFormat === 'standard') return STANDARD_GEOMETRY
  if (plateFormat === 'sport') return SPORT_GEOMETRY
  return plateType === 'transport' ? LONG_TRANSPORT_GEOMETRY : LONG_GEOMETRY
}

/**
 * هل لهذه اللوحة شعارٌ أوسط؟
 *
 * الطويلة الخصوصية وحدها: الاعتيادية والرياضية لا يتّسع وسطهما، والنقل تشغل
 * وسطَه كتلةُ الدولة، والدراجة أضيق من أن تحمله. ويقرؤها النموذج فلا يعرض
 * اختيارًا لا أثر له.
 */
export function plateShowsEmblem(plateType: PlateType, plateFormat: PlateFormat): boolean {
  return geometryOf(plateType, plateFormat).emblem.size > 0
}

/**
 * يعكس مجموعة حول محورها الرأسي — يُستخدم لإبقاء النص والشعار بالاتجاه الصحيح
 * عندما تُعكس اللوحة بأكملها لوضع الشريط في الجهة المقابلة.
 */
function Unflip({ x, active, children }: { x: number; active: boolean; children: React.ReactNode }) {
  if (!active) return <>{children}</>
  return <g transform={`translate(${x * 2} 0) scale(-1 1)`}>{children}</g>
}

/**
 * مولّد بصري للوحات المركبات السعودية.
 *
 * مرسوم بالكامل بـ SVG: الأرقام والحروف عناصر نصية حقيقية (وليست صورة ثابتة)،
 * والنِّسب محفوظة عبر viewBox فلا يحدث أي تشوّه عند تغيير الحجم.
 * التخطيط: الأرقام يمينًا… لا — الأرقام في الجهة اليسرى (عربية أعلى ولاتينية أسفل)،
 * والحروف في الجهة اليمنى، وبينهما مساحة الشعار، ثم شريط KSA الرأسي في الطرف.
 */
export function SaudiLicensePlate({
  plateType = 'private',
  plateFormat = 'long',
  arabicLetters,
  latinLetters,
  plateNumbers,
  arabicNumbers,
  latinNumbers,
  emblem = 'none',
  customEmblemUrl = null,
  size = 'card',
  animated = false,
  showReflection = true,
  className,
  stripSide = 'right',
  title,
}: SaudiLicensePlateProps) {
  const western = latinNumbers ?? plateNumbers ?? ''
  const eastern = arabicNumbers ?? toArabicIndicDigits(western)
  const geo = geometryOf(plateType, plateFormat)
  /*
   * معرّفٌ ثابت مشتقّ من كلّ ما يُغيّر تعريفات اللوحة — متطابق بين الخادم
   * والعميل.
   *
   * ويجب أن يضمّ الإصدار والمقاس لا المحتوى وحده: بطاقات اختيار الإصدار
   * الثلاث تحمل الحروف والأرقام نفسها، فخرجت بمعرّفٍ واحد وتضاربت
   * `clipPath` فيها. والمتصفّح يحلّ `url(#id)` إلى **أوّل** تعريف، فقُصّت
   * الطويلة والرياضية على مقاس الاعتيادية (٤٦٠) وسقط منهما كلّ ما بعده:
   * الحروف وشريط الدولة.
   */
  const uid = stableUid([plateType, plateFormat, size, arabicLetters, latinLetters, western, emblem])

  const letterCount = Array.from(arabicLetters).length

  /*
   * العرض المتاح لكل خانة — منه يُحسب الحدّ، لا من عدد المحارف.
   *
   * و`0.86` هامشٌ داخل الخانة: الحرف لا يلامس حدّها في المصنوعة.
   */
  const numbersRoom = (geo.numbers.to - geo.numbers.from) * 0.86
  const lettersRoom = (geo.letters.to - geo.letters.from) * 0.86

  const numberWidthLimit = fitFontSize(
    western.length * ADVANCE.digits,
    geo.fonts.numbers,
    numbersRoom,
    0.08,
    western.length,
  )
  /*
   * مجموع عروض الحروف بعينها — لا عددٌ مضروبٌ في متوسّط — **ومعها فواصلها**.
   *
   * والفاصل يُحسب بعرضه المقيس لا بتقديرٍ: `isolateArabic` يصل الحروف بمسافةٍ
   * عرضُها `0.2778em`، وكان يُقال للحاسب `0.06em`. فثلاثة حروفٍ تخرج أعرض
   * بنحو الرُّبع ممّا قُدِّر لها — وهو ما أخرج «سعد» عن خانتها في الاعتيادية.
   */
  const arabicLetterWidthLimit = fitFontSize(
    arabicAdvance(arabicLetters),
    geo.fonts.letters,
    lettersRoom,
    ARABIC_SEPARATOR_ADVANCE,
    letterCount,
  )
  const latinLetterWidthLimit = fitFontSize(
    latinLetters.length * ADVANCE.latin,
    geo.fonts.letters,
    lettersRoom,
    0.1,
    latinLetters.length,
  )

  // ثم يقيّد الشريط الرأسي كل عنصر بحبره الحقيقي، فيتساوى الارتفاع المرئي
  const topRow = layoutRow(
    [
      { widthLimit: numberWidthLimit, ink: ARABIC_DIGIT_INK },
      { widthLimit: arabicLetterWidthLimit, ink: inkOf(arabicLetters, ARABIC_LETTER_INK) },
    ],
    geo.rows.topBand,
    geo.rows.bandHeight,
  )
  /*
   * الصفّ اللاتينيّ أصغر قليلًا من العربيّ.
   *
   * الحبران متساويان في المقياس — `0.7188` مقابل `0.7236` — فيخرجان بارتفاعٍ
   * واحد. لكنّ العين تقرأ اللاتينيّ أضخم: حروفه أعرض وأثخن، فتملأ مساحتها
   * بينما يترك العربيّ فراغًا حوله. والمعامل يردّ التوازن الذي يُرى لا الذي
   * يُقاس، ويبقى الصفّ داخل شريطه فلا يمسّ حدًّا.
   */
  const LATIN_SCALE = 0.88
  const bottomRow = layoutRow(
    [
      { widthLimit: numberWidthLimit * LATIN_SCALE, ink: LATIN_DIGIT_INK },
      { widthLimit: latinLetterWidthLimit * LATIN_SCALE, ink: LATIN_CAP_INK },
    ],
    geo.rows.bottomBand + (geo.rows.bandHeight * (1 - LATIN_SCALE)) / 2,
    geo.rows.bandHeight * LATIN_SCALE,
  )
  /**
   * **والفهرسةُ تُفحص** — إعداداتُ هذا المستودع تمنع الوصولَ بلا تحقّق،
   * وهي أصرمُ من مصدر النقل. والصفر لا يقع: `layoutRow` تُرجع عنصرًا
   * لكلّ مُدخَل، والمُدخَلان مكتوبان فوقها.
   */
  const [arabicNumberSize = 0, arabicLetterSize = 0] = topRow.sizes
  const [numberSize = 0, latinLetterSize = 0] = bottomRow.sizes
  // حجم صفر يعني أن هذه الهندسة بلا شعار أوسط (لوحة الدراجة)
  const showCenterEmblem = geo.emblem.size > 0
  /*
   * خلفية زرقاء لخانة الدولة في لوحات النقل.
   *
   * هي علامتها في اللوحة الحقيقية: يُعرف صنف المركبة منها قبل قراءة حرفٍ.
   * وتقع حيث تقع الدولة — شريطًا جانبيًّا في الطويلة والاعتيادية، وخانةً
   * وسطى في الرياضية — فتتبع نوع الإصدار ولا تُثبَّت في موضع.
   */
  const countryFill = plateType === 'transport' ? 'var(--plate-transport)' : null
  /*
   * كتلة الدولة سوداء الحبر مهما تبدّلت أرضيّتها.
   *
   * «السعودية» و«KSA» على اللوحة المصنوعة سوداوان على الأزرق، فيبقيان كذلك.
   * والشعار معهما لا لأنّنا اخترنا، بل لأنّ لونه مخبوزٌ في ملفّه فلا يقلبه
   * `monochrome` — وقد كان هنا سطرٌ يَعِد ببياضٍ على الأزرق ولا يفي به.
   */
  const countryInk = 'var(--plate-ink)'
  const country = geo.countryBox ?? null
  // الضيّقة تُكدّس K S A رأسيًّا — «KSA» كلمةً واحدة لا تُقرأ في ستّين بكسلًا
  const narrowCountry = country ? country.width < country.height * 0.45 : false
  const cx = country ? country.x + country.width / 2 : 0
  /*
   * مواضع ما في كتلة الدولة — نِسبٌ من ارتفاعها.
   *
   * الضيّقة تحمل ثلاثة أشياء فوق بعضها في شريطٍ نحيل: شعارٌ ثمّ «السعودية»
   * ثمّ K S A. وكان الشعار يمسّ «السعودية» في الطويلة — يفيض على أعلاها
   * بوحدتين — لأنّ ما بينهما لم يكن مفروضًا بل ما تبقّى بعد الشعار. فصار
   * لكلٍّ موضعه، بينهما فُرجةٌ مقصودة، وما فضل من الشريط قُسم بالسويّة
   * أعلاه وأسفله. والعريضة تُبقي نسبها: شيئان لا ثلاثة، ولا تلاصُق فيها.
   */
  const strip = narrowCountry
    ? { symbol: 0.215, symbolTop: 0.105, name: 0.435, letters: [0.61, 0.75, 0.89] }
    : { symbol: 0.26, symbolTop: 0.05, name: 0.54, letters: [0.78] }
  // الشعار محدودٌ بالبعدين: عرضُ الكتلة يحكمه في الضيّقة وارتفاعُها في العريضة
  const countrySymbol = country
    ? Math.min(country.width * (narrowCountry ? 0.74 : 0.44), country.height * strip.symbol)
    : 0
  const art = showCenterEmblem && emblem !== 'none' && emblem !== 'custom' ? EMBLEM_ART[emblem] : null

  const mirrored = stripSide === 'left'
  const label =
    title ??
    `لوحة ${plateType === 'motorcycle' ? 'دراجة نارية' : plateType === 'transport' ? 'نقل خاص' : 'خصوصي'}${
      geo.singleRow ? ' رياضية' : ''
    } ${geo.singleRow ? latinLetters : arabicLetters} ${western}`

  const ksaLetters = ['K', 'S', 'A']


  /*
   * النقش للمقاسات التي تُرى فيها التفاصيل.
   *
   * والحرف على اللوحة الحقيقية **مطروق** بارز، بريقه من حافّته لا من لونه.
   * فيُنقش في كل مقاسٍ إلّا المصغّر: في 190 بكسلًا لا يُرى النقش ويبقى ثمنه.
   */
  const embossed = size !== 'thumbnail'

  return (
    <div className={cn('select-none', SIZE_CLASS[size], className)} data-plate-size={size}>
      <svg
        viewBox={geo.viewBox}
        className={cn(size === 'fill' ? 'h-full w-full' : 'h-auto w-full', animated && 'plate-animated')}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
        data-plate-type={plateType}
        /* الإصدارُ بجانب النوع: نسبتاهما تختلفان، فلا يُقاسان معًا */
        data-plate-format={plateFormat}
        data-plate-letters={arabicLetters}
        data-plate-numbers={western}
      >
        <defs>
          {/*
            * وجه اللوحة: تدرّج رأسي كما كان، ومعه **شريط ضوء مائل** خافت جدًّا
            * يعطي إحساس السطح المعدني المصقول. النسب محسوبة ليبقى الوجه أبيضَ
            * رسميًّا لا لامعًا زخرفيًّا.
            */}
          {/*
            * وإحداثيّاته من فضاء اللوحة لا من صندوق كل شكل.
            *
            * الخانات المنفصلة تُملأ بهذا التدرّج نفسه، فبإحداثيّات الصندوق
            * يعيد كلُّ خانةٍ التدرّجَ كاملًا في مساحتها: أربعُ لمعاتٍ صغيرة
            * متطابقة بدل ضوءٍ واحدٍ يمرّ على الوجه. وبفضاء اللوحة تقتسم
            * الخاناتُ مسحةً واحدة كما تقتسمها لوحةٌ متّصلة — وهو ما يجعل
            * الطويلة تُقرأ سطحًا معدنيًّا واحدًا.
            */}
          <linearGradient
            id={`plate-face-${uid}`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={geo.width * 0.2}
            y2={geo.height}
          >
            <stop offset="0%" stopColor="var(--plate-face)" />
            <stop offset="46%" stopColor="var(--plate-face-2)" />
            <stop offset="58%" stopColor="var(--plate-face-3)" />
            <stop offset="100%" stopColor="var(--plate-face-4)" />
          </linearGradient>
          {/*
            * النقش: اللوحة الحقيقية **مطروقة** لا مطبوعة.
            *
            * الحرف مطروقٌ من الخلف فيبرز عن وجهها، وحافّته العليا تلمع والسفلى
            * تُظلّ. وثلاث طبقات لا طبقتان: خطٌّ أبيض حادّ يصنع الحافّة، وظلٌّ
            * رماديّ قريب يعطي السُّمك، وظلٌّ أبعدُ ناعم يُجلس الحرف على الوجه
            * بدل أن يطفو عليه. و`stdDeviation` صفر في الأوّلين فلا تفقد الحافّة
            * حدّتها.
            */}
          {embossed && (
            <filter id={`plate-emboss-${uid}`} x="-6%" y="-18%" width="112%" height="136%">
              <feDropShadow dx="-1.1" dy="-1.3" stdDeviation="0" floodColor="var(--plate-face)" floodOpacity="0.95" />
              <feDropShadow dx="1" dy="1.2" stdDeviation="0" floodColor="var(--plate-shade)" floodOpacity="0.55" />
              <feDropShadow dx="2.2" dy="2.8" stdDeviation="2.2" floodColor="var(--plate-ink)" floodOpacity="0.3" />
            </filter>
          )}
          {/*
            * الخانة محفورةٌ في الوجه لا ملصوقةٌ عليه.
            *
            * ظلٌّ داخليّ من أعلاها يجعلها تغور تحت مستوى الإطار — وهو ما
            * تفعله اللوحة الحقيقية: الخانات مضغوطةٌ في المعدن. وبدونه تُقرأ
            * أربعَ بطاقاتٍ بيضاء مسطّحة موضوعةٍ على أرضيّة سوداء.
            */}
          {geo.cells && (
            <filter
              id={`plate-inset-${uid}`}
              x="-12%"
              y="-30%"
              width="124%"
              height="160%"
            >
              {/*
                * الإزاحة أصغر من التمويه، والاتجاه من حيث يأتي الضوء.
                *
                * بإزاحةٍ تقارب التمويه يخرج الظلُّ خطًّا داكنًا حادًّا على
                * الحافّة — يُقرأ حدًّا مرسومًا لا عمقًا. وبتمويهٍ ضعفَها يذوب
                * في الوجه فيُقرأ تغويرًا. والإزاحة إلى أسفلَ ويمينٍ تترك الظلّ
                * في الأعلى واليسار — حيث يقع لو جاء الضوء من هناك، وهو من
                * حيث يأتي في تدرّج الوجه نفسه.
                */}
              <feOffset
                in="SourceAlpha"
                dx={geo.height * 0.008}
                dy={geo.height * 0.010}
                result="off"
              />
              <feGaussianBlur in="off" stdDeviation={geo.height * 0.019} result="blr" />
              <feComposite in="blr" in2="SourceAlpha" operator="out" result="cut" />
              <feFlood floodColor="var(--plate-ink)" floodOpacity="0.24" result="ink" />
              <feComposite in="ink" in2="cut" operator="in" result="shade" />
              <feMerge>
                <feMergeNode in="SourceGraphic" />
                <feMergeNode in="shade" />
              </feMerge>
            </filter>
          )}
          <linearGradient id={`plate-sheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--plate-face)" stopOpacity="0.9" />
            <stop offset="45%" stopColor="var(--plate-face)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--plate-face)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`plate-clip-${uid}`}>
            <rect
              x={geo.inset}
              y={geo.inset}
              width={geo.width - geo.inset * 2}
              height={geo.height - geo.inset * 2}
              rx={geo.frameRadius - 5}
            />
          </clipPath>
        </defs>

        <g transform={mirrored ? `translate(${geo.width} 0) scale(-1 1)` : undefined}>
          {/* جسم اللوحة: وجه أبيض وإطار أسود رفيع بحواف دائرية */}
          <rect
            x={geo.inset / 2}
            y={geo.inset / 2}
            width={geo.width - geo.inset}
            height={geo.height - geo.inset}
            rx={geo.frameRadius}
            fill={`url(#plate-face-${uid})`}
            stroke="var(--plate-ink)"
            strokeWidth={geo.inset}
          />

          {/*
            * الخانات المنفصلة: أرضيّةٌ سوداء يُرسم فوقها البياض.
            *
            * الوجه المرسوم أصلًا أبيضُ كلّه، فلو رُسم الأسود بينها لصار
            * أربعة مستطيلاتٍ سوداء تُحاذي أربعة بيضاء وتتراكب حوافّها. وطلاء
            * الأرضيّة أوّلًا ثمّ وضع البياض عليها يُنتج الفراغ نفسه بحدٍّ
            * واحدٍ نظيف.
            *
            * **وتُرسم خارج مرشِّح النقش.** النقشُ ظلٌّ خارجيّ يُبرز ما تحته عن
            * سطحه، وهو حقُّ الحرف لا حقُّ الخانة: كان يقع عليها فتُقرأ بطاقةً
            * ناتئةً موضوعةً على الأرضيّة، وهي في اللوحة الحقيقية **محفورةٌ
            * فيها**. فصار لها مرشِّحها: ظلٌّ داخليّ يُغوّرها.
            */}
          {geo.cells && (
            <g clipPath={`url(#plate-clip-${uid})`}>
              <rect
                x={geo.inset}
                y={geo.inset}
                width={geo.width - geo.inset * 2}
                height={geo.height - geo.inset * 2}
                fill="var(--plate-ink)"
              />
              <g filter={`url(#plate-inset-${uid})`}>
                {geo.cells.map((cell) => (
                  <rect
                    key={`${cell.x}-${cell.y}`}
                    x={cell.x}
                    y={cell.y}
                    width={cell.width}
                    height={cell.height}
                    rx={geo.cellRadius}
                    fill={`url(#plate-face-${uid})`}
                  />
                ))}
                {/* كتلة الدولة خانةٌ مثلها، فتُحفر معها لا تطفو فوقها */}
                {country && (
                  <rect
                    x={country.x}
                    y={country.y}
                    width={country.width}
                    height={country.height}
                    rx={geo.cellRadius}
                    fill={countryFill ?? `url(#plate-face-${uid})`}
                  />
                )}
              </g>
            </g>
          )}

          <g clipPath={`url(#plate-clip-${uid})`} filter={embossed ? `url(#plate-emboss-${uid})` : undefined}>

            {/* أرضيّة خانة الدولة — زرقاء في لوحات النقل */}
            {/*
              * كتلة الدولة — شعارٌ و«السعودية» و«KSA».
              *
              * موضعها يختلف بالإصدار وشكلُها يحكم ترتيبَ ما فيها: الضيّقة
              * (الاعتيادية) تُكدّس الحروف رأسيًّا لأنّ «KSA» كلمةً واحدة لا
              * تُقرأ في ستّين بكسلًا، والعريضة (الطويلة والرياضية) تكتبها كما
              * هي. وأرضيّتها زرقاء في لوحات النقل — علامتها في اللوحة الحقيقية.
              */}
            {country && (
              <>
                {!geo.cells && (
                  <rect
                    x={country.x}
                    y={country.y}
                    width={country.width}
                    height={country.height}
                    rx={geo.cellRadius}
                    fill={countryFill ?? `url(#plate-face-${uid})`}
                  />
                )}

                <Unflip x={country.x + country.width / 2} active={mirrored}>
                  <g>
                    {/*
                      * المواضع نِسبٌ من ارتفاع الكتلة لا مقاديرُ متراكمة.
                      *
                      * كان كلٌّ يُحسب بإضافة ما قبله، فيكفي أن يكبر الشعار
                      * قليلًا حتى ينزل الاسم على «KSA» — وقد وقع. والنِّسب
                      * تُثبّت كلًّا في حصّته مهما تغيّر جاره.
                      */}
                    <g
                      transform={`translate(${cx - countrySymbol / 2} ${country.y + country.height * strip.symbolTop}) scale(${countrySymbol / 100})`}
                    >
                      <EmblemShapes art={STRIP_SYMBOL} monochrome={countryInk} box={100} />
                    </g>

                    <text
                      x={cx}
                      y={country.y + country.height * strip.name}
                      textAnchor="middle"
                      fill={countryInk}
                      fontSize={country.width * (narrowCountry ? 0.26 : 0.19)}
                      fontWeight={600}
                      style={{ fontFamily: 'var(--font-plate-arabic)' }}
                    >
                      السعودية
                    </text>

                    {narrowCountry ? (
                      ksaLetters.map((letter, index) => (
                        <text
                          key={letter}
                          x={cx}
                          y={country.y + country.height * (strip.letters[index] ?? 0)}
                          textAnchor="middle"
                          fill={countryInk}
                          fontSize={country.width * 0.44}
                          fontWeight={700}
                          style={{ fontFamily: 'var(--font-plate-latin)' }}
                        >
                          {letter}
                        </text>
                      ))
                    ) : (
                      <text
                        x={cx}
                        y={country.y + country.height * (strip.letters[0] ?? 0)}
                        textAnchor="middle"
                        fill={countryInk}
                        fontSize={country.width * 0.32}
                        fontWeight={700}
                        letterSpacing={country.width * 0.02}
                        style={{ fontFamily: 'var(--font-plate-latin)' }}
                      >
                        KSA
                      </text>
                    )}

                    {/*
                      * مثلّثٌ أبيض أسفل كتلة النقل.
                      *
                      * مطبوعٌ على اللوحة الحقيقية لا ملصقًا عليها، وهو ممّا
                      * يُميّز النقل الخاصّ في نظرةٍ واحدة.
                      */}
                    {countryFill && (
                      <path
                        d={`M ${cx - country.width * 0.17} ${country.y + country.height * 0.86} L ${cx + country.width * 0.17} ${country.y + country.height * 0.86} L ${cx} ${country.y + country.height * 0.97} Z`}
                        fill="var(--plate-face)"
                      />
                    )}
                  </g>
                </Unflip>
              </>
            )}

            {/* الشعار الوسطي */}
            {art && (
              <Unflip x={geo.emblem.center} active={mirrored}>
                <g
                  data-plate-emblem="center"
                  transform={`translate(${geo.emblem.center - geo.emblem.size / 2} ${geo.height / 2 - geo.emblem.size / 2}) scale(${geo.emblem.size / 100})`}
                >
                  <EmblemShapes art={art} box={100} />
                </g>
              </Unflip>
            )}
            {showCenterEmblem && emblem === 'custom' && customEmblemUrl && (
              <Unflip x={geo.emblem.center} active={mirrored}>
                <image
                  data-plate-emblem="center"
                  href={customEmblemUrl}
                  x={geo.emblem.center - geo.emblem.size / 2}
                  y={geo.height / 2 - geo.emblem.size / 2}
                  width={geo.emblem.size}
                  height={geo.emblem.size}
                  preserveAspectRatio="xMidYMid meet"
                />
              </Unflip>
            )}

            {/* انعكاس زجاجي خفيف جدًا */}
            {showReflection && (
              <rect
                x={geo.inset}
                y={geo.inset}
                width={geo.width - geo.inset * 2}
                height={geo.height - geo.inset * 2}
                fill={`url(#plate-sheen-${uid})`}
                opacity="0.5"
                pointerEvents="none"
              />
            )}

            {/*
              * العربية تُسقط في الرياضية.
              *
              * ليست إخفاءً بالتنسيق بل امتناعًا عن الرسم: اللوحة الرياضية لا
              * عربية فيها أصلًا، ورسمُها ثمّ إخفاؤها يُبقيها في نصّ الوصول
              * وفي البحث فتُقرأ لوحةً ليست هي.
              */}
            {!geo.singleRow && (
            <Unflip x={geo.numbers.center} active={mirrored}>
              <text
                x={geo.numbers.center}
                y={topRow.baselines[0]}
                textAnchor="middle"
                fill="var(--plate-ink)"
                fontSize={arabicNumberSize}
                fontWeight={700}
                letterSpacing={arabicNumberSize * 0.05}
                style={{ fontFamily: 'var(--font-plate-arabic)' }}
              >
                {eastern}
              </text>
            </Unflip>
            )}
            {/* الأرقام الإنجليزية — أسفل القسم الأيسر */}
            <Unflip x={geo.numbers.center} active={mirrored}>
              <text
                x={geo.numbers.center}
                y={bottomRow.baselines[0]}
                textAnchor="middle"
                fill="var(--plate-ink)"
                fontSize={numberSize}
                fontWeight={700}
                letterSpacing={numberSize * 0.08}
                style={{ fontFamily: 'var(--font-plate-latin)' }}
              >
                {western}
              </text>
            </Unflip>
            {!geo.singleRow && (
            <Unflip x={geo.letters.center} active={mirrored}>
              <text
                x={geo.letters.center}
                y={topRow.baselines[1]}
                textAnchor="middle"
                fill="var(--plate-ink)"
                fontSize={arabicLetterSize}
                fontWeight={700}
                direction="rtl"
                /* مقبضٌ للفحص: يقيس أنّ الحبر لا يتجاوز إطار اللوحة */
                data-plate-arabic-letters
                /*
                 * وحدّا الخانة معه — وإلّا قاس الفحصُ حدودًا منسوخةً في ملفّه
                 * تبقى على قِدمها حين تتغيّر الهندسة، فيمرّ وهو لا يقيس شيئًا.
                 */
                data-cell={`${geo.letters.from},${geo.letters.to}`}
                style={{ fontFamily: 'var(--font-plate-arabic)' }}
              >
                {isolateArabic(arabicLetters)}
              </text>
            </Unflip>
            )}
            {/* الحروف الإنجليزية — أسفل القسم الأيمن */}
            <Unflip x={geo.letters.center} active={mirrored}>
              <text
                x={geo.letters.center}
                y={bottomRow.baselines[1]}
                textAnchor="middle"
                fill="var(--plate-ink)"
                fontSize={latinLetterSize}
                fontWeight={700}
                letterSpacing={latinLetterSize * 0.1}
                style={{ fontFamily: 'var(--font-plate-latin)' }}
              >
                {latinLetters}
              </text>
            </Unflip>
          </g>
        </g>

        {animated && (
          <rect
            className="plate-shimmer"
            x={-geo.width}
            y="0"
            width={geo.width * 0.45}
            height={geo.height}
            fill={`url(#plate-sheen-${uid})`}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  )
}

export default SaudiLicensePlate
