'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

/**
 * ═══ قائمةٌ جانبية على الهاتف ═══
 *
 * **وكان الصفّ يُمرَّر أفقيًّا.** خمسةُ روابط في عرض ٣٧٥ لا تتّسع،
 * فآخرها («الخدمات») خارج الشاشة — يُبلَغ بسحبٍ أفقيّ **لا أثر له
 * يدلّ عليه**: لا سهم ولا تدرّج، والشريط مخفيّ بـ`no-scrollbar`.
 * فمن لا يعرف أنه يُسحب لا يصل إليه.
 *
 * ═══ والجهة تتبع اللغة ═══
 *
 * العربية تفتح من اليمين، والإنجليزية من اليسار — وهي جهة الإبهام في
 * كلٍّ منهما. والموضع بخصائص منطقية (`end-0`) فيتبع `dir` وحده،
 * والحركة تُقلب بمتغيّرَي `rtl:`/`ltr:` لأن محور `translate-x` لا
 * ينقلب معه.
 */
export function MobileNav({
  items,
  active,
  locale,
  otherLocale,
  otherLabel,
  menuLabel,
  closeLabel,
}: {
  items: readonly { key: string; href: string; label: string }[];
  active?: string;
  locale: Locale;
  otherLocale: Locale;
  otherLabel: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /**
   * **ومفتاح الهروب يُغلق.** القائمة تغطّي الشاشة، ومن فتحها سهوًا
   * على لوحة مفاتيح يحتاج مخرجًا لا يلمسه.
   *
   * **ويُمنع تمرير ما تحتها**: درجٌ مفتوح فوق صفحةٍ تتحرّك يفقد
   * موضعه، فيُغلق المستخدم ليجد نفسه في مكانٍ آخر.
   */
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /** والتركيز ينتقل إلى اللوحة، فقارئ الشاشة يقرأ ما فُتح لا ما تحته. */
    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={menuLabel}
        aria-expanded={open}
        aria-controls="site-drawer"
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line sm:hidden"
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
      </button>

      {/*
        **والستارة تُنقر فتُغلق.** ومن فتح قائمةً بالخطأ يُغلقها بأقرب
        لمسةٍ لا بالبحث عن زرّ.
      */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          'fixed inset-0 z-40 bg-ink/45 transition-opacity sm:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/*
        ═══ والدرجُ المغلق يُقصّ في حاويته ═══

        **عنصرٌ `fixed` مُزاح خارج الحافّة يوسّع الصفحة بعرضه** في
        متصفّحات حقيقية، فيظهر تمريرٌ أفقيّ على فراغ. و`overflow-x` على
        الجذر لا يحتويه دائمًا: الثابت يُوضع بالنسبة إلى المنفذ لا إلى
        ما يقصّه.

        **ولم يُقَس العطل هنا**: ما قرأتُه فيضًا كان أثرَ محاكاة المقاس
        في المعراض — صفحةُ الأدمن بلا درجٍ أعطت الرقم نفسه. والحاوية
        تبقى لأنها الشكل الصحيح، لا لأنها أصلحت ما رأيت.

        فحاويةٌ ثابتةٌ بملء المنفذ تقصّ ما بداخلها، واللوحة تنزلق
        داخلها. و`pointer-events-none` على الحاوية حتى لا تبتلع
        نقرات الصفحة وهي شفّافة.
      */}
      <div
        aria-hidden={!open}
        className={cn(
          'pointer-events-none fixed inset-0 z-50 overflow-hidden sm:hidden',
          open ? '' : 'invisible',
        )}
      >
      <div
        id="site-drawer"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={menuLabel}
        className={cn(
          /*
            ═══ `start-0` لا `end-0` ═══

            **والمحور ينقلب مع الاتّجاه.** في RTL يجري المحور السطريّ
            من اليمين إلى اليسار، فـ`inline-start` هي **اليمين**
            و`inline-end` اليسار. فكتبتُ `end-0` أوّلًا فانفتح الدرج
            يسارَ الشاشة العربية — عكسَ جهة الإبهام وعكسَ المطلوب.

            و`translate-x` محورٌ بصريّ ثابت لا ينقلب، فتُقلب إشارتُه
            بالمتغيّرين: العربية تختفي يمينًا والإنجليزية يسارًا.
          */
          'pointer-events-auto absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col',
          'border-e border-line bg-surface transition-transform duration-200',
          open ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Logo className="h-6" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
            className="flex size-9 items-center justify-center rounded-md border border-line"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={item.key === active ? 'page' : undefined}
              className={cn(
                'rounded-md px-4 py-3 text-base font-semibold',
                item.key === active
                  ? 'bg-accent-100 text-accent-900'
                  : 'opacity-75 hover:bg-ink/5 hover:opacity-100',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/*
          ═══ مبدّل اللغة — وكان مبنيًّا ولا يناديه أحد ═══

          `LocaleSwitcher` مكتوبٌ منذ زمن ولا شاشة تستعمله: فمن فتح
          الموقع بالعربية **لا سبيل له إلى الإنجليزية إلّا بتحرير
          الرابط بيده**.
        */}
        <div className="border-t border-line p-3">
          <LocaleSwitcher
            locale={otherLocale}
            label={otherLabel}
            className="flex w-full items-center justify-between rounded-md px-4 py-3 text-2xs font-bold opacity-75 hover:bg-ink/5 hover:opacity-100"
          />
          <p className="px-4 pt-1 text-3xs opacity-45" lang={locale}>
            {locale === 'ar' ? 'لغة العرض' : 'Display language'}
          </p>
        </div>
      </div>
      </div>
    </>
  );
}
