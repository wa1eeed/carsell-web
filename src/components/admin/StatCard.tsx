import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { cn } from '@/lib/cn';

/**
 * ═══ بطاقة الإحصاء — أكثرُ عنصرٍ تكرارًا في اللوحة ═══
 *
 * كانت مكتوبةً **أربع مرّات**: في `MonitorCards` وفي `Card` المحليّة
 * داخل مراجعة الإعلانات والبلاغات والتوثيق — والثلاث الأخيرة متطابقةٌ
 * حرفًا بحرف. ونسخةٌ رابعة لا تُنتج فرقًا اليوم، بل أوّل تعديلٍ يُصيب
 * واحدةً ويترك ثلاثًا.
 *
 * ═══ والهندسة مقيسةٌ من الترميز ═══
 *
 * نصف قطر ١١px (`rounded-md`) · حشو ‎16px/18px‎ · فجوة ١٤px ·
 * **وخلفية `surface`**. والخلفية كانت غائبة عن بطاقاتنا كلّها: شفّافةً
 * على خلفية الصفحة والحدُّ وحده يحملها، وبطاقةُ التصميم مصمتة — والفرق
 * يُرى في كل شاشة.
 *
 * ═══ والمقاسات النصّية على سُلَّمنا ═══
 *
 * لا على أرقام الترميز الخام: رُفع السُّلَّم بقرارٍ صريح من المالك
 * (الخطوط كانت أصغر من المعتاد عالميًّا)، ورجوعٌ إلى ١٠px هنا ينقض ذلك
 * القرار في أكثر عنصرٍ يُقرأ في اللوحة.
 */
export function StatCard({
  title,
  value,
  note,
  className,
}: {
  title: string;
  value: number | string;
  note: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-line bg-surface px-4.5 py-4', className)}>
      <p className="mb-1.5 text-2xs opacity-50">{title}</p>
      {typeof value === 'number' ? (
        <ArabicNumber value={value} className="text-3xl font-bold" />
      ) : (
        <span className="font-num text-3xl font-bold">{value}</span>
      )}
      <p className="mt-1.5 text-3xs opacity-50">{note}</p>
    </div>
  );
}

/** شبكة البطاقات — والفجوة ١٤px كالترميز. */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </section>
  );
}
