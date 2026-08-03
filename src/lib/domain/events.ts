import { z } from 'zod';
import { auctionChannel, userChannel } from '@/lib/realtime/channels';

/**
 * أحداث النطاق — **مصدر الحقيقة الواحد** الذي يستهلكه REST وWebSocket
 * والتطبيق. الحمولة متحقَّقة بـZod على الطرفين: الناشر يتحقّق قبل النشر
 * والمستهلك بعد الاستقبال، فلا رسالة مشوّهة تعبر.
 *
 * **الرسالة إشعار بتغيّر لا مصدر بيانات.** لذلك الحمولة معرّفات وأرقام
 * صغيرة فقط: العميل يقرأ التفاصيل من REST. رسالة ضائعة تعني تحديثًا
 * متأخّرًا لا سعرًا خاطئًا على شاشة مزايد.
 *
 * **ممنوع في أي حمولة:** `reservePrice` · `minAcceptPrice` · هوية
 * المزايد الكاملة. الاسم مختصر دائمًا («خالد ع.») ولا يُعاد معرّف
 * المستخدم في قناة عامة.
 */

/** التسلسل يُضاف عند النشر لا عند البناء — الناشر وحده يملك العدّاد. */
const Sequenced = { seq: z.number().int().nonnegative() };

// ═══════════════════════════════════════════════════════════
//  قناة المزاد — عامة
// ═══════════════════════════════════════════════════════════

export const BidPlaced = z.object({
  type: z.literal('bid.placed'),
  auctionId: z.string().min(1),
  amount: z.string(), // Decimal كنصّ — لا Float في المال ولو في رسالة
  // «خالد ع.» — لا اسم كامل ولا معرّف. و`null` حين لا اسم، والشاشة تسمّي المجهول
  bidderMasked: z.string().min(1).nullable(),
  bidCount: z.number().int().nonnegative(),
  ...Sequenced,
});

export const AuctionExtended = z.object({
  type: z.literal('auction.extended'),
  auctionId: z.string().min(1),
  newEndsAt: z.string().datetime(),
  ...Sequenced,
});

export const AuctionEnded = z.object({
  type: z.literal('auction.ended'),
  auctionId: z.string().min(1),
  /** بلوغ الاحتياطي من عدمه — **لا قيمته** */
  result: z.enum(['ENDED_MET', 'ENDED_UNMET', 'CANCELLED']),
  ...Sequenced,
});

// ═══════════════════════════════════════════════════════════
//  قناة المستخدم — خاصة بصاحبها
// ═══════════════════════════════════════════════════════════

export const OfferReceived = z.object({
  type: z.literal('offer.received'),
  offerId: z.string().min(1),
  listingRef: z.string().min(1),
  amount: z.string(),
  ...Sequenced,
});

export const OfferCountered = z.object({
  type: z.literal('offer.countered'),
  offerId: z.string().min(1),
  listingRef: z.string().min(1),
  amount: z.string(),
  ...Sequenced,
});

export const OfferAccepted = z.object({
  type: z.literal('offer.accepted'),
  offerId: z.string().min(1),
  listingRef: z.string().min(1),
  orderRef: z.string().min(1),
  ...Sequenced,
});

export const OrderStageChanged = z.object({
  type: z.literal('order.stage_changed'),
  orderRef: z.string().min(1),
  stage: z.enum([
    'REQUEST',
    'APPROVED',
    'INSPECTION',
    'PAYMENT',
    'TRANSFER',
    'DONE',
  ]),
  ...Sequenced,
});

export const RealtimeEvent = z.discriminatedUnion('type', [
  BidPlaced,
  AuctionExtended,
  AuctionEnded,
  OfferReceived,
  OfferCountered,
  OfferAccepted,
  OrderStageChanged,
]);

export type RealtimeEvent = z.infer<typeof RealtimeEvent>;
export type RealtimeEventType = RealtimeEvent['type'];

/**
 * الحدث قبل إضافة التسلسل — ما يبنيه استدعاء النطاق.
 * `Omit` على اتحاد مميَّز يطوي الأنواع إلى مفاتيحها المشتركة،
 * فيلزم توزيعه على كل فرع حتى تبقى الحقول الخاصة بكل حدث.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type UnsequencedEvent = DistributiveOmit<RealtimeEvent, 'seq'>;

/**
 * القناة التي ينتمي إليها الحدث.
 * الربط هنا لا في موضع النشر، فلا يُنشر حدث مزاد على قناة مستخدم بالخطأ.
 */
export function channelFor(
  event: UnsequencedEvent,
  recipientId?: string,
): string {
  switch (event.type) {
    case 'bid.placed':
    case 'auction.extended':
    case 'auction.ended':
      return auctionChannel(event.auctionId);
    case 'offer.received':
    case 'offer.countered':
    case 'offer.accepted':
    case 'order.stage_changed': {
      if (recipientId === undefined || recipientId === '') {
        throw new Error(`Event ${event.type} is private and requires a recipient id`);
      }
      return userChannel(recipientId);
    }
  }
}

/**
 * اسم مختصر للعرض العام: الاسم الأول ثم أول حرف من العائلة.
 * الشفافية تقتضي معرفة «من زايد»، والخصوصية تمنع الاسم الكامل.
 */
export function maskName(fullName: string | null): string | null {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (first === undefined) return null;
  const family = parts[1];
  return family === undefined ? first : `${first} ${family.charAt(0)}.`;
}
