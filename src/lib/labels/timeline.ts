/**
 * ═══ تسميات خطّ الزمن — بالعربية، وفي طبقة العرض ═══
 *
 * النطاق يعيد **مفاتيح**: `listing.published` و`offer.ACCEPTED`. وهو
 * لا يستطيع الصياغة أصلًا — لا يعرف اللغة ولا يملك `Quantity`
 * (البوابة ١٧).
 *
 * **والمفتاح الخام يبقى لما لا تسمية له**: سطرٌ يقول
 * `order.transfer_confirmed` أوضح من سطرٍ يقول «حدث» — والتاريخ
 * يُقرأ في تحقيق، فغموضُه أسوأ من قبحه.
 */
export const TIMELINE_LABEL: Record<string, string> = {
  'listing.created': 'أُنشئ الإعلان',
  'listing.queued': 'أُحيل إلى المراجعة',
  'listing.reviewed': 'انتهت المراجعة',
  'listing.published': 'نُشر الإعلان',
  'listing.closed': 'أُغلق الإعلان',

  'auction.opened': 'فُتح المزاد',
  'auction.bid': 'مزايدة',
  'auction.closed': 'أُغلق المزاد',

  /*
    ═══ الضمان والفواتير والدفعات ═══

    **ولكلٍّ كاتبٌ الآن.** البوابة ١٩ لدغت `escrow.released` حين
    أُضيفت تحسّبًا بلا كاتب — ومفتاحٌ لا يكتبه أحد يُعرض خامًا ويبدو
    مقصودًا. وخطُّ زمن الطلب يكتبها من `Escrow.heldAt`/`releasedAt`
    و`TaxInvoice` و`PaymentEvent`.
  */
  /* ═══ الحساب والمعرض والبلاغ والخدمة — ولكلٍّ كاتبٌ في `admin-entity-timelines` ═══ */
  'trim.create': 'أُنشئت الفئة',
  'trim.update': 'عُدِّلت الفئة',
  'trim.delete': 'حُذفت الفئة',

  'user.joined': 'أُنشئ الحساب',
  /** **والدورُ يُقال**: «أُنشئ طلب» لا تقول أمشتريًا كان أم بائعًا. */
  'order.asBuyer': 'اشترى',
  'order.asSeller': 'باع',
  'report.filed': 'قدّم بلاغًا',

  'dealer.registered': 'سُجّل المعرض',
  'dealer.marginScheme': 'مُنح نظام هامش الربح',

  'deposit.released': 'رُدّ العربون',
  'dispute.message': 'رسالةٌ في النزاع',

  'service.requested': 'طُلبت خدمة',
  'service.scheduled': 'حُدّد موعد الخدمة',

  'escrow.held': 'حُجز المبلغ في الضمان',
  'escrow.released': 'أُفرج عن الضمان',
  'invoice.issued': 'صدرت فاتورة ضريبية',

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

  'dispute.opened': 'فُتح نزاع',
  'dispute.resolved': 'حُسم النزاع',

  'offer.PENDING': 'عرضٌ وصل',
  'offer.COUNTERED': 'عرضٌ مقابل',
  'offer.ACCEPTED': 'قُبل العرض',
  'offer.REJECTED': 'رُفض العرض',
  'offer.AUTO_REJECTED': 'رُفض تلقائيًّا — دون الحدّ',
  'offer.EXPIRED': 'سقط العرض بانقضاء مهلته',
  'offer.WITHDRAWN': 'سحب المشتري عرضه',

  'order.created': 'أُنشئ طلب',
  'stage.advanced': 'تقدّم الطلب مرحلةً',
  'payment.timeout': 'انقضت مهلة الدفع',
  'invoice.blocked': 'تعذّر إصدار فاتورة',
  'order.completed': 'اكتمل الطلب',
  'deposit.forfeited': 'صُودر العربون',
  /*
    **ولا يُضاف مفتاحٌ لحدثٍ لا يقع.** أضفتُ `order.cancelled` و
    `escrow.released` تحسّبًا، فبلّغت البوابة ١٩: مفتاحٌ لا يكتبه أحد
    يُعرض الرمز الخام ويبدو مقصودًا. والتسمية تتبع الكاتب لا العكس.
  */
};

/**
 * ═══ تفصيلُ الحدث حين يكون مفتاحًا ═══
 *
 * بعضُ الأحداث تفصيلُها مبلغٌ (المزايدة والعرض)، وبعضُها **مفتاح**:
 * حالُ المزاد عند إغلاقه، والمرحلةُ التي تقدّم إليها الطلب. وكان
 * يُعرض خامًا — «ENDED_MET» و«TRANSFER» في سطرٍ عربيّ.
 */
export const TIMELINE_DETAIL: Record<string, string> = {
  ENDED_MET: 'بلغ الاحتياطي',
  ENDED_UNMET: 'لم يبلغ الاحتياطي',
  CANCELLED: 'أُلغي',

  /**
   * **وأسبابُ الإغلاق** — تُكتب في `closeReason` ويقرؤها خطُّ الزمن.
   * وقِيست في القاعدة فإذا هي خمسة، منها `بيع` بالعربية من البذرة:
   * **قيمةٌ مزروعة لا يكتبها المنتج** — تُترك كما هي لا تُترجَم.
   */
  'order.completed': 'اكتمل الطلب',
  'order.created': 'أُنشئ عليه طلب',
  'offer.accepted': 'قُبل عرضٌ عليه',
  'auction.won': 'رسا المزاد',
  'auction.buy_now': 'شُري فورًا',

  /*
    **ومراحلُ الطلب كلُّها هنا.** كانت `REQUEST` و`APPROVED` و
    `INSPECTION` و`DONE` غائبةً، فسطرُ «تقدّم الطلب مرحلةً» يعرض
    `DONE` خامًا بينما أخوه يعرض «نقل الملكية» — جدولٌ واحد بصيغتين.
  */
  /* مصدرُ الطلب — يُعرض تفصيلًا على سطر «أُنشئ طلب» */
  DIRECT: 'بيع مباشر',
  OFFER: 'قبول عرض',
  AUCTION: 'رسوّ مزاد',
  BUY_NOW: 'اشترِ الآن',

  REQUEST: 'الطلب',
  APPROVED: 'موافقة البائع',
  INSPECTION: 'الفحص',
  DONE: 'الإنهاء',
  PAYMENT: 'الدفع',
  TRANSFER: 'نقل الملكية',
  HANDOVER: 'التسليم',
  SETTLED: 'التسوية',
  COMPLETED: 'الاكتمال',
};
