import type { ReviewReason } from '@/generated/prisma/enums';

/**
 * تسميات أسباب إحالة الإعلان للمراجعة (قرار ٣٣) — **مرّةً واحدة**.
 *
 * كانت مكتوبةً داخل `ReviewQueue.tsx`، فلمّا احتاجتها شاشة التفاصيل
 * كان النسخ يُنتج قائمتين تتباعدان: سببٌ يُضاف في إحداهما ويظهر مفتاحًا
 * خامًا في الأخرى.
 *
 * والملف بلا `db`: تستورده مكوّنات العميل.
 */
export const REVIEW_REASON_LABEL: Record<string, string> = {
  DUPLICATE_IMAGE: 'صورة مكررة',
  PRICE_OUTLIER: 'سعر شاذ',
  NEW_ACCOUNT_BURST: 'حساب جديد',
  USER_REPORT: 'بلاغ',
} satisfies Record<ReviewReason, string>;

/**
 * السببُ **مجموعًا** — لبطاقة «أُعيد للبائع · صور مكرّرة غالبًا».
 *
 * وليست تسميةَ الصفّ: الصفُّ واحدٌ («صورة مكررة») والبطاقةُ تصف عدّةً
 * أُعيدت لسببٍ واحد، فجمعُها مفردًا يُقرأ «صورة مكررة غالبا» عن ثلاثة.
 */
export const REVIEW_REASON_AGGREGATE: Record<string, string> = {
  DUPLICATE_IMAGE: 'صور مكررة',
  PRICE_OUTLIER: 'أسعار شاذة',
  NEW_ACCOUNT_BURST: 'حسابات جديدة',
  USER_REPORT: 'بلاغات مستخدمين',
} satisfies Record<ReviewReason, string>;
