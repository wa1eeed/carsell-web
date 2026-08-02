import { defineRouting } from 'next-intl/routing';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

/** اتجاه الكتابة يُشتقّ من اللغة — لا يُكتب يدويًا في أي شاشة. */
const direction: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return direction[locale];
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * كوكي الاختيار المعلن.
 * يُكتب **عند الضغط على مبدّل اللغة وحده** ويُقرأ في `/` فقط.
 * لا يُكتب من الخادم ولا يُستنتج من أي ترويسة.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // سنة

export const routing = defineRouting({
  locales,
  defaultLocale,
  // البادئة ظاهرة دائمًا: /ar و/en — الروابط قابلة للمشاركة والزحف
  localePrefix: 'always',
  /**
   * لا استنتاج صامت للّغة: `accept-language` مُهمَل تمامًا،
   * فـ`/` يذهب إلى `/ar` ما لم يكن هناك اختيار معلن.
   * قراءة الاختيار المعلن تتم في `middleware.ts` لا هنا،
   * لأن `localeDetection` في next-intl يعطّل الكوكي والترويسة معًا.
   */
  localeDetection: false,
});
