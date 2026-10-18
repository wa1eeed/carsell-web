/**
 * ═══ أنواعُ اللوحة ═══
 *
 * منقولةٌ عن مواصفة المالك (`plate-rendering.md`) كما هي، فتبقى اللوحةُ
 * ومحرّرُها في مشروعيه على تعريفٍ واحد.
 *
 * **وكارز اليوم تخزّن حروفًا وأرقامًا وحدها** — لا نوعًا ولا إصدارًا —
 * فترسم الخصوصيّة الطويلة دائمًا. والهندساتُ الأخرى محفوظةٌ هنا بلا
 * منادٍ، لأنّ أوّل يومٍ يُخزَّن فيه نوعُ اللوحة تُستعمل بلا إعادة نقل.
 */

export type PlateType = 'private' | 'transport' | 'motorcycle'

/**
 * نوع الإصدار — شكل اللوحة نفسها لا صنف مركبتها.
 *
 * محورٌ مستقلّ عن `PlateType`: تلك تقول «خصوصي» أو «نقل خاص»، وهذه تقول أيّ
 * قالبٍ صُبّت فيه. ولوحةٌ خصوصية قد تصدر طويلةً أو اعتيادية أو رياضية.
 *
 *   · `long`     الطويلة — صفّان وشعارٌ أوسط وشريط الدولة يمينًا
 *   · `standard` الاعتيادية — أقرب إلى المربّع، صفّان بلا شعارٍ أوسط
 *   · `sport`    الرياضية — صفٌّ واحد **لاتينيّ فقط**، والدولة في خانةٍ وسطى
 */

export type PlateFormat = 'long' | 'standard' | 'sport'

export const PLATE_FORMATS: readonly PlateFormat[] = ['standard', 'long', 'sport']

export const PLATE_FORMAT_LABELS: Record<PlateFormat, string> = {
  standard: 'لوحة اعتيادية',
  long: 'لوحة طويلة',
  sport: 'لوحة رياضية',
}

export const PLATE_FORMAT_HINTS: Record<PlateFormat, string> = {
  standard: 'مستطيلة قريبة من المربع — صفان: العربي أعلى واللاتيني أسفله.',
  long: 'الطويلة المعتادة — صفان وشعار في الوسط.',
  sport: 'قصيرة بصف واحد، بحروف وأرقام إنجليزية فقط بلا عربية.',
}

export const isLatinOnlyFormat = (format: PlateFormat): boolean => format === 'sport'

export const PLATE_TYPES: readonly PlateType[] = ['private', 'transport', 'motorcycle']

export const PLATE_TYPE_LABELS: Record<PlateType, string> = {
  private: 'خصوصي',
  transport: 'نقل خاص',
  motorcycle: 'دراجة نارية',
}

export const PLATE_TYPE_MAX_LETTERS: Record<PlateType, number> = {
  private: 3,
  transport: 3,
  motorcycle: 2,
}

export type PlateEmblem =
  | 'none'
  | 'palm-swords-black'
  | 'palm-swords-gold'
  | 'vision-2030'
  | 'dereyah'
  | 'madaen'
  | 'custom'

export const PLATE_EMBLEMS: readonly PlateEmblem[] = [
  'palm-swords-black',
  'palm-swords-gold',
  'vision-2030',
  'dereyah',
  'madaen',
  'none',
  'custom',
]

export const PLATE_EMBLEM_LABELS: Record<PlateEmblem, string> = {
  'palm-swords-black': 'النخلة والسيفان (الافتراضي)',
  'palm-swords-gold': 'النخلة والسيفان — ذهبي',
  'vision-2030': 'رؤية السعودية 2030',
  dereyah: 'الدرعية',
  madaen: 'مدائن صالح',
  none: 'بدون شعار وسطي',
  custom: 'شعار مخصص (رفع صورة)',
}

export type PlateSize = 'thumbnail' | 'card' | 'stage' | 'fullscreen' | 'fill'
