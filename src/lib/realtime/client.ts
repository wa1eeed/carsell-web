import Redis from 'ioredis';

/**
 * ═══ عميلُ Redis — اتّصالٌ واحد لا اثنان ═══
 *
 * كان `publish.ts` يبني اتّصالَه داخله، ثمّ احتاجته التذاكر. **واتّصالان
 * من العملية نفسها إلى الخادم نفسه ضِعفُ ما يلزم**، وأسوأُ منه أنّ
 * إعدادَيهما يتباعدان: أحدُهما بمهلةٍ والآخر بلا مهلة، فيقع العطل في
 * أحدهما دون الآخر ويُقرأ تقطّعًا.
 *
 * **والغياب لا يُرمى**: Redis مؤجَّلٌ في التطوير، و`null` تعني «لا بثّ»
 * فيسقط الاشتراك بصمتٍ ويبقى الاستطلاع.
 */

const globalForRedis = globalThis as unknown as { realtimeRedis?: Redis | null };

export function realtimeRedis(): Redis | null {
  if (globalForRedis.realtimeRedis !== undefined) return globalForRedis.realtimeRedis;

  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') {
    globalForRedis.realtimeRedis = null;
    return null;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    /** ثانيةٌ للاتّصال — خادمٌ لا يردّ فيها لن يردّ في عشر. */
    connectTimeout: 1_000,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  // تعطّل Redis لا يكسر الموقع — يُسجَّل ولا يُرمى
  redis.on('error', (error: Error) => {
    console.warn('[realtime] Redis غير متاح:', error.message);
  });

  globalForRedis.realtimeRedis = redis;
  return redis;
}

/** للاختبارات وإغلاق العمليات القصيرة. */
export async function disconnectRealtimeRedis(): Promise<void> {
  const redis = globalForRedis.realtimeRedis;
  if (redis !== null && redis !== undefined) {
    await redis.quit().catch(() => undefined);
  }
  globalForRedis.realtimeRedis = undefined;
}

/**
 * ═══ ومهلةٌ على كل أمر ═══
 *
 * **التعطّل أسوأ من الفشل.** `publish` مكتوبٌ فيها أن فشل النشر لا
 * يُفشل العملية — والتعليق ليس فشلًا: هو انتظارٌ لا ينتهي. ومنفذٌ
 * يقبل الاتّصال ولا يردّ (حاوية موقوفة خلف وسيط) يجعل `incr` تنتظر
 * مهلةَ الاتّصال ثم تُعيد المحاولة أبدًا.
 *
 * وقِيس: اختبارُ إلغاء طلبٍ استغرق **٦٣٨ ثانية** ثم سقط — والإلغاء
 * نفسه نجح، والمعلَّق هو إشعارُه. وفي الإنتاج هذا طلبُ مستخدمٍ يُجمَّد.
 *
 * فالبثّ تحسينٌ لا شرط، **وثمنُه محدود**: ثانيةٌ ثمّ يُترك.
 */
export const REALTIME_TIMEOUT_MS = 1_000;

export async function withRealtimeTimeout<T>(
  work: Promise<T>,
  timeoutMs: number = REALTIME_TIMEOUT_MS,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    /* فشلُ الأمر نفسه — والنتيجة واحدة: لا بثّ */
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
