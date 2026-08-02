import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    // التخزين والحساب دائمًا Latin — العرض فقط عربي-هندي (القسم ٣ قاعدة ٢)
    timeZone: 'Asia/Riyadh',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
