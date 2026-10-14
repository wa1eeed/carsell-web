/**
 * ═══ أحوالُ طلب الخدمة كما تُقرأ ═══
 *
 * **والقائمة كانت ناقصة**: شاشةُ «تقاريري» تعرف `NEW` و`ASSIGNED` و
 * `IN_PROGRESS` وحدها، وتقول عن كلِّ طلبٍ «بانتظار التقرير» أيًّا كان
 * حالُه — فمن رُفض طلبُه يقرأ أنه ينتظر تقريرًا لن يأتي.
 *
 * والنطاق يُعيد مفاتيح، والصياغة هنا (البوابة ١٧).
 */
export const SERVICE_REQUEST_STATUS: Record<string, string> = {
  AWAITING_SELLER: 'ينتظر إذن صاحب المركبة',
  AWAITING_PAYMENT: 'ينتظر سدادك',
  DECLINED: 'لم يُؤذَن به',
  NEW: 'في طابور الفاحصين',
  ASSIGNED: 'مُسنَد إلى المزوّد',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'اكتمل',
  FAILED: 'تعذّر تنفيذه',
  REFUNDED: 'رُدّ مبلغه',
};

/** ما يُعرض في عمود القيمة — ولكل حالٍ ما ينتظره صاحبُها فعلًا. */
export const SERVICE_REQUEST_NEXT: Record<string, string> = {
  AWAITING_SELLER: 'ينتظر إذنًا',
  AWAITING_PAYMENT: 'ادفع لتبدأ',
  DECLINED: 'انتهى',
  NEW: 'بانتظار الإسناد',
  ASSIGNED: 'بانتظار الفاحص',
  IN_PROGRESS: 'بانتظار التقرير',
  DONE: 'التقرير جاهز',
  FAILED: 'راجع الدعم',
  REFUNDED: 'رُدّ المبلغ',
};
