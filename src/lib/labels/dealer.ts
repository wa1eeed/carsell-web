import type { DealerModule } from '@/lib/domain/dealer-modules';
import type { DealerExpenseKind, DealerRole, EscrowStatus, InvoiceStatus, SupplyType } from '@/generated/prisma/enums';
import type { OrderBucket } from '@/lib/domain/dealer-desk';
import type { DealerLedgerKind, InvoiceBucket } from '@/lib/domain/dealer-money';
import type { AuctionBucket } from '@/lib/domain/dealer-auctions';
import type { ImportColumn, ImportNote, ImportSeverity } from '@/lib/domain/dealer-import';

/**
 * أدوارُ فريق المعرض بالعربية — ومصفوفةُ صلاحياتها في `D9`.
 *
 * **وتعهّدُ `Record` يفرض الاكتمال**: دورٌ يُضاف إلى التعداد بلا
 * تسمية يُعرض مفتاحًا لاتينيًّا في شاشةٍ عربية. (البوابة ٥٩.)
 */
export const DEALER_ROLE_AR: Record<DealerRole, string> = {
  OWNER: 'مالك',
  MANAGER: 'مدير',
  SALES: 'مبيعات',
  ACCOUNTANT: 'محاسب',
};

/**
 * شرائحُ طابور الطلبات — `D6`.
 *
 * **وموضعُها `labels` لا النطاق** (البوابة ١٧): النطاق لا يصوغ، ولا
 * يعرف اللغة ولا يملك `Quantity`. والمفتاحُ يأتي منه والتسميةُ هنا.
 */
export const ORDER_BUCKET_AR: Record<OrderBucket, string> = {
  LIVE: 'الجارية',
  REQUEST: 'الطلب',
  INSPECTION: 'الفحص',
  PAYMENT: 'الدفع',
  TRANSFER: 'نقل الملكية',
  DONE: 'مكتملة',
  TROUBLED: 'متعثرة',
};

/**
 * حالُ الضمان بالعربية — **خمسٌ لا اثنتان**.
 *
 * و`Record<EscrowStatus, …>` يفرض الاكتمال (البوابة ٥٩): حالٌ تُضاف
 * إلى التعداد بلا تسمية تُعرض مفتاحًا لاتينيًّا، أو — أسوأ — تسقط
 * في فرعِ «أُفرج» فتقول للمعرض إنّ مالَه وصله.
 */
export const ESCROW_STATUS_AR: Record<EscrowStatus, { text: string; tone: 'warn' | 'accent' | 'neutral' }> = {
  PENDING: { text: 'لم يقبض', tone: 'neutral' },
  HELD: { text: 'محتجز', tone: 'warn' },
  RELEASED: { text: 'أفرج', tone: 'accent' },
  REFUNDED: { text: 'رد للمشتري', tone: 'neutral' },
  PARTIAL_REFUND: { text: 'رد جزئي', tone: 'warn' },
};

/** شرائحُ `D7` — و«اشتراك» ليست منها، وسببُها في `dealer-money.ts`. */
export const INVOICE_BUCKET_AR: Record<InvoiceBucket, string> = {
  ALL: 'الكل',
  SALES: 'مبيعات',
  COMMISSION: 'عمولة',
};

/**
 * حالُ الفاتورة لدى هيئة الزكاة والضريبة والجمارك.
 *
 * **ولا تُقال «مرسلة» عن `ISSUED`**: صدرت عندنا ولم تبلغ الهيئة بعد،
 * وقولُ غيرِ ذلك وعدٌ مُخلَف في أمرٍ نظاميّ.
 */
export const INVOICE_STATUS_AR: Record<InvoiceStatus, { text: string; tone: 'accent' | 'warn' | 'neutral' | 'danger' }> = {
  ISSUED: { text: 'قيد الإرسال', tone: 'warn' },
  REPORTED: { text: 'مرسلة', tone: 'accent' },
  REPORT_FAILED: { text: 'تعذر الإرسال', tone: 'danger' },
  CANCELLED: { text: 'ملغاة', tone: 'neutral' },
};

/** نوعُ التوريد في سطر الفاتورة. */
export const SUPPLY_TYPE_AR: Record<SupplyType, string> = {
  VEHICLE: 'بيع مركبة',
  COMMISSION: 'عمولة المنصة',
  SERVICE: 'خدمة',
  ADMIN_FEE: 'رسم إداري',
  DISBURSEMENT: 'صرف نيابة عنك',
};

/** أنواعُ حركة المال في `D8`. */
export const LEDGER_KIND_AR: Record<DealerLedgerKind, string> = {
  SETTLEMENT: 'تحويل صادر',
  ESCROW_HELD: 'احتجاز ضمان',
  REFUND: 'رد كامل للمشتري',
  PARTIAL_REFUND: 'رد جزئي',
};

/** شرائحُ `D4` — والترميزُ يسمّي الثالثة بنتيجتها لا بحالتها. */
export const AUCTION_BUCKET_AR: Record<AuctionBucket, string> = {
  LIVE: 'جارية',
  SCHEDULED: 'مجدولة',
  UNMET: 'انتهت دون الاحتياطي',
};

/** أسماءُ أعمدة ملفّ الاستيراد — `D3`. */
export const IMPORT_COLUMN_AR: Record<ImportColumn, string> = {
  vin: 'الرقم التسلسلي',
  brand: 'الماركة',
  model: 'الطراز',
  trim: 'الفئة',
  year: 'سنة الصنع',
  mileage: 'الممشى',
  price: 'السعر المطلوب',
  colour: 'اللون الخارجي',
  branch: 'الفرع',
};

export const IMPORT_SEVERITY_AR: Record<ImportSeverity, string> = {
  ERROR: 'خطأ',
  WARNING: 'تحذير',
  INFO: 'معلومة',
};

/**
 * صياغةُ سبب الملاحظة — **بعموده وقيمته**.
 *
 * «صفّ مرفوض» وحدها تجعل من رفع الملفّ يفتحه يبحث عمّا لا يعرفه،
 * و«الفرع ‹جدة› غير موجود في معرضك» تقول الموضع والقيمة معًا.
 */
export function importNoteAr(note: ImportNote): string {
  const column = note.column === undefined ? '' : IMPORT_COLUMN_AR[note.column];
  const value = note.value === undefined || note.value === '' ? '' : `«${note.value}» `;

  switch (note.code) {
    case 'VIN_INVALID':
      return `${column} ${value}غير صالح — سبع عشرة خانة بلا I وO وQ`;
    case 'BRANCH_UNKNOWN':
      return `${column} ${value}غير موجود في معرضك`;
    case 'YEAR_OUT_OF_RANGE':
      return `${column} ${value}خارج المدى`;
    case 'ALREADY_EXISTS':
      return 'مركبة موجودة أصلا — تحدث ولا تضاف';
    case 'PRICE_ZERO':
      return `${column} صفر — تدخل مسودة ولا تنشر`;
    case 'BRAND_REQUIRED':
      return `${column} مطلوب للمركبة الجديدة — الرقم التسلسلي لا يحمل الطراز`;
    case 'BRAND_UNKNOWN':
      /** **والماركةُ مؤنّثة** — «ليس» عنها خطأٌ نحويّ يقرؤه من رفع الملفّ. */
      return `${column} ${value}ليست في الكتالوج`;
    case 'MODEL_REQUIRED':
      return `${column} مطلوب للمركبة الجديدة`;
    case 'MODEL_UNKNOWN':
      return `${column} ${value}ليس من طرازات هذه الماركة`;

    case 'TRIM_REQUIRED':
      return `${column} مطلوب — ومنه تجلب المواصفة`;
    case 'TRIM_UNKNOWN':
      /** **والفئةُ مؤنّثة** كالماركة. */
      return `${column} ${value}ليست من فئات هذا الطراز`;
    case 'YEAR_UNRESOLVED':
      return `${column} غير موجود ولا يستخرج من الرقم التسلسلي`;
    case 'CATALOGUE_MISMATCH':
      return 'الماركة أو الطراز لم يطابق الكتالوج';
  }
}

/**
 * مطابقةُ ترويسة الملفّ بعمودٍ نعرفه.
 *
 * **وموضعُها `labels` لا النطاق** (البوابة ١٧): المطابقةُ تقرأ أسماءً
 * عربية، والنطاقُ لا يحمل حرفًا عربيًّا. والأسماءُ العربية **تُشتقّ من
 * `IMPORT_COLUMN_AR` لا تُكتب ثانيةً** — فاسمٌ يُعدَّل في القالب
 * يُطابَق في الملفّ، ولا نسختان تتباعدان.
 */
const HEADER_ALIASES: Record<string, ImportColumn> = {
  vin: 'vin',
  make: 'brand',
  brand: 'brand',
  model: 'model',
  trim: 'trim',
  'model year': 'year',
  year: 'year',
  mileage: 'mileage',
  asking: 'price',
  price: 'price',
  colour: 'colour',
  color: 'colour',
  branch: 'branch',
  ...Object.fromEntries(
    Object.entries(IMPORT_COLUMN_AR).map(([key, name]) => [name.toLowerCase(), key as ImportColumn]),
  ),
};

export function importColumnOf(header: string): ImportColumn | null {
  return HEADER_ALIASES[header.trim().toLowerCase()] ?? null;
}

/** **واللونُ مطلوبٌ في `Vehicle`** — وغيابُه يُملأ بقولٍ لا بفراغ. */
export const COLOUR_UNSPECIFIED = 'غير محدد';

/**
 * أصنافُ مصروف المعرض — **بتعهّدٍ للمُصرِّف** (البوابة ٥٩): قيمةٌ
 * تُضاف إلى التعداد بلا تسميةٍ تُعرض خامًا في البطاقة.
 */
export const DEALER_EXPENSE_KIND_AR = {
  RENT: 'إيجار',
  SALARIES: 'رواتب',
  MARKETING: 'تسويق وإعلان',
  UTILITIES: 'كهرباء وماء واتصالات',
  GOVERNMENT: 'رسوم حكومية',
  FACILITY: 'صيانة المبنى والمعدات',
  OTHER: 'أخرى',
} satisfies Record<DealerExpenseKind, string>;

/**
 * أسماءُ موديولز اللوحة كما تُعرض للمشغّل.
 *
 * **والخريطةُ تحمل تعهّدَ مفاتيحها** (`Record<DealerModule, …>`): موديولٌ
 * يُضاف إلى `DEALER_MODULE` ويُنسى هنا يُعرض بمفتاحه الخام — وهي البوابة
 * ٥٩ بعينها.
 */
export const DEALER_MODULE_AR: Record<DealerModule, string> = {
  dealer_branches: 'الفروع',
  dealer_customers: 'العملاء',
  dealer_expenses: 'المصروفات',
  dealer_pos: 'نقطة البيع',
  dealer_installments: 'التقسيط',
  dealer_landing: 'موقع المعرض',
};
