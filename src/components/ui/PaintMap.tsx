import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type PanelState = 'original' | 'repainted' | 'unknown';
export type Panel = { key: string; state: PanelState };

/**
 * مخطط الهيكل — لوحات المركبة وحالة صبغ كلٍّ منها.
 *
 * ثلاث حالات لا اثنتان: **«لم يُقس» ليست «أصلي»**. إخفاء الفرق بينهما
 * يجعل لوحة لم يمرّ عليها المقياس تبدو موثّقة، وهذا أسوأ من الصمت.
 *
 * الترتيب في شبكة ٣×٣ يقارب هيكل السيارة: مقدّمة فوق، جوانب في
 * الوسط، مؤخّرة تحت — لا خريطة تشريحية، لكنها تُقرأ بلا مفتاح.
 */
const GRID: readonly (string | null)[] = [
  'frontLeftFender', 'hood', 'frontRightFender',
  'leftFrontDoor', 'roof', 'rightFrontDoor',
  'leftRearDoor', 'trunk', 'rightRearDoor',
];

const TONE: Record<PanelState, string> = {
  original: 'bg-accent-200',
  repainted: 'bg-accent-2',
  unknown: 'bg-ink/12',
};

export function PaintMap({
  panels,
  className,
}: {
  panels: readonly Panel[];
  className?: string;
}) {
  const t = useTranslations('ui');
  const stateOf = (key: string): PanelState =>
    panels.find((panel) => panel.key === key)?.state ?? 'unknown';

  return (
    <div className={cn('rounded-xl border border-line p-4.5', className)}>
      <h4 className="mb-3 text-xs font-bold">{t('paintMap')}</h4>
      <div className="grid grid-cols-3 gap-1.5">
        {GRID.map((key) => (
          <span
            key={key}
            title={key === null ? undefined : t(`panel.${key}`)}
            className={cn('h-5 rounded-xs', TONE[key === null ? 'unknown' : stateOf(key)])}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-3 text-3xs font-medium">
        {(['original', 'repainted', 'unknown'] as const).map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-xs', TONE[state])} />
            {t(`paint.${state}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
