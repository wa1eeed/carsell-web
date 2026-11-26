import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { DEALER_COOKIE, dealerCookieOptions } from '@/lib/auth/dealer-session';
import { openDealerSession, DEALER_SESSION_HOURS } from '@/lib/domain/dealer-auth';
import { registerDealer } from '@/lib/domain/dealer-register';

export const runtime = 'nodejs';

const Body = z.object({
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  city: z.string().min(1).max(60),
  crNumber: z.string().min(1).max(24),
  address: z.string().max(200).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
});

const MESSAGES: Record<string, { ar: string; en: string }> = {
  ALREADY_MEMBER: { ar: 'حسابك عضو في معرض بالفعل.', en: 'This account already belongs to a dealership.' },
  USER_NOT_FOUND: { ar: 'الحساب غير موجود.', en: 'Account not found.' },
};

/**
 * `POST /api/v1/dealer/register` — يُنشئ المعرضَ ويفتح لوحته.
 *
 * ═══ والجلسةُ تُفتح هنا لا في بابٍ ثانٍ ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «المعرض يسجل و يدخل للوحة تحكمه مباشره».
 * فمن أتمّ الخطوات الأربع **لا يُرسَل إلى `/dealer/enter` ليضغط زرًّا
 * آخر**: الكوكي يُكتب في الاستجابة نفسِها، والشاشة تذهب إلى `/dealer`.
 * وبابُ `enter` يبقى لمن يعود غدًا بجلسةِ متجرٍ بلا جلسةِ لوحة.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(ERRORS.VALIDATION({ body: 'INVALID' }), 422);

  const result = await registerDealer(user.id, {
    nameAr: parsed.data.nameAr,
    nameEn: parsed.data.nameEn,
    city: parsed.data.city,
    crNumber: parsed.data.crNumber,
    address: parsed.data.address ?? null,
    phone: parsed.data.phone ?? null,
  });

  if (!result.ok) {
    if (result.reason === 'VALIDATION') return fail(ERRORS.VALIDATION(result.fields), 422);
    const message = MESSAGES[result.reason];
    return fail(
      {
        code: result.reason,
        messageAr: message?.ar ?? 'تعذر إنشاء المعرض.',
        messageEn: message?.en ?? 'Could not create the dealership.',
      },
      result.reason === 'ALREADY_MEMBER' ? 409 : 404,
    );
  }

  /**
   * **وفشلُ فتح الجلسة لا يُلغي المعرض.** المعرضُ أُنشئ ومالكُه
   * مالكُه — فيُقال «أُنشئ، ادخل من بابه» لا «تعذّر التسجيل»، وإلّا
   * أعاد المحاولة فردّه `ALREADY_MEMBER` وهو لا يفهم لماذا.
   */
  const session = await openDealerSession(user.id);
  if (session.ok) {
    const jar = await cookies();
    jar.set(DEALER_COOKIE, session.token, dealerCookieOptions(DEALER_SESSION_HOURS));
  }

  return ok({ dealerId: result.dealerId, slug: result.slug, entered: session.ok });
}
