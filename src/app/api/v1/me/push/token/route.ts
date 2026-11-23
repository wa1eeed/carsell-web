import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth/session';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/me/push/token` — تسجيلُ رمز الجهاز.
 *
 * **`DeviceToken` كان بلا كاتبٍ في المنتج كلِّه**: الشاشة تعدّ الرموز،
 * والإغلاقُ يحذفها، ولا شيء يُنشئ صفًّا. فعدّادُ «أجهزة مسجلة» صفرٌ
 * دائمًا مهما كبر المنتج — وهو صنفُ «جدولٌ بلا كاتب» الذي أُغلق هنا
 * مرارًا.
 *
 * والمنادي هو التطبيق، لا شاشةَ ويبّ تدفع إشعارًا. والسببُ معلَنٌ في
 * `ROUTES_WITHOUT_A_SCREEN`.
 *
 * ═══ والرمزُ يُنقل بين الحسابات لا يُكرَّر ═══
 *
 * جهازٌ سجّل عليه شخصان: المزوّد يُصدر الرمز للجهاز لا للحساب، فرمزٌ
 * واحد يبقى بعد خروج الأوّل. وكتابةُ صفٍّ ثانٍ تسقط على فرادة الرمز،
 * **وتركُه لصاحبه الأوّل يُرسل إشعاراتِ شخصٍ إلى جهاز غيره**. فينتقل
 * إلى من سجّله آخرًا.
 */
const Body = z.object({
  token: z.string().min(16).max(512),
  platform: z.enum(['ios', 'android']),
});

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(ERRORS.VALIDATION({ token: 'REQUIRED' }), 422);
  }

  const { token, platform } = parsed.data;
  await db.deviceToken.upsert({
    where: { token },
    create: { token, platform, userId: user.id },
    update: { platform, userId: user.id, lastSeenAt: new Date() },
  });

  return ok({ registered: true });
}
