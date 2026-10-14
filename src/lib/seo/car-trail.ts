import type { Canonical } from '@/lib/domain/listing-detail';

/**
 * مسارُ الفُتات — **دالّةٌ خالصة تُختبَر**.
 *
 * فالقاعدة التي يحرسها اختبارٌ هي «لا عقدةَ بلا صفحة»، ولا تُفحص على
 * مكوّنٍ يُصيَّر. و`/cars/{مدينة}/{ماركة}` لا تظهر فيها أبدًا: ذلك
 * الشكل ليس مسارًا في المنتج، وكان يُعلَن ثلاثَ مرّات في كل صفحة
 * مركبة.
 */
export function carTrail({
  site,
  locale,
  url,
  city,
  brandName,
  modelName,
  ref,
  canonical,
  landing,
}: {
  site: string;
  locale: string;
  url: string;
  city: string;
  brandName: string;
  modelName: string;
  ref: string;
  canonical: Canonical;
  landing: { brand: boolean; model: boolean };
}): { name: string; item: string }[] {
  const browse = `${site}/${locale}/browse/${canonical.city}/${canonical.brand}`;
  return [
    { name: 'CARZ', item: `${site}/${locale}` },
    { name: city, item: `${site}/${locale}/cars?city=${encodeURIComponent(city)}` },
    ...(landing.brand ? [{ name: brandName, item: browse }] : []),
    ...(landing.model ? [{ name: modelName, item: `${browse}/${canonical.model}` }] : []),
    { name: ref, item: url },
  ];
}
