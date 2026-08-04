/**
 * ثوابت التوثيق — **في وحدةٍ بلا `db`** فتصلها الشاشة بلا أن تجرّ Prisma
 * إلى حزمة المتصفّح.
 */

/** أقصر ملاحظةٍ مقبولة عند الرفض أو طلب التوضيح. */
export const MIN_IDENTITY_NOTE = 15;

export const IDENTITY_METHODS = ['manual', 'nafath', 'commercial_register'] as const;
