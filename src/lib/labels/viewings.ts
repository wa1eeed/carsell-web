import type { ViewingParty, ViewingPeriod, ViewingStatus } from '@/generated/prisma/enums';

/**
 * ═══ المعاينة كما تُقرأ ═══
 *
 * النطاق يُعيد مفاتيح، والصياغة هنا (البوابة ١٧).
 */

/**
 * **فتراتُ اليوم كما تُقال في هذا السوق** — والمواعيد تُضبط على
 * الصلوات لا على الساعة. والساعاتُ بين قوسين لمن يريد الدقّة.
 */
export const VIEWING_PERIOD: Record<string, string> = {
  MORNING: 'صباحًا',
  NOON: 'بعد الظهر',
  AFTERNOON: 'بعد العصر',
  EVENING: 'بعد المغرب',
} satisfies Record<ViewingPeriod, string>;

/** ومداها بالساعة — تُعرض تحت الاسم لا بدلًا منه */
export const VIEWING_PERIOD_HINT: Record<string, string> = {
  MORNING: 'من ٨ إلى ١٢',
  NOON: 'من ١٢ إلى ٤',
  AFTERNOON: 'من ٤ إلى ٦',
  EVENING: 'من ٦ إلى ١٠',
} satisfies Record<ViewingPeriod, string>;

export const VIEWING_STATUS: Record<string, string> = {
  REQUESTED: 'ينتظر ردّ البائع',
  COUNTERED: 'اقترح البائع موعدًا آخر',
  CONFIRMED: 'موعدٌ مؤكَّد',
  DECLINED: 'اعتذر البائع',
  CANCELLED: 'أُلغي',
  COMPLETED: 'تمّت',
  /** **و«انقضى» غيرُ «رُفض»** — هذا لم يردّ عليه أحد */
  EXPIRED: 'انقضى بلا ردّ',
} satisfies Record<ViewingStatus, string>;

/** وما يُنتظر — ولكلِّ حالٍ ما يفعله صاحبُها الآن */
export const VIEWING_NEXT_BUYER: Record<string, string> = {
  REQUESTED: 'بانتظار ردّه',
  COUNTERED: 'اقبل اقتراحه أو ألغِ',
  CONFIRMED: 'احضر في موعدك',
  DECLINED: 'اقترح موعدًا آخر',
  CANCELLED: 'انتهى',
  COMPLETED: 'انتهت',
  EXPIRED: 'لم يردّ — اقترح موعدًا آخر',
} satisfies Record<ViewingStatus, string>;

export const VIEWING_NEXT_SELLER: Record<string, string> = {
  REQUESTED: 'ردُّك مطلوب',
  COUNTERED: 'بانتظار قبوله',
  CONFIRMED: 'موعدٌ عليك',
  DECLINED: 'اعتذرتَ عنه',
  CANCELLED: 'انتهى',
  COMPLETED: 'انتهت',
  EXPIRED: 'فاتك الردّ',
} satisfies Record<ViewingStatus, string>;

/** ومن ألغى — فالوسمُ وحده يجعل الطرفين يتّهمان بعضهما */
export const VIEWING_CANCELLED_BY: Record<string, string> = {
  BUYER: 'ألغاه المشتري',
  SELLER: 'ألغاه البائع',
} satisfies Record<ViewingParty, string>;
