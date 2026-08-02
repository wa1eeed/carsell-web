'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from './Button';
import { formatNumber, type NumeralLocale } from '@/lib/arabic';
import { cn } from '@/lib/cn';

const PRICE_STEPS = [50_000, 100_000, 150_000, 250_000, 500_000] as const;

/**
 * شريط البحث في صدر الرئيسية.
 *
 * **يبني الرابط نفسه الذي تفكّه Wb** — لا مسار بحث ثانٍ. ما يُكتب هنا
 * يصير `searchParams` تقرأها صفحة النتائج، فالزائر يصل إلى شاشة قابلة
 * للمشاركة من أول نقرة.
 *
 * ومدخل الجملة الحرّة **غائب كليًا** لا معطّلًا (قرار ٢٤): لا يُعرض
 * ما لا يعمل.
 */
export function HeroSearch({
  cities,
  className,
}: {
  cities: readonly string[];
  className?: string;
}) {
  const t = useTranslations('site');
  const te = useTranslations('enums');
  const router = useRouter();
  // `<option>` نصّ لا عقدة، فالصياغة هنا بلغة الصفحة لا بلغة مثبَّتة
  const numerals = useLocale() as NumeralLocale;

  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [condition, setCondition] = useState('');
  const [priceMax, setPriceMax] = useState('');

  const submit = (): void => {
    const params = new URLSearchParams();
    if (query.trim() !== '') params.set('q', query.trim());
    if (city !== '') params.set('city', city);
    if (condition !== '') params.set('condition', condition);
    if (priceMax !== '') params.set('priceMax', priceMax);
    router.push(`cars${params.size === 0 ? '' : `?${params.toString()}`}`);
  };

  const field = 'flex-1 min-w-40 px-4.5 py-3';
  const label = 'mb-1.5 block text-3xs font-medium opacity-50';
  const input =
    'w-full bg-transparent text-sm font-semibold outline-none placeholder:opacity-45';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        'flex flex-wrap items-stretch gap-0.5 rounded-xl bg-bg p-2 text-ink',
        className,
      )}
    >
      <div className={cn(field, 'flex-[1.5]')}>
        <label className={label} htmlFor="hero-q">
          {t('searchBrandModel')}
        </label>
        <input
          id="hero-q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className={input}
        />
      </div>

      <span className="my-1.5 w-px bg-line" aria-hidden />

      <div className={field}>
        <label className={label} htmlFor="hero-city">
          {t('city')}
        </label>
        <select
          id="hero-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className={input}
        >
          <option value="">{t('anyCity')}</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <span className="my-1.5 w-px bg-line" aria-hidden />

      <div className={field}>
        <label className={label} htmlFor="hero-condition">
          {t('condition')}
        </label>
        <select
          id="hero-condition"
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          className={input}
        >
          <option value="">{t('anyCondition')}</option>
          <option value="USED">{te('condition.USED')}</option>
          <option value="NEW">{te('condition.NEW')}</option>
        </select>
      </div>

      <span className="my-1.5 w-px bg-line" aria-hidden />

      <div className={field}>
        <label className={label} htmlFor="hero-price">
          {t('priceUpTo')}
        </label>
        <select
          id="hero-price"
          value={priceMax}
          onChange={(event) => setPriceMax(event.target.value)}
          className={input}
        >
          <option value="">{t('anyPrice')}</option>
          {PRICE_STEPS.map((step) => (
            <option key={step} value={step}>
              {formatNumber(step, numerals)}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="px-9">
        {t('search')}
      </Button>
    </form>
  );
}
