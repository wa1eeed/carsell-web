/**
 * ═══ شاراتُ البطاقة — ما يُفرّق لا ما يَعمّ ═══
 *
 * `card_badge` موضعٌ معرَّفٌ منذ A19 ويُضبط من لوحة الأدمن، **ولم يكن
 * يقرؤه شيء**: لا بطاقةَ في المنتج كلِّه تعرض ميزة. (طلب المالك
 * ٢٠٢٦-١٠-١٨.)
 *
 * **وشارةٌ على كل بطاقة ليست شارة** — فاثنتان على الأكثر، وبترتيب
 * الكتالوج نفسِه (`Feature.sort`) لا بترتيب الصفوف: مصدرٌ واحد
 * يملكه المشغّل، فلا أولويّةٌ ثانية مخبّأة في الشيفرة.
 */
export const MAX_CARD_BADGES = 2;

export type CardBadge = { key: string; nameAr: string; nameEn: string };

/** نوعُ ما يُجلَب من القاعدة — والترتيب من الاستعلام لا من هنا. */
export type CardBadgeRow = { featureKey: string; feature: CardBadge };

/** التسمية بلغة الشاشة — والنطاق لا يعرف اللغة فالاختيار هنا. */
export function badgeLabel(badge: CardBadge, locale: string): string {
  return locale === 'ar' ? badge.nameAr : badge.nameEn;
}
