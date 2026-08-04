/**
 * حالات البلاغ — **في وحدةٍ بلا `db`** فتصلها الشاشة.
 *
 * وكانت تُكتب نصًّا حرًّا (`'open'`) في الإنشاء، ويُقرأ في مكانٍ آخر
 * بحروفٍ كبيرة — فمقارنةٌ لا تطابق شيئًا **بلا خطأ**. فالقيَم هنا
 * مرّةً واحدة، والكاتب والقارئ يستوردانها.
 */
export const REPORT_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** أقصر ملاحظةٍ مقبولة عند الحسم — و«لا يوجد» ليست ملاحظة. */
export const MIN_REPORT_NOTE = 15;
