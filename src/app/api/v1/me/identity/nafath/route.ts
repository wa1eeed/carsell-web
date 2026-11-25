import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto/secrets';
import { verifyByNafath } from '@/lib/domain/identity-state';
import { nafathReady, pollNafath, startNafath, validNationalId } from '@/lib/identity/nafath';

export const runtime = 'nodejs';

const Start = z.object({ nationalId: z.string().min(10).max(10) });
const Poll = z.object({ transactionId: z.string().min(1).max(120) });

const MESSAGES: Record<string, string> = {
  NOT_CONFIGURED: 'التحقق بنفاذ غير متاح الآن — وثق هويتك بالطريقة اليدوية.',
  ID_INVALID: 'رقم الهوية عشر خانات يبدأ بـ1 أو 2.',
  REJECTED: 'رفض الطلب في تطبيق نفاذ.',
  EXPIRED: 'انتهت مهلة الطلب — ابدأ من جديد.',
  UPSTREAM: 'تعذر الوصول إلى نفاذ. حاول بعد قليل.',
};

/**
 * `POST /api/v1/me/identity/nafath` — يبدأ تحقّقًا، أو يسأل عن حاله.
 *
 * **والرقمُ العشوائيّ يُعاد إلى الشاشة** — وهو جزءٌ من الأمان: يفتح
 * المستخدمُ تطبيقَ نفاذ فيجد ثلاثةَ أرقام ويضغط ما يطابق شاشتَنا،
 * فمن لم يرَ شاشتَنا لا يعرف أيَّها يضغط.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  /**
   * **والمتاحُ يُفحص هنا كما في الشاشة.** الشاشةُ تُخفي الزرَّ متى
   * كانت نفاذُ غيرَ مضبوطة، والنداءُ المباشر يُردّ بالسبب نفسه —
   * فحارسٌ في الشاشة اقتراح.
   */
  if (!(await nafathReady())) {
    return fail({ code: 'NOT_CONFIGURED', messageAr: MESSAGES.NOT_CONFIGURED ?? '', messageEn: 'Nafath is not available.' }, 409);
  }

  const body: unknown = await request.json().catch(() => null);

  const poll = Poll.safeParse(body);
  if (poll.success) {
    const status = await pollNafath(poll.data.transactionId);
    if (!status.ok) {
      return fail({ code: status.reason, messageAr: MESSAGES[status.reason] ?? '', messageEn: 'Nafath check failed.' }, 409);
    }
    if (status.state === 'WAITING') return ok({ state: 'WAITING' });

    /**
     * **والاسمُ من المصدر يغلب المكتوب.** من كتب اسمًا مختصرًا عند
     * التسجيل يصير اسمُه ما في السجلّ المدنيّ — وهو ما يُقابَل به
     * اسمُ صاحب الآيبان، فاختلافُهما كان علّةَ أكثر ما يُرفض.
     */
    await verifyByNafath(db, user.id, {
      name: status.fullName ?? user.name ?? '',
      nationalIdEncrypted: encryptSecret(status.nationalId),
    });
    return ok({ state: 'APPROVED' });
  }

  const start = Start.safeParse(body);
  if (!start.success || !validNationalId(start.data.nationalId)) {
    return fail({ code: 'ID_INVALID', messageAr: MESSAGES.ID_INVALID ?? '', messageEn: 'Invalid national ID.' }, 422);
  }

  const result = await startNafath(start.data.nationalId);
  if (!result.ok) {
    return fail({ code: result.reason, messageAr: MESSAGES[result.reason] ?? '', messageEn: 'Could not start Nafath.' }, 409);
  }
  return ok({
    transactionId: result.transactionId,
    random: result.random,
    expiresAt: result.expiresAt.toISOString(),
  });
}

/** أمتاحةٌ نفاذ؟ — تسألها الشاشةُ لتعرف أتعرض زرَّها أم لا. */
export async function GET() {
  return ok({ available: await nafathReady() });
}
