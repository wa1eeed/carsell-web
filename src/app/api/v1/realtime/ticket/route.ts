import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { userChannel } from '@/lib/realtime/channels';
import { issueTicket } from '@/lib/realtime/ticket';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/realtime/ticket` — تذكرةُ اشتراكٍ في القناة الخاصّة.
 *
 * **المسار الذي وصفته الوثيقة ولم يفتحه أحد.** العقد مكتوبٌ في
 * `docs/architecture/realtime.md` منذ المهمة ١٠، وخدمةُ البثّ ترفض
 * `user:{id}` رفضًا تامًّا بسببه — فأربعةُ أحداثٍ خاصّة تُنشر ولا
 * يستقبلها أحد، و«لحظيًّا» استطلاعٌ كلّ ثلاثين ثانية.
 *
 * ═══ والقناة تُعاد مع التذكرة ═══
 *
 * فالعميل لا يبني `user:${id}` بيده: اسمُ القناة يُبنى في
 * `channels.ts` وحده — وخطأُ حرفٍ في البادئة يُنتج قناةً لا يستمع
 * إليها أحد، ولا مراجعةٌ ولا اختبارٌ يلتقطه.
 *
 * **ولا معرّفَ مستخدمٍ في الردّ** غيرَ ما في اسم القناة: العميل يعرف
 * نفسه، والردّ لا يُضيف ما لا يحتاجه.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const issued = await issueTicket(user.id);

  /**
   * **وغيابُ البثّ ليس خطأً.** Redis مؤجَّلٌ في التطوير وقد يتعطّل في
   * الإنتاج، والعميل يبقى على الاستطلاع. فـ`ticket: null` حالٌ
   * متوقَّعة تُقرأ، لا ٥٠٣ تُحوَّل إلى رسالةٍ حمراء على شاشةٍ سليمة.
   */
  if (issued === null) return ok({ ticket: null, channel: null, expiresIn: 0 });

  return ok({
    ticket: issued.ticket,
    channel: userChannel(user.id),
    expiresIn: issued.expiresInSeconds,
  });
}
