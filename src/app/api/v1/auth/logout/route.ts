import { ok } from '@/lib/api/response';
import { SESSION_COOKIE } from '@/lib/auth/token';
import { isDevelopment } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * `POST /api/v1/auth/logout` — **ولم يكن له وجود**.
 *
 * المنتج كلّه بلا بابِ خروج: لا مسار ولا زرّ. فمن دخل من جهازٍ مشترك —
 * حاسوب معرضٍ أو جهاز صديق — يبقى داخلًا ثلاثين يومًا، ومن يجلس بعده
 * يفتح طلباته وآيبانه ومستحقّاته.
 *
 * **وجلسةُ الموقع رمزٌ موقَّع لا صفٌّ في قاعدة** (بخلاف جلسة الأدمن)،
 * فالخروج محوُ الكعكة. وسقفُها ثلاثون يومًا هو مدّة صلاحيّتها، والرمز
 * المسروق لا يُبطَل بهذا المسار — ويُسجَّل أن إبطال الرموز يحتاج
 * مُعرِّف جلسةٍ مخزَّنًا، وهو تغييرٌ في نموذج الجلسة لا في هذا الزرّ.
 */
export function POST() {
  const response = ok({ signedOut: true });

  /** **بنفس خصائص الكتابة** — كعكةٌ تُمحى بمسارٍ مختلف تبقى حيّة. */
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDevelopment,
    path: '/',
    maxAge: 0,
  });

  return response;
}
