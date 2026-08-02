import { afterAll, describe, expect, it } from 'vitest';
import {
  RealtimeEvent,
  channelFor,
  maskName,
  type UnsequencedEvent,
} from '@/lib/domain/events';
import {
  auctionChannel,
  canSubscribe,
  parseChannel,
  sequenceKey,
  userChannel,
} from '@/lib/realtime/channels';
import { disconnectPublisher, publish } from '@/lib/realtime/publish';

/** جاهزية اللحظية — القواعد قبل بناء الخدمة في المهمة ١٩. */

afterAll(async () => {
  await disconnectPublisher();
});

describe('القنوات', () => {
  it('تُبنى وتُفكّ بلا نصّ مكتوب', () => {
    expect(auctionChannel('a1')).toBe('auction:a1');
    expect(userChannel('u1')).toBe('user:u1');
    expect(parseChannel('auction:a1')).toEqual({ scope: 'auction', id: 'a1' });
    expect(parseChannel('user:u1')).toEqual({ scope: 'user', id: 'u1' });
  });

  it('ترفض ما ليس قناة معروفة', () => {
    for (const bad of ['', 'auction', 'auction:', ':a1', 'admin:1', 'listing:a1']) {
      expect(parseChannel(bad), bad).toBeNull();
    }
  });

  it('قناة المزاد عامة وقناة المستخدم لصاحبها وحده', () => {
    expect(canSubscribe('auction:a1', null)).toBe(true);
    expect(canSubscribe('auction:a1', 'u1')).toBe(true);

    expect(canSubscribe('user:u1', 'u1')).toBe(true);
    expect(canSubscribe('user:u1', 'u2')).toBe(false);
    expect(canSubscribe('user:u1', null)).toBe(false);
  });

  it('عدّاد التسلسل لكل قناة لا عدّاد عام', () => {
    expect(sequenceKey('auction:a1')).toBe('seq:auction:a1');
    expect(sequenceKey('user:u1')).toBe('seq:user:u1');
  });
});

describe('ربط الحدث بقناته', () => {
  it('أحداث المزاد على قناة المزاد', () => {
    const event: UnsequencedEvent = {
      type: 'auction.extended',
      auctionId: 'a9',
      newEndsAt: '2026-08-02T10:00:00.000Z',
    };
    expect(channelFor(event)).toBe('auction:a9');
  });

  it('الأحداث الخاصة تلزمها هوية المستلم — ولا تُنشر بلا صاحب', () => {
    const event: UnsequencedEvent = {
      type: 'order.stage_changed',
      orderRef: 'ORD-2026-1184',
      stage: 'PAYMENT',
    };
    expect(channelFor(event, 'u7')).toBe('user:u7');
    expect(() => channelFor(event)).toThrow();
  });
});

describe('الحمولة', () => {
  it('تُقبل الحمولة الصحيحة بتسلسلها', () => {
    const parsed = RealtimeEvent.safeParse({
      type: 'bid.placed',
      auctionId: 'a1',
      amount: '208500.00',
      bidderMasked: 'خالد ع.',
      bidCount: 5,
      seq: 12,
    });
    expect(parsed.success).toBe(true);
  });

  it('تُرفض حمولة بلا تسلسل — الفجوة تُكتشف بالتسلسل وحده', () => {
    const parsed = RealtimeEvent.safeParse({
      type: 'bid.placed',
      auctionId: 'a1',
      amount: '208500.00',
      bidderMasked: 'خالد ع.',
      bidCount: 5,
    });
    expect(parsed.success).toBe(false);
  });

  it('تُسقَط الحقول الحسّاسة ولا تعبر', () => {
    const parsed = RealtimeEvent.parse({
      type: 'auction.ended',
      auctionId: 'a1',
      result: 'ENDED_MET',
      seq: 3,
      reservePrice: '190000.00',
      minAcceptPrice: '180000.00',
      bidderId: 'u1',
    });
    expect(parsed).not.toHaveProperty('reservePrice');
    expect(parsed).not.toHaveProperty('minAcceptPrice');
    expect(parsed).not.toHaveProperty('bidderId');
  });

  it('نتيجة المزاد حالة لا قيمة — لا يُستنتج منها الاحتياطي', () => {
    const bad = RealtimeEvent.safeParse({
      type: 'auction.ended',
      auctionId: 'a1',
      result: '190000.00',
      seq: 1,
    });
    expect(bad.success).toBe(false);
  });
});

describe('الاسم المختصر', () => {
  it('الاسم الأول وأول حرف من العائلة — لا اسم كامل في قناة عامة', () => {
    expect(maskName('خالد العتيبي')).toBe('خالد ا.');
    expect(maskName('ريم')).toBe('ريم');
    expect(maskName(null)).toBe('مزايد');
    expect(maskName('  ')).toBe('مزايد');
  });
});

describe('الناشر', () => {
  it('غياب Redis لا يرمي ولا يُفشل العملية — الحفظ نجح والبثّ تأخّر', async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    await disconnectPublisher();

    const result = await publish({
      type: 'bid.placed',
      auctionId: 'a1',
      amount: '208500.00',
      bidderMasked: 'خالد ع.',
      bidCount: 5,
    });

    expect(result).toEqual({ published: false, reason: 'NO_REDIS' });

    if (saved !== undefined) process.env.REDIS_URL = saved;
    await disconnectPublisher();
  });
});
