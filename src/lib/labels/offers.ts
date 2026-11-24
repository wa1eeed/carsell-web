import type { InboxOffer } from '@/lib/domain/offer-inbox';

/**
 * موضعُ العرض من سعر البائع وأرضيّته — **صياغةٌ في الشاشة لا في النطاق**
 * (البوابة ١٧)، وبتعهّدٍ يفحصه المُصرِّف (البوابة ٥٩).
 *
 * و`above_ask` جملةٌ ناقصة يُتمّها المبلغ («أعلى من سعرك بـ ١٬٠٠٠»):
 * الفرقُ هو الخبر، وقولُ «أعلى من سعرك» بلا مقداره يترك البائع يطرح.
 */
export const OFFER_STANDING = {
  above_ask: 'أعلى من سعرك بـ',
  above_floor: 'فوق الحد الأدنى',
  below_floor: 'دون الحد الأدنى',
  no_floor: 'لا حد أدنى موضوع',
} as const satisfies Record<Exclude<InboxOffer['standing'], null>, string>;
