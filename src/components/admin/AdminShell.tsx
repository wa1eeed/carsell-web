import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { APP_ENV } from '@/lib/env';
import { can, type Permission } from '@/lib/domain/permissions';
import { cn } from '@/lib/cn';
import type { AdminUser } from '@/generated/prisma/client';

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
      { label: 'الخلافات', href: '/admin/disputes', permission: 'orders.view' },
      { label: 'الشكاوى', href: '/admin/reports', permission: 'reports.handle' },
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
    /** **المزوّدون في مكانٍ واحد** — وطلباتُهم معهم لا في التشغيل. */
    title: 'الخدمات والمزوّدون',
    items: [
      { label: 'طلبات الخدمات', href: '/admin/service-requests', permission: 'serviceRequests.handle' },
      { label: 'المزوّدون', href: '/admin/providers', permission: 'services.manage' },
      { label: 'الخدمات وأسعارها', href: '/admin/services', permission: 'services.manage' },
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
      { label: 'دفتر الحسابات', href: '/admin/ledger', permission: 'finance.view' },
      { label: 'المدد والمهل', href: '/admin/deadlines', permission: 'finance.view' },
    ],
  },
  {
    title: 'الإعدادات — المحتوى',
    items: [
      { label: 'الماركات والموديلات', href: '/admin/catalog/brands', permission: 'catalog.manage' },
      { label: 'أنواع الهياكل', href: '/admin/catalog/body-types', permission: 'catalog.manage' },
      { label: 'المميّزات', href: '/admin/catalog/features', permission: 'catalog.manage' },
      { label: 'مساحات الإعلانات', href: '/admin/ads', permission: 'finance.view' },
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
      { label: 'سجل العمليات', href: '/admin/audit', permission: 'audit.view' },
    ],
  },
];

/** شريط تنبيه أعلى اللوحة — يظهر في staging وحدها. */
function EnvBanner() {
  if (APP_ENV !== 'staging') return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warn px-5 py-2 text-2xs font-bold text-ink">
      <span className="size-1.5 rounded-full bg-ink" aria-hidden />
      بيئة تجربة — البيانات هنا وهمية ولا تمثّل الإنتاج
    </div>
  );
}

/** الصدفة: شريط جانبي ٢٣٨px داكن + رأس صفحة ١٧px/٣٠px (القسم ٣ قاعدة ٥). */
export function AdminShell({
  title,
  subtitle,
  activeHref,
  actions,
  admin,
  children,
}: {
  title: string;
  /**
   * سطرٌ رماديّ تحت العنوان — **في الترميز لكل شاشة**.
   *
   * ويقول ما تفعله الشاشة في سطر، فيعرف الداخل أين هو قبل أن يقرأ
   * جدولًا. وكان غائبًا عندنا: عنوانٌ وحده في شريطٍ عريض.
   */
  subtitle?: string;
  activeHref?: string;
  actions?: ReactNode;
  admin: Pick<AdminUser, 'name' | 'role'>;
  children: ReactNode;
}) {
  // بند بلا صلاحية يُخفى لا يُعطَّل — «OPS لا يرى المالية» حرفيًا
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.permission === undefined || can(admin.role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
  return (
    <div dir="rtl" className="flex min-h-screen bg-bg text-ink">
      <nav className="flex w-[238px] shrink-0 flex-col bg-ink py-5 text-bg">
        <div className="mb-1.5 border-b border-bg/14 px-5 pb-4.5">
          <p className="font-body-en text-xl font-extrabold tracking-tight">
            carsell<span className="text-accent-400">.one</span>
          </p>
          <p className="mt-1.5 text-3xs font-semibold tracking-[0.12em] opacity-50">
            ADMIN CONSOLE
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3.5 pt-4 pb-1.5 text-3xs font-bold tracking-[0.16em] opacity-38">
                {group.title}
              </p>
              {group.items.map((item) => {
                const isActive = item.href !== null && item.href === activeHref;
                const disabled = item.href === null;

                return (
                  <a
                    key={item.label}
                    href={item.href ?? undefined}
                    aria-disabled={disabled}
                    title={disabled ? 'قريبًا — لا ترميز تصميم بعد' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-sm px-3.5 py-2.5 text-sm',
                      isActive && 'bg-bg/13 font-bold',
                      !isActive && !disabled && 'font-semibold opacity-66 hover:opacity-100',
                      disabled && 'pointer-events-none font-semibold opacity-28',
                    )}
                  >
                    {isActive ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-accent-400" />
                    ) : null}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge === undefined ? null : (
                      <span className="rounded-sm bg-warn px-1.5 py-0.5 text-3xs font-bold text-ink">
                        <ArabicNumber value={item.badge} />
                      </span>
                    )}
                    {disabled ? (
                      <span className="text-3xs opacity-70">قريبًا</span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <EnvBanner />
        <header className="flex items-center gap-4 border-b border-line bg-surface px-7.5 py-4.5">
          <span className="flex min-w-0 flex-col">
            <h1 className="text-lg font-bold">{title}</h1>
            {subtitle === undefined ? null : (
              <span className="mt-0.5 truncate text-2xs opacity-50">{subtitle}</span>
            )}
          </span>
          <span className="flex-1" />
          {actions}
          {/*
            **الاسم يفتح الحساب.** وشاشة «حسابي» ليست في الشريط الجانبي
            — مكانها حيث يبحث عنها المرء: تحت اسمه.
          */}
          <Link
            href="/admin/account"
            className="flex flex-col items-end gap-0.5 border-s border-line ps-4 hover:opacity-70"
          >
            <span className="text-sm font-bold">{admin.name}</span>
            <span className="text-3xs opacity-55">{admin.role}</span>
          </Link>
        </header>
        <main className="flex-1 p-7.5">{children}</main>
      </div>
    </div>
  );
}
