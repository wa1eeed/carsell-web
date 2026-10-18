import {
  RealtimeEvent,
  channelFor,
  type UnsequencedEvent,
} from '@/lib/domain/events';
import { realtimeRedis as client, withRealtimeTimeout } from './client';
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
    /* **ومهلةٌ على كل أمر** — التعطّل أسوأ من الفشل، والنشر تحسين */
    const seq = await withRealtimeTimeout(redis.incr(sequenceKey(channel)));
    if (seq === null) return { published: false, reason: 'FAILED' };

    const message = RealtimeEvent.parse({ ...event, seq });
    const sent = await withRealtimeTimeout(redis.publish(channel, JSON.stringify(message)));
    if (sent === null) return { published: false, reason: 'FAILED' };
    return { published: true, seq, channel };
  } catch (error) {
    // الحفظ نجح والنشر فشل: العميل سيلحق باللقطة التالية
    console.warn(
      `[realtime] تعذر نشر ${event.type} على ${channel}:`,
      error instanceof Error ? error.message : String(error),
    );
    return { published: false, reason: 'FAILED' };
  }
}

/**
 * للاختبارات وإغلاق العمليات القصيرة.
 *
 * **ويُعاد تصديرها باسمها القديم**: نقلُ الاتّصال موضعًا لا يَعني كسرَ
 * من يناديها — والاسم جزءٌ من عقدٍ قائم.
 */
export { disconnectRealtimeRedis as disconnectPublisher } from './client';
