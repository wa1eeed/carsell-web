import { createServer } from 'node:http';
import Redis from 'ioredis';
import { WebSocketServer, type WebSocket } from 'ws';
/**
 * **القنوات والبوابة من ملفّ التطبيق نفسه** — لا نسخةَ ثانية.
 * خطأُ حرفٍ في `user:` يُنتج قناةً لا يستمع إليها أحد، وبوابةٌ منسوخة
 * تتباعد عن أصلها فتسمح بما يمنعه.
 */
import { canSubscribe } from '../../../src/lib/realtime/channels';
import { TICKET_PREFIX } from '../../../src/lib/realtime/ticket';

/**
 * خدمة الوقت الحقيقي — `ws.carsell.one`.
 *
 * **تشترك في Redis وتبثّ. لا تكتب في قاعدة البيانات ولا تقرأ منها.**
 * الحقيقة في Postgres، وهذه ناقل إشعارات: تعطُّلها يعني تأخّر تحديث لا
 * فقدان بيانات، وسقوطها لا يمنع مزايدة.
 *
 * **ولا حالة تراكمية هنا**: العميل يطلب لقطة من REST عند الاتصال وعند
 * كل فجوة في `seq`. بناء الحالة من الرسائل يعني أن رسالةً ضائعة تُفسد
 * كل ما بعدها بلا أن يظهر ذلك.
 */

const PORT = Number(process.env.PORT ?? 4000);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

/**
 * نافذة الاشتراك — قناة واحدة أو أكثر لكل اتصال، واتصال واحد لكل عميل.
 *
 * و`viewerId` صاحبُ التذكرة إن قُدِّمت — **و`null` يعني زائرًا**: تُفتح
 * له القنوات العامة وحدها.
 */
type Client = { socket: WebSocket; channels: Set<string>; alive: boolean; viewerId: string | null };

const clients = new Set<Client>();

const server = createServer((request, response) => {
  // فحص صحّة بسيط — لا يلمس Redis: عافيةُ الناقل ليست عافية المصدر
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, clients: clients.size }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server });

/**
 * **عميلان لا واحد.** اتّصالٌ في وضع الاشتراك لا يقبل أمرًا عاديًّا —
 * فـ`GETDEL` على `subscriber` ترتدّ بخطأ، وهو قيدٌ في بروتوكول Redis
 * لا خيارٌ لنا.
 */
const tickets = new Redis(REDIS_URL, { lazyConnect: true });
tickets.on('error', (error: Error) => {
  console.warn('[realtime] Redis (التذاكر):', error.message);
});
void tickets.connect();

const subscriber = new Redis(REDIS_URL, { lazyConnect: true });
subscriber.on('error', (error: Error) => {
  console.warn('[realtime] Redis:', error.message);
});

void subscriber.connect().then(() => subscriber.psubscribe('auction:*', 'user:*'));

subscriber.on('pmessage', (_pattern: string, channel: string, payload: string) => {
  for (const client of clients) {
    if (!client.channels.has(channel)) continue;
    if (client.socket.readyState !== client.socket.OPEN) continue;
    client.socket.send(payload);
  }
});

wss.on('connection', (socket: WebSocket) => {
  const client: Client = { socket, channels: new Set(), alive: true, viewerId: null };
  clients.add(client);

  socket.on('pong', () => {
    client.alive = true;
  });

  socket.on('message', (raw) => {
    let message: { action?: string; channel?: string; ticket?: string };
    try {
      message = JSON.parse(String(raw)) as typeof message;
    } catch {
      return;
    }

    /**
     * ═══ المصادقة — أوّل إطار، لا في العنوان ═══
     *
     * العناوين تُسجَّل في الوسطاء وسجلّ المتصفّح والمُحيل، فالتذكرة
     * تُقدَّم في رسالة. **وتُستهلَك مرّةً واحدة**: `GETDEL` ذرّيّة،
     * فاتّصالان بالتذكرة نفسها ينجح أوّلُهما ويُرفض الثاني بلا سباق.
     *
     * **ولا سرَّ هنا ولا تحقّقَ من توقيع**: التذكرة معرّفٌ عشوائيّ
     * كتبه التطبيق في Redis — والخدمة تسأل Redis الذي تتّصل به أصلًا.
     */
    if (message.action === 'auth') {
      const ticket = message.ticket;
      if (typeof ticket !== 'string' || ticket === '' || ticket.length > 128) return;

      void tickets
        .getdel(`${TICKET_PREFIX}${ticket}`)
        .then((userId) => {
          client.viewerId = userId === null || userId === '' ? null : userId;
          if (client.socket.readyState === client.socket.OPEN) {
            client.socket.send(JSON.stringify({ type: 'auth.result', ok: client.viewerId !== null }));
          }
        })
        .catch(() => {
          /* تعطُّل Redis لا يمنح وصولًا — ويبقى الزائر زائرًا */
        });
      return;
    }

    const channel = message.channel;
    if (typeof channel !== 'string') return;

    /**
     * **والبوابة واحدة**: `canSubscribe` هي نفسها التي يستعملها
     * التطبيق — القنوات العامة مفتوحة، و`user:{id}` لصاحبها وحده.
     * ونسخُها هنا يجعلها تتباعد عن أصلها فتسمح بما يمنعه.
     */
    if (!canSubscribe(channel, client.viewerId)) return;

    if (message.action === 'subscribe') client.channels.add(channel);
    if (message.action === 'unsubscribe') client.channels.delete(channel);
  });

  socket.on('close', () => {
    clients.delete(client);
  });
});

/** نبضة كل ٣٠ ثانية — اتصالٌ ميت يستهلك ذاكرة ولا يستقبل. */
const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (!client.alive) {
      client.socket.terminate();
      clients.delete(client);
      continue;
    }
    client.alive = false;
    client.socket.ping();
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`[realtime] يستمع على ${String(PORT)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    void tickets.quit();
    void subscriber.quit();
    server.close(() => process.exit(0));
  });
}
