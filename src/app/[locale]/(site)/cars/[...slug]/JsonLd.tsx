import type { Canonical, PublicListingDetail } from '@/lib/domain/listing-detail';
import { carTrail } from '@/lib/seo/car-trail';
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
/**
 * حالة الإعلان بمفردات schema.org — والمحجوز **ليس مباعًا**: طلبٌ قد
 * يُلغى فيعود معروضًا، فـ`LimitedAvailability` أصدق من `SoldOut`.
 */
const AVAILABILITY: Record<string, string> = {
  PUBLISHED: 'https://schema.org/InStock',
  RESERVED: 'https://schema.org/LimitedAvailability',
  SOLD: 'https://schema.org/SoldOut',
};

export function JsonLd({
  detail,
  faq,
  canonical,
  locale,
  landing,
}: {
  detail: PublicListingDetail;
  faq: readonly { id: string; question: string; answer: string }[];
  canonical: Canonical;
  locale: string;
  /**
   * أللمدينة×الماركة (ثم الطراز) صفحةُ هبوطٍ قائمة؟ — تُقرأ في الخادم
   * ولا تُفترض. **ومسارٌ يُعلَن ولا وجود له يُفسد الفُتات كلّه** عند
   * محرّك البحث، ولا يشكو منه مستخدمٌ فيُكتشف.
   */
  landing: { brand: boolean; model: boolean };
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
      /**
       * ═══ والتوافر يتبع الحالة ═══
       *
       * **كان `InStock` دائمًا** — حتى للمباع. فمحرّك البحث يُعلن
       * مركبةً بِيعت على أنها متاحة، والزائر ينقر ويجد صفحة «بِيعت»:
       * وعدٌ مُخلَف يراه من لم يزر المنصّة قطّ، وتكرارُه يُفقد نتائجنا
       * الثراء الذي بُني لها.
       */
      availability: AVAILABILITY[detail.status] ?? 'https://schema.org/InStock',
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

  /**
   * ═══ ولا تُعلَن عقدةٌ بلا صفحة ═══
   *
   * كان الفُتات يشير إلى `/cars/{المدينة}/{الماركة}` و
   * `/cars/{…}/{…}/{الطراز}` — **وثلاثتُها تردّ ٤٠٤**، فالمسار الحقيقيّ
   * للمدينة×الماركة هو صفحة الهبوط `/browse/…`، ولا صفحة لمدينةٍ وحدها.
   *
   * فالمدينة تُحمَل على البحث بمرشّحها (صفحةٌ قائمة دائمًا)، والماركة
   * والطراز على صفحتَي الهبوط **حين تبلغان عتبتهما**، وتُطرح العقدة
   * إن لم تبلغ: فُتاتٌ أقصر أصدق من فُتاتٍ يقود إلى عدم.
   */
  const trail = carTrail({
    site,
    locale,
    url,
    city: detail.city,
    brandName: detail.vehicle.brandName,
    modelName: detail.vehicle.modelName,
    ref: detail.ref,
    canonical,
    landing,
  });

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, i) => ({
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
