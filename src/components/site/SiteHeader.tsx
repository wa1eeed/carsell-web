import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Countdown } from '@/components/ui/Countdown';
import { Link } from '@/i18n/navigation';
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

/** رأس الموقع — تنقّل بمؤشّر سفلي على البند النشط (Wa). */
export function SiteHeader({
  active = 'home',
  actions,
}: {
  active?: (typeof NAV)[number]['key'];
  actions?: ReactNode;
}) {
  const t = useTranslations('site');

  return (
    <header className="flex items-center gap-6 border-b border-line bg-surface px-10 py-4">
      <Link href="/" className="font-body-en text-2xl font-extrabold tracking-tight">
        carsell<span className="text-accent">.one</span>
      </Link>

      <nav className="flex gap-5 text-base font-semibold whitespace-nowrap">
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

      <span className="flex-1" />
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
