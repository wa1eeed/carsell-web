import type { Permission } from '@/lib/domain/permissions';

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
      { label: 'تحويل مستحقّات البائعين', href: '/admin/payouts', permission: 'finance.view' },
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
      { label: 'الإعلانات المموّلة', href: '/admin/ads', permission: 'finance.view' },
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
      { label: 'الرسوم والضرائب', href: '/admin/tax', permission: 'finance.view' },
      { label: 'الباقات والعمولة', href: '/admin/plans', permission: 'finance.view' },
      { label: 'طرق الدفع', href: '/admin/payments', permission: 'finance.view' },
      { label: 'المدد والمهل', href: '/admin/deadlines', permission: 'finance.view' },
    ],
  },
  {
    title: 'الإعدادات — المحتوى',
    items: [
      /**
       * **والخدمةُ وسعرُها تعريفٌ كالكتالوج** — موضعُها حيث يُعرَّف
       * ما يعرضه المنتج، لا مع الطابور الذي يُعالَج يوميًّا.
       */
      { label: 'الخدمات وأسعارها', href: '/admin/services', permission: 'services.manage' },
      { label: 'مزوّدو الخدمات', href: '/admin/providers', permission: 'services.manage' },
      { label: 'الماركات والموديلات', href: '/admin/catalog/brands', permission: 'catalog.manage' },
      { label: 'أنواع الهياكل', href: '/admin/catalog/body-types', permission: 'catalog.manage' },
      { label: 'المميّزات', href: '/admin/catalog/features', permission: 'catalog.manage' },
      /**
       * **و«مساحات الإعلانات» حُذفت من هنا**: مسارُها `/admin/ads`
       * نفسُه الذي تحته «الإعلانات المموّلة» في «التسويق» — بندان
       * باسمين يفتحان الصفحة ذاتها. ومن ضغط الثاني ظنّ أنه أخطأ.
       * (والشاشة تجمع A30 وA31 عمدًا: من يعطّل مساحةً يرى ما سيوقفه.)
       */
      { label: 'قواعد المزادات', href: '/admin/auction-settings', permission: 'finance.view' },
      { label: 'الأسئلة الشائعة', href: '/admin/faq', permission: 'notifications.manage' },
      { label: 'الصفحات القانونية', href: '/admin/legal', permission: 'notifications.manage' },
    ],
  },
  {
    title: 'الإعدادات — النظام',
    items: [
      { label: 'الإشعارات والقوالب', href: '/admin/notifications', permission: 'notifications.manage' },
      { label: 'إشعارات الجوال', href: '/admin/push' },
      { label: 'الربط بالخدمات الخارجية', href: '/admin/integrations', permission: 'integrations.view' },
      { label: 'الفريق والصلاحيات', href: '/admin/team', permission: 'team.manage' },
    ],
  },
];
