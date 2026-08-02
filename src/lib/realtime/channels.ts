/**
 * أسماء القنوات — **مصدر واحد**.
 *
 * لا اسم قناة يُكتب نصًّا في استدعاء: خطأ حرف واحد في `auction:`
 * لا يظهر في مراجعة ولا في اختبار، ويُنتج قناةً لا يستمع إليها أحد.
 *
 * التفويض على مستوى القناة:
 *   · `auction:{id}` عامة — يشترك فيها أي متصل.
 *   · `user:{id}` خاصة — لصاحبها وحده، تتحقّق منها الخدمة
 *     بمطابقة معرّف التذكرة بمعرّف القناة.
 */

export const CHANNEL_PREFIX = {
  auction: 'auction',
  user: 'user',
} as const;

export type ChannelScope = keyof typeof CHANNEL_PREFIX;

export function auctionChannel(auctionId: string): string {
  return `${CHANNEL_PREFIX.auction}:${auctionId}`;
}

export function userChannel(userId: string): string {
  return `${CHANNEL_PREFIX.user}:${userId}`;
}

/** يفكّ اسم القناة، ويعيد `null` لما ليس قناة معروفة. */
export function parseChannel(
  channel: string,
): { scope: ChannelScope; id: string } | null {
  const separator = channel.indexOf(':');
  if (separator <= 0) return null;

  const scope = channel.slice(0, separator);
  const id = channel.slice(separator + 1);
  if (id === '') return null;

  if (scope === CHANNEL_PREFIX.auction) return { scope: 'auction', id };
  if (scope === CHANNEL_PREFIX.user) return { scope: 'user', id };
  return null;
}

/** `user:{id}` لصاحبها وحده — تُستدعى في الخدمة عند كل اشتراك. */
export function canSubscribe(channel: string, viewerId: string | null): boolean {
  const parsed = parseChannel(channel);
  if (parsed === null) return false;
  if (parsed.scope === 'auction') return true;
  return viewerId !== null && parsed.id === viewerId;
}

/** مفتاح عدّاد التسلسل في Redis — عدّاد لكل قناة لا عدّاد عام. */
export function sequenceKey(channel: string): string {
  return `seq:${channel}`;
}
