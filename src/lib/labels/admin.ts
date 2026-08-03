import type {
  IntegrationCategory,
  IntegrationEnv,
  PaymentPurpose,
} from '@/generated/prisma/enums';

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
};

export const ORDER_SOURCE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  BUY_NOW: 'شراء فوري',
  OFFER: 'تفاوض',
  AUCTION: 'مزاد',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'مكتملة',
  ACTIVE: 'جارية',
  CANCELLED: 'ملغاة',
  STALLED: 'متعثّرة',
  DISPUTED: 'متنازع عليها',
};

export const AUCTION_STATUS_LABEL: Record<string, string> = {
  LIVE: 'جارية',
  SCHEDULED: 'قادمة',
  ENDED_MET: 'رست',
  ENDED_UNMET: 'لم تبلغ الاحتياطي',
  CANCELLED: 'ملغاة',
};

/** بطاقات A1 — العنوان وشرائحه. */
export const DASHBOARD_CARD_LABEL: Record<string, string> = {
  users: 'العملاء',
  vehicles: 'المركبات المضافة',
  listings: 'الإعلانات',
  orders: 'الطلبات',
  repeat: 'العملاء المتكرّرون',
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
  ads: 'إعلانات مموّلة',
  commission: 'عمولة المنصّة',
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
  IDENTITY: 'الهوية والتحقّق',
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

export const SEGMENT_FIELD_LABEL: Record<string, string> = {
  hasFavorites: 'لديه مفضلة',
  hasCompletedOrder: 'أتمّ صفقة',
  hasActiveOrder: 'لديه طلب جارٍ',
  hasListing: 'له إعلان',
  hasVehicle: 'أضاف مركبة',
  hasBid: 'زايد سابقًا',
  isDealer: 'تاجر',
  activeWithinDays: 'سجّل خلال (يومًا)',
};

export const NOTIFICATION_CHANNEL_LABEL: Record<string, string> = {
  email: 'بريد',
  sms: 'رسالة',
  push: 'دفع',
  inApp: 'داخل التطبيق',
};

export const ROUTE_DISABLED_LABEL = 'معطّل';

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
  INDIVIDUAL: 'فرد غير مسجَّل',
  DEALER_VAT: 'مورِّد مسجَّل',
  DEALER_NO_VAT: 'تاجر غير مسجَّل',
  COMPANY: 'شركة',
};

export const BUYER_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: 'فرد',
  DEALER: 'تاجر',
  COMPANY: 'شركة',
};

export const SUPPLY_TYPE_LABEL: Record<string, string> = {
  VEHICLE: 'المركبة',
  COMMISSION: 'العمولة',
  SERVICE: 'الخدمات',
  ADMIN_FEE: 'رسوم إدارية',
  DISBURSEMENT: 'صرف نيابةً عن العميل',
};

export const TAXABLE_BASE_LABEL: Record<string, string> = {
  FULL_VALUE: 'كامل القيمة',
  MARGIN: 'هامش الربح',
  FEE_ONLY: 'العمولة وحدها',
  OUT_OF_SCOPE: 'خارج النطاق؟ — لا فاتورة',
};

export const INVOICE_ISSUER_LABEL: Record<string, string> = {
  PLATFORM: 'المنصّة',
  SELLER: 'البائع',
  PLATFORM_ON_BEHALF: 'المنصّة نيابةً',
  NONE: 'لا أحد',
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'صادرة',
  REPORTED: 'مُبلَّغة',
  REPORT_FAILED: 'تعذّر الإبلاغ',
  CANCELLED: 'ملغاة',
};

/** «أي» لا «الكل»: الصفّ العامّ يطابق ما لم يجد أخصّ منه. */
export const ANY_TYPE = 'أي';
