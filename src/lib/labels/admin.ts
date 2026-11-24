import type { SegmentFieldKey } from '@/lib/campaigns/segments';
import type { AuctionStatus, BuyerType, CampaignStatus, DisputeStatus, IdentityStatus, IntegrationCategory, IntegrationEnv, InvoiceIssuer, InvoiceStatus, LedgerAccount, ListingType, OrderSource, OrderStatus, PaymentPurpose, PayoutStatus, SellerType, SupplyType, TaxableBase, UserStatus } from '@/generated/prisma/enums';
import type { OrderCancelCategory, ReconciliationStatus } from '@/generated/prisma/enums';
import type { RowProblem } from '@/lib/domain/catalog-import';
import type { AssignFailure } from '@/lib/domain/admin-services';

/**
 * تسميات لوحة الأدمن — **هنا لا في النطاق**.
 *
 * النطاق يعيد **مفاتيح وأرقامًا**، والصياغة في طبقة العرض وحدها. وسببُ
 * الفصل ليس ترتيبًا: النطاق لا يعرف اللغة ولا يملك `Quantity`، فجملةٌ
 * يبنيها تُنتج «6 يومًا» — رقمًا لاتينيًّا وجمعًا خاطئًا — ولا يستطيع
 * تصحيحهما.
 *
 * والملف بلا `db` عمدًا: الشاشات العميلة تستورده.
 */

export const USER_SEGMENT_LABEL: Record<string, string> = {
  buyers: 'أفراد مشترون',
  sellers: 'أفراد بائعون',
  dealers: 'تجار ومعارض',
  suspended: 'موقوفون',
};

export const LISTING_TYPE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  NEGOTIATION: 'تفاوض',
  AUCTION: 'مزاد',
} satisfies Record<ListingType, string>;

export const ORDER_SOURCE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  BUY_NOW: 'شراء فوري',
  OFFER: 'تفاوض',
  AUCTION: 'مزاد',
} satisfies Record<OrderSource, string>;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'مكتملة',
  ACTIVE: 'جارية',
  CANCELLED: 'ملغاة',
  STALLED: 'متعثرة',
  DISPUTED: 'متنازع عليها',
} satisfies Record<OrderStatus, string>;

export const AUCTION_STATUS_LABEL: Record<string, string> = {
  LIVE: 'جارية',
  SCHEDULED: 'قادمة',
  ENDED_MET: 'رست',
  ENDED_UNMET: 'لم تبلغ الاحتياطي',
  CANCELLED: 'ملغاة',
} satisfies Record<AuctionStatus, string>;

/** بطاقات A1 — العنوان وشرائحه. */
export const DASHBOARD_CARD_LABEL: Record<string, string> = {
  users: 'العملاء',
  vehicles: 'المركبات المضافة',
  listings: 'الإعلانات',
  orders: 'الطلبات',
  repeat: 'العملاء المتكررون',
  auctions: 'المزادات',
  serviceRequests: 'طلبات الخدمات',
};

export const DASHBOARD_SEGMENT_LABEL: Record<string, string> = {
  ...USER_SEGMENT_LABEL,
  listed: 'معروضة للبيع',
  garage: 'في الجراج فقط',
  sold: 'مباعة',
  twice: 'شراء مرتين',
  thrice: 'ثلاث مرات',
  more: 'أربع فأكثر',
};

/** تجميع بقية المدن — مفتاحٌ محجوز لا اسم مدينة. */
export const REST_OF_CITIES = '__rest__';
export const REST_OF_CITIES_LABEL = 'بقية المدن';

export const REVENUE_STREAM_LABEL: Record<string, string> = {
  ads: 'إعلانات ممولة',
  commission: 'عمولة المنصة',
};

export const FINANCE_INPUT_LABEL: Record<string, string> = {
  salaries: 'رواتب',
  marketing_spend: 'إعلانات مدفوعة',
  referral_incentives: 'حوافز إحالة',
  content_seo: 'محتوى وSEO',
  infra_cost: 'بنية تحتية',
  other_cost: 'أخرى',
  cash_balance: 'الرصيد النقدي',
};

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  IDENTITY: 'الهوية والتحقق',
  PAYMENT: 'المدفوعات والضمان',
  GOVERNMENT: 'البيانات الحكومية والخدمات',
  INFRASTRUCTURE: 'الاتصال والبنية',
};

export const ENV_LABEL: Record<IntegrationEnv, string> = {
  TEST: 'اختبار',
  LIVE: 'إنتاج',
};

export const PAYMENT_PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  VEHICLE_ESCROW: 'بيع المركبات — الضمان',
  AUCTION_DEPOSIT: 'العربون في المزادات',
  WALLET_TOPUP: 'شحن رصيد المحفظة',
  SERVICE_PURCHASE: 'شراء الخدمات',
  TRANSFER_FEE: 'رسوم نقل الملكية',
  SUBSCRIPTION: 'اشتراكات الباقات',
};

/**
 * ═══ وما يفعله الغرضُ بالمال — سطرٌ تحت اسمه ═══
 *
 * ترميزُ `A20` يكتب تحت كلّ غرضٍ ما يقع به: «حجز ثمّ إفراج بعد نقل
 * الملكية» · «تحصيل فوريّ بلا حجز». وهو ليس زينةً: من يبدّل بوابةَ غرضٍ
 * يحتاج أن يعرف **أيحجز أم يحصّل** قبل أن يقرأ قدرات البوابة — فبوابةٌ
 * بلا حجزٍ تصلح لشحن المحفظة ولا تصلح للضمان.
 *
 * و`SUBSCRIPTION` وحدها بلا سطرٍ هنا: سببُ تعطيلها حالُ الباقات، فيُقرأ
 * من القاعدة ويُصاغ في الشاشة.
 */
export const PAYMENT_PURPOSE_NOTE: Record<string, string> = {
  VEHICLE_ESCROW: 'حجز ثم إفراج بعد نقل الملكية',
  AUCTION_DEPOSIT: 'حجز مؤقت يرد أو يخصم',
  WALLET_TOPUP: 'تحصيل فوري بلا حجز',
  SERVICE_PURCHASE: 'فحص · موجز · شحن · تصوير',
  TRANSFER_FEE: 'تحصل مع مبلغ الطلب',
  SUBSCRIPTION: '',
} satisfies Record<PaymentPurpose, string>;

export const NOTIFICATION_GROUP_LABEL: Record<string, string> = {
  auth: 'الدخول',
  account: 'الحساب',
  listing: 'الإعلان',
  offer: 'العروض',
  auction: 'المزاد',
  order: 'الطلب والدفع',
  escrow: 'الضمان',
  deposit: 'العربون',
  dispute: 'النزاعات',
  service: 'الخدمات',
};

/**
 * حالُ الحملة — **بتعهّد تعدادها** (البوابة ٥٩): حالٌ تُضاف إلى
 * المخطّط يشكو منها المُصرِّف هنا، ولا تُعرض خامّةً في شاشة.
 */
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'مسودة',
  SCHEDULED: 'مجدولة',
  RUNNING: 'جارية',
  SENT: 'أرسلت',
  CANCELLED: 'ملغاة',
};

/**
 * حقولُ الشريحة — **والمفتاحُ من `SEGMENT_FIELDS` لا من `string`**:
 * حقلٌ يُضاف هناك بلا تسميةٍ هنا يُعرض خامًّا للمشغّل.
 */
export const SEGMENT_FIELD_LABEL: Record<SegmentFieldKey, string> = {
  hasFavorites: 'لديه مفضلة',
  hasCompletedOrder: 'أتم صفقة',
  hasActiveOrder: 'لديه طلب جاري',
  hasListing: 'له إعلان',
  hasVehicle: 'أضاف مركبة',
  hasBid: 'زايد سابقا',
  isDealer: 'تاجر',
  activeWithinDays: 'سجل خلال (يوما)',
};

export const NOTIFICATION_CHANNEL_LABEL: Record<string, string> = {
  email: 'بريد',
  sms: 'رسالة',
  push: 'دفع',
  inApp: 'داخل التطبيق',
};

export const ROUTE_DISABLED_LABEL = 'معطل';

/** بدائل العرض حين يغيب الاسم — والنطاق يعيد `null` لا نصًّا. */
export const ANONYMOUS_BIDDER = 'مزايد';
export const ANONYMOUS_SELLER = 'بائع';

/**
 * ═══ ترميز A21 — بألفاظ التصميم حرفيًّا ═══
 *
 * و«خارج النطاق؟» **بعلامة الاستفهام**: هي الفرق بين «حكمنا بخروجها»
 * و«لا نعرف بعد». والعلامة تنجو من كل ترجمة.
 */
export const SELLER_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: 'فرد غير مسجل',
  DEALER_VAT: 'مورد مسجل',
  DEALER_NO_VAT: 'تاجر غير مسجل',
  COMPANY: 'شركة',
} satisfies Record<SellerType, string>;

export const BUYER_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: 'فرد',
  DEALER: 'تاجر',
  COMPANY: 'شركة',
} satisfies Record<BuyerType, string>;

/**
 * ═══ لماذا لم تصدر الفاتورة ═══
 *
 * والفعلان مختلفان: «اكتب قاعدة» و«أقِرّ القاعدة التي عندك». فسببٌ
 * واحدٌ غامض يرسل المشغّل ليكتب قاعدةً قائمةً أصلًا، فتتزاحم قاعدتان
 * على الحالة نفسها.
 */
export const INVOICE_BLOCK_REASON: Record<string, string> = {
  NO_MATCHING_RULE: 'لا قاعدة تطابق هذه الحالة — اكتب قاعدة لها',
  RULE_AWAITING_APPROVAL: 'القاعدة المطابقة تنتظر الإقرار — أقرها',
  MARGIN_NOT_APPROVED: 'نظام هامش الربح غير معتمد لهذا البائع',
  MARGIN_AMOUNT_MISSING: 'هامش الربح غير معروف — لا سعر شراء مسجل للمركبة',
  OUT_OF_SCOPE_NO_INVOICE: 'خارج نطاق الضريبة — لا فاتورة تستحق',
  ALREADY_ISSUED: 'صدرت من قبل',
  INVOICED_WITH_ITS_OWN_PAYMENT: 'فوترت مع دفعتها لا مع التسوية',
  UNKNOWN: 'سبب غير معروف',
};

export const SUPPLY_TYPE_LABEL: Record<string, string> = {
  VEHICLE: 'المركبة',
  COMMISSION: 'العمولة',
  SERVICE: 'الخدمات',
  ADMIN_FEE: 'رسوم إدارية',
  DISBURSEMENT: 'صرف بدلا عن العميل',
} satisfies Record<SupplyType, string>;

export const TAXABLE_BASE_LABEL: Record<string, string> = {
  FULL_VALUE: 'كامل القيمة',
  MARGIN: 'هامش الربح',
  FEE_ONLY: 'العمولة وحدها',
  OUT_OF_SCOPE: 'خارج النطاق؟ — لا فاتورة',
} satisfies Record<TaxableBase, string>;

export const INVOICE_ISSUER_LABEL: Record<string, string> = {
  PLATFORM: 'المنصة',
  SELLER: 'البائع',
  PLATFORM_ON_BEHALF: 'المنصة بالنيابة',
  NONE: 'لا أحد',
} satisfies Record<InvoiceIssuer, string>;

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'صادرة',
  REPORTED: 'مبلغة',
  REPORT_FAILED: 'تعذر الإبلاغ',
  CANCELLED: 'ملغاة',
} satisfies Record<InvoiceStatus, string>;

/** «أي» لا «الكل»: الصفّ العامّ يطابق ما لم يجد أخصّ منه. */
export const ANY_TYPE = 'أي';

/** حالات النزاع — والنطاق يعيد المفتاح، والصياغة هنا. */
export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'مفتوح',
  INVESTIGATING: 'قيد الفحص',
  RESOLVED_BUYER: 'حسم للمشتري',
  RESOLVED_SELLER: 'حسم للبائع',
  CLOSED: 'مغلق',
} satisfies Record<DisputeStatus, string>;

export const RESOLUTION_LABEL: Record<string, string> = {
  FULL_REFUND: 'استرداد كامل',
  PARTIAL_SETTLEMENT: 'تسوية جزئية',
  RELEASE_TO_SELLER: 'إفراج للبائع',
};

/**
 * أسماء المهل ووحداتها وشرحُ أثرها.
 *
 * **والأثر يُقال لا الاسم وحده**: من يقرأ «مهلة الدفع ٢٤» لا يعرف ماذا
 * يقع بعدها، ومن يعدّلها يجب أن يعرف أنه يُسقط طلبات.
 */
export const DEADLINE_LABEL: Record<string, { name: string; unit: string; effect: string }> = {
  offerTtlHours: {
    name: 'مهلة العرض',
    unit: 'ساعة',
    effect: 'بعدها يسقط العرض تلقائيا ولا يعود البائع يستطيع قبوله.',
  },
  paymentWindowHours: {
    name: 'مهلة الدفع',
    unit: 'ساعة',
    effect: 'من إنشاء الطلب. بعدها يلغى الطلب ويعود الإعلان معروضا.',
  },
  transferDeadlineDays: {
    name: 'مهلة نقل الملكية',
    unit: 'يوم',
    effect: 'من تأكيد الدفع. بعدها ينبه الطرفان ويفتح مسار النزاع.',
  },
  transferExtensionDays: {
    name: 'تمديد نقل الملكية',
    unit: 'يوم',
    effect: 'تمديد واحد لا أكثر، بسبب مكتوب ومسجل.',
  },
  sellerDecisionHours: {
    name: 'قرار البائع بعد المزاد',
    unit: 'ساعة',
    effect: 'حين لا تبلغ المزايدات الاحتياطي. بعدها يسقط حقه في القبول.',
  },
  disputeSlaHours: {
    name: 'مهلة الرد على النزاع',
    unit: 'ساعة',
    effect: 'الحد الذي يجب أن يرد فيه فريق الدعم، وينبه عند تجاوزه.',
  },
  settleWindowHours: {
    name: 'مهلة التسوية',
    unit: 'ساعة',
    effect: 'المدة المتاحة لإتمام التسوية بعد استيفاء شروط الإفراج.',
  },
  auctionExtendWindowSeconds: {
    name: 'نافذة تمديد المزاد',
    unit: 'ثانية',
    effect: 'مزايدة داخل هذه النافذة قبل الإغلاق تمد المزاد.',
  },
  auctionExtendBySeconds: {
    name: 'مقدار تمديد المزاد',
    unit: 'ثانية',
    effect: 'كم يمد المزاد عند مزايدة أخيرة — بحد أقصى عشر مرات.',
  },
  reportValidityDays: {
    name: 'صلاحية تقرير الفحص',
    unit: 'يوم',
    effect: 'بعدها يعد التقرير قديما ويطلب فحص جديد.',
  },
  paymentReminderHours: {
    name: 'تذكير الدفع قبل انقضاء المهلة',
    unit: 'ساعة',
    effect: 'يصل المشتري تنبيه واحد قبل سقوط طلبه بهذه المدة.',
  },
  auctionClosingReminderMinutes: {
    name: 'تذكير إغلاق المزاد',
    unit: 'دقيقة',
    effect: 'يصل من زايد تنبيه واحد قبل الإغلاق بهذه المدة.',
  },
  offerReminderHours: {
    name: 'تذكير سقوط العرض',
    unit: 'ساعة',
    effect: 'يصل طرفي العرض تنبيه واحد قبل سقوطه بهذه المدة.',
  },
  serviceConsentHours: {
    name: 'مهلة إذن البائع بالفحص',
    unit: 'ساعة',
    effect: 'حين يطلب مشتري فحص مركبة معروضة. بعدها يسقط الطلب ولا يؤخذ مال.',
  },
  viewingReminderHours: {
    name: 'التذكير قبل موعد المعاينة',
    unit: 'ساعة',
    effect: 'يصل الطرفين تنبيه واحد قبل الموعد المؤكد بهذه المدة.',
  },
};

/** أسماء حسابات دفتر الأستاذ — وطبيعة كلٍّ منها في `docs/LEDGER.md`. */
/**
 * ═══ حدثُ القيد — ما الذي حرّك الحساب ═══
 *
 * `LEDGER_ACCOUNT_LABEL` تسمّي **الحساب**، وهذه تسمّي **الواقعة**.
 * وصفحةُ التحويل تعرض قيودَ حساب البائع، فمفتاحٌ خامٌّ مثل
 * `order.earned` لا يقول للمشغّل شيئًا — **وقيمةٌ بلا تسمية تُعرض
 * خامًّا أو لا تُعرض**، وهو الصنف الذي أُغلق في قوالب الإشعار وحسابات
 * الدفتر وشاشة الصرف.
 */
export const LEDGER_EVENT_LABEL: Record<string, string> = {
  'order.paid': 'دفع المشتري',
  'order.captured': 'حصل من البوابة',
  'order.earned': 'استحق بعد نقل الملكية',
  'payout.sent': 'حوالة إلى البائع',
  'deposit.captured': 'حصل عربون',
  'deposit.forfeited': 'صودر عربون',
  'refund.before_earning': 'رد قبل الاستحقاق',
  'refund.after_earning': 'رد بعد الاستحقاق',
  'service.paid': 'دفع خدمة',
  'service.captured': 'حصل مبلغ خدمة',
  'service.earned': 'استحقت خدمة',
  'service.refunded': 'ردت خدمة',
  'service.provider_due': 'استحق للمزود',
  'provider_payout.sent': 'حوالة إلى المزود',
  'wallet.admin_credit': 'منحة من الأدمن',
  'wallet.admin_debit': 'خصم من الأدمن',
  'provider.admin_credit': 'تسوية للمزود',
  'provider.admin_debit': 'تسوية على المزود',
};

export const LEDGER_ACCOUNT_LABEL: Record<string, string> = {
  ESCROW_AT_PROVIDER: 'لدى مزود الدفع',
  BUYER_ADVANCE: 'قبض ولم يستحق',
  SELLER_PAYABLE: 'حقوق البائعين',
  PLATFORM_REVENUE: 'إيراد المنصة',
  VAT_PAYABLE: 'ضريبة مستحقة',
  GATEWAY_FEES_CLEARING: 'رسوم البوابة (عبور)',
  GOVT_FEES_CLEARING: 'رسوم حكومية (عبور)',
  PLATFORM_CASH: 'ما وصلنا فعلا',
  // **وحسابٌ بلا تسمية يُعرض مفتاحًا خامًا** — وهو ما وقع أوّل قيد محفظة
  WALLET_PAYABLE: 'أرصدة محافظ العملاء',
  GOODWILL_EXPENSE: 'تعويضات ومنح',
  PROVIDER_PAYABLE: 'حقوق مزودي الخدمات',
  PROVIDER_COST: 'تكلفة خدمات المزودين',
} satisfies Record<LedgerAccount, string>;

/**
 * ═══ حالُ الحساب وحالُ هويّته — يُقرآن لا يُهجّيان ═══
 *
 * صفحةُ العميل كانت تطبع `SUSPENDED` و`PENDING` شارتين خامّتين فوق
 * اسمه — وهما مفتاحان لا جملتان. والمشغّل يقرأ العربية، والشاشة
 * نفسها تسمّيهما بالعربية في قائمة الهوية («ينتظر» · «موثّق»).
 *
 * **والمصدر واحد**: هذه الخريطة تقرؤها الصفحتان معًا، فلا تتباعد
 * تسميةٌ عن أختها.
 */
export const USER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  BANNED: 'محظور',
  /**
   * **وحسابٌ أغلقه صاحبُه ليس موقوفًا ولا محظورًا**: الثلاثة كانت
   * القائمة كلَّها، و`CLOSED` يُكتب من `account-closure.ts` — فصفحةُ
   * العميل كانت تعرض المفتاح الخام «CLOSED» لمن أغلق حسابه.
   */
  CLOSED: 'مغلق بطلب صاحبه',
} satisfies Record<UserStatus, string>;

export const IDENTITY_STATUS_LABEL: Record<string, string> = {
  NONE: 'لم تقدم',
  PENDING: 'ينتظر المراجعة',
  CLARIFICATION: 'معلق للتوضيح',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
} satisfies Record<IdentityStatus, string>;


/**
 * أحداثُ حساب المزوّد بالعربية — **والنطاق يعيد مفاتيح لا جُملًا**،
 * فالصياغة هنا كما تقول القاعدة.
 */
export const PROVIDER_EVENT_LABEL: Readonly<Record<string, string>> = {
  'service.provider_due': 'استحق عن خدمة',
  'provider.admin_credit': 'قيد يدوي — زيادة',
  'provider.admin_debit': 'قيد يدوي — خصم',
  /**
   * **وحدثٌ جديد تُكتب صياغتُه معه**: المفتاح الخام في كشفٍ يقرؤه
   * محاسبٌ أو المزوّدُ نفسه هو الصنف الذي وقع في قوالب الإشعار.
   */
  'provider_payout.sent': 'حوالة إلى حسابه',
};

/**
 * ═══ حالُ التحويل — تسميةٌ واحدة لأربع شاشات ═══
 *
 * كانت مكتوبةً أربع مرّات: قائمتا البائعين والمزوّدين وصفحتا تفاصيلهما
 * — **وتباعدت في جلسةٍ واحدة**: `FAILED` «تعذّر» في قائمةٍ و«فشل» في
 * صفحةٍ تفتحها القائمةُ نفسُها.
 *
 * **والتعهّدُ على التعداد** (`Record<PayoutStatus, …>`): حالٌ تُضاف إلى
 * المخطّط يشكو منها المُصرِّف هنا، ولا تُعرض خامّةً في شاشة.
 *
 * ═══ وصياغتُها تُقرأ بلا تشكيل ═══
 *
 * «حوّل» و«أُلغي» تُكتبان بلا تشكيل «حول» و«ألغي» — والأولى تُقرأ
 * «حَوْل»، والثانية فعلًا مبنيًّا للمعلوم. فالوصفُ أسلمُ من الفعل:
 * «محول» و«ملغى» لا تحتملان قراءةً ثانية.
 */
export const PAYOUT_STATUS_LABEL: Record<
  PayoutStatus,
  { label: string; tone: 'accent' | 'warn' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'ينتظر مرجع الحوالة', tone: 'warn' },
  SENT: { label: 'محول', tone: 'accent' },
  FAILED: { label: 'تعذر', tone: 'danger' },
  CANCELLED: { label: 'ملغى', tone: 'neutral' },
};

/**
 * ═══ أسماءُ حقول المفاتيح بالعربية ═══
 *
 * كانت تُعرض بمفاتيحها اللاتينية (`secretKey` · `clientId`)، والترميز
 * يكتبها «المفتاح السرّي» و«المفتاح العام». ومن يضبط تكاملًا لأوّل
 * مرّة يقرأ اسمًا لا يعرف أيَّ حقلٍ يقابله في لوحة المزوّد.
 *
 * **ولا سقوطَ صامت إلى الاسم الخام**: `tests/integration-fields.test.ts`
 * يفحص أنّ لكلّ حقلٍ في `INTEGRATION_SECRET_FIELDS` تسميةً هنا —
 * فالفهرسةُ بنصٍّ تُعيد `undefined` بلا شكوى، وحقلٌ جديد بلا تسمية
 * يُعرض خامًا ولا يشكو أحد.
 */
export const INTEGRATION_FIELD_LABEL: Readonly<Record<string, string>> = {
  secretKey: 'المفتاح السري',
  publicKey: 'المفتاح العام',
  webhookSecret: 'سر الويب هوك',
  platformKey: 'مفتاح المنصة',
  clientId: 'معرف العميل',
  clientSecret: 'سر العميل',
  apiKey: 'مفتاح الواجهة',
  senderId: 'اسم المرسل',
  accountId: 'معرف الحساب',
  accessKeyId: 'معرف مفتاح الوصول',
  secretAccessKey: 'مفتاح الوصول السري',
  bucket: 'الحاوية',
};

/**
 * تسمياتُ مجموعات اللوحة التشغيلية (A2).
 *
 * **والنطاق يعيد مفاتيح** (البوابة ١٧): لا يعرف اللغة ولا يملك
 * `Quantity`، فجملةٌ يبنيها تُخرج «6 يومًا».
 */
export const OPS_GROUP_LABEL: Readonly<Record<string, string>> = {
  listings: 'إعلانات',
  identity: 'توثيق هوية',
  reports: 'بلاغات',
  services: 'طلبات خدمات',
  disputes: 'نزاعات',
  stalled: 'طلبات متعثرة',
  forfeited: 'انسحاب من مزاد',
};

/**
 * أصنافُ إلغاء الطلب (A2).
 *
 * **بتعهّدٍ للمُصرِّف** (البوابة ٥٩): قيمةٌ تُضاف إلى التعداد بلا
 * تسميةٍ تُعرض خامًا في البطاقة، والفهرسةُ بنصٍّ تُعيد `undefined`
 * بلا شكوى.
 */
export const CANCEL_CATEGORY_LABEL = {
  PAYMENT_TIMEOUT: 'لم يكتمل الدفع',
  NOT_AS_DESCRIBED: 'لا تطابق الوصف',
  CHANGED_MIND: 'غير رأيه',
  SELLER_DELAY: 'تأخر البائع',
  OTHER: 'أخرى',
} satisfies Record<OrderCancelCategory, string>;

/**
 * ═══ حالُ مطابقةِ بوّابةٍ ليوم ═══
 *
 * كانت مكتوبةً في `ReconciliationTable` وحدها (A20) بـ
 * `Record<string, string>` — بلا تعهّدٍ للمُصرِّف. ثمّ احتاجتها لوحةُ
 * A25، **والنسخةُ الثانية تتباعد أوّل تغيير**: فتقول شاشةٌ «تعذّرت
 * القراءة» وأختُها «بانتظار ملف التسوية» عن الحال نفسِه.
 *
 * **و«بانتظار ملف التسوية» لفظُ المصمّم**، وهو أصدقُ من «تعذّرت
 * القراءة»: يقول ما ننتظره لا أنّ شيئًا تعطّل. و`UNAVAILABLE` ليست
 * تطابقًا — فلونُها محايدٌ لا أخضر في الموضعين.
 */
export const RECON_STATUS_LABEL = {
  MATCHED: 'مطابق',
  DIFFERS: 'فرق',
  UNAVAILABLE: 'بانتظار ملف التسوية',
} satisfies Record<ReconciliationStatus, string>;

/** ولم تُطابَق قطّ — حالٌ خارج التعداد، فلها لفظُها. */
export const RECON_NEVER_LABEL = 'لم تطابق بعد';

/**
 * حالُ صفّ الإرسال في سجلّ A10.
 *
 * **و«في الطابور» ليست فشلًا**: صفٌّ لم يُحاوَل بعد، وهو حالُ كلّ صفٍّ
 * اليوم إذ لا دافعَ إلى FCM/APNs في المنتج.
 *
 * والمفتاحُ نصٌّ في المخطّط لا تعداد (`queued | sent | delivered |
 * failed`)، فالخريطة بقيمةٍ احتياطية في الشاشة لا بتعهّدٍ للمُصرِّف.
 */
export const PUSH_SEND_STATUS_LABEL: Readonly<Record<string, string>> = {
  queued: 'في الانتظار',
  sent: 'أرسل',
  delivered: 'سلم',
  failed: 'فشل',
};

/**
 * سببُ رفض صفٍّ في استيراد الكتالوج (A13).
 *
 * **والسببُ يُقال بعمودِه** — «صفّ مرفوض» وحدها تجعل المشغّل يفتح
 * الملفّ يبحث عمّا لا يعرفه.
 */
export const ROW_PROBLEM_LABEL = {
  BRAND_NOT_FOUND: 'ماركة غير معروفة — أضفها من شاشة البراندات أولا',
  MISSING_FIELD: 'حقل مطلوب فارغ',
  BAD_ENUM: 'قيمة غير مقبولة — راجع القالب',
  BAD_NUMBER: 'رقم غير صالح',
  DUPLICATE_IN_FILE: 'مكرر داخل الملف نفسه',
} satisfies Record<RowProblem, string>;

/**
 * سببُ تعذّر إسناد طلبِ خدمة (A6).
 *
 * **والسببُ يُقال بمرجعه** — «تعذّر إسناد ثلاثة» تترك المشغّل يبحث
 * عمّا لا يعرفه.
 */
export const ASSIGN_FAILURE_LABEL = {
  NOT_FOUND: 'لم يعد موجودا',
  NOT_ASSIGNABLE: 'حاله لا يقبل الإسناد',
  ALREADY_ASSIGNED: 'أسند قبل قليل',
  PROVIDER_NOT_FOUND: 'المزود غير معروف',
  PROVIDER_INACTIVE: 'المزود معطل',
  WRONG_TYPE: 'المزود لا يؤدي هذا النوع',
  CITY_NOT_COVERED: 'المزود لا يغطي مدينة الطلب',
} satisfies Record<AssignFailure, string>;
