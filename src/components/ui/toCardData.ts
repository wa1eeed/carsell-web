import type { ListingCardData } from '@/components/ui/CarCard';

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
  publishedAt: string | null;
  highestBid: string | null;
  bidderCount: number | null;
  endsAt: string | null;
};

export function toCardData(
  row: SearchRow,
  labels: { transmission: string; anonymousSeller: string },
): ListingCardData {
  return {
    ...row,
    transmissionLabel: labels.transmission,
    price: Number(row.price),
    monthly: row.monthly ?? undefined,
    // `null` من النطاق — والتسمية من الشاشة
    sellerName: row.sellerName ?? labels.anonymousSeller,
    /**
     * **وحقول المزاد تُحذف لا تُصفَّر.** صفرٌ في «أعلى مزايدة» يوحي
     * بأن المركبة بلا قيمة، و`undefined` تجعل البطاقة لا تعرض السطر.
     */
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
    ...(row.highestBid === null ? {} : { highestBid: Number(row.highestBid) }),
    ...(row.bidderCount === null ? {} : { bidderCount: row.bidderCount }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt }),
  } as ListingCardData;
}
