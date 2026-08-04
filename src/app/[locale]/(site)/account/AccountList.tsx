import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { SiteHeader } from '@/components/site/SiteHeader';

/**
 * ═══ قائمة حسابٍ واحدة، تخدم أربع شاشات ═══
 *
 * **الأربع كانت ٤٠٤** والحساب يربط إليها بعدّاداتها: الطلبات
 * والمركبات والمفضّلة والتقارير. والبيانات كانت جاهزة في
 * `getAccountData` منذ بنائها — الشاشة وحدها ناقصة، فيقرأ المستخدم
 * «طلباتي ٣» ويضغط فيصل إلى لا شيء.
 *
 * وهي **قالبٌ واحد** لأن الأربع بنيةٌ واحدة: عنوانٌ وعودةٌ وقائمةٌ
 * أو حالةُ فراغ. ونسخُها أربع مرّات يُنتج أربع صفحاتٍ تتباعد أوّل تعديل.
 */
export function AccountList({
  locale,
  title,
  subtitle,
  empty,
  action,
  children,
}: {
  locale: string;
  title: string;
  subtitle: string;
  empty: { title: string; description: string };
  /** زرّ الحالة الفارغة — «بِع سيارتك» أو «تصفّح» */
  action?: ReactNode;
  children: ReactNode[];
}) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-bg text-ink">
        <div className="mx-auto w-full max-w-3xl px-10 py-10">
          <Link
            href={`/${locale}/account`}
            className="mb-6 inline-block text-2xs opacity-55 hover:opacity-100"
          >
            ← حسابي
          </Link>

          <h1 className="mb-1.5 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mb-8 text-sm opacity-60">{subtitle}</p>

          {children.length === 0 ? (
            <EmptyState title={empty.title} description={empty.description} action={action} />
          ) : (
            <div className="flex flex-col gap-2.5">{children}</div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * صفٌّ واحد: عنوانٌ وسنة، وسطرُ تفاصيل، وقيمةٌ في الطرف.
 * و`href === null` يعني صفًّا لا يُفتح — التقرير الذي سُحب إعلانه.
 */
export function AccountRow({
  href,
  title,
  year,
  meta,
  value,
  badge,
}: {
  href: string | null;
  title: string;
  /** يُحذف حين لا سنة للصفّ — والتقرير منه، فلا يُرسم «٠» */
  year?: number;
  meta: ReactNode;
  value?: ReactNode;
  badge?: { text: string; tone: 'accent' | 'warn' | 'neutral' };
}) {
  const body = (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
          {title}
          {year === undefined ? null : (
            <span className="font-num text-2xs opacity-45">
              <ArabicNumber value={year} grouped={false} />
            </span>
          )}
          {badge === undefined ? null : <Badge tone={badge.tone}>{badge.text}</Badge>}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs opacity-55">{meta}</p>
      </div>
      {value === undefined ? null : <div className="shrink-0 text-end">{value}</div>}
    </div>
  );

  return href === null ? (
    <div className="opacity-60">{body}</div>
  ) : (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {body}
    </Link>
  );
}

export { Money };
