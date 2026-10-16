import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SESSION_COOKIE, verifySession } from './token';
import type { User } from '@/generated/prisma/client';

/**
 * قراءة الجلسة من الطلب.
 * ترتيب البحث: ترويسة `Authorization` (التطبيق) ثم الكوكي (الويب).
 */
export async function currentUser(request: NextRequest): Promise<User | null> {
  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') === true ? header.slice(7) : null;
  const token = bearer ?? request.cookies.get(SESSION_COOKIE)?.value ?? null;

  if (token === null || token === '') return null;

  const claims = await verifySession(token);
  if (claims === null) return null;

  const user = await db.user.findUnique({ where: { id: claims.userId } });

  /**
   * ═══ والإيقاف يقع على الجلسة القائمة لا على الدخول وحده ═══
   *
   * الدخول يرفض `SUSPENDED` و`BANNED` منذ بُني (`auth.ts` ومسار
   * الكلمة) — **وهذه الدالّة كانت تقرأ الصفّ ولا تنظر في حاله**.
   * فالرمز يعيش ثلاثين يومًا: حسابٌ يُوقَف اليوم يبقى يشتري ويبيع
   * ويزايد شهرًا كاملًا، ولا شيء يقول إن الإيقاف لم يقع.
   *
   * وهي مدخلُ **كل مسارٍ يكتب**، فمنعُها منعٌ للفعل كلِّه. وصفحاتُ
   * الحساب تقرأ بـ`currentUserFromCookies` فتبقى مفتوحة: من أُوقف
   * يرى حسابه ويعرف لماذا، ولا يفعل شيئًا.
   */
  if (user === null || user.status !== 'ACTIVE') return null;

  return user;
}
