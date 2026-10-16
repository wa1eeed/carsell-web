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

/**
 * فئةُ الخدمة — **وكانت تُعرض مفتاحًا خامًا** («PRE_PURCHASE») في
 * شاشة الأدمن، والنطاق يُعيد مفاتيح والصياغة هنا (البوابة ١٧).
 */
export const SERVICE_CATEGORY: Record<string, string> = {
  PRE_PURCHASE: 'قبل الشراء',
  POST_PURCHASE: 'بعد الشراء',
  SELLER: 'للبائع',
};

/**
 * حالُ دفعةِ الطلب كما يقرؤها المشغّل.
 *
 * **و«محجوز» غيرُ «حُصِّل»**: الأوّل مالٌ لدى البوّابة باسم المعاملة
 * يُردّ بإلغاء، والثاني وصلنا. وطيُّهما في «مدفوع» يُخفي الفرق الذي
 * يُسأل عنه أوّلَ نزاع.
 */
export const SERVICE_PAYMENT_STATUS: Record<string, string> = {
  CREATED: 'أُنشئت ولم تُحجز',
  REQUIRES_ACTION: 'تنتظر تحقّق العميل',
  PENDING: 'قيد التأكيد',
  HELD: 'محجوز لدى البوّابة',
  SETTLED: 'حُصِّل',
  PARTIALLY_SETTLED: 'حُصِّل جزئيًّا',
  CANCELLED: 'أُلغي ورُدّ',
  FAILED: 'فشلت',
};
