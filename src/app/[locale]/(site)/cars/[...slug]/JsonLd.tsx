import type { Canonical, PublicListingDetail } from '@/lib/domain/listing-detail';
import { APP_URL } from '@/lib/env';

/**
 * البيانات المنظَّمة — `Vehicle` و`FAQPage` و`BreadcrumbList`.
 *
 * **المصدر هو الكائن العام نفسه** الذي تعرضه الصفحة، لا استعلام ثانٍ.
 * `reservePrice` و`minAcceptPrice` غير موجودين في `PublicListingDetail`
 * أصلًا، فتسريبهما إلى JSON-LD **مستحيل بالنوع** لا ممنوع بالمراجعة
 * (قرار ٢٩: لا في استجابة ولا HTML ولا JSON-LD ولا سمة `data-`).
 *
 * والأرقام هنا **لاتينية عمدًا**: هذا حقل آلة لا نصّ قارئ، و
 * schema.org يتطلّب أرقامًا قابلة للتحليل.
 */
export function JsonLd({
  detail,
  faq,
  canonical,
  locale,
}: {
  detail: PublicListingDetail;
  faq: readonly { id: string; question: string; answer: string }[];
  canonical: Canonical;
  locale: string;
}) {
  const site = APP_URL;
  const url = `${site}${canonical.path}`;

  const vehicle = {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    // check-9-ok: حقل آلة — schema.org يتطلّب أرقامًا لاتينية قابلة للتحليل
    name: `${detail.vehicle.title} ${detail.vehicle.year}`,
    url,
    sku: detail.ref,
    brand: { '@type': 'Brand', name: detail.vehicle.brandName },
    model: detail.vehicle.modelName,
    vehicleModelDate: String(detail.vehicle.year),
    mileageFromOdometer: {
      '@type': 'QuantitativeValue',
      value: detail.vehicle.mileageKm,
      unitCode: 'KMT',
    },
    vehicleTransmission: detail.vehicle.transmission,
    fuelType: detail.vehicle.fuel,
    bodyType: detail.vehicle.bodyType,
    driveWheelConfiguration: detail.vehicle.drivetrain,
    vehicleSeatingCapacity: detail.vehicle.seats,
    color: detail.vehicle.colorExterior,
    itemCondition:
      detail.vehicle.condition === 'NEW'
        ? 'https://schema.org/NewCondition'
        : 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      // سعر الطلب المعلن — وهو ما يراه المشتري، لا حدًّا مخفيًا
      price: detail.askPrice,
      priceCurrency: 'SAR',
      availability: 'https://schema.org/InStock',
      url,
      seller: { '@type': 'Organization', name: detail.seller.name },
    },
  };

  const faqPage =
    faq.length === 0
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((entry) => ({
            '@type': 'Question',
            name: entry.question,
            acceptedAnswer: { '@type': 'Answer', text: entry.answer },
          })),
        };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'carsell.one', item: `${site}/${locale}` },
      { name: detail.city, item: `${site}/${locale}/cars/${canonical.city}` },
      { name: detail.vehicle.brandName, item: `${site}/${locale}/cars/${canonical.city}/${canonical.brand}` },
      { name: detail.vehicle.modelName, item: `${site}/${locale}/cars/${canonical.city}/${canonical.brand}/${canonical.model}` },
      { name: detail.ref, item: url },
    ].map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };

  return (
    <>
      {[vehicle, faqPage, breadcrumb].filter((block) => block !== null).map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
