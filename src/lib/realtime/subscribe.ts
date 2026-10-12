'use client';

import { subscribeToChannel } from './connection';

/**
 * ═══ الاشتراك من المتصفّح ═══
 *
 * القناة `user:{id}` تنشر منذ مهمة مركز الإشعارات، **ولا مشترِك لها
 * في المنتج كلّه** — فـ«لحظيًّا» كانت استطلاعًا كلّ ثلاثين ثانية.
 *
 * ═══ والاستطلاع يبقى سقفًا لا يُرفع ═══
 *
 * البثّ تحسينٌ لا شرط: لا Redis في التطوير، وقد تسقط الخدمة في
 * الإنتاج. **فالاستطلاع هو الأرضية**، والاشتراك يُسرّع ما بين
 * استطلاعين. ونزعُ الأرضية يجعل عطلًا في ناقل إشعاراتٍ عطلًا في
 * المنتج.
 *
 * ═══ وقواعد الاتّصال من الوثيقة ═══
 *
 * `docs/architecture/realtime.md`: اتّصالٌ واحد لكل عميل · وتراجعٌ
 * ١→٢→٤…→٣٠ ثانية **بتشويش** فلا يُقابَل إعادةُ تشغيلٍ بزحفٍ متزامن ·
 * وفكُّ الاشتراك عند إخفاء التبويبة.
 */

export type RealtimeMessage = { type: string; [key: string]: unknown };


type Options = {
  /** ما يُفعل عند كل رسالة — والتفاصيل تُقرأ من REST لا من الرسالة. */
  onMessage: (message: RealtimeMessage) => void;
  /** يُنادى حين يُفتح اتّصالٌ مُصادَق — فيُخفَّف الاستطلاع. */
  onLive?: (live: boolean) => void;
};

/**
 * ═══ قناةُ صاحب الجلسة — فوق الاتّصال المشترك ═══
 *
 * كانت تفتح نافذتها بنفسها. ثم احتاجت صفحةُ المزاد قناةً ثانية
 * (`auction:{id}`)، **ونسخُ الطريقة يفتح نافذةً ثانية** — والوثيقة
 * تقول: اتّصالٌ واحد لكل عميل مُجزَّأ بالاشتراك. فانتقل الاتّصال إلى
 * `connection.ts`، وبقي هذا مدخلًا مريحًا يسأل المسار عن قناته.
 */
export function subscribeToOwnChannel(options: Options): () => void {
  let release: (() => void) | null = null;
  let closed = false;

  void (async () => {
    let channel: string | null = null;
    try {
      const response = await fetch('/api/v1/realtime/ticket', { method: 'POST' });
      if (response.ok) {
        const body = (await response.json()) as { data?: { channel?: string | null } };
        channel = body.data?.channel ?? null;
      }
    } catch {
      /* لا شبكة — والاستطلاع تحتها يعمل */
    }
    if (closed || channel === null) return;
    release = subscribeToChannel(channel, options.onMessage, options.onLive);
  })();

  return () => {
    closed = true;
    release?.();
  };
}
