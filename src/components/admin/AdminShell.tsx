import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { APP_ENV } from '@/lib/env';
import { cn } from '@/lib/cn';

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
};

export type AdminNavGroup = {
  title: string;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    title: 'التشغيل',
    items: [
      { label: 'لوحة القيادة', href: '/admin' },
      { label: 'الطلبات', href: '/admin/orders' },
      { label: 'الإعلانات', href: null },
      { label: 'المزادات', href: null },
      { label: 'العروض والمفاوضات', href: null },
      { label: 'طلبات الخدمات', href: '/admin/service-requests' },
      { label: 'طلبات التمويل', href: null },
      { label: 'المدفوعات والضمان', href: null },
      { label: 'النزاعات', href: null },
      { label: 'البلاغات', href: null },
    ],
  },
  {
    title: 'العملاء',
    items: [
      { label: 'العملاء', href: '/admin/users' },
      { label: 'التجار والمعارض', href: null },
      { label: 'توثيق الهوية', href: null },
    ],
  },
  {
    title: 'النمو',
    items: [
      { label: 'الإعلانات المموّلة', href: null },
      { label: 'الحملات التسويقية', href: '/admin/campaigns' },
      { label: 'التقارير والتصدير', href: null },
    ],
  },
  {
    title: 'الإعدادات',
    items: [
      { label: 'الكتالوج', href: '/admin/catalog/brands' },
      { label: 'الخدمات وأسعارها', href: '/admin/services' },
      { label: 'مزوّدو الخدمات والتمويل', href: null },
      { label: 'إعدادات المزادات', href: null },
      { label: 'الأسئلة الشائعة', href: null },
      { label: 'الباقات والعمولة', href: null },
      { label: 'مساحات الإعلانات وتسعيرها', href: null },
      { label: 'الرسوم والضرائب', href: null },
      { label: 'الإشعارات والقوالب', href: '/admin/notifications' },
      { label: 'إشعارات الدفع', href: '/admin/push' },
      { label: 'التكاملات ومفاتيح الربط', href: '/admin/integrations' },
      { label: 'الصفحات القانونية', href: null },
      { label: 'الفريق والصلاحيات', href: null },
      { label: 'سجل التدقيق', href: null },
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
  children,
}: {
  title: string;
  activeHref?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
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
          {ADMIN_NAV.map((group) => (
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
        </header>
        <main className="flex-1 p-7.5">{children}</main>
      </div>
    </div>
  );
}
