import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { APP_ENV } from '@/lib/env';
import { can } from '@/lib/domain/permissions';
import { visibleGroups } from './nav';
import { adminNavCounts } from '@/lib/domain/admin-nav-counts';
import { SignOut } from '@/components/ui/SignOut';
import { AdminMobileNav } from './AdminMobileNav';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import type { AdminUser } from '@/generated/prisma/client';

/** شريط تنبيه أعلى اللوحة — يظهر في staging وحدها. */
function EnvBanner() {
  if (APP_ENV !== 'staging') return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warn px-5 py-2 text-2xs font-bold text-ink">
      <span className="size-1.5 rounded-full bg-ink" aria-hidden />
      بيئة تجربة — البيانات هنا وهمية ولا تمثل الإنتاج
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

  /**
   * **والإعدادات بندٌ واحد ما لم تكن فيها** — والمنطق في `nav.ts`
   * لأنه قرارُ بنية يُختبَر، لا تفصيلُ تصيير.
   */
  const visible = visibleGroups(activeHref);

  // بند بلا صلاحية يُخفى لا يُعطَّل — «OPS لا يرى المالية» حرفيًا
  const groups = visible.map((group) => ({
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
      {/*
        ═══ الشريط الجانبيّ فوق `lg` وحده ═══

        كان ثابتًا بعرض ٢٣٨px **بلا صنفٍ متجاوب واحد**: على شاشة ٣٧٥
        يبتلع ثُلثَي العرض فيبقى للجدول مئةٌ وثلاثون — وتُقرأ اللوحة
        بتكبيرٍ وتمريرٍ أفقيّ. ودونه يحلّ الدرج.
      */}
      <nav className="hidden w-[238px] shrink-0 flex-col bg-ink py-5 text-bg lg:flex">
        <div className="mb-1.5 border-b border-bg/14 px-5 pb-4.5">
          <Logo variant="white" priority className="h-7" />
          <p className="mt-1.5 text-3xs font-semibold tracking-[0.12em] opacity-70">
            ADMIN CONSOLE
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3.5 pt-4 pb-1.5 text-3xs font-bold tracking-[0.16em] opacity-65">
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
                    title={disabled ? 'قريبا — لا ترميز تصميم بعد' : undefined}
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
                      <span className="text-3xs opacity-75">قريبا</span>
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

        {/*
          الدرج — ومعه شريطٌ علويّ على الهاتف. والمجموعات هي نفسها
          المعروضة في الجانبيّ (بصلاحياتها وشاراتها)، فلا تفترقان.
        */}
        <AdminMobileNav
          groups={groups.map((group) => ({
            title: group.title,
            items: group.items.map((item) => ({
              label: item.label,
              href: item.href,
              ...(item.badge === undefined ? {} : { badge: item.badge }),
            })),
          }))}
          {...(activeHref === undefined ? {} : { activeHref })}
          title={title}
        />

        <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-4 sm:px-7.5 sm:py-4.5">
          <span className="flex min-w-0 flex-col">
            {/*
              **ولا يُكرَّر العنوان.** الشريط العلويّ على الهاتف يحمله
              ويبقى لاصقًا عند التمرير، فإعادتُه هنا تُظهره مرّتين في
              شاشةٍ واحدة. ويبقى `h1` في الشجرة لقارئ الشاشة — يُنطق
              مرّةً ويُرى على الكبير وحده.
            */}
            <h1 className="sr-only text-lg font-bold lg:not-sr-only">{title}</h1>
            {subtitle === undefined ? null : (
              <span className="mt-0.5 truncate text-2xs opacity-70">{subtitle}</span>
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
            <span className="text-3xs opacity-70">{admin.role}</span>
          </Link>

          {/*
            ═══ والخروج هنا — ومسارُه مبنيٌّ بلا نادٍ ═══

            `POST /api/v1/admin/auth/logout` موجودٌ منذ بُني الدخول،
            **ولا شيء في اللوحة يناديه** — فمحرّرٌ يقوم عن جهازٍ مشترك
            في المكتب يترك خلفه إفراجاتٍ عن أموالٍ وقراراتِ توثيق.
            وهو أثقل من خروج الموقع: الجلسة صفٌّ يُبطَل، لا كعكةٌ
            تُمحى.
          */}
          <SignOut path="/api/v1/admin/auth/logout" next="/admin/login" label="خروج" />
        </header>
        {/* **وحشوةٌ أضيق على الهاتف** — ٣٠px من ٣٧٥ ثُمنُ العرض */}
        <main className="min-w-0 flex-1 p-4 sm:p-7.5">{children}</main>
      </div>
    </div>
  );
}
