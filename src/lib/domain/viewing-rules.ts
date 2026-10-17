import type { ViewingPeriod } from '@/generated/prisma/enums';

/**
 * ═══ فتراتُ المعاينة — والسوق يضبط مواعيده على الصلاة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «افعل ما تراه احترافيًّا ويناسب السوق
 * السعودي».
 *
 * **فاليومُ وفترتُه، لا ساعةٌ بالدقيقة.** «بعد العصر» و«بعد المغرب»
 * هما ما يقوله الناس هنا ويتّفقون عليه، ودقّةٌ بالدقيقة ادّعاء:
 * الطرفان يعدّلانها بمكالمةٍ على كل حال، ومن يُطلَب منه اختيار ٤:٣٧
 * يختار رقمًا لا يعنيه — ثمّ يصل متأخّرًا نصف ساعة ولا أحد يتضرّر.
 *
 * **وبلا `db`**: الشاشة تقرأ هذه القاعدة كما يقرؤها الخادم.
 */

/** حدودُ الفترة بتوقيت الرياض — والمملكة بلا توقيتٍ صيفيّ، فالفرق ثابت +٣ */
export const RIYADH_OFFSET_HOURS = 3;

export const PERIOD_HOURS: Readonly<Record<ViewingPeriod, { from: number; to: number }>> = {
  MORNING: { from: 8, to: 12 },
  NOON: { from: 12, to: 16 },
  AFTERNOON: { from: 16, to: 18 },
  EVENING: { from: 18, to: 22 },
};

/**
 * نهايةُ الفترة لحظةً — وبها تُعرف المواعيدُ التي مضت.
 *
 * `onDate` يُخزَّن `@db.Date`، فيصل منتصفَ ليلٍ بتوقيت UTC. ونهايةُ
 * «بعد المغرب» (٢٢ بالرياض) هي ١٩ بتوقيت UTC من اليوم نفسه.
 */
export function slotEnd(onDate: Date, period: ViewingPeriod): Date {
  const hour = PERIOD_HOURS[period].to - RIYADH_OFFSET_HOURS;
  return new Date(onDate.getTime() + hour * 3_600_000);
}

/** وبدايتُها — وبها يُعرف ما لم يحن بعد */
export function slotStart(onDate: Date, period: ViewingPeriod): Date {
  const hour = PERIOD_HOURS[period].from - RIYADH_OFFSET_HOURS;
  return new Date(onDate.getTime() + hour * 3_600_000);
}

/**
 * ═══ وما بعد الغد وحده يُحجَز ═══
 *
 * **ولا موعدَ في الماضي**: طلبٌ لأمسِ ليس طلبًا. ولا بعد شهرين:
 * السيارة تُباع قبله، فيصل البائعَ موعدٌ على مركبةٍ لم تعد له.
 *
 * واليومُ نفسه مقبول — من يرى سيارةً صباحًا قد يريدها بعد المغرب،
 * وهو أكثرُ ما يقع.
 */
export const MAX_DAYS_AHEAD = 21;

/** أقصرُ ملاحظةٍ تُفهم — و«لا» ليست سببَ رفض */
export const MIN_DECLINE_REASON = 10;

/** ونقطةُ اللقاء تُكتب وصفًا يُبلَغ به — «جدة» ليست موعدًا */
export const MIN_MEETING_POINT = 6;

/** أكثرُ ما يطلبه مشترٍ على إعلانٍ واحد — ما دام طلبُه قائمًا */
export const MAX_OPEN_PER_LISTING = 1;
