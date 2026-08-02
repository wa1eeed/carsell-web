import { useTranslations } from 'next-intl';
import { EmptyState } from './EmptyState';
import { cn } from '@/lib/cn';

export type HistoryEntry = {
  title: string;
  detail: string | null;
  /** SELLER · INSPECTION · PLATFORM — يظهر بجوار كل سطر. */
  source: string;
};

/**
 * تاريخ المركبة المجاني.
 *
 * **كل سطر يحمل مصدره** (قرار ١٥): «من البائع» ليست «من الفحص»، والقارئ
 * يقدّر ثقة السطر بمصدره. وما لا تملكه المنصة **لا يُعرض** — لا سطر
 * رمادي ولا «غير متاح». البلاغات والرهن والملّاك السابقون في التقرير
 * المدفوع وحده، وهو ما يبرّر ثمنه.
 */
export function HistoryList({
  entries,
  className,
}: {
  entries: readonly HistoryEntry[];
  className?: string;
}) {
  const t = useTranslations('ui');
  const te = useTranslations('enums');

  if (entries.length === 0) {
    return <EmptyState title={t('noHistory')} description={t('noHistoryBody')} />;
  }

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {entries.map((entry, i) => (
        <li key={i} className="flex items-start gap-3.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-1.5 text-sm font-bold">
              <span className="bidi-isolate">{entry.title}</span>
              <span className="text-2xs font-medium opacity-50">
                · {te(`source.${entry.source}`)}
              </span>
            </p>
            {entry.detail === null ? null : (
              <p className="mt-0.5 text-2xs opacity-55">{entry.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
