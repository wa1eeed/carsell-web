import Redis from 'ioredis';
import {
  RealtimeEvent,
  channelFor,
  type UnsequencedEvent,
} from '@/lib/domain/events';
import { sequenceKey } from './channels';

/**
 * ناشر الأحداث — الطرف الوحيد الذي يكتب على Redis من Next.
 *
 * **الاتجاه واحد:** Next يحفظ في Postgres ثم ينشر هنا؛ وخدمة
 * `services/realtime` تشترك وتبثّ. لا استدعاء مباشر بين الطرفين،
 * فيتوسّع كلٌّ منهما أفقيًا بلا تغيير كود — وهو نفسه ما يلزم
 * عند الانتقال إلى Google Cloud.
 *
 * **احفظ ثم انشر، ولا تنشر قبل نجاح الحفظ.** الحقيقة في Postgres،
 * والرسالة إشعار بتغيّر. ولذلك فشل النشر **لا يُفشل العملية**:
 * المزايدة محفوظة، وغاية ما يقع أن يتأخّر التحديث حتى الاستطلاع
 * التالي أو اللقطة التالية.
 */

const globalForRedis = globalThis as unknown as { realtimePublisher?: Redis | null };

function client(): Redis | null {
  if (globalForRedis.realtimePublisher !== undefined) {
    return globalForRedis.realtimePublisher;
  }

  const url = process.env.REDIS_URL;
  if (url === undefined || url === '') {
    globalForRedis.realtimePublisher = null;
    return null;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  // تعطّل Redis لا يكسر الموقع — يُسجَّل ولا يُرمى
  redis.on('error', (error: Error) => {
    console.warn('[realtime] Redis غير متاح:', error.message);
  });

  globalForRedis.realtimePublisher = redis;
  return redis;
}

export type PublishResult =
  | { published: true; seq: number; channel: string }
  | { published: false; reason: 'NO_REDIS' | 'FAILED' };

/**
 * ينشر حدثًا بعد حفظه.
 *
 * التسلسل من `INCR` على مفتاح القناة — عدّاد لكل قناة لا عدّاد عام،
 * فالعميل يكتشف الفجوة في قناته وحدها ويطلب لقطة جديدة.
 *
 * @param recipientId مطلوب لأحداث `user:` وحدها
 */
export async function publish(
  event: UnsequencedEvent,
  recipientId?: string,
): Promise<PublishResult> {
  const redis = client();
  if (redis === null) return { published: false, reason: 'NO_REDIS' };

  const channel = channelFor(event, recipientId);

  try {
    const seq = await redis.incr(sequenceKey(channel));
    const message = RealtimeEvent.parse({ ...event, seq });
    await redis.publish(channel, JSON.stringify(message));
    return { published: true, seq, channel };
  } catch (error) {
    // الحفظ نجح والنشر فشل: العميل سيلحق باللقطة التالية
    console.warn(
      `[realtime] تعذّر نشر ${event.type} على ${channel}:`,
      error instanceof Error ? error.message : String(error),
    );
    return { published: false, reason: 'FAILED' };
  }
}

/** للاختبارات وإغلاق العمليات القصيرة. */
export async function disconnectPublisher(): Promise<void> {
  const redis = globalForRedis.realtimePublisher;
  if (redis !== null && redis !== undefined) {
    await redis.quit().catch(() => undefined);
  }
  globalForRedis.realtimePublisher = undefined;
}
