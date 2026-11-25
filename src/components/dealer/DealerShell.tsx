import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { DealerActor } from '@/lib/domain/dealer-auth';
import { DEALER_ROLE_AR } from '@/lib/labels/dealer';

/**
 * ═══ هيكلُ لوحة المعرض ═══
 *
 * المِلاحةُ أربعُ مجموعاتٍ كما يرسمها `Dealer.dc.html`: المخزونُ
 * والبيع · الطلبُ والعميل · المال · المعرض.
 *
 * **والبندُ لا يُعرض لمن لا يملكه.** مصفوفةُ `D9` تحسم ذلك: المبيعاتُ
 * يرى فرعَه، والمحاسبُ الفواتيرَ كلَّها والمخزونَ قراءةً،
 * **والاشتراكُ للمالك وحده**. وبندٌ يُعرض ثمّ يردّ «ليس لك» يجعل
 * العاملَ يحسب النظام معطّلًا.
 */
type Item = { href: string; label: string; roles?: readonly DealerActor['role'][] };
type Group = { title: string; items: readonly Item[] };

const NAV: readonly Group[] = [
  {
    title: 'المخزون والبيع',
    items: [
      { href: '/dealer', label: 'لوحة القيادة' },
      { href: '/dealer/inventory', label: 'المخزون' },
      { href: '/dealer/import', label: 'الإضافة الجماعية', roles: ['OWNER', 'MANAGER'] },
      { href: '/dealer/auctions', label: 'المزادات', roles: ['OWNER', 'MANAGER', 'SALES'] },
    ],
  },
  {
    title: 'الطلب والعميل',
    items: [
      { href: '/dealer/offers', label: 'العروض والمفاوضات', roles: ['OWNER', 'MANAGER', 'SALES'] },
      { href: '/dealer/orders', label: 'الطلبات' },
      { href: '/dealer/customers', label: 'العملاء', roles: ['OWNER', 'MANAGER', 'SALES'] },
    ],
  },
  {
    title: 'المال',
    items: [
      { href: '/dealer/invoices', label: 'الفواتير والضريبة', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { href: '/dealer/settlements', label: 'التسويات والعمولة', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
      { href: '/dealer/subscription', label: 'الاشتراك والباقة', roles: ['OWNER'] },
    ],
  },
  {
    title: 'المعرض',
    items: [
      { href: '/dealer/team', label: 'الفريق والفروع', roles: ['OWNER', 'MANAGER'] },
      { href: '/dealer/profile', label: 'الملف العام', roles: ['OWNER', 'MANAGER'] },
      { href: '/dealer/replies', label: 'الردود الجاهزة', roles: ['OWNER', 'MANAGER', 'SALES'] },
      { href: '/dealer/reports', label: 'التقارير', roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
    ],
  },
];

export function visibleNav(role: DealerActor['role']): readonly Group[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles === undefined || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function DealerShell({
  actor,
  activeHref,
  title,
  subtitle,
  actions,
  children,
}: {
  actor: DealerActor;
  activeHref: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const groups = visibleNav(actor.role);

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="hidden w-60 shrink-0 border-e border-line bg-surface lg:block">
        <div className="border-b border-line p-5">
          <p className="text-3xs font-bold tracking-widest opacity-65">DEALER DASHBOARD</p>
          <p className="mt-2 text-sm font-bold">{actor.dealerName}</p>
          {/*
            **واسمُ من يعمل ودورُه على رأس اللوحة.** في معرضٍ له فريق،
            من يجلس أمام الشاشة ليس واحدًا دائمًا — ومن لا يرى دورَه
            لا يعرف لِمَ غاب بندٌ عن ملاحته.
          */}
          <p className="mt-1 text-3xs opacity-70">
            {actor.name ?? '—'} · {DEALER_ROLE_AR[actor.role]}
          </p>
        </div>

        <nav className="flex flex-col gap-5 p-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-2 text-3xs font-bold tracking-wide opacity-65">{group.title}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'block rounded-md px-2.5 py-2 text-2xs transition-colors',
                        item.href === activeHref
                          ? 'bg-ink font-bold text-bg'
                          : 'opacity-80 hover:bg-ink/6 hover:opacity-100',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 p-6 lg:p-9">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle === undefined ? null : (
              <p className="mt-1.5 text-2xs opacity-70">{subtitle}</p>
            )}
          </div>
          {actions === undefined ? null : <div className="flex shrink-0 gap-2.5">{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}
