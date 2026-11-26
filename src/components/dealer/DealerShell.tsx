import Link from 'next/link';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Quantity } from '@/components/ui/Quantity';
import { Logo } from '@/components/ui/Logo';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { DealerActor } from '@/lib/domain/dealer-auth';
import { DEALER_ROLE_AR } from '@/lib/labels/dealer';
import { resolveEntitlements } from '@/lib/domain/entitlements';
import { visibleNav } from '@/lib/dealer-nav';
import { dealerNavCounts } from '@/lib/domain/dealer-desk';
import { dealerIdentity } from '@/lib/domain/dealer-branches';

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
export async function DealerShell({
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
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [counts, badge, grants] = await Promise.all([
    dealerNavCounts(actor.dealerId, actor.branchId),
    dealerIdentity(actor.dealerId),
    resolveEntitlements({ userId: actor.userId, dealerId: actor.dealerId }),
  ]);
  const groups = visibleNav(actor.role, grants);

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      {/*
        **والشريطُ داكنٌ كما يرسمه `Dealer.dc.html`** — `var(--carz-ink)`
        بنصٍّ فاتح، وهو شريطُ لوحة الأدمن نفسُه: أداةُ عملٍ لا صفحةُ
        تسوّق. وكنتُ بنيتُه فاتحًا فخرج عن الترميز بلا سبب.
      */}
      <aside className="hidden w-[238px] shrink-0 flex-col bg-ink py-5 text-bg lg:flex">
        <div className="border-b border-bg/13 px-5 pb-4">
          {/* **والعلامةُ أصلٌ لا نصٌّ يُكتب** — `Logo` كما في شريط الأدمن. */}
          <Logo variant="white" priority className="h-7" />
          <p className="mt-1.5 text-3xs font-semibold tracking-widest opacity-70">
            DEALER DASHBOARD
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-5 p-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-2 text-3xs font-bold tracking-wide opacity-70">{group.title}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'block rounded-md px-2.5 py-2 text-2xs transition-colors',
                        item.href === activeHref
                          ? 'bg-bg/12 font-bold'
                          : 'opacity-65 hover:bg-bg/7 hover:opacity-100',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex-1">{item.label}</span>
                        {item.badge === undefined || counts[item.badge] === 0 ? null : (
                          /**
                            **والشارةُ على الصفر تُحذف لا تُصفَّر**:
                            «المزادات ٠» تُقرأ عطلًا، وغيابُها يُقرأ
                            «لا شيء هناك» — وهو الصواب.
                          */
                          <span className="rounded-md bg-accent-400 px-1.5 font-num text-3xs font-bold text-ink">
                            <ArabicNumber value={counts[item.badge]} />
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/*
          **واسمُ من يعمل ودورُه في أسفل الشريط** كما يرسمه الترميز.
          في معرضٍ له فريق، من يجلس أمام الشاشة ليس واحدًا دائمًا —
          ومن لا يرى دورَه لا يعرف لِمَ غاب بندٌ عن ملاحته.
        */}
        <div className="mx-4 rounded-lg bg-bg/7 p-3.5">
          <p className="text-2xs font-bold">{actor.dealerName}</p>
          <p className="mt-1 text-3xs opacity-70">
            {badge.verified ? 'تاجر موثق' : 'قيد التوثيق'}
            {badge.branches === 0 ? null : (
              <>
                <span aria-hidden> · </span>
                <Quantity unit="branches" count={badge.branches} />
              </>
            )}
          </p>
          <p className="mt-2.5 text-3xs font-semibold opacity-70">
            {actor.name ?? '—'} · {DEALER_ROLE_AR[actor.role]}
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6 lg:p-9">
        {/*
          ═══ والتذكيرُ يسبق لحظةَ الحاجة ═══

          قرار المالك ٢٠٢٦-١١-٢٦: المعرضُ يدخل لوحتَه من أوّل دقيقة،
          **ولا يصل السوقَ منه إعلانٌ حتى يُراجَع سجلُّه**. فمن يصوّر
          عشرَ مركباتٍ ويكتب أسعارَها ثمّ يُردّ عند «انشر» يحسب العطلَ
          في النظام — واكتشافُ «عليك عمل» عند الضغط أسوأُ توقيتٍ ممكن.

          وهو في الغلاف لا في شاشةٍ واحدة: الطريقُ إلى النشر يمرّ
          بالمخزون وبصفحة المركبة وبالإضافة الجماعية.
        */}
        {actor.verified ? null : (
          <p className="mb-6 rounded-lg border border-line bg-surface px-4 py-3 text-2xs leading-loose">
            <b>سجلك التجاري قيد المراجعة.</b> جهز مخزونك وأسعارك الآن — ويفتح النشر
            للسوق فور اعتماده، وتظهر معه شارة «تاجر موثق» على صفحتك.
          </p>
        )}

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
