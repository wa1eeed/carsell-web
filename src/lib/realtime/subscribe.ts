'use client';

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

const MAX_BACKOFF_MS = 30_000;

/**
 * عنوانُ الخدمة — **وغيابُه يعني لا بثّ**، لا خطأً.
 *
 * ويُقرأ من `NEXT_PUBLIC_REALTIME_URL`: متغيّرٌ عامّ لأن المتصفّح
 * يحتاجه، ولا سرَّ فيه (العنوان وحده، والتذكرة تأتي من REST).
 */
function serviceUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  return url === undefined || url === '' ? null : url;
}

/**
 * يفتح اشتراكًا على قناة صاحب الجلسة، ويعيد دالّةَ إغلاق.
 *
 * **ولا يرمي أبدًا**: كلُّ فشلٍ يعني «ابقَ على الاستطلاع».
 */
export function subscribeToOwnChannel(options: Options): () => void {
  const url = serviceUrl();
  if (url === null || typeof WebSocket === 'undefined') return () => undefined;

  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;

  const live = (value: boolean): void => {
    options.onLive?.(value);
  };

  const connect = async (): Promise<void> => {
    if (closed) return;

    /* التذكرة أوّلًا — وغيابُها يعني أن لا بثّ، فلا تُفتح نافذة */
    let ticket: string | null = null;
    let channel: string | null = null;
    try {
      const response = await fetch('/api/v1/realtime/ticket', { method: 'POST' });
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { ticket?: string | null; channel?: string | null };
        };
        ticket = body.data?.ticket ?? null;
        channel = body.data?.channel ?? null;
      }
    } catch {
      /* لا شبكة — يُعاد المحاولة بالتراجع */
    }

    if (closed) return;
    if (ticket === null || channel === null) {
      schedule();
      return;
    }

    const next = new WebSocket(url);
    socket = next;

    next.addEventListener('open', () => {
      /** **التذكرة في أوّل إطار لا في العنوان** — والعناوين تُسجَّل. */
      next.send(JSON.stringify({ action: 'auth', ticket }));
      next.send(JSON.stringify({ action: 'subscribe', channel }));
    });

    next.addEventListener('message', (event) => {
      let message: RealtimeMessage;
      try {
        message = JSON.parse(String(event.data)) as RealtimeMessage;
      } catch {
        return;
      }
      if (message.type === 'auth.result') {
        const granted = message.ok === true;
        live(granted);
        /* تذكرةٌ مرفوضة لا تُعاد المحاولة بها — تُغلق ويُطلب غيرها */
        if (!granted) next.close();
        return;
      }
      /* نجاحُ أوّل رسالةٍ يعني أن الاتّصال سليم — فيُصفَّر التراجع */
      attempt = 0;
      options.onMessage(message);
    });

    const dropped = (): void => {
      live(false);
      if (socket === next) socket = null;
      schedule();
    };
    next.addEventListener('close', dropped);
    next.addEventListener('error', () => {
      next.close();
    });
  };

  /**
   * **تراجعٌ بتشويش.** إعادةُ تشغيل الخدمة تُسقط كل العملاء معًا، فلو
   * عادوا بالتوقيت نفسه لضربوها ثانيةً. والتشويش يفرّقهم.
   */
  function schedule(): void {
    if (closed) return;
    attempt += 1;
    const base = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    const jitter = base * 0.5 * Math.random();
    timer = setTimeout(() => void connect(), base * 0.75 + jitter);
  }

  /** **ولا اشتراك في تبويبةٍ مخفيّة** — ولا مؤقّت. */
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      if (socket === null) void connect();
    } else {
      socket?.close();
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  void connect();

  return () => {
    closed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (timer !== undefined) clearTimeout(timer);
    socket?.close();
    live(false);
  };
}
