import type { NextRequest } from 'next/server';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { pendingAcceptance, recordAcceptance } from '@/lib/domain/legal';

export const runtime = 'nodejs';

/**
 * ═══ `POST /api/v1/me/legal` — يقبل الشروط ═══
 *
 * **ولم يكن لها مسار.** شاشةُ الدخول تشترط تأشير «أوافق على الشروط
 * والأحكام وسياسة الخصوصية» ولا تمضي بدونه، و`agreed` حالةٌ في
 * المتصفّح تموت بإغلاق التبويب — فلا صفَّ في القاعدة كلِّها يقول إنّ
 * أحدًا قبِل شيئًا.
 *
 * وهذا المسارُ طرفُ «طلب قبول جديد عند أوّل فتح بعده»: نسخةٌ جوهريّةٌ
 * نفذت، فيُسأل القبولُ من جديد ويُكتب بنسخته.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const written = await recordAcceptance(user.id, 'reaccept');
  const pending = await pendingAcceptance(user.id);

  return ok({ recorded: written, pending: pending.map((doc) => doc.key) });
}

/** `GET` — ما ينتظر قبولَه، تقرؤه الشريطةُ في الترويسة. */
export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const pending = await pendingAcceptance(user.id);
  return ok({ pending });
}
