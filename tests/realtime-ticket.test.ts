import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RealtimeClient from '@/lib/realtime/client';
import { auctionChannel, canSubscribe, userChannel } from '@/lib/realtime/channels';

/**
 * ═══ تذكرةُ القناة الخاصّة ═══
 *
 * هذه حراسةُ وصول، **فتُختبَر بما يُحاوَل بها لا بما يُفترض**: تذكرةٌ
 * مستعملة، ومختلَقة، ومفرطة الطول، وتذكرةُ غيرك.
 *
 * ═══ ولماذا بمحاكاةٍ لا بخادمٍ حيّ ═══
 *
 * Redis تبعيّةٌ اختيارية: البثّ تحسينٌ لا شرط، وبيئةُ التطوير قد تكون
 * بلا خادم. واختبارٌ ينتظر اتّصالًا لا يأتي **يُعلّق الطقم كلَّه** —
 * وقع: عشر ثوانٍ ثم «Hook timed out».
 *
 * والمحاكاة تختبر **ما كتبتُه**: الحدَّ على الطول، ورفضَ الفارغ،
 * والحرقَ بعد الاستعمال، والمهلة. أمّا ذرّيّةُ `GETDEL` فهي ضمانُ
 * Redis لا ضمانُنا — وتُوثَّق ولا تُختبَر هنا.
 */

type Entry = { value: string; expiresAt: number };

/** محاكاةٌ صغيرة: `set … EX` و`getdel` و`ttl` — لا أكثر ممّا نستعمله. */
class FakeRedis {
  private readonly store = new Map<string, Entry>();
  private now = 1_000_000;
  /** ما سُئل عنه فعلًا — فحارسٌ يمنع السؤال يُثبَت بألّا يُسأل. */
  readonly queried: string[] = [];

  advance(seconds: number): void {
    this.now += seconds;
  }

  private live(key: string): Entry | null {
    const row = this.store.get(key);
    if (row === undefined) return null;
    if (row.expiresAt <= this.now) {
      this.store.delete(key);
      return null;
    }
    return row;
  }

  set(key: string, value: string, _mode: 'EX', seconds: number): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: this.now + seconds });
    return Promise.resolve('OK');
  }

  getdel(key: string): Promise<string | null> {
    this.queried.push(key);
    const row = this.live(key);
    this.store.delete(key);
    return Promise.resolve(row === null ? null : row.value);
  }

  ttl(key: string): Promise<number> {
    const row = this.live(key);
    return Promise.resolve(row === null ? -2 : row.expiresAt - this.now);
  }
}

let fake: FakeRedis | null = new FakeRedis();

vi.mock('@/lib/realtime/client', () => ({
  realtimeRedis: () => fake,
  disconnectRealtimeRedis: () => Promise.resolve(),
  /* المهلة تُمرَّر كما هي — المحاكاة فوريّة، والمقيس هنا منطقُ التذكرة */
  withRealtimeTimeout: async <T,>(work: Promise<T>) => work,
}));

const { TICKET_TTL_SECONDS, consumeTicket, issueTicket, ticketKey } = await import(
  '@/lib/realtime/ticket'
);

const MINE = 'user-ticket-mine';
const THEIRS = 'user-ticket-theirs';

beforeEach(() => {
  fake = new FakeRedis();
});

describe('تذكرةُ البثّ', () => {
  it('تُصدَر ثم تُستهلَك فتُعيد صاحبها', async () => {
    const issued = await issueTicket(MINE);

    expect(issued).not.toBeNull();
    expect(issued?.expiresInSeconds).toBe(TICKET_TTL_SECONDS);
    expect(await consumeTicket(issued?.ticket ?? '')).toBe(MINE);
  });

  it('ولا تُستهلَك مرّتين', async () => {
    const issued = await issueTicket(MINE);

    expect(await consumeTicket(issued?.ticket ?? '')).toBe(MINE);
    /*
      **أحاديّةُ الاستعمال هي سببُ ألّا تكون JWT.** من التقطها من سجلٍّ
      أو شبكةٍ يجدها محروقة — ورمزٌ عديم الحالة يبقى صالحًا حتى ينتهي.
    */
    expect(await consumeTicket(issued?.ticket ?? '')).toBeNull();
  });

  it('وتُرفض المختلَقة', async () => {
    expect(await consumeTicket('ليست-تذكرة')).toBeNull();
  });

  it('والفارغة والمفرطة تُردّان قبل أن يُسأل Redis', async () => {
    expect(await consumeTicket('')).toBeNull();
    expect(await consumeTicket('x'.repeat(5_000))).toBeNull();

    /**
     * **وحارسٌ يمنع السؤال يُثبَت بألّا يُسأل.** كان الفحص يمرّ ولو
     * حُذف الحدّ: المحاكاة تردّ `null` لأي مفتاح مجهول، فالاختبار
     * يقيس نتيجةً يصل إليها الطريقان. والشاهدُ هنا أنّ Redis لم
     * يُنادَ أصلًا — فمفتاحٌ بخمسة آلاف حرف ليس مجّانيًّا.
     */
    expect(fake?.queried).toEqual([]);
  });

  it('وتسقط بانقضاء مهلتها', async () => {
    const issued = await issueTicket(MINE);
    expect(await fake?.ttl(ticketKey(issued?.ticket ?? ''))).toBe(TICKET_TTL_SECONDS);

    fake?.advance(TICKET_TTL_SECONDS + 1);

    expect(await consumeTicket(issued?.ticket ?? '')).toBeNull();
  });

  it('وتذكرتان لمستخدمين لا تتبادلان', async () => {
    const mine = await issueTicket(MINE);
    const theirs = await issueTicket(THEIRS);

    expect(mine?.ticket).not.toBe(theirs?.ticket);
    expect(await consumeTicket(mine?.ticket ?? '')).toBe(MINE);
    expect(await consumeTicket(theirs?.ticket ?? '')).toBe(THEIRS);
  });

  it('وبلا Redis لا تذكرة — ولا خطأ', async () => {
    fake = null;

    /* البثّ تحسينٌ لا شرط: المسار يردّ `null` والعميل يبقى على الاستطلاع */
    expect(await issueTicket(MINE)).toBeNull();
    expect(await consumeTicket('أيًّا كانت')).toBeNull();
  });
});

describe('بوابةُ الاشتراك', () => {
  /**
   * **والبوابة واحدة**: خدمةُ البثّ تستورد `canSubscribe` من هذا
   * الملفّ نفسه، فاختبارُها هنا اختبارٌ لها هناك — ولا نسخةَ ثانية
   * تتباعد عن أصلها فتسمح بما يمنعه.
   */
  it('المزادُ عامّ ولو بلا تذكرة', () => {
    expect(canSubscribe(auctionChannel('a1'), null)).toBe(true);
  });

  it('والقناةُ الخاصّة مغلقةٌ على الزائر', () => {
    /* زائرٌ بلا تذكرة — وهي حالُ كل اتّصالٍ قبل أوّل إطار مصادقة */
    expect(canSubscribe(userChannel('u1'), null)).toBe(false);
  });

  it('ولصاحبها وحده', () => {
    expect(canSubscribe(userChannel('u1'), 'u1')).toBe(true);
    expect(canSubscribe(userChannel('u1'), 'u2')).toBe(false);
  });

  it('ولا قناةَ بلا بادئةٍ معروفة', () => {
    expect(canSubscribe('user', 'u1')).toBe(false);
    expect(canSubscribe('admin:1', 'u1')).toBe(false);
    expect(canSubscribe('', 'u1')).toBe(false);
    /* بادئةٌ تُشبه ولا تُطابق — `users:` ليست `user:` */
    expect(canSubscribe('users:u1', 'u1')).toBe(false);
  });
});

describe('مهلةُ الأمر', () => {
  /**
   * ═══ التعطّل أسوأ من الفشل ═══
   *
   * منفذٌ يقبل الاتّصال ولا يردّ — حاويةٌ موقوفة خلف وسيط — يجعل أمرَ
   * Redis ينتظر مهلةَ الاتّصال ثمّ يُعيد المحاولة أبدًا. **وقِيس**:
   * اختبارُ إلغاء طلبٍ استغرق ٦٣٨ ثانية ثمّ سقط، والإلغاء نفسه نجح —
   * المعلَّق كان إشعارَه. وفي الإنتاج هذا طلبُ مستخدمٍ يُجمَّد.
   */
  it('تترك الأمر المعلَّق ولا تنتظره', async () => {
    const { withRealtimeTimeout } = await vi.importActual<typeof RealtimeClient>('@/lib/realtime/client');

    const never = new Promise<string>(() => {
      /* لا يُحلّ أبدًا — وهو شكلُ Redis الموقوف بالضبط */
    });

    const started = Date.now();
    const result = await withRealtimeTimeout(never, 30);

    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('وتُعيد النتيجة حين تصل في وقتها', async () => {
    const { withRealtimeTimeout } = await vi.importActual<typeof RealtimeClient>('@/lib/realtime/client');

    expect(await withRealtimeTimeout(Promise.resolve('قيمة'), 1_000)).toBe('قيمة');
  });

  it('والأمرُ الذي يرمي يُقرأ فشلًا لا انفجارًا', async () => {
    const { withRealtimeTimeout } = await vi.importActual<typeof RealtimeClient>('@/lib/realtime/client');

    expect(await withRealtimeTimeout(Promise.reject(new Error('مغلق')), 1_000)).toBeNull();
  });
});
