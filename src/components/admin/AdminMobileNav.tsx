'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { cn } from '@/lib/cn';

/**
 * ═══ لوحة الأدمن على الهاتف ═══
 *
 * الشريط كان ثابتًا بعرض ٢٣٨px **بلا صنفٍ متجاوب واحد**: على شاشة
 * ٣٧٥ يبتلع ثُلثَي العرض، فيبقى للجدول مئةٌ وثلاثون — وتُقرأ اللوحة
 * بتكبيرٍ وتمريرٍ أفقيّ.
 *
 * **ومن يُشغّل سوقًا لا يجلس إلى مكتبه دائمًا**: بلاغٌ يصل ليلًا،
 * وطلبُ تحويلٍ ينتظر اعتمادًا ثانيًا، ومزادٌ يُغلق — وكلُّها قراراتٌ
 * دقائق لا ساعات.
 *
 * ═══ والبناء من `MobileNav` نفسه ═══
 *
 * فيه ما تعلّمناه: الستارة تُنقر فتُغلق · ومفتاح الهروب يُغلق ·
 * وتمريرُ ما تحتها يُمنع · والتركيز ينتقل إلى اللوحة · **والدرج
 * المغلق يُقصّ في حاوية** — عنصرٌ `fixed` مُزاح خارج الحافّة يوسّع
 * الصفحة بعرضه.
 */
export type MobileNavGroup = {
  title: string;
  items: readonly { label: string; href: string | null; badge?: number }[];
};

export function AdminMobileNav({
  groups,
  activeHref,
  title,
}: {
  groups: readonly MobileNavGroup[];
  activeHref?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * **وما ينتظر عملًا يُعدّ على الزرّ المغلق.** الشارات داخل الدرج لا
   * تُرى حتى يُفتح — ومن لا يعرف أنّ شيئًا ينتظره لا يفتحه.
   */
  const waiting = groups
    .flatMap((group) => group.items)
    .reduce((total, item) => total + (item.badge ?? 0), 0);

  return (
    <>
      {/* شريطٌ علويّ على الهاتف وحده — والشريط الجانبيّ يحلّ محلّه فوق `lg` */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink px-4 py-3 text-bg lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="القائمة"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-bg/25"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {waiting === 0 ? null : (
            <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-warn px-1 text-3xs font-bold text-ink">
              <ArabicNumber value={waiting} />
            </span>
          )}
        </button>

        {/* و`aria-hidden` — العنوان يُنطق من `h1` في الترويسة، ولا يُكرَّر */}
        <p aria-hidden className="min-w-0 flex-1 truncate text-sm font-bold">
          {title}
        </p>

        <Link href="/admin" className="font-body-en text-sm font-extrabold tracking-tight">
          carsell<span className="text-accent-400">.one</span>
        </Link>
      </header>

      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          'fixed inset-0 z-40 bg-ink/45 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div
        aria-hidden={!open}
        className={cn(
          'pointer-events-none fixed inset-0 z-50 overflow-hidden lg:hidden',
          open ? '' : 'invisible',
        )}
      >
        <div
          id="admin-drawer"
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="قائمة اللوحة"
          className={cn(
            /*
              `start-0` — جهةُ الإبهام في RTL هي اليمين، وهي
              `inline-start`. و`translate-x` محورٌ بصريّ لا ينقلب،
              فتُقلب إشارتُه بالمتغيّر.
            */
            'pointer-events-auto absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col',
            'overflow-y-auto bg-ink text-bg transition-transform duration-200',
            'motion-reduce:transition-none',
            open ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-bg/14 px-5 py-4">
            <p className="font-body-en text-lg font-extrabold tracking-tight">
              carsell<span className="text-accent-400">.one</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="flex size-8 items-center justify-center rounded-md border border-bg/25"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1 px-3 py-4">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="px-3 pb-1.5 pt-4 text-3xs font-bold tracking-wider opacity-40">
                  {group.title}
                </p>
                {group.items.map((item) =>
                  item.href === null ? (
                    <span
                      key={item.label}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-2xs opacity-35"
                    >
                      {item.label}
                      <span className="text-3xs">قريبًا</span>
                    </span>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      /** **والنقر يُغلق الدرج** — وإلّا بقي فوق الصفحة التي فُتحت. */
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2.5 text-2xs',
                        item.href === activeHref ? 'bg-bg/14 font-bold' : 'opacity-70',
                      )}
                    >
                      <span className="flex-1">{item.label}</span>
                      {item.badge === undefined ? null : (
                        <span className="rounded-md bg-warn px-1.5 py-px text-3xs font-bold text-ink">
                          <ArabicNumber value={item.badge} />
                        </span>
                      )}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
