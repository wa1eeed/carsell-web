import type { ListingCardData } from '@/components/ui/CarCard';
import { badgeLabel } from '@/lib/catalog/badges';

/**
 * ═══ صفُّ البحث إلى بطاقة — **مرّةً لا أربعًا** ═══
 *
 * التحويل نفسه مكتوبٌ في شاشة البحث والرئيسية وصفحة المعرض وصفحة
 * الهبوط: نصٌّ إلى رقم، و`null` إلى تسمية، وحقولُ المزاد المشروطة.
 * **وأربع نسخٍ تتباعد أوّل حقلٍ يُضاف** — فتعرض شاشةٌ عدّاد المزايدين
 * وأخرى لا تعرضه، والفرق لا يُلاحَظ حتى يسأل عنه مستخدم.
 *
 * **والتسمية تُمرَّر لا تُشتقّ هنا**: هذه الوحدة لا تعرف اللغة ولا
 * تملك `useTranslations` — فالشاشة تقرأ `enums` وتُعطي.
 */
export type SearchRow = {
  ref: string;
  href: string;
  title: string;
  year: number;
  city: string;
  mileageKm: number;
  price: string;
  monthly: number | null;
  type: string;
  inspected: boolean;
  imageCount: number;
  sellerName: string | null;
  sellerVerified: boolean;
  isOwn: boolean;
  publishedAt: string | null;
  highestBid: string | null;
  bidderCount: number | null;
  endsAt: string | null;
  /** بلغتيها من النطاق — والشاشة تختار، فهي التي تعرف لغتها. */
  badges: readonly { key: string; nameAr: string; nameEn: string }[];
};

export function toCardData(
  row: SearchRow,
  labels: { transmission: string; anonymousSeller: string; locale: string },
): ListingCardData {
  /**
   * ═══ والحقول تُكتب واحدًا واحدًا — لا `...row` ═══
   *
   * كانت تبدأ بـ`...row` ثمّ تُضيف أسفلها
   * `...(row.endsAt === null ? {} : { endsAt })` ظنًّا أن ذلك **يحذف**
   * الحقل — **والنشرُ الأوّل قد وضعه أصلًا**، فيبقى `endsAt: null`.
   *
   * و`as ListingCardData` هي التي أسكتت المترجم: النوع يقول
   * `endsAt?: string` والقيمة `null`، فتمرّ `endsAt !== undefined` في
   * البطاقة ويصل `null` إلى `Countdown` — **فتسقط الصفحة كلّها ٥٠٠**.
   *
   * وقعت على `/browse/tabuk/lexus` (إحدى صفحتَي هبوطٍ قائمتين)، ولا
   * اختبارَ يسقط: الصفحة تُصيَّر في الخادم والخطأ في العميل.
   *
   * فالكتابة صريحةٌ بلا نشرٍ وبلا قسر، والمترجم يفحصها.
   */
  return {
    ref: row.ref,
    title: row.title,
    year: row.year,
    city: row.city,
    mileageKm: row.mileageKm,
    transmissionLabel: labels.transmission,
    price: Number(row.price),
    type: row.type as ListingCardData['type'],
    inspected: row.inspected,
    imageCount: row.imageCount,
    // `null` من النطاق — والتسمية من الشاشة
    sellerName: row.sellerName ?? labels.anonymousSeller,
    sellerVerified: row.sellerVerified,
    isOwn: row.isOwn,
    badges: row.badges.map((badge) => badgeLabel(badge, labels.locale)),
    /**
     * **وحقول المزاد تُحذف لا تُصفَّر.** صفرٌ في «أعلى مزايدة» يوحي
     * بأن المركبة بلا قيمة، و`undefined` تجعل البطاقة لا تعرض السطر.
     */
    ...(row.monthly === null ? {} : { monthly: row.monthly }),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
    ...(row.highestBid === null ? {} : { highestBid: Number(row.highestBid) }),
    ...(row.bidderCount === null ? {} : { bidderCount: row.bidderCount }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
  };
}
