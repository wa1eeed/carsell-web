import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { ADMIN_COOKIE } from '@/lib/auth/admin-session';
import { resolveAdminSession } from '@/lib/domain/admin-auth';
import { changeOwnPassword } from '@/lib/domain/admin-account';

export const runtime = 'nodejs';

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

/**
 * `PUT /api/v1/admin/account/password` — تغيير كلمة المرء نفسه.
 *
 * ═══ ولا يمرّ بحارس الصلاحيات ═══
 *
 * `requireAdmin` يشترط صلاحيةً، وتغييرُ كلمتك ليس صلاحيةً يمنحها دور:
 * **كل من دخل يملكه**. واشتراطُ صلاحيةٍ هنا يجعل أضعف الأدوار عاجزًا عن
 * تغيير كلمةٍ انكشفت — فيُترك الباب مفتوحًا لأنّ إغلاقه ممنوع.
 */
export async function PUT(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value ?? '';
  const admin = await resolveAdminSession(token);
  if (admin === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ password: 'INVALID' }), 422);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const result = await changeOwnPassword({
    adminId: admin.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    ip,
  });

  if (!result.ok) {
    if (result.reason === 'ADMIN_NOT_FOUND') return fail(ERRORS.NOT_FOUND, 404);
    /**
     * **والكلمة الخاطئة ليست انتهاءَ جلسة.**
     *
     * ردّها ٤٠١ أوّلًا فقال نصُّه «يلزم تسجيل الدخول» لمن هو داخلٌ
     * بالفعل — ولو التقطه معترضٌ عامّ لأخرجه من اللوحة على خطأ حرفٍ في
     * حقل. فهي ٤٢٢ بحقلها: الجلسة صحيحة، والمُدخَل خاطئ.
     */
    return fail(ERRORS.VALIDATION({ password: result.reason }), 422);
  }

  /**
   * **والكوكي يُمسح هنا.** الجلسات أُبطلت كلها، وتركُ الكوكي يجعل
   * المتصفّح يحمل رمزًا ميّتًا فيرى المستخدم شاشةً تُعيده إلى الدخول
   * بلا سبب معلَن.
   */
  const response = ok({ revokedSessions: result.revokedSessions, signedOut: true });
  response.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
