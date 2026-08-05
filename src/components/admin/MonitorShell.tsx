import type { ReactNode } from 'react';
import { StatCard, StatGrid } from '@/components/admin/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { toArabicDigits } from '@/lib/arabic';

/**
 * ═══ صدفة شاشات المراقبة — A16 · A22 · A23 · A27 ═══
 *
 * أربع شاشات بالبنية نفسها في التصميم: **بطاقات، ثم تابز بعدّادات،
 * ثم قائمة**. وكتابتها أربع مرّات تُنتج أربعة تخطيطات تتباعد أوّل
 * تعديل — والفرق يُرى حين تُفتح الشاشتان جنبًا إلى جنب.
 *
 * فالتخطيط هنا مرّةً واحدة، ولكل شاشة صفوفها وبطاقاتها.
 */

export type MonitorCard = { title: string; value: number | string; note: string };
export type MonitorTab = { key: string | null; label: string; count: number };

/** الوقت المنقضي نصًّا — والجملة لا يحكمها المعدود (البوابة ١٨). */
export function elapsed(minutes: number): string {
  if (minutes < 60) return `دقائق (${toArabicDigits(String(minutes))})`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.floor(hours / 24)))})`;
}

/**
 * عدّاد تنازليّ **يُرسَم على الخادم**.
 *
 * والسالب يعني أن الوقت انقضى ولم تمرّ الوظيفة الدورية بعد — فيُقال
 * «انتهى — يُحتسب الآن» لا «مباشر»، لأننا لا نعرف بعدُ أبلغ الاحتياطي
 * أم لا.
 */
export function countdown(seconds: number): string {
  if (seconds <= 0) return 'انتهى — يُحتسب الآن';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${toArabicDigits(String(h).padStart(2, '0'))}:${toArabicDigits(String(m).padStart(2, '0'))}`;
}

/**
 * بطاقات المراقبة — **وتبني على `StatCard` لا تنسخها**.
 *
 * فالهندسة مكتوبةٌ مرّةً واحدة، وتعديلها يُصيب كل شاشة معًا.
 */
export function MonitorCards({ cards }: { cards: readonly MonitorCard[] }) {
  return (
    <StatGrid>
      {cards.map((card) => (
        <StatCard key={card.title} title={card.title} value={card.value} note={card.note} />
      ))}
    </StatGrid>
  );
}

export function MonitorTabs({
  tabs,
  active,
  basePath,
  param = 'filter',
}: {
  tabs: readonly MonitorTab[];
  active: string | null;
  basePath: string;
  param?: string;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <a
          key={tab.key ?? 'all'}
          href={tab.key === null ? basePath : `${basePath}?${param}=${tab.key}`}
          className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-2xs ${
            active === tab.key ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink'
          }`}
        >
          {tab.label}
          <span className="font-num opacity-60">{toArabicDigits(String(tab.count))}</span>
        </a>
      ))}
    </nav>
  );
}

export function MonitorList({
  children,
  empty,
  note,
}: {
  children: ReactNode;
  empty: { title: string; description: string };
  note?: string;
}) {
  const rows = Array.isArray(children) ? children : [children];
  const isEmpty = rows.flat().filter(Boolean).length === 0;

  return (
    <>
      {isEmpty ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">{children}</div>
      )}
      {note === undefined ? null : (
        <p className="mt-7 max-w-2xl rounded-lg border border-line bg-surface p-4 text-2xs leading-loose opacity-65">
          {note}
        </p>
      )}
    </>
  );
}

/** صفٌّ واحد — عنوانٌ وسطرٌ تحته على اليمين، وتفاصيل على اليسار. */
export function MonitorRow({
  title,
  subtitle,
  meta,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="bidi-isolate truncate text-sm font-bold">{title}</span>
        {subtitle === undefined ? null : (
          <span className="truncate text-2xs opacity-60">{subtitle}</span>
        )}
        {meta === undefined ? null : <span className="text-3xs opacity-45">{meta}</span>}
      </div>
      {children === undefined ? null : (
        <div className="flex flex-wrap items-center gap-5">{children}</div>
      )}
    </div>
  );
}
