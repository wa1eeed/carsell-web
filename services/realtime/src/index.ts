import { createServer } from 'node:http';
import Redis from 'ioredis';
import { WebSocketServer, type WebSocket } from 'ws';

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

/** نافذة الاشتراك — قناة واحدة أو أكثر لكل اتصال، واتصال واحد لكل عميل. */
type Client = { socket: WebSocket; channels: Set<string>; alive: boolean };

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
  const client: Client = { socket, channels: new Set(), alive: true };
  clients.add(client);

  socket.on('pong', () => {
    client.alive = true;
  });

  socket.on('message', (raw) => {
    let message: { action?: string; channel?: string };
    try {
      message = JSON.parse(String(raw)) as typeof message;
    } catch {
      return;
    }

    const channel = message.channel;
    if (typeof channel !== 'string') return;

    /**
     * **القنوات العامة وحدها بلا تذكرة.** قناة المستخدم تحتاج مصادقة
     * قصيرة العمر، ونقطة التذكرة تأتي مع هذه المهمة — وحتى ذلك الحين
     * لا يُسمح بالاشتراك فيها إطلاقًا. اشتراكٌ مفتوح على قناة خاصّة
     * أسوأ من غياب الميزة.
     */
    if (!channel.startsWith('auction:')) return;

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
    void subscriber.quit();
    server.close(() => process.exit(0));
  });
}
