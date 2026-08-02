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

  return db.user.findUnique({ where: { id: claims.userId } });
}
