import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Countdown } from '@/components/ui/Countdown';
import { Link } from '@/i18n/navigation';
import { AccountNav } from './AccountNav';
import { cn } from '@/lib/cn';

const NAV = [
  { key: 'home', href: '/' },
  { key: 'cars', href: '/cars' },
  { key: 'auctions', href: '/auctions' },
  { key: 'dealers', href: '/dealers' },
  { key: 'services', href: '/services' },
] as const;

/**
 * الشريط الحيّ أعلى الصفحة — سطح داكن، مزادات جارية وأقربها إغلاقًا.
 * يختفي كليًا إن لم يكن هناك مزاد حيّ: لا نعرض شريطًا فارغًا.
 */
export function LiveBar({
  liveAuctions,
  closingTitle,
  closingAt,
  city,
}: {
  liveAuctions: number;
  closingTitle?: string;
  closingAt?: string;
  city: string;
}) {
  const t = useTranslations('site');
  if (liveAuctions === 0) return null;

  return (
    <div className="flex items-center gap-5 bg-ink px-10 py-3 text-sm font-medium text-bg">
      <span className="flex items-center gap-2">
        <span className="size-1.5 animate-pulse rounded-full bg-warn-400" aria-hidden />
        <ArabicNumber value={liveAuctions} />
        <span>{t('liveAuctions')}</span>
      </span>

      {closingTitle !== undefined && closingAt !== undefined ? (
        <>
          <span className="opacity-30" aria-hidden>
            |
          </span>
          <span className="flex items-center gap-2 opacity-72">
            <span>{t('closingSoon')}</span>
            <span className="bidi-isolate">{closingTitle}</span>
            <Countdown endsAt={closingAt} tone="plain" />
          </span>
        </>
      ) : null}

      <span className="flex-1" />
      <span className="bidi-isolate opacity-72">{city}</span>
    </div>
  );
}

/**
 * رأس الموقع — تنقّل بمؤشّر سفلي على البند النشط (Wa).
 *
 * و`actions` لِما تزيده صفحةٌ بعينها؛ ومدخل الحساب ليس منها — هو في
 * كل شاشة، فيُرسم هنا.
 */
export function SiteHeader({
  active = 'home',
  actions,
}: {
  active?: (typeof NAV)[number]['key'];
  actions?: ReactNode;
}) {
  const t = useTranslations('site');

  return (
    /*
      ═══ الترويسة صفٌّ واحد لا ينكسر — وكانت تفيض على الهاتف ═══

      قِستُ على ٣٧٥px فوجدتُ الصفحة ٨٧٠px عرضًا: **٤٩٥px تمرير أفقيّ**
      على أكثر شاشةٍ يزورها الناس.

      وأوّل إصلاحٍ جرّبتُه جعل المِلاحة تنكمش داخل الصفّ — فذهب الفيض
      **وذهبت المِلاحة معه**: الشعار والحساب أخذا العرض كلَّه ولم يبقَ
      لها شيء. فزائر الهاتف بلا فيضٍ وبلا روابط، وهو أسوأ من الاثنين.

      فالصفّان على الضيّق: الشعار والحساب في الأوّل، والمِلاحة في الثاني
      تُمرَّر داخل حدّها — **وكلّ رابطٍ يبقى مبلوغًا**. وصفٌّ واحد من
      `sm` فصاعدًا كالتصميم.
    */
    <header className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6 sm:px-10 sm:py-4">
      <div className="flex items-center justify-between gap-4 sm:contents">
        <Link
          href="/"
          className="font-body-en shrink-0 text-xl font-extrabold tracking-tight sm:text-2xl"
        >
          carsell<span className="text-accent">.one</span>
        </Link>

        {/*
          **مدخل الحساب من الترويسة لا من كل صفحة.** كان يُمرَّر
          `actions` يدويًّا، فمرّرته صفحةٌ واحدة من إحدى وعشرين — وبقي
          عشرون شاشة بلا باب إلى الحساب.

          وهو في الصفّ الأوّل على الهاتف، وفي آخر الصفّ على الواسع.
        */}
        <span className="shrink-0 sm:order-last">
          <AccountNav />
        </span>
      </div>

      <nav className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 text-base font-semibold whitespace-nowrap sm:mx-0 sm:flex-1 sm:px-0">
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'pb-1',
              item.key === active
                ? 'border-b-2 border-accent text-accent-700'
                : 'opacity-62 hover:opacity-100',
            )}
          >
            {t(`nav.${item.key}`)}
          </Link>
        ))}
      </nav>

      {actions}
    </header>
  );
}

/** تذييل الموقع — أعمدة روابط والفصل بخطّ. */
export function SiteFooter({
  columns,
}: {
  columns: readonly { title: string; links: readonly string[] }[];
}) {
  const t = useTranslations('site');

  return (
    <footer className="border-t border-line bg-surface px-10 py-10">
      <div className="mx-auto flex w-full max-w-page flex-wrap gap-10">
        <div className="min-w-56 flex-1">
          <p className="font-body-en text-2xl font-extrabold tracking-tight">
            carsell<span className="text-accent">.one</span>
          </p>
          <p className="mt-2.5 max-w-72 text-xs leading-loose opacity-60">
            {t('tagline')}
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title} className="min-w-40">
            <p className="mb-3 text-3xs font-bold tracking-[0.14em] opacity-45">
              {col.title}
            </p>
            <ul className="flex flex-col gap-2.5 text-xs opacity-70">
              {col.links.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
