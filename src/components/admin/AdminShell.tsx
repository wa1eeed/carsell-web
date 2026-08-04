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
    title: 'التشغيل',
    items: [
      { label: 'لوحة القيادة', href: '/admin', permission: 'dashboard.view' },
      { label: 'الطلبات', href: '/admin/orders', permission: 'orders.view' },
      { label: 'الإعلانات', href: '/admin/listings', permission: 'listings.review' },
      { label: 'كل الإعلانات', href: '/admin/all-listings', permission: 'listings.review' },
      { label: 'المزادات', href: '/admin/auctions', permission: 'orders.view' },
      { label: 'العروض والمفاوضات', href: '/admin/offers', permission: 'orders.view' },
      { label: 'طلبات الخدمات', href: '/admin/service-requests', permission: 'serviceRequests.handle' },
      { label: 'النزاعات', href: '/admin/disputes', permission: 'orders.view' },
      { label: 'طلبات التمويل', href: null },
      { label: 'المدفوعات والضمان', href: '/admin/settlements', permission: 'finance.view' },
      { label: 'البلاغات', href: '/admin/reports', permission: 'reports.handle' },
    ],
  },
  {
    title: 'العملاء',
    items: [
      { label: 'العملاء', href: '/admin/users', permission: 'users.view' },
      { label: 'التجار والمعارض', href: '/admin/dealers', permission: 'users.view' },
      { label: 'توثيق الهوية', href: '/admin/identity', permission: 'identity.review' },
    ],
  },
  {
    title: 'النمو',
    items: [
      { label: 'الإعلانات المموّلة', href: '/admin/ads', permission: 'finance.view' },
      { label: 'الحملات التسويقية', href: '/admin/campaigns' },
      { label: 'التقارير والتصدير', href: '/admin/exports' },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { label: 'التشغيلية', href: '/admin/ops', permission: 'orders.view' },
      { label: 'المالية', href: '/admin/finance', permission: 'finance.view' },
      { label: 'إعدادات الدفع والتوجيه', href: '/admin/payments', permission: 'finance.view' },
      { label: 'المهل الزمنية', href: '/admin/deadlines', permission: 'finance.view' },
      { label: 'دفتر الأستاذ', href: '/admin/ledger', permission: 'finance.view' },
      { label: 'الكتالوج', href: '/admin/catalog/brands', permission: 'catalog.manage' },
      { label: 'أنواع الهياكل', href: '/admin/catalog/body-types', permission: 'catalog.manage' },
      { label: 'المميّزات', href: '/admin/catalog/features', permission: 'catalog.manage' },
      { label: 'الخدمات وأسعارها', href: '/admin/services', permission: 'services.manage' },
      { label: 'مزوّدو الخدمات والتمويل', href: '/admin/providers', permission: 'services.manage' },
      { label: 'إعدادات المزادات', href: '/admin/auction-settings', permission: 'finance.view' },
      { label: 'الأسئلة الشائعة', href: '/admin/faq', permission: 'notifications.manage' },
      { label: 'الباقات والعمولة', href: '/admin/plans', permission: 'finance.view' },
      { label: 'مساحات الإعلانات وتسعيرها', href: '/admin/ads', permission: 'finance.view' },
      // **«الرسوم والضرائب» اسمُ A21 في التصميم** — وكانت لدينا باسمين:
      // بندٌ حيّ اسمُه «محرّك الضريبة» وبندٌ ميّت اسمُه اسمَها.
      { label: 'الرسوم والضرائب', href: '/admin/tax', permission: 'finance.view' },
      { label: 'الإشعارات والقوالب', href: '/admin/notifications', permission: 'notifications.manage' },
      { label: 'إشعارات الدفع', href: '/admin/push' },
      { label: 'التكاملات ومفاتيح الربط', href: '/admin/integrations', permission: 'integrations.view' },
      { label: 'الصفحات القانونية', href: '/admin/legal', permission: 'notifications.manage' },
      { label: 'الفريق والصلاحيات', href: '/admin/team', permission: 'team.manage' },
      { label: 'سجل التدقيق', href: '/admin/audit', permission: 'audit.view' },
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
  activeHref,
  actions,
  admin,
  children,
}: {
  title: string;
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
          <h1 className="text-xl font-bold">{title}</h1>
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
