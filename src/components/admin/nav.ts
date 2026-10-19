import type { Permission } from '@/lib/domain/permissions';

/**
 * بادئةُ عناوين مجموعات الإعدادات — **تُقرأ لا تُكرَّر**.
 *
 * يميّز بها الشريطُ ما يُضبط ممّا يُعالَج، وتقرؤها صفحةُ الإعدادات
 * لتبني أقسامَها، ويحرسها اختبار. وثلاثةُ مواضع تكتب «الإعدادات»
 * حرفيًّا تتباعد أوّل إعادة تسمية.
 */
export const SETTINGS_PREFIX = 'الإعدادات';

/** مدخلُ الإعدادات الوحيد — ومنه تُفتح أقسامُها. */
export const SETTINGS_HOME = '/admin/settings';

/**
 * ═══ بيانات المِلاحة — في ملفّها لا في المكوّن ═══
 *
 * فُصلت عن `AdminShell.tsx` لأن **ترتيب اللوحة قرارُ بنية يُختبَر**:
 * لا بندَ مكرَّر المسار، ولا سجلًّا تحت «الإعدادات»، وكلُّ شارةٍ
 * تقابل بندًا. واستيرادُ ملفٍّ فيه JSX من اختبارٍ يسقط في التحليل.
 *
 */
/**
 * قائمة لوحة الأدمن — **٣٠ بندًا في ٤ مجموعات** كما في ترميز A1.
 *
 * لوحة الأدمن عربية فقط في المرحلة الأولى (قرار: أداة داخلية بلا ترجمة)،
 * فالتسميات ثابتة هنا لا في ملفات الترجمة. وهذه تسميات تنقّل لا محتوى —
 * المحتوى كله من Prisma كما تشترط القاعدة.
 *
 * `href: null` يعني بندًا بلا شاشة مصمَّمة: يُعرض معطّلًا بوسم «قريبًا»
 * ولا يُبنى شيء بلا ترميز (DESIGN-DECISIONS ١٠).
 */
export type AdminNavItem = {
  label: string;
  href: string | null;
  badge?: number;
  /**
   * سطرٌ يقول **ما يُضبط هنا** — تقرؤه صفحة الإعدادات لا الشريط.
   *
   * وقائمةُ روابطٍ بلا وصفٍ تجعل من يبحث عن «أين أغيّر مهلة الدفع»
   * يفتح أربع شاشاتٍ ليجدها.
   */
  description?: string;
  /** بند بلا صلاحية لا يُعرض معطّلًا — يُخفى. عرضه يكشف بنية اللوحة. */
  permission?: Permission;
};

export type AdminNavGroup = {
  title: string;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    /** ما يُفتح كل صباح — الأرقام ثم ما ينتظر عملًا. */
    title: 'المتابعة',
    items: [
      /**
       * **ولوحة القيادة بندٌ واحد.** «المتابعة اليومية» و«المالية»
       * تابان داخلها (A2 · A3)، والشريط في التصميم لا يذكرهما — وكانا
       * بندين هنا، فصارت الشاشةُ الواحدة ثلاثًا.
       */
      { label: 'لوحة القيادة', href: '/admin', permission: 'dashboard.view' },
      { label: 'التقارير والتصدير', href: '/admin/exports' },
      /**
       * ═══ والسجلّان قراءةٌ لا ضبط ═══
       *
       * «دفتر الحسابات» و«سجل العمليات» كانا تحت «الإعدادات» — وهما
       * لا يُضبط فيهما شيء: الأوّل قيودٌ تُقرأ، والثاني أثرٌ لا
       * يُعدَّل. **ومجموعةٌ اسمُها «الإعدادات» تضمّ سجلًّا تَعِد بما
       * لا تفي به**: من دخلها ليغيّر شيئًا وجد جدولًا، ومن أراد
       * الجدول لم يفتّش عنه في الإعدادات.
       *
       * فموضعُهما مع ما يُقرأ: المتابعة.
       */
      /**
       * **ومجرى النشاط غيرُ سجلّ العمليات.** الثاني أثرُ الأدمن وحده،
       * والأوّل ما يفعله السوق بنفسه: إعلانٌ نُشر، عرضٌ قُبل، دفعةٌ
       * ارتدّت. وكانت اللوحة تُجيب «كم» و«ما ينتظرني» ولا تُجيب
       * «ماذا يحدث».
       */
      { label: 'مجرى النشاط', href: '/admin/activity', permission: 'audit.view' },
      { label: 'دفتر الحسابات', href: '/admin/ledger', permission: 'finance.view' },
      { label: 'سجل العمليات', href: '/admin/audit', permission: 'audit.view' },
    ],
  },
  {
    /** **الإعلانات في مكانٍ واحد** — كانت مفرّقةً بين ثلاث مجموعات. */
    title: 'الإعلانات',
    items: [
      { label: 'إعلانات تنتظر المراجعة', href: '/admin/listings', permission: 'listings.review' },
      { label: 'كل الإعلانات', href: '/admin/all-listings', permission: 'listings.review' },
      { label: 'المزادات', href: '/admin/auctions', permission: 'orders.view' },
      { label: 'العروض والمساومات', href: '/admin/offers', permission: 'orders.view' },
    ],
  },
  {
    title: 'الطلبات والمبيعات',
    items: [
      { label: 'الطلبات', href: '/admin/orders', permission: 'orders.view' },
      { label: 'المدفوعات والضمان', href: '/admin/settlements', permission: 'finance.view' },
      { label: 'تحويل مستحقات البائعين', href: '/admin/payouts', permission: 'finance.view' },
      /**
       * **وطابورٌ ثانٍ لا بندٌ واحد**: الطرفُ مزوّدٌ لا بائع،
       * والحسابُ `PROVIDER_PAYABLE` لا `SELLER_PAYABLE`، ومن يصرف
       * للمزوّدين يفتح شاشةً يرى فيها مزوّديه وحدهم — لا قائمةً
       * مخلوطةً يبحث فيها عن سبعةٍ بين مئة بائع.
       */
      { label: 'صرف مستحقات المزودين', href: '/admin/provider-payouts', permission: 'finance.view' },
      { label: 'الخلافات', href: '/admin/disputes', permission: 'orders.view' },
      { label: 'الشكاوى', href: '/admin/reports', permission: 'reports.handle' },
      /**
       * ═══ وطابورُ الخدمات طابور ═══
       *
       * كان في مجموعةٍ مع «الخدمات وأسعارها» و«المزوّدون» بتعليلٍ
       * مكتوب: «المزوّدون في مكانٍ واحد — وطلباتُهم معهم». **وهذا
       * عكسُه بأمر المالك**: الفصلُ بين ما يُضبط وما يُعالَج.
       *
       * وسعرُ خدمةٍ يُضبط مرّةً في الشهر، وطابورُها يُعالَج كل يوم —
       * فجمعُهما يجعل المشغّل يمرّ على شاشتَي إعدادٍ ليبلغ عملَه.
       */
      { label: 'طلبات الخدمات', href: '/admin/service-requests', permission: 'serviceRequests.handle' },
      { label: 'طلبات التمويل', href: null },
    ],
  },
  {
    /** **العملاء في مكانٍ واحد** — والتوثيق منهم لا من الإعدادات. */
    title: 'العملاء',
    items: [
      { label: 'العملاء', href: '/admin/users', permission: 'users.view' },
      { label: 'المعارض والتجار', href: '/admin/dealers', permission: 'users.view' },
      { label: 'طلبات توثيق الهوية', href: '/admin/identity', permission: 'identity.review' },
    ],
  },
  {
    title: 'التسويق والإعلان',
    items: [
      { label: 'الإعلانات الممولة', href: '/admin/ads', permission: 'finance.view' },
      { label: 'الحملات التسويقية', href: '/admin/campaigns' },
    ],
  },
  {
    /**
     * ═══ الإعدادات آخرًا وبتسلسل ═══
     *
     * المال ثمّ المحتوى ثمّ النظام. وكانت خمسة عشر بندًا بلا ترتيب:
     * الكتالوج بين المهل والخدمات، والباقات بين الأسئلة والمساحات.
     */
    title: 'الإعدادات — المال',
    items: [
      { label: 'الرسوم والضرائب', href: '/admin/tax', permission: 'finance.view', description: 'نسب الضريبة وقواعد الإصدار ومن يصدر الفاتورة.' },
      { label: 'الباقات والعمولة', href: '/admin/plans', permission: 'finance.view', description: 'باقات البائعين ونسب العمولة على كل بيعة.' },
      { label: 'طرق الدفع', href: '/admin/payments', permission: 'finance.view', description: 'أي بوابة تستقبل كل غرض، ورسوم المعالجة.' },
      /**
       * **والتمويل إعدادُ منتجٍ لا تقريرُ أرباح.** `/admin/finance`
       * لوحةُ الربح والخسارة، وهذه الأربعةُ أرقام تبني «أو شهريا»
       * على كلّ بطاقة — وكانت لا تتغيّر إلّا بنشر (البوابة ٦٣).
       */
      { label: 'التمويل والقسط', href: '/admin/financing', permission: 'finance.view', description: 'الدفعة الأولى والمدة ونسبة الربح وأقل سعر يظهر له قسط.' },
      { label: 'المدد والمهل', href: '/admin/deadlines', permission: 'finance.view', description: 'مهلة الدفع ونافذة النقل وقرار البائع وغيرها.' },
    ],
  },
  {
    title: 'الإعدادات — المحتوى',
    items: [
      /**
       * **والخدمةُ وسعرُها تعريفٌ كالكتالوج** — موضعُها حيث يُعرَّف
       * ما يعرضه المنتج، لا مع الطابور الذي يُعالَج يوميًّا.
       */
      { label: 'الخدمات وأسعارها', href: '/admin/services', permission: 'services.manage', description: 'الخدمات المعروضة وأسعارها ومهلة تنفيذها.' },
      { label: 'مزودو الخدمات', href: '/admin/providers', permission: 'services.manage', description: 'من ينفذ الخدمات، وتغطيته، وعمولتنا منه.' },
      { label: 'قالب الفحص', href: '/admin/inspection-template', permission: 'services.manage', description: 'أقسام الفحص وبنوده وأوزانها — يحررها المشغل بلا نشر.' },
      { label: 'الماركات والموديلات', href: '/admin/catalog/brands', permission: 'catalog.manage', description: 'الماركات والموديلات والفئات التي تبنى منها الإعلانات.' },
      { label: 'أنواع الهياكل', href: '/admin/catalog/body-types', permission: 'catalog.manage', description: 'أنواع الهياكل وصورها وترتيب عرضها.' },
      { label: 'المميزات', href: '/admin/catalog/features', permission: 'catalog.manage', description: 'المميزات التي يختارها البائع ويرشح بها المشتري.' },
      /**
       * **و«مساحات الإعلانات» حُذفت من هنا**: مسارُها `/admin/ads`
       * نفسُه الذي تحته «الإعلانات المموّلة» في «التسويق» — بندان
       * باسمين يفتحان الصفحة ذاتها. ومن ضغط الثاني ظنّ أنه أخطأ.
       * (والشاشة تجمع A30 وA31 عمدًا: من يعطّل مساحةً يرى ما سيوقفه.)
       */
      { label: 'قواعد المزادات', href: '/admin/auction-settings', permission: 'finance.view', description: 'الحد الأدنى للمزايدة والتمديد التلقائي والعربون.' },
      { label: 'الأسئلة الشائعة', href: '/admin/faq', permission: 'notifications.manage', description: 'الأسئلة الشائعة ومواضع ظهورها.' },
      /**
       * **وقنوات الدعم محتوى لا نظام**: هي ما يظهر للزائر في صفحة
       * «تواصل معنا» — موضعُها مع الأسئلة الشائعة والصفحات القانونية،
       * لا مع المفاتيح والبيئات.
       */
      { label: 'قنوات الدعم', href: '/admin/contact', permission: 'notifications.manage', description: 'الهاتف والواتساب والبريد الظاهرة في «تواصل معنا».' },
      { label: 'الصفحات القانونية', href: '/admin/legal', permission: 'notifications.manage', description: 'الشروط والخصوصية ونسخها المنشورة.' },
      /**
       * **وعلاماتُ الموثوقية محتوًى كالقانونيّة**: ما يراه الزائر في
       * التذييل. وكانت صفوفُها بلا كاتبٍ إطلاقًا — تُعرض أربعُ جهاتٍ
       * نظامية بلا رقمٍ واحد، والوثيقة تقول إنّ الرقم «يُضبط من
       * اللوحة». (طلب المالك ٢٠٢٦-١٠-١٨، وبابُه ٢٠٢٦-١٠-١٩.)
       */
      { label: 'علامات الموثوقية', href: '/admin/trust-marks', permission: 'notifications.manage', description: 'شعارات الجهات في التذييل وأرقام تسجيلها.' },
    ],
  },
  {
    title: 'الإعدادات — النظام',
    items: [
      { label: 'الإشعارات والقوالب', href: '/admin/notifications', permission: 'notifications.manage', description: 'قوالب الرسائل ومتى ترسل.' },
      { label: 'إشعارات الجوال', href: '/admin/push', description: 'قنوات إشعارات الجوال وما يفتح منها افتراضا.' },
      { label: 'الربط بالخدمات الخارجية', href: '/admin/integrations', permission: 'integrations.view', description: 'مفاتيح الربط وبيئاتها وحال كل تكامل.' },
      { label: 'الفريق والصلاحيات', href: '/admin/team', permission: 'team.manage', description: 'من في الفريق وبأي دور، ومصفوفة الصلاحيات.' },
    ],
  },
];

/**
 * ═══ المجموعات المعروضة — والإعدادات بندٌ واحد ما لم تكن فيها ═══
 *
 * ستّةَ عشرَ بندًا من ثلاثين كانت إعدادات: تُضبط مرّةً في الشهر
 * وتزاحم العمل اليوميّ في كل يوم. **فتُطوى خلف مدخلٍ واحد، فإن
 * دخلتَها انفتحت أقسامُها** — فلا تفقد التنقّل بينها، ولا تحملها
 * معك وأنت تعالج طابورًا.
 *
 * والمنطق هنا لا في المكوّن: **ترتيب اللوحة قرارُ بنية يُختبَر**.
 */
export function visibleGroups(activeHref?: string): readonly AdminNavGroup[] {
  const isSettings = (group: AdminNavGroup): boolean => group.title.startsWith(SETTINGS_PREFIX);

  const inside =
    activeHref !== undefined
    && (activeHref === SETTINGS_HOME
      || ADMIN_NAV.some(
        (group) => isSettings(group) && group.items.some((item) => item.href === activeHref),
      ));

  if (inside) return ADMIN_NAV;

  return [
    ...ADMIN_NAV.filter((group) => !isSettings(group)),
    { title: SETTINGS_PREFIX, items: [{ label: 'كل الإعدادات', href: SETTINGS_HOME }] },
  ];
}
