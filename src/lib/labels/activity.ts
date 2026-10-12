import { AUDIT_ACTION_LABEL } from './audit';
import { TIMELINE_LABEL } from './timeline';
import type { ActivityKind } from '@/lib/domain/admin-activity';

/**
 * ═══ تسميات المجرى — ولا جدولَ رابعًا ═══
 *
 * مفاتيح المجرى هي مفاتيح خطّ الزمن نفسها (`listing.published` ·
 * `offer.ACCEPTED` · `stage.advanced`) ومفاتيح التدقيق نفسها لأثر
 * الأدمن. **ونسخُها هنا يُنتج جدولين يتباعدان أوّل تعديل** — فتقول
 * صفحةُ الإعلان «نُشر الإعلان» ويقول المجرى «نُشر» بعد شهر.
 *
 * فما هنا هو **الزائد وحده**: ما لا مصدر له في الجدولين.
 */
const EXTRA: Record<string, string> = {
  'user.joined': 'حسابٌ جديد',
  'auction.extended': 'مُدِّد المزاد',
  'dispute.opened': 'فُتح نزاع',
  'dispute.resolved': 'حُسم النزاع',

  /*
    حالات الدفعة — **بأسماء التعداد لا بأسماءٍ متخيَّلة**. وكتبتُ
    `CAPTURED` أوّلًا وليست فيه، فأسقطها المترجم قبل أن تصير فرعًا
    ميّتًا في الشاشة.
  */
  'payment.CREATED': 'أُنشئت دفعة',
  'payment.REQUIRES_ACTION': 'الدفعة تنتظر تحقّق المستخدم',
  'payment.PENDING': 'الدفعة بانتظار تأكيد البوابة',
  'payment.HELD': 'حُجز المبلغ لدى البوابة',
  'payment.SETTLED': 'سُوّيت الدفعة',
  'payment.PARTIALLY_SETTLED': 'سُوّيت الدفعة جزئيًّا',
  'payment.CANCELLED': 'أُلغي الحجز',
  'payment.RETURNED': 'رُدّ المبلغ',
  'payment.PARTIALLY_RETURNED': 'رُدّ جزءٌ من المبلغ',
  'payment.FAILED': 'فشلت الدفعة',
};

/**
 * **والمفتاح الخام يبقى لما لا تسمية له.** سطرٌ يقول
 * `listing.review.approve` أوضح من سطرٍ يقول «إجراء» — والمجرى يُقرأ
 * في متابعةٍ وتحقيق، فغموضُه أسوأ من قبحه.
 */
export function activityLabel(key: string): string {
  return EXTRA[key] ?? TIMELINE_LABEL[key] ?? AUDIT_ACTION_LABEL[key] ?? key;
}

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  listing: 'الإعلانات',
  offer: 'العروض',
  order: 'الطلبات',
  payment: 'المدفوعات',
  auction: 'المزادات',
  dispute: 'النزاعات',
  user: 'الحسابات',
  admin: 'أثر الفريق',
};
