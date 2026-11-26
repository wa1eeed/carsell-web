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

const NAV: readonly Group[] = [
  {
    title: 'المخزون والبيع',
    items: [
      { href: '/dealer', label: 'لوحة القيادة' },
      { href: '/dealer/inventory', label: 'المخزون', badge: 'inventory' },
      { href: '/dealer/import', label: 'الإضافة الجماعية', roles: ['OWNER', 'MANAGER'] },
      { href: '/dealer/auctions', label: 'المزادات', roles: ['OWNER', 'MANAGER', 'SALES'], badge: 'auctions' },
    ],
  },
  {
    title: 'الطلب والعميل',
    items: [
      { href: '/dealer/offers', label: 'العروض والمفاوضات', roles: ['OWNER', 'MANAGER', 'SALES'], badge: 'offers' },
      { href: '/dealer/orders', label: 'الطلبات', badge: 'orders' },
      {
        href: '/dealer/customers',
        label: 'العملاء',
        roles: ['OWNER', 'MANAGER', 'SALES'],
        module: 'dealer_customers',
      },
    ],
  },
  {
    title: 'المال',
    items: [
      { href: '/dealer/invoices', label: 'الفواتير والضريبة', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { href: '/dealer/settlements', label: 'التسويات والعمولة', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      /** **والمصروفُ من المال لا من المخزون** — وهو نصفُ نتيجة المعرض. */
      {
        href: '/dealer/expenses',
        label: 'المصروفات',
        roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
        module: 'dealer_expenses',
      },
      { href: '/dealer/subscription', label: 'الاشتراك والباقة', roles: ['OWNER'] },
    ],
  },
  {
    title: 'المعرض',
    items: [
      {
        href: '/dealer/team',
        label: 'الفريق والفروع',
        roles: ['OWNER', 'MANAGER'],
        module: 'dealer_branches',
      },
      { href: '/dealer/profile', label: 'الملف العام', roles: ['OWNER', 'MANAGER'] },
      /**
       * **ولمالكه وحده** — توثيقُ المنشأة وحسابُ التحويل قرارُ صاحب
       * السجلّ، ومن يملك تغييرَ الآيبان يملك تحويلَ المستحقّات.
       */
      { href: '/dealer/owner', label: 'بيانات صاحب المعرض', roles: ['OWNER'] },
      { href: '/dealer/replies', label: 'الردود الجاهزة', roles: ['OWNER', 'MANAGER', 'SALES'] },
      { href: '/dealer/reports', label: 'التقارير', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
    ],
  },
];

/**
 * **والمفتاحُ الغائبُ مسموح** — كما في `entitlements.ts`: خاصّيةٌ لم
 * تُعرَّف لا تمنع أحدًا. فبيئةٌ لم يصلها ترحيلُ المفاتيح تعمل كما كانت،
 * ولا يختفي قسمٌ لأنّ صفًّا مرجعيًّا تأخّر.
 */
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

