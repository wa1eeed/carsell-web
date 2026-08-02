import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArabicNumber } from './ArabicNumber';
import { Money } from './Money';
import { Quantity } from './Quantity';
import { cn } from '@/lib/cn';

/**
 * أقسام الرئيسية — العناوين والشبكات التي تتكرّر في Wa.
 *
 * جُمِعت في ملف واحد لأنها **لا تُستعمل خارج Wa**: مكوّن لمستهلك واحد
 * موزَّع على سبعة ملفات يُبعثر القراءة بلا مقابل. ما يخرج منها إلى
 * شاشة أخرى يُنقل حينها إلى ملفه.
 */

/** ترويسة قسم: عنوان · خطّ · رابط. الفصل بالخطوط لا بالظلال. */
export function SectionHead({
  title,
  action,
  href,
  className,
}: {
  title: string;
  action?: string;
  href?: string;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 flex items-baseline gap-3.5', className)}>
      <h2 className="text-2xl font-bold">{title}</h2>
      <span className="h-px flex-1 bg-line" />
      {action === undefined ? null : href === undefined ? (
        <span className="text-xs font-bold text-accent-700">{action}</span>
      ) : (
        <Link href={href} className="text-xs font-bold text-accent-700 hover:underline">
          {action}
        </Link>
      )}
    </header>
  );
}

export type SummaryCard = {
  key: string;
  title: string;
  body: string;
  /** العدد الحقيقي، أو `null` لبطاقة الإجراء («بِع سيارتك»). */
  count: number | null;
  unit: 'cars' | 'auctions';
  action: string;
  href: string;
  icon: ReactNode;
};

/** البطاقات الأربع تحت الصدر — كل رقم فيها محسوب. */
export function SummaryCards({ cards }: { cards: readonly SummaryCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.key}
          href={card.href}
          className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5 hover:border-ink/25"
        >
          <span className="flex size-11 items-center justify-center rounded-lg border border-line bg-bg text-accent-800">
            {card.icon}
          </span>
          <span>
            <span className="mb-1 block text-lg font-bold">{card.title}</span>
            <span className="block text-xs opacity-60">{card.body}</span>
          </span>
          <span className="mt-auto flex items-center gap-2 text-xs font-bold text-accent-700">
            {card.count === null ? (
              card.action
            ) : (
              <Quantity unit={card.unit} count={card.count} />
            )}
            <svg viewBox="0 0 24 24" className="size-3 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * شبكة الماركات.
 *
 * العدّاد تحت كل ماركة هو عدد إعلاناتها المنشورة — لا رقم ثابت. وماركة
 * بلا إعلان لا تظهر: شبكةٌ نصفها أصفار تعلّم الزائر ألّا يثق بالأرقام.
 */
export function BrandGrid({
  brands,
  remaining,
  locale,
}: {
  brands: readonly { id: string; nameAr: string; nameEn: string; slug: string; count: number }[];
  remaining: number;
  locale: string;
}) {
  const t = useTranslations('site');

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {brands.map((brand) => (
        <Link
          key={brand.id}
          href={`/${locale}/cars?brandId=${brand.id}`}
          className="rounded-lg border border-line py-4.5 text-center hover:border-ink/25"
        >
          <span className="washed mx-auto mb-2.5 block size-9 rounded-md" />
          <span className="block text-xs font-bold">
            {locale === 'ar' ? brand.nameAr : brand.nameEn}
          </span>
          <span className="mt-1 block text-3xs opacity-45">
            <ArabicNumber value={brand.count} />
          </span>
        </Link>
      ))}
      {remaining <= 0 ? null : (
        <Link
          href={`/${locale}/cars`}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-4.5 hover:border-ink/25"
        >
          <span className="text-xl font-bold text-accent-700">
            <ArabicNumber value={remaining} />
          </span>
          <span className="mt-1 text-2xs opacity-55">{t('moreBrands')}</span>
        </Link>
      )}
    </div>
  );
}

/** خطوات الشراء — أربع بطاقات مرقّمة على سطح فاتح. */
export function StepList({ steps }: { steps: readonly { title: string; body: string }[] }) {
  return (
    <ol className="flex flex-col gap-8 md:flex-row">
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-1 flex-col gap-3">
          <span className="flex items-center gap-3">
            <span className="font-num flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg">
              <ArabicNumber value={i + 1} grouped={false} />
            </span>
            <span className="h-px flex-1 bg-line" />
          </span>
          <span className="text-base font-bold">{step.title}</span>
          <span className="text-xs leading-loose opacity-65">{step.body}</span>
        </li>
      ))}
    </ol>
  );
}

/** الضمانات الأربع — على سطح داكن، مفصولة بخطوط رأسية. */
export function ValueProps({ items }: { items: readonly { title: string; body: string }[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-0">
      {items.map((item, i) => (
        <div
          key={item.title}
          className={cn('lg:px-8', i > 0 && 'lg:border-s lg:border-s-bg/16', i === 0 && 'lg:ps-0')}
        >
          <p className="mb-1.5 text-base font-bold">{item.title}</p>
          <p className="text-xs leading-loose opacity-68">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * خدمات مدفوعة — الاسم والوصف والسعر.
 * السعر من `Service.price` لا من نصّ: خدمةٌ تغيّر سعرها في الأدمن يجب
 * أن يتغيّر معها ما يقرؤه الزائر في اللحظة نفسها.
 */
export function ServiceBanners({
  services,
  locale,
}: {
  services: readonly { key: string; nameAr: string; nameEn: string; descAr: string; descEn: string; price: string }[];
  locale: string;
}) {
  if (services.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {services.map((service) => (
        <article key={service.key} className="rounded-xl border border-line p-5">
          <h3 className="mb-1.5 text-sm font-bold">
            {locale === 'ar' ? service.nameAr : service.nameEn}
          </h3>
          <p className="mb-3.5 text-2xs leading-relaxed opacity-60">
            {locale === 'ar' ? service.descAr : service.descEn}
          </p>
          <Money amount={Number(service.price)} size="md" className="text-accent-700" />
        </article>
      ))}
    </div>
  );
}
