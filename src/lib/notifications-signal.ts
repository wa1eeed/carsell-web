/**
 * ═══ إشارةُ «تغيّر عدّ الإشعارات» ═══
 *
 * الجرس مكوّن عميل يحتفظ بعدّه في `useState`، و«علّم الكلّ مقروءًا»
 * في شاشةٍ أخرى. فنجح الفعل، و`router.refresh()` أعاد تصيير الخادم —
 * **والجرس بقي على «٣»**: الشاشة تقول «قُرئ الكلّ» وفوقها شارةٌ تقول
 * إن ثلاثةً تنتظر. رقمان متناقضان في شاشةٍ واحدة.
 *
 * ولا تُنسخ الخاصّية إلى الحالة لإصلاحها (البوابة ٢٧): الإشارة صريحة
 * واتّجاهها واحد — **من غيّر يُعلن، ومن يعرض يسمع**. وكلُّ كاتبٍ
 * لاحقٍ يُعلن بالسطر نفسه.
 */
export const NOTIFICATIONS_CHANGED = 'carsell:notifications-changed';

export function announceNotificationsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED));
}
