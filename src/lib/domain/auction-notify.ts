import type { Prisma } from '@/generated/prisma/client';
import type { db } from '@/lib/db';
import { notify, notifyMany, type NotifyInput } from './notifications';

/**
 * ═══ إشعارات المزاد — والمزاد لا يعمل بلا جرس ═══
 *
 * **`auction.outbid` هي الآلة التي يدور عليها المزاد**: تُتجاوَز
 * مزايدتُك فتُخبَر فتعود فترفع. وبلا الخبر لا يعود أحد، فينتهي المزاد
 * على أوّل مزايدةٍ تركها صاحبُها — والصيغة كلُّها تفقد معناها.
 *
 * وقِيس: ستّةُ قوالب مزادٍ مزروعة **بلا كاتبٍ واحد**
 * (`outbid` · `won` · `closing` · `starting` · `extended` ·
 * `reserve_not_met`)، و`auction.lost` وحدها موصولة. فمن خسر يُخبَر ومن
 * فاز لا، ومن تُجووز لا.
 *
 * **والمزاد يُغلقه مُجدوِلٌ لا إنسان** — فلا طرف أمام شاشة لحظة
 * الإغلاق، والجرس هو السبيل الوحيد.
 *
 * والحمولة مفاتيحُ وأرقام، والنصّ في القالب (البوابة ١٧).
 */

type Writer = Prisma.TransactionClient | typeof db;

/**
 * **والوجهة تُحلّ بمعرّف المزاد لا بمرجع الإعلان.**
 *
 * `destinations()` تربط `Auction:{id}` إلى `/auctions/{listing.ref}` —
 * فالمعرّف هو المفتاح، والمرجع هو ما يُعرَض في النصّ. وخلطُهما يُنتج
 * سطرًا بلا رابط: لا يسقط شيء، ولا يُفتح شيء.
 */
type Auction = { id: string; listingRef: string };

const PRIORITY: Record<string, 'critical' | 'high' | 'normal'> = {
  'auction.outbid': 'critical',
  'auction.won': 'critical',
  'auction.closing': 'critical',
  'auction.extended': 'high',
  'auction.reserve_not_met': 'high',
  'deposit.held': 'high',
  'deposit.released': 'high',
  'auction.starting': 'normal',
  'auction.lost': 'normal',
};

function bell(
  userId: string,
  key: string,
  auction: Auction,
  extra: Record<string, string>,
): NotifyInput {
  return {
    userId,
    templateKey: key,
    priority: PRIORITY[key] ?? 'normal',
    payload: { ref: auction.listingRef, ...extra },
    entityType: 'Auction',
    entityId: auction.id,
  };
}

/**
 * تُجووزت مزايدتُه.
 *
 * **ولمن سبق وحده**: من زايد للتوّ يرى نتيجته، ومن كان الأعلى قبله هو
 * من فقد موقعه ولا يعلم. ومن رفع على نفسه لا يُخطَر — تجاوزَ نفسه.
 */
export async function notifyOutbid(
  tx: Writer,
  auction: Auction,
  previousTopBidderId: string | null,
  newBidderId: string,
  amount: number | string,
): Promise<void> {
  if (previousTopBidderId === null || previousTopBidderId === newBidderId) return;
  await notify(bell(previousTopBidderId, 'auction.outbid', auction, {
    amount: String(amount),
  }), tx);
}

/**
 * مُدّد الإغلاق.
 *
 * **ومن ينتظر انتهاءه هو المعنيّ**: ضبط صاحبُ المزايدة منبّهًا على وقتٍ
 * لم يعد الوقت. ويُستثنى من زايد للتوّ — هو من مدّده.
 */
export async function notifyExtended(
  tx: Writer,
  auction: Auction,
  bidderIds: readonly string[],
  exceptId: string,
  minutes: number,
): Promise<void> {
  const targets = [...new Set(bidderIds)].filter((id) => id !== exceptId);
  if (targets.length === 0) return;
  await notifyMany(
    targets.map((id) =>
      bell(id, 'auction.extended', auction, { minutes: String(minutes) }),
    ),
    tx,
  );
}

/**
 * فاز بالمزاد — **ولم يكن يُخبَر**.
 *
 * `auction.lost` موصولةٌ للخاسرين منذ بُنيت، والفائز وحده بلا خبر:
 * رسا عليه المزاد وله مهلة دفعٍ تجري، ولا شيء يقول له إنها بدأت.
 */
export async function notifyWon(
  tx: Writer,
  auction: Auction,
  winnerId: string,
  amount: number | string,
  paymentHours: number,
): Promise<void> {
  await notify(bell(winnerId, 'auction.won', auction, {
    amount: String(amount),
    hours: String(paymentHours),
  }), tx);
}

/**
 * خسر المزاد.
 *
 * **والمفتاح موصولٌ في «اشترِ الآن» وحده**: من اختفى المزاد من تحته
 * فجأةً يُخبَر، ومن خسره بانتهاء وقته لا — وهو الأكثر وقوعًا. و«رُدّ
 * عربونك» وحدها لا تقول «خسرت»، فيبقى يتابع مزادًا انتهى.
 */
export async function notifyLost(
  tx: Writer,
  auction: Auction,
  loserIds: readonly string[],
): Promise<void> {
  const targets = [...new Set(loserIds)];
  if (targets.length === 0) return;
  await notifyMany(targets.map((id) => bell(id, 'auction.lost', auction, {})), tx);
}

/**
 * أُغلق دون الاحتياطي — **وخبرُ البائع**، فالقرار قراره ومهلتُه تجري.
 *
 * وأعلى مزايدٍ معه: عربونُه يبقى محجوزًا حتى يقرّر البائع، فاحتجازُ
 * مالٍ بلا كلمةٍ تفسّره أسوأ من الانتظار نفسه.
 */
export async function notifyReserveNotMet(
  tx: Writer,
  auction: Auction,
  sellerId: string,
  topBidderId: string | null,
): Promise<void> {
  const targets = topBidderId === null ? [sellerId] : [sellerId, topBidderId];
  await notifyMany(
    targets.map((id) => bell(id, 'auction.reserve_not_met', auction, {})),
    tx,
  );
}

/**
 * مزادٌ يبدأ — **لمن حفظ الإعلان**.
 *
 * ولا أحد زايد بعد، فالجمهور الوحيد الصادق هو من وضعه في مفضّلته: دلّ
 * على نيّته قبل أن تفتح النافذة، وهي اللحظة التي ينفعه فيها الخبر.
 */
export async function notifyStarting(
  tx: Writer,
  auction: Auction,
  watcherIds: readonly string[],
): Promise<void> {
  const targets = [...new Set(watcherIds)];
  if (targets.length === 0) return;
  /**
   * **ولا `minutes` هنا**: يُرسَل عند الفتح نفسه لا قبله، فـ«يبدأ بعد
   * ٠ دقيقة» جملةٌ لا معنى لها — والنصّ يقول «بدأ».
   */
  await notifyMany(targets.map((id) => bell(id, 'auction.starting', auction, {})), tx);
}

/** يُغلق قريبًا — لمن زايد فيه، فهم وحدهم من يملك أن يرفع. */
export async function notifyClosingSoon(
  tx: Writer,
  auction: Auction,
  bidderIds: readonly string[],
  minutes: number,
): Promise<void> {
  const targets = [...new Set(bidderIds)];
  if (targets.length === 0) return;
  await notifyMany(
    targets.map((id) =>
      bell(id, 'auction.closing', auction, { minutes: String(minutes) }),
    ),
    tx,
  );
}

/** حُجز عربونه — إقرارٌ بأن مالًا حُجز على بطاقته، وبكم. */
export async function notifyDepositHeld(
  tx: Writer,
  auction: Auction,
  userId: string,
  amount: number | string,
): Promise<void> {
  await notify(bell(userId, 'deposit.held', auction, { amount: String(amount) }), tx);
}

/**
 * رُدّ عربونه.
 *
 * **والمال المحجوز على بطاقةٍ لا يُرى رجوعُه**: إلغاءُ الحجز يختفي من
 * الكشف بلا سطر، فمن لا يُخبَر يظنّ مالَه مأخوذًا.
 */
export async function notifyDepositsReleased(
  tx: Writer,
  auction: Auction,
  userIds: readonly string[],
  amount: number | string,
): Promise<void> {
  const targets = [...new Set(userIds)];
  if (targets.length === 0) return;
  await notifyMany(
    targets.map((id) =>
      bell(id, 'deposit.released', auction, { amount: String(amount) }),
    ),
    tx,
  );
}
