import { APP_URL } from '@/lib/env';

/**
 * ═══ البيانات المنظَّمة لصفحة الهبوط ═══
 *
 * وهي **صفحةُ محرّكِ بحثٍ أوّلًا** — غايتها أن يصلها من يكتب «تويوتا
 * في الرياض». وكانت الوحيدة من صفحات SEO بلا بياناتٍ منظَّمة: لا
 * فُتاتَ يقول أين هي من الشجرة، ولا قائمةَ تقول ما فيها.
 *
 * **والقائمة من المعروض لا من العدّاد**: `ItemList` تُبنى من البطاقات
 * المصيَّرة نفسها، فما يُعلَن هو ما يُرى. وقائمةٌ تُعلن مئةً وتعرض
 * اثنتي عشرة وعدٌ مُخلَف يقرؤه المحرّك قبل الإنسان.
 */
export function LandingJsonLd({
  locale,
  city,
  cityLabel,
  brand,
  brandLabel,
  model,
  modelLabel,
  carsLabel,
  items,
}: {
  locale: string;
  city: string;
  cityLabel: string;
  brand: string;
  brandLabel: string;
  /** المقطع والعنوان للطراز — غيابُهما يعني صفحة المدينة×الماركة. */
  model?: string | undefined;
  modelLabel?: string | undefined;
  carsLabel: string;
  items: readonly { name: string; path: string; price: string }[];
}) {
  const site = APP_URL;
  const browse = `${site}/${locale}/browse/${city}/${brand}`;

  const trail = [
    { name: 'CARZ', item: `${site}/${locale}` },
    { name: carsLabel, item: `${site}/${locale}/cars` },
    {
      name: cityLabel,
      item: `${site}/${locale}/cars?city=${encodeURIComponent(cityLabel)}`,
    },
    { name: brandLabel, item: browse },
    ...(model === undefined || modelLabel === undefined
      ? []
      : [{ name: modelLabel, item: `${browse}/${model}` }]),
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      // check-9-ok: حقل آلة — schema.org يتطلّب أرقامًا لاتينية
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };

  const list =
    items.length === 0
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'Car',
              name: item.name,
              url: `${site}${item.path}`,
              offers: { '@type': 'Offer', price: item.price, priceCurrency: 'SAR' },
            },
          })),
        };

  return (
    <>
      {[breadcrumb, list].filter((block) => block !== null).map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
