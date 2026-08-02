import type { Prisma } from '@/generated/prisma/client';

/**
 * «بائع موثّق» — **حالة واحدة محسوبة لا حقلان**.
 *
 * فرد: `idVerified` (النفاذ الوطني أو مراجعة يدوية).
 * تاجر: `Dealer.verified` (سجل تجاري متحقَّق منه).
 *
 * المشتري لا يميّز فردًا من تاجر حين يبحث عن الأمان — يريد بائعًا
 * تحقّقت المنصة من هويته. شارتان مختلفتان لنفس المعنى تُربكه.
 *
 * **الشارة المعروضة تختلف** («بائع موثّق» / «تاجر موثّق») والمعيار واحد:
 * التسمية تصف الطرف، لا تصف معيارًا آخر.
 *
 * كل قارئ — الفلتر والشارة والفرز — يمرّ من هنا. الشرط لا يُكرَّر في
 * استعلام، وإلا انحرف أحدهما عن الباقي بلا أن يظهر.
 */

export type SellerLike = {
  idVerified: boolean;
  dealer?: { verified: boolean } | null;
};

export function isVerifiedSeller(seller: SellerLike): boolean {
  return seller.idVerified || seller.dealer?.verified === true;
}

export type SellerBadge = 'DEALER_VERIFIED' | 'USER_VERIFIED' | null;

/** الشارة المعروضة — نفس المعيار وتسمية تصف الطرف. */
export function sellerBadge(seller: SellerLike): SellerBadge {
  if (!isVerifiedSeller(seller)) return null;
  return seller.dealer != null ? 'DEALER_VERIFIED' : 'USER_VERIFIED';
}

/**
 * نفس الشرط في صيغة Prisma، ليقرأه الفلتر من المصدر نفسه.
 * `seller` هو `User` على `Listing`.
 */
export function verifiedSellerWhere(verified = true): Prisma.ListingWhereInput {
  const isVerified: Prisma.ListingWhereInput = {
    OR: [{ seller: { idVerified: true } }, { seller: { dealer: { verified: true } } }],
  };
  return verified ? isVerified : { NOT: isVerified };
}
