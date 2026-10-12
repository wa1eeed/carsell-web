import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * ═══ شعار المنصة ═══
 *
 * كان نصًا في ثمانية مواضع: `carsell` ثم `.one` بلون التمييز. **ونصٌّ
 * مكرر ثماني مرات يتغير سبعًا ويبقى واحد** — وقع مثله في هذا المستودع
 * أكثر من مرة. فالشعار مكوّن واحد، وتغييره يصل كل شاشة.
 *
 * ونسختان: ملوّنة للأسطح الفاتحة، وبيضاء للشريط الداكن في لوحة
 * التحكم. والبيضاء ليست فلترًا على الملوّنة — ملفٌّ مستقل بقناة
 * الشفافية نفسها، فلا يعتمد الظهور على دعم المتصفح لـ`filter`.
 *
 * **والأبعاد مكتوبة** (262×109): بلا عرض وارتفاع يحجز المتصفح صفرًا ثم
 * يدفع ما تحته عند التحميل — وهو ما يقيسه CLS.
 */

const WIDTH = 262;
const HEIGHT = 109;

export function Logo({
  variant = 'colour',
  className,
  priority = false,
}: {
  /** `white` للشريط الداكن في اللوحة. */
  variant?: 'colour' | 'white';
  className?: string;
  /** الشعار في الترويسة يظهر فورًا — فلا يُؤجَّل تحميله. */
  priority?: boolean;
}) {
  return (
    <Image
      src={variant === 'white' ? '/logo-white.png' : '/logo.png'}
      alt="CARZ"
      width={WIDTH}
      height={HEIGHT}
      priority={priority}
      className={cn('h-auto w-auto object-contain', className)}
    />
  );
}
