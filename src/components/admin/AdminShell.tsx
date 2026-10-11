import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { APP_ENV } from '@/lib/env';
import { can } from '@/lib/domain/permissions';
import { ADMIN_NAV } from './nav';
import { adminNavCounts } from '@/lib/domain/admin-nav-counts';
import { cn } from '@/lib/cn';
import type { AdminUser } from '@/generated/prisma/client';

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

export async function AdminShell({
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
  /**
   * ═══ الشارة تُملأ هنا — وكانت مبنيّةً لا تظهر ═══
   *
   * `AdminNavItem.badge` معرَّفٌ ومُصيَّر، و`ADMIN_NAV` ثابتٌ لا
   * يُسند إليه عدد. فسبعُ شاراتٍ في ترميز A1 لم تظهر قطّ.
   *
   * **ومشغّلٌ يفتح اللوحة يسأل سؤالًا واحدًا: أين ينتظرني عمل؟**
   * وبلا شارات يفتح تسع شاشاتٍ ليعرف — فيفتح أوّلها كل صباحٍ ويترك
   * آخرها أسابيع.
   *
   * ويُقرأ مرّةً للشريط كلّه: ثماني عدّاتٍ في استدعاءٍ واحد.
   */
  const counts = await adminNavCounts();

  // بند بلا صلاحية يُخفى لا يُعطَّل — «OPS لا يرى المالية» حرفيًا
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => item.permission === undefined || can(admin.role, item.permission))
      .map((item) => ({
        ...item,
        ...(item.href !== null && counts[item.href] !== undefined
          ? { badge: counts[item.href] }
          : {}),
      })),
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
