import Link from 'next/link';
import { ArabicNumber } from './ArabicNumber';
import { cn } from '@/lib/cn';

export type BodyTypeCard = {
  key: string;
  name: string;
  imageUrl: string | null;
  count: number;
  href: string;
};

/**
 * تصفّح حسب نوع الهيكل.
 *
 * **صفّ أفقي قابل للتمرير لا شبكة**: الأنواع ستّة إلى ثمانية، وشبكةٌ
 * لها تفرض ارتفاعًا يزاحم ما تحته على شاشة صغيرة، والصفّ يعرض ما يسع
 * ويلمّح إلى ما بعده.
 *
 * **بلا صورة يُعرض الاسم وحده** — لا حرف أوّل ولا أيقونة بديلة: الهيكل
 * *شكل* لا اسم، وحرف «س» في مربّع لا يقول «سيدان» لأحد.
 *
 * **والنوع الفارغ يُخفى لا يُعطَّل** — بخلاف شرائح القسط: هناك السلّم
 * نفسه معلومة («لا شيء تحت ألف ريال» جواب)، وهنا «لا فان معروض» ليس
 * جوابًا يبحث عنه أحد.
 */
export function BodyTypeStrip({
  items,
  className,
}: {
  items: readonly BodyTypeCard[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        // التمرير داخل الصفّ وحده — الصفحة لا تتزحزح أفقيًا أبدًا
        'flex gap-2.5 overflow-x-auto pb-1',
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className="w-32 shrink-0 rounded-lg border border-line bg-surface p-2 hover:border-ink/25"
        >
          {item.imageUrl === null ? (
            <span className="washed flex h-16 items-center justify-center rounded-md" />
          ) : (
            /* صورة ظلّية يرفعها الأدمن — نسبة محجوزة قبل التحميل */
            /* eslint-disable-next-line @next/next/no-img-element -- من R2؛ التحسين في المهمة ٢٠ والمقاس مصرَّح به فلا انزياح */
            <img
              src={item.imageUrl}
              alt=""
              width={128}
              height={64}
              className="h-16 w-full rounded-md object-contain"
            />
          )}
          <span className="flex items-center justify-between gap-2 px-1.5 pt-2 pb-0.5">
            <span className="bidi-isolate text-xs font-bold">{item.name}</span>
            <span className="text-2xs opacity-45">
              <ArabicNumber value={item.count} />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
