'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Chip } from '@/components/ui/Chip';
import { SERVICE_CATEGORIES } from '@/lib/domain/service-categories';

/** المرشِّح يكتب في الرابط — الصفحة مفلترة قابلة للمشاركة كما في Wb. */
export function CategoryFilter({ active }: { active: string | null }) {
  const t = useTranslations('services');
  const te = useTranslations('enums');
  const router = useRouter();
  const params = useSearchParams();

  const go = (key: string | null): void => {
    const next = new URLSearchParams(params.toString());
    if (key === null) next.delete('category');
    else next.set('category', key);
    router.push(next.toString() === '' ? '?' : `?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-2.5">
      <Chip active={active === null} onClick={() => go(null)}>
        {t('all')}
      </Chip>
      {SERVICE_CATEGORIES.map((key) => (
        <Chip key={key} active={active === key} onClick={() => go(key)}>
          {te(`serviceCategory.${key}`)}
        </Chip>
      ))}
    </div>
  );
}
