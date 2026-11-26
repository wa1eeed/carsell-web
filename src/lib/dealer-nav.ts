import type { DealerActor } from '@/lib/domain/dealer-auth';
import type { DealerNavCounts } from '@/lib/domain/dealer-desk';
import { hasModule } from '@/lib/domain/dealer-modules';
import type { Entitlements } from '@/lib/domain/entitlements';

/**
 * ═══ شريطُ لوحة المعرض — بياناتٌ ودالّةٌ خالصة ═══
 *
 * **وأُخرج من المكوّن** لأنّ ترتيبَ الأقسام قرارُ منتجٍ يُفحص بلا
 * متصفّح: اختبارٌ يستورد مكوّنًا فيه JSX يسقط في التحويل، فبقي أهمُّ
 * ما يُفحص — أيُّ بندٍ يظهر لأيّ دورٍ وأيّ باقة — بلا حارس.
 */
export type Item = {
  href: string;
  label: string;
  roles?: readonly DealerActor['role'][];
  /**
   * ═══ موديولُ هذا البند — قرار المالك ٢٠٢٦-١١-٢٦ ═══
   *
   * «كلها تكون على شكل موديولز يمكن للسوبر ادمن اضافتها حسب باقات
   * المعارض». **والسؤالُ عن المفتاح لا عن الباقة** (القاعدة الذهبية في
   * `entitlements.ts`): البندُ يسأل `dealer_pos` ولا يسأل «ما باقتُه؟»
   * — فباقةٌ تُضاف غدًا لا تحتاج سطرًا هنا.
   *
   * **والدورُ والموديولُ شرطان لا شرط**: الموديولُ يقول «أهذه الميزة
   * في باقته؟» والدورُ يقول «أهي من عمله؟» — ومحاسبٌ في معرضٍ باقتُه
   * تشمل المخزون لا يعدّل مخزونًا.
   */
  module?: string;
  /** مفتاحُ الشارة — وبنودٌ بلا شارةٍ في الترميز تبقى بلا رقم. */
  badge?: keyof DealerNavCounts;
};
export type Group = { title: string; items: readonly Item[] };

/**
 * ═══ الترتيبُ على يوم المعرض لا على ما تراكم ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «ترتيب و تنسيق الاقسام في القائمه الجانبيه …
 * مثلاً الاضافه الجماعيه تخص المخزون لذلك اعتقد لو تكون زر او قسم فرعي
 * داخل المخزون».
 *
 * **والمقياسُ سؤالٌ واحد**: ماذا يفعل صاحبُ المعرض في يومه، وبأيّ
 * ترتيب؟ يفتح اللوحةَ ليرى ما ينتظره، ثمّ يعمل في سيّاراته، ثمّ فيمن
 * يشتريها، ثمّ في عملائه، ثمّ في ماله. والإعداداتُ آخرًا لأنّها تُضبط
 * مرّةً وتُنسى.
 *
 * وما تغيّر عن الترتيب السابق، وسببُه:
 *
 * ١. **لوحةُ القيادة خرجت من «المخزون والبيع»** — لوحةٌ ليست مخزونًا،
 *    ووجودُها داخل مجموعةٍ يجعل أوّلَ ما يُفتح تابعًا لما بعده.
 * ٢. **الإضافةُ الجماعية دخلت المخزون** كلسانٍ في الشاشة لا بندًا في
 *    الشريط: هي بابُ إدخالٍ ثالث بعد «أضف مركبة» و«استورد» — وبندٌ
 *    مستقلٌّ لبابٍ يُستعمل مرّةً كلَّ شهرٍ يزاحم ما يُستعمل كلَّ يوم.
 * ٣. **الردودُ الجاهزة انتقلت إلى «العملاء»** — هي كلامٌ يُرسَل إلى
 *    مشترٍ، لا إعدادًا للمنشأة. وموضعُها في «المعرض» كان يجعل البائعَ
 *    يبحث عنها في الإعدادات.
 * ٤. **الاشتراكُ وبياناتُ المالك والملفُّ العامّ والفريق** صارت
 *    «الإعدادات»: أربعةٌ تُضبط مرّةً، وخلطُها بما يُفتح يوميًّا يطيل
 *    الشريطَ بلا فائدة.
 * ٥. **المزاداتُ انتقلت إلى «البيع»** — المزادُ طريقةُ بيعٍ لا صنفَ
 *    مخزون.
 *
 * **ولا يُحذف بندٌ ولا يُغيَّر مسار**: إعادةُ ترتيبٍ تكسر روابطَ
 * المستخدم ليست إعادةَ ترتيب.
 */
const NAV: readonly Group[] = [
  {
    title: 'اليوم',
    items: [{ href: '/dealer', label: 'لوحة القيادة' }],
  },
  {
    title: 'المخزون',
    items: [
      { href: '/dealer/inventory', label: 'المركبات', badge: 'inventory' },
    ],
  },
  {
    title: 'البيع',
    items: [
      /**
       * **والمنضدةُ أوّلُ البيع لا آخرُه** — عميلُ الصالة أمامك الآن،
       * وعرضٌ على الإنترنت ينتظر. والموديولُ يُخفيها لمن لا باقةَ له.
       */
      {
        href: '/dealer/pos',
        label: 'نقطة البيع',
        roles: ['OWNER', 'MANAGER', 'SALES'],
        module: 'dealer_pos',
      },
      {
        href: '/dealer/offers',
        label: 'العروض والمفاوضات',
        roles: ['OWNER', 'MANAGER', 'SALES'],
        badge: 'offers',
      },
      { href: '/dealer/orders', label: 'الطلبات', badge: 'orders' },
      {
        href: '/dealer/auctions',
        label: 'المزادات',
        roles: ['OWNER', 'MANAGER', 'SALES'],
        badge: 'auctions',
      },
    ],
  },
  {
    title: 'العملاء',
    items: [
      {
        href: '/dealer/customers',
        label: 'العملاء',
        roles: ['OWNER', 'MANAGER', 'SALES'],
        module: 'dealer_customers',
      },
      {
        href: '/dealer/replies',
        label: 'الردود الجاهزة',
        roles: ['OWNER', 'MANAGER', 'SALES'],
      },
    ],
  },
  {
    title: 'المال',
    items: [
      {
        href: '/dealer/invoices',
        label: 'الفواتير والضريبة',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        href: '/dealer/settlements',
        label: 'التسويات والعمولة',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
      },
      /** **والمصروفُ من المال لا من المخزون** — وهو نصفُ نتيجة المعرض. */
      /** **والتقسيطُ مالٌ يُحصَّل** — فموضعُه المال لا البيع. */
      {
        href: '/dealer/installments',
        label: 'التقسيط',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
        module: 'dealer_installments',
      },
      {
        href: '/dealer/expenses',
        label: 'المصروفات',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
        module: 'dealer_expenses',
      },
      {
        href: '/dealer/reports',
        label: 'التقارير',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
      },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      {
        href: '/dealer/team',
        label: 'الفريق والفروع',
        roles: ['OWNER', 'MANAGER'],
        module: 'dealer_branches',
      },
      { href: '/dealer/profile', label: 'الملف العام', roles: ['OWNER', 'MANAGER'] },
      /** **ولمالكه وحده** — من يملك تغييرَ الآيبان يملك تحويلَ المستحقّات. */
      { href: '/dealer/owner', label: 'بيانات صاحب المعرض', roles: ['OWNER'] },
      { href: '/dealer/subscription', label: 'الاشتراك والباقة', roles: ['OWNER'] },
    ],
  },
];

/** والسؤالُ يُفوَّض إلى `dealer-modules` — فقاعدةُ «الغائبُ مسموح» تُكتب مرّة. */
const granted = (grants: Entitlements, key: string | undefined): boolean =>
  hasModule(grants, key);

export function visibleNav(
  role: DealerActor['role'],
  grants: Entitlements = {},
): readonly Group[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (item.roles === undefined || item.roles.includes(role)) && granted(grants, item.module),
    ),
  })).filter((group) => group.items.length > 0);
}

