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
  /**
   * **يضيء ولو لم يطابق المسار**: «كل الإعدادات» مسارُه
   * `/admin/settings` والداخلُ في `/admin/tax` — فبلا هذا يُقرأ
   * الشريطُ كأنّ لا شيء مفتوحًا.
   */
  active?: boolean;
};

export type AdminNavGroup = {
  title: string;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    /**
     * ═══ الترتيب — قرار المالك ٢٠٢٦-١١-٢٨ ═══
     *
     * «أول شي تظهر لوحة القيادة ثم الإعلانات ثم العملاء … ثم التجار
     * والمعارض … نتبع ستاندرت عالمي بحيث تصبح مألوفة».
     *
     * والترتيبُ المألوف في لوحات الإدارة واحد: **نظرةٌ عامة، ثمّ ما
     * يُعرض، ثمّ من يَعرض ومن يشتري، ثمّ ما يقع بينهم، ثمّ المال، ثمّ
     * التسويق، ثمّ ما يُقرأ، ثمّ ما يُضبط**. ومن فتح لوحةً جديدة
     * يتوقّعه، فلا يتعلّم ترتيبَنا نحن.
     *
     * **ولوحةُ القيادة أوّلًا وحدها** — لا تحت عنوانٍ يزاحمها.
     */
    title: 'نظرة عامة',
    items: [
      { label: 'لوحة القيادة', href: '/admin', permission: 'dashboard.view' },
      /**
       * **ومجرى النشاط غيرُ سجلّ العمليات.** الثاني أثرُ الأدمن وحده،
       * والأوّل ما يفعله السوق بنفسه: إعلانٌ نُشر، عرضٌ قُبل، دفعةٌ
       * ارتدّت. وموضعُه مع النظرة العامة لأنه يُقرأ كلَّ صباح.
       */
      { label: 'مجرى النشاط', href: '/admin/activity', permission: 'audit.view' },
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
    /**
     * **والعملاءُ هم الأفراد** — بنصّ طلب المالك: «العملاء ويقصد بهم
     * مستخدمي المنصة (المستخدمين الأفراد)». والتوثيقُ طابورُهم، فهو
     * معهم لا في الإعدادات.
     */
    title: 'العملاء',
    items: [
      { label: 'العملاء', href: '/admin/users', permission: 'users.view' },
      { label: 'طلبات توثيق الهوية', href: '/admin/identity', permission: 'identity.review' },
    ],
  },
  {
    /**
     * **والمعارضُ جمهورٌ آخر لا صنفٌ من العملاء**: لها لوحتُها
     * وباقاتُها وسجلُّها التجاريّ، ومن يفتحها يفتحها لعملٍ آخر.
     */
    title: 'المعارض والوكالات',
    items: [
      { label: 'المعارض والتجار', href: '/admin/dealers', permission: 'users.view' },
    ],
  },
  {
    /**
     * ═══ والمزوّدون جمهورٌ ثالث — سأل عنهم المالك ٢٠٢٦-١١-٢٨ ═══
     *
     * «وين أحصل قائمة المزودين مثل ما يوجد قائمة للعملاء وقائمة
     * للتجار؟» — والقائمةُ مبنيّةٌ منذ `A28`، **وموضعُها كان تحت
     * الإعدادات**: فمن بحث عنها حيث يبحث عن العملاء والتجار لم يجدها.
     *
     * **وسعرُ الخدمة يبقى إعدادًا**: يُضبط مرّةً في الشهر. أمّا من
     * ينفّذها — التزامُه وتأخّرُه وإيقافُه — فعملٌ يوميّ كالعملاء.
     */
    title: 'المزودون',
    items: [
      { label: 'مزودو الخدمات', href: '/admin/providers', permission: 'services.manage' },
      { label: 'صرف مستحقات المزودين', href: '/admin/provider-payouts', permission: 'finance.view' },
    ],
  },
  {
    title: 'الطلبات والمبيعات',
    items: [
      { label: 'الطلبات', href: '/admin/orders', permission: 'orders.view' },
      { label: 'المدفوعات والضمان', href: '/admin/settlements', permission: 'finance.view' },
      { label: 'الخلافات', href: '/admin/disputes', permission: 'orders.view' },
      { label: 'الشكاوى', href: '/admin/reports', permission: 'reports.handle' },
      /**
       * ═══ وطابورُ الخدمات طابور ═══
       *
       * وسعرُ خدمةٍ يُضبط مرّةً في الشهر، وطابورُها يُعالَج كل يوم —
       * فجمعُهما يجعل المشغّل يمرّ على شاشتَي إعدادٍ ليبلغ عملَه.
       */
      { label: 'طلبات الخدمات', href: '/admin/service-requests', permission: 'serviceRequests.handle' },
      { label: 'طلبات التمويل', href: null },
    ],
  },
  {
    /**
     * **والمالُ مجموعةٌ قائمة**: من يصرف يفتحها وحدها، ولا يمرّ على
     * طابور الإعلانات ليبلغ تحويلًا.
     */
    title: 'المال',
    items: [
      { label: 'تحويل مستحقات البائعين', href: '/admin/payouts', permission: 'finance.view' },
      { label: 'دفتر الحسابات', href: '/admin/ledger', permission: 'finance.view' },
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
     * **وما يُقرأ ولا يُضبط**: تقريرٌ يُصدَّر وأثرٌ لا يُعدَّل.
     * ومجموعةٌ اسمُها «الإعدادات» تضمّ سجلًّا تَعِد بما لا تفي به.
     */
    title: 'التقارير والسجلات',
    items: [
      { label: 'التقارير والتصدير', href: '/admin/exports' },
      { label: 'سجل العمليات', href: '/admin/audit', permission: 'audit.view' },
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
       * **وردُّ البوّابة دليلٌ لا سجلّ**: `WebhookEvent` يُكتب منذ بُني
       * المسار **ولا يقرؤه شيء** (البوابة ٦٤) — فحين يسقط دفعٌ يكون
       * ما قالته البوّابة في الجدول ولا بابَ إليه. (وبابُه ٢٠٢٦-١٠-١٩.)
       */
      { label: 'ردود بوابة الدفع', href: '/admin/webhooks', permission: 'finance.view', description: 'ما قالته البوابة وما ترتب عليه عندنا.' },
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
      { label: 'قالب الفحص', href: '/admin/inspection-template', permission: 'services.manage', description: 'أقسام الفحص وبنوده وأوزانها — يحررها المشغل بلا نشر.' },
      { label: 'الماركات والموديلات', href: '/admin/catalog/brands', permission: 'catalog.manage', description: 'الماركات والموديلات والفئات التي تبنى منها الإعلانات.' },
      { label: 'أنواع الهياكل', href: '/admin/catalog/body-types', permission: 'catalog.manage', description: 'أنواع الهياكل وصورها وترتيب عرضها.' },
      { label: 'المميزات', href: '/admin/catalog/features', permission: 'catalog.manage', description: 'المميزات التي يختارها البائع ويرشح بها المشتري.' },
      { label: 'المدن', href: '/admin/catalog/cities', permission: 'catalog.manage', description: 'المدن المعروضة في المرشحات ومعالج البيع ومناطقها.' },
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
      { label: 'الصفحات القانونية', href: '/admin/legal', permission: 'notifications.manage', description: 'الشروط والخصوصية، ونسخها وسجل قبولها.' },
      /**
       * **وعلاماتُ الموثوقية محتوًى كالقانونيّة**: ما يراه الزائر في
       * التذييل. وكانت صفوفُها بلا كاتبٍ إطلاقًا — تُعرض أربعُ جهاتٍ
       * نظامية بلا رقمٍ واحد، والوثيقة تقول إنّ الرقم «يُضبط من
       * اللوحة». (طلب المالك ٢٠٢٦-١٠-١٨، وبابُه ٢٠٢٦-١٠-١٩.)
       */
      { label: 'علامات الموثوقية', href: '/admin/trust-marks', permission: 'notifications.manage', description: 'شعارات الجهات في التذييل وأرقام تسجيلها.' },
      /**
       * **ونصُّ السيو محتوًى كالقانونيّة**: ما يقرؤه محرّكُ البحث
       * قبل أن يقرأه زائر. وكان `SeoTemplate` **بلا قارئٍ ولا
       * محرِّر** — صفًّا مزروعًا لا يلمسه استعلام، وصفحاتُ الهبوط
       * تطبع من ملفّ الرسائل فيحتاج العنوانُ نشرًا كاملًا.
       * (القرار ٢٦، وبابُه ٢٠٢٦-١٠-١٩.)
       */
      { label: 'نصوص صفحات البحث', href: '/admin/seo', permission: 'notifications.manage', description: 'عنوان صفحات الهبوط ووصفها وفقراتها.' },
    ],
  },
  {
    title: 'الإعدادات — النظام',
    items: [
      { label: 'الإشعارات والقوالب', href: '/admin/notifications', permission: 'notifications.manage', description: 'قوالب الرسائل ومتى ترسل.' },
      { label: 'إشعارات الجوال', href: '/admin/push', description: 'قنوات إشعارات الجوال وما يفتح منها افتراضا.' },
      { label: 'الربط بالخدمات الخارجية', href: '/admin/integrations', permission: 'integrations.view', description: 'مفاتيح الربط وبيئاتها وحال كل تكامل.' },
      /**
       * **ومفتاحُ الواجهة العامّة قفلٌ بلا مفتاح.** ثلاثةُ مسارات تحت
       * `/api/public/v1` تطلبه، والمصادقةُ و`mintKey` والحدُّ كلُّها
       * مبنيّة — **ولا شيء يُصدر مفتاحًا**: لا بذرة ولا شاشة ولا مسار.
       * فالواجهةُ العامّة لم تكن تُنادى في أيّ بيئةٍ وُجدت.
       * (وبابُه ٢٠٢٦-١٠-١٩.)
       */
      { label: 'مفاتيح الواجهة العامة', href: '/admin/api-keys', permission: 'integrations.view', description: 'من يقرأ كتالوجنا من خارج الموقع وبأي حد.' },
      { label: 'الفريق والصلاحيات', href: '/admin/team', permission: 'team.manage', description: 'من في الفريق وبأي دور، ومصفوفة الصلاحيات.' },
    ],
  },
];

/** أقسامُ الإعدادات بعناوينها بلا البادئة — يقرؤها مركزُ الإعدادات وشريطُه. */
export function settingsSections(): readonly AdminNavGroup[] {
  return ADMIN_NAV.filter((group) => group.title.startsWith(SETTINGS_PREFIX)).map((group) => ({
    ...group,
    title: group.title.replace(`${SETTINGS_PREFIX} — `, ''),
  }));
}

/** أهذا المسارُ إعدادٌ — مركزُها أو شاشةٌ من شاشاتها؟ */
export function isSettingsHref(href: string | undefined): boolean {
  if (href === undefined) return false;
  if (href === SETTINGS_HOME) return true;
  return ADMIN_NAV.some(
    (group) =>
      group.title.startsWith(SETTINGS_PREFIX) && group.items.some((item) => item.href === href),
  );
}

/**
 * ═══ الشريطُ لا يفتح الإعدادات أبدًا — قرار المالك ٢٠٢٦-١١-٢٨ ═══
 *
 * «صفحة الإعدادات بمجرّد الضغط عليها تظهر العديد من الأقسام تحتها
 * بشكل يشتّت المستخدم وتكثر الصفحات في القائمة الجانبية».
 *
 * وكان الشريطُ يطويها خارجها **ويفتح ستّةً وعشرين بندًا داخلها** —
 * فمن دخل ليغيّر نسبةَ ضريبةٍ وجد شريطَه وقد تضاعف، وفقد ترتيبَ
 * اللوحة الذي حفظه. **والطيُّ الذي ينقضُ نفسَه عند أوّل استعمالٍ ليس
 * طيًّا.**
 *
 * فالشريطُ بندٌ واحد في الحالين، والتنقّلُ بين الإعدادات **داخل
 * الصفحة** (شريطُ أقسامٍ في `AdminShell`): وهو الشكلُ المألوف في
 * لوحات الإدارة — منطقةٌ لها مِلاحتُها، لا ملاحةٌ تنتفخ في الجذر.
 */
export function visibleGroups(activeHref?: string): readonly AdminNavGroup[] {
  const isSettings = (group: AdminNavGroup): boolean => group.title.startsWith(SETTINGS_PREFIX);

  return [
    ...ADMIN_NAV.filter((group) => !isSettings(group)),
    {
      title: SETTINGS_PREFIX,
      items: [
        {
          label: 'كل الإعدادات',
          href: SETTINGS_HOME,
          /** **والبندُ مضيءٌ داخل أيّ إعداد** — فلا يضيع الداخلُ عن موضعه. */
          ...(isSettingsHref(activeHref) ? { active: true } : {}),
        },
      ],
    },
  ];
}
