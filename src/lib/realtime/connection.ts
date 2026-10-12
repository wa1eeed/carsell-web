'use client';

import type { RealtimeMessage } from './subscribe';

/**
 * ═══ اتّصالٌ واحد لكل عميل، مُجزَّأ بالاشتراكات ═══
 *
 * `docs/architecture/realtime.md` يقولها صراحةً: **اتّصالٌ واحد لكل
 * عميل، مُجزَّأ بالاشتراك — لا نافذةٌ لكل قناة**. وكان المشترك الوحيد
 * (`subscribeToOwnChannel`) يفتح نافذتَه الخاصّة، فإضافةُ قناة المزاد
 * بالطريقة نفسها تفتح الثانية — ويصير لصفحةٍ واحدة اتّصالان،
 * وتذكرتان، وتراجعان متزامنان عند كل إعادة تشغيل للخدمة.
 *
 * فهذه الوحدة تحمل النافذة وحدها، وتوزّع رسائلها على المشتركين. وأوّلُ
 * مشترِكٍ يفتحها وآخرُ مُنصرِفٍ يغلقها.
 *
 * ═══ والبثّ تحسينٌ لا شرط ═══
 *
 * لا `NEXT_PUBLIC_REALTIME_URL` ⇒ لا نافذة. ولا تذكرة ⇒ لا نافذة.
 * وفي الحالين يبقى الاستطلاع تحتها يعمل — فعطلٌ في ناقلٍ لا يصير
 * عطلًا في منتج.
 */

const MAX_BACKOFF_MS = 30_000;

type Handler = (message: RealtimeMessage) => void;
type LiveHandler = (live: boolean) => void;

/** المشتركون على كل قناة — والقناة تُلغى حين يفرغ طقمُها. */
const handlers = new Map<string, Set<Handler>>();
const liveHandlers = new Set<LiveHandler>();

let socket: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
/** مفتوحٌ ومصادَق — لا «مفتوح» وحدها: التذكرة قد تُرفض بعد الفتح. */
let authed = false;

function serviceUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  return url === undefined || url === '' ? null : url;
}

function announce(live: boolean): void {
  authed = live;
  for (const handler of liveHandlers) handler(live);
}

/** يُرسل اشتراكًا لكل قناةٍ لها مشترِك — عند الفتح وعند كل إضافة. */
function subscribeAll(target: WebSocket): void {
  for (const channel of handlers.keys()) {
    target.send(JSON.stringify({ action: 'subscribe', channel }));
  }
}

async function connect(): Promise<void> {
  const url = serviceUrl();
  if (url === null || typeof WebSocket === 'undefined') return;
  if (socket !== null || handlers.size === 0) return;

  /** التذكرة أوّلًا — وغيابُها يعني لا بثّ، فلا تُفتح نافذة. */
  let ticket: string | null = null;
  try {
    const response = await fetch('/api/v1/realtime/ticket', { method: 'POST' });
    if (response.ok) {
      const body = (await response.json()) as { data?: { ticket?: string | null } };
      ticket = body.data?.ticket ?? null;
    }
  } catch {
    /* لا شبكة — يُعاد بالتراجع */
  }

  if (handlers.size === 0) return;
  if (ticket === null) {
    schedule();
    return;
  }

  const next = new WebSocket(url);
  socket = next;

  next.addEventListener('open', () => {
    /** **التذكرة في أوّل إطار لا في العنوان** — والعناوين تُسجَّل. */
    next.send(JSON.stringify({ action: 'auth', ticket }));
    subscribeAll(next);
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
      announce(granted);
      /* تذكرةٌ مرفوضة لا يُعاد بها — تُغلق النافذة وتُطلب غيرها */
      if (!granted) next.close();
      return;
    }

    attempt = 0;
    /**
     * **التوجيه بالقناة حين تحملها الرسالة**، وإلّا فإلى الجميع.
     * الخدمة تُرسل `channel` مع ما تبثّه، ورسالةٌ بلا قناة (إشعارٌ
     * عامّ مثلًا) تبلغ كل مشترِك — ومن لا يعنيه يتجاهلها.
     */
    const channel = typeof message.channel === 'string' ? message.channel : null;
    const targets =
      channel === null
        ? [...handlers.values()].flatMap((set) => [...set])
        : [...(handlers.get(channel) ?? [])];
    for (const handler of targets) handler(message);
  });

  const dropped = (): void => {
    announce(false);
    if (socket === next) socket = null;
    schedule();
  };
  next.addEventListener('close', dropped);
  next.addEventListener('error', () => {
    next.close();
  });
}

/**
 * **تراجعٌ بتشويش.** إعادةُ تشغيل الخدمة تُسقط كل العملاء معًا، فلو
 * عادوا بالتوقيت نفسه لضربوها ثانيةً.
 */
function schedule(): void {
  if (handlers.size === 0) return;
  if (timer !== undefined) clearTimeout(timer);
  attempt += 1;
  const base = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  const jitter = base * 0.5 * Math.random();
  timer = setTimeout(() => void connect(), base * 0.75 + jitter);
}

/** **ولا اشتراك في تبويبةٍ مخفيّة** — ولا مؤقّت. */
function onVisibility(): void {
  if (document.visibilityState === 'visible') {
    if (socket === null) void connect();
  } else {
    socket?.close();
    if (timer !== undefined) clearTimeout(timer);
  }
}

let watching = false;

/**
 * يشترك في قناةٍ ويعيد دالّةَ إلغاء. **ولا يرمي أبدًا**: كلُّ فشلٍ
 * يعني «ابقَ على الاستطلاع».
 */
export function subscribeToChannel(
  channel: string,
  onMessage: Handler,
  onLive?: LiveHandler,
): () => void {
  const set = handlers.get(channel) ?? new Set<Handler>();
  set.add(onMessage);
  handlers.set(channel, set);
  if (onLive !== undefined) {
    liveHandlers.add(onLive);
    onLive(authed);
  }

  if (!watching && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    watching = true;
  }

  if (socket === null) void connect();
  else if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ action: 'subscribe', channel }));
  }

  return () => {
    const current = handlers.get(channel);
    current?.delete(onMessage);
    if (current !== undefined && current.size === 0) {
      handlers.delete(channel);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'unsubscribe', channel }));
      }
    }
    if (onLive !== undefined) liveHandlers.delete(onLive);

    /** آخرُ مُنصرِفٍ يُغلق — ونافذةٌ بلا مشترِك اتّصالٌ بلا سبب. */
    if (handlers.size === 0) {
      if (timer !== undefined) clearTimeout(timer);
      socket?.close();
      socket = null;
      announce(false);
    }
  };
}
