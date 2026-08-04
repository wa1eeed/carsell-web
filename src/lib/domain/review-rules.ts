import type { ReviewReason } from '@/generated/prisma/enums';

/**
 * ثوابت المراجعة — **في وحدةٍ بلا `db`**.
 *
 * كانت في `admin-listings.ts`، فاستوردها مكوّن العميل فجرّ Prisma إلى
 * حزمة المتصفّح وسقط البناء بـ«Can't resolve 'fs'» — رسالةٌ لا تذكر
 * لا العميل ولا قاعدة البيانات. وهو الحدّ نفسه المسجَّل في CLAUDE.md:
 * **يمرّ عبر الاستيرادات لا عبر التوجيهات.**
 */

/** أقصر ملاحظةٍ مقبولة عند الإرجاع — و«غير مناسب» ليست ملاحظة. */
export const MIN_REVIEW_NOTE = 15;

export const REVIEW_REASONS: readonly ReviewReason[] = [
  'DUPLICATE_IMAGE',
  'PRICE_OUTLIER',
  'NEW_ACCOUNT_BURST',
  'USER_REPORT',
];
