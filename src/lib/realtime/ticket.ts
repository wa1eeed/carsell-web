import { randomBytes } from 'node:crypto';
import { realtimeRedis, withRealtimeTimeout } from './client';

/**
 * ═══ تذكرةُ الاشتراك في قناةٍ خاصّة ═══
 *
 * خدمةُ البثّ **ترفض `user:{id}` رفضًا تامًّا** حتى تُوجد هذه: اشتراكٌ
 * مفتوح على قناةٍ خاصّة أسوأ من غياب الميزة. فالعقد مكتوبٌ في
 * `docs/architecture/realtime.md` منذ المهمة ١٠، والمسار لم يُفتح.
 *
 * ═══ ولماذا ليست JWT ═══
 *
 * العقد يشترط **أحاديّة الاستعمال**، ورمزٌ عديم الحالة لا يُحرَق: من
 * التقطه أعاده ما بقي صالحًا. فالتذكرة **معرّفٌ عشوائيّ** في Redis
 * يُقرأ ويُحذف في عمليةٍ واحدة (`GETDEL`) — فاتّصالان بالتذكرة نفسها
 * ينجح أوّلُهما ويُرفض الثاني، بلا سباق.
 *
 * **ولا سرَّ يُوزَّع**: الخدمة لا تحتاج مفتاحًا ولا تتحقّق من توقيع، بل
 * تسأل Redis الذي تتّصل به أصلًا. فلا متغيّرَ بيئةٍ ثالثًا يُنسى، ولا
 * اختراقُ الخدمة يُزوّر تذكرةً لغيرها.
 *
 * **والرمز لا يدخل العنوان**: يُقدَّم في أوّل إطار — والعناوين تُسجَّل
 * في الوسطاء وسجلّ المتصفّح والمُحيل.
 */

/** ستّون ثانية — تكفي للاتّصال، ولا تكفي لاستعمالٍ مؤجَّل. */
export const TICKET_TTL_SECONDS = 60;

/** بادئةٌ واحدة — والخدمة تقرأ بها، فلا تُكتب نصًّا في موضعين. */
export const TICKET_PREFIX = 'rt:ticket:';

export function ticketKey(id: string): string {
  return `${TICKET_PREFIX}${id}`;
}

export type IssuedTicket = { ticket: string; expiresInSeconds: number };

/**
 * يُصدر تذكرةً لصاحب الجلسة.
 *
 * **ويعيد `null` حين لا Redis** — فالعميل يبقى على الاستطلاع ولا يرى
 * خطأً: البثّ تحسينٌ لا شرط.
 */
export async function issueTicket(userId: string): Promise<IssuedTicket | null> {
  const redis = realtimeRedis();
  if (redis === null) return null;

  /*
    ٢٥٦ بتًّا من العشوائية — والتذكرة معرّفٌ لا يحمل معنى، فلا شيء
    يُستنتج منها ولا شيء يُخمَّن.
  */
  const ticket = randomBytes(32).toString('base64url');

  /* تعطّلُ Redis أو تعليقُه لا يُفشل الطلب — لا بثّ، والاستطلاع قائم */
  const stored = await withRealtimeTimeout(
    redis.set(ticketKey(ticket), userId, 'EX', TICKET_TTL_SECONDS),
  );
  if (stored === null) return null;

  return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
}

/**
 * يستهلك التذكرة ويعيد صاحبها — **مرّةً واحدة**.
 *
 * `GETDEL` ذرّيّة: اتّصالان بالتذكرة نفسها في اللحظة نفسها لا ينجحان
 * معًا. وهي في Redis منذ ٦.٢، وهذه نسخةُ المشروع.
 *
 * وهي هنا لا في الخدمة وحدها لأن **الاختبار يحتاج أن يستهلك**: دالّةٌ
 * تعيش في عمليةٍ أخرى لا تُختبَر، وأحاديّةُ الاستعمال هي ما يجب أن
 * يُثبَت.
 */
export async function consumeTicket(ticket: string): Promise<string | null> {
  const redis = realtimeRedis();
  if (redis === null) return null;
  if (ticket === '' || ticket.length > 128) return null;

  const userId = await withRealtimeTimeout(redis.getdel(ticketKey(ticket)));
  return userId === null || userId === '' ? null : userId;
}
