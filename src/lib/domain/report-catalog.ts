import type { Permission } from './permissions';

/**
 * ═══ A36 — كتالوج التقارير · مفاتيح لا جُمل ═══
 *
 * **والنطاق يعيد مفاتيح**، والصياغة في `src/lib/labels/reports.ts`
 * (البوابة ١٧). كتبتُ الأسماء والمحتوى هنا أوّلًا فأخرجت البوابة ٢٥
 * سطرًا — والقاعدة ليست ترتيبًا: النطاق لا يعرف اللغة.
 *
 * ═══ ولا تُبنى التقارير من الشاشات ═══
 *
 * التصميم يكتبها حرفيًّا: **كل تقرير استعلامٌ مسمّى على القراءة**. فما
 * يُصدَّر ليس ما تعرضه شاشةٌ ما (وهي تعرض صفحةً واحدة بترتيبٍ ما)، بل
 * استعلامٌ له اسمٌ وأعمدةٌ ثابتة — يُقرأ بعد سنةٍ فيُعطي الشكل نفسه.
 */

export type ReportKey =
  | 'sales_commissions'
  | 'ledger'
  | 'inventory_aging'
  | 'auction_performance'
  | 'service_requests'
  | 'customers';

/** الجدولة المقصودة — مفتاحٌ تصوغه طبقة العرض */
export type ReportSchedule = 'weekly_sunday' | 'weekly' | 'monthly' | 'on_demand';

export type ReportDef = {
  key: ReportKey;
  schedule: ReportSchedule;
  /** من يفتحه — الصلاحية، لا بريدٌ يُرسَل إليه */
  permission: Permission;
  /**
   * **يحمل بيانات شخصية.** كل تصديرٍ منه يُقيَّد باسم من صدّره ووقته
   * وعدد صفوفه — وهو الفرق بين تقريرٍ مجمَّع وقائمةِ ناس.
   */
  personal: boolean;
};

/**
 * ═══ ستّة تقارير مبنيّة، لا اثنا عشر مكتوبًا ═══
 *
 * التصميم يعرض اثني عشر. والمبنيّ هنا ما له مصدرٌ في قاعدتنا اليوم:
 * تقرير المستثمرين يحتاج CAC وLTV والحرق — أرقامًا لا نملك مصادرها،
 * وتقريرٌ يُنزَّل بأعمدةٍ فارغة أسوأ من تقريرٍ غير موجود.
 */
export const REPORTS: readonly ReportDef[] = [
  {
    key: 'sales_commissions',
    schedule: 'weekly_sunday',
    permission: 'finance.view',
    personal: false,
  },
  { key: 'ledger', schedule: 'on_demand', permission: 'finance.view', personal: false },
  {
    key: 'inventory_aging',
    schedule: 'weekly',
    permission: 'listings.review',
    personal: false,
  },
  {
    key: 'auction_performance',
    schedule: 'monthly',
    permission: 'orders.view',
    personal: false,
  },
  {
    key: 'service_requests',
    schedule: 'weekly',
    permission: 'serviceRequests.handle',
    personal: false,
  },
  {
    /**
     * **وصلاحيته أضيق من صلاحية عرض العملاء.** من يرى القائمة في
     * الشاشة ليس بالضرورة من يُخرجها ملفًّا من المنصّة ولا يعود.
     */
    key: 'customers',
    schedule: 'on_demand',
    permission: 'users.viewIdentity',
    personal: true,
  },
];

/** حدّ صفوف التصدير — والمهلة تُقاس عليه لا على الرجاء. */
export const EXPORT_ROW_LIMIT = 50_000;

/**
 * **الجدولة معلَنة ولا تُنفَّذ بعد.**
 *
 * لا وظيفة دورية تُولّد تقريرًا ولا تُسلّمه. وحقل `schedule` يقول ما هو
 * مقصود، والشاشة تقول إنه لم يبدأ — فقولُ «أسبوعيًّا» بلا وظيفةٍ تعمل
 * يجعل من يعتمد عليه ينتظر ملفًّا لن يصل.
 */
export const REPORT_SCHEDULING_RUNS = false;
