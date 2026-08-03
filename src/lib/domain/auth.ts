import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { APP_ENV, isDevelopment } from '@/lib/env';
import type { User } from '@/generated/prisma/client';

/**
 * منطق OTP — **هنا لا في مسار الـAPI**، فالتطبيق سيستهلكه لاحقًا
 * ولا يجوز أن تعيش قاعدة في مسار HTTP وحده.
 *
 * الحدود من DESIGN-DECISIONS ٢٨:
 *   · ٦ خانات (٤ خانات = ١٠٬٠٠٠ احتمال، ضعيف على حساب مالي)
 *   · ٥ إرسالات في الساعة للرقم — السادس يُرفض
 *   · ٥ محاولات تحقّق لكل تحدٍّ — السادسة تُبطله
 *   · إعادة الإرسال بعد ٣٠ ثانية
 *   · صلاحية ٥ دقائق
 *
 * التحديد محفوظ في Postgres لا في الذاكرة: يصمد عبر إعادة التشغيل
 * ويبقى قابلًا للتدقيق. Redis يتولّى الحدود عالية التردّد لاحقًا
 * (المزايدة ١٠/دقيقة — المهمة ١٩).
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** رمز ثابت لأرقام التجربة — معروف عمدًا ولا يُرسل عبر مزوّد. */
export const OTP_TEST_CODE = '000000';

/**
 * أرقام تجربة لـstaging بلا كلفة رسائل.
 * **الأرقام الحقيقية تمرّ بالمزوّد دائمًا** — لا استثناء.
 * كل استخدام يُسجَّل في `AuditLog` بنوع `otp.test_number`،
 * فقائمة مفتوحة على الإنتاج تظهر في التدقيق لا في السكوت.
 */
function testNumbers(): ReadonlySet<string> {
  const raw = process.env.OTP_TEST_NUMBERS ?? '';
  return new Set(
    raw
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n !== ''),
  );
}

export function isTestNumber(phone: string): boolean {
  return testNumbers().has(phone);
}

export type RequestOtpResult =
  | { ok: true; challengeId: string; expiresIn: number; devCode?: string }
  | { ok: false; reason: 'RATE_LIMITED' | 'COOLDOWN'; retryAfter: number };

export type VerifyOtpResult =
  | { ok: true; user: User; isNew: boolean }
  | {
      ok: false;
      reason: 'INVALID' | 'EXPIRED' | 'CONSUMED' | 'ATTEMPTS_EXHAUSTED' | 'BLOCKED';
      attemptsLeft?: number;
    };

/**
 * بصمة الرمز.
 * الفلفل (`OTP_PEPPER`) خارج قاعدة البيانات، ومعرّف التحدّي داخل
 * البصمة — فبصمة الرمز نفسه تختلف بين تحدٍّ وآخر، ولا تُبنى جداول
 * قوس قزح على ستّ خانات.
 */
function hashCode(challengeId: string, code: string): string {
  const pepper = process.env.OTP_PEPPER;
  if (pepper === undefined || pepper === '') {
    throw new Error('OTP_PEPPER is unset — see .env.example');
  }
  return createHash('sha256').update(`${pepper}:${challengeId}:${code}`).digest('hex');
}

function equalHashes(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/**
 * طلب رمز.
 *
 * **لا يكشف وجود الحساب**: النتيجة واحدة سواء كان الرقم مسجّلًا أو لا،
 * ولا يُنشأ مستخدم هنا — الإنشاء عند التحقّق الناجح وحده.
 */
export async function requestOtp(
  phone: string,
  now: Date = new Date(),
): Promise<RequestOtpResult> {
  const hourAgo = new Date(now.getTime() - 3_600_000);

  const recent = await db.otpChallenge.findMany({
    where: { phone, expiresAt: { gte: hourAgo } },
    orderBy: { expiresAt: 'desc' },
    select: { expiresAt: true },
  });

  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    const oldest = recent[recent.length - 1];
    const retryAfter =
      oldest === undefined
        ? 3600
        : Math.max(
            1,
            Math.ceil(
              (oldest.expiresAt.getTime() + 3_600_000 - OTP_TTL_SECONDS * 1000 - now.getTime()) /
                1000,
            ),
          );
    return { ok: false, reason: 'RATE_LIMITED', retryAfter };
  }

  const last = recent[0];
  if (last !== undefined) {
    const sentAt = last.expiresAt.getTime() - OTP_TTL_SECONDS * 1000;
    const elapsed = (now.getTime() - sentAt) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: 'COOLDOWN',
        retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  const isTest = isTestNumber(phone);
  const code = isTest ? OTP_TEST_CODE : generateCode();
  const challenge = await db.otpChallenge.create({
    data: {
      phone,
      codeHash: '',
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    },
  });

  // البصمة تحتاج المعرّف، فتُكتب بعد الإنشاء مباشرةً
  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashCode(challenge.id, code) },
  });

  if (isTest) {
    await db.auditLog.create({
      data: {
        actorId: phone,
        actorType: 'system',
        entity: 'OtpChallenge',
        entityId: challenge.id,
        action: 'otp.test_number',
        after: { phone, appEnv: APP_ENV },
      },
    });
  }

  // TODO(المهمة ٢٧): إرسال الرسالة عبر مزوّد SMS المحلي.
  //
  // حتى ذلك الحين يُعاد الرمز في **التطوير وحده**. والشرط على
  // `APP_ENV` لا على `NODE_ENV`: الأخير يساوي `production` في
  // staging أيضًا، فـ`NODE_ENV !== 'production'` تُسرّب الرمز على
  // إنترنت عام — ورمز مكشوف يعني انتحال أي رقم بضغطة.
  return {
    ok: true,
    challengeId: challenge.id,
    expiresIn: OTP_TTL_SECONDS,
    ...(isDevelopment ? { devCode: code } : {}),
  };
}

/**
 * التحقّق من رمز.
 *
 * المحاولة تُحسب قبل المقارنة، فالمحاولة الفاشلة تُكلّف حتى لو
 * انقطع الاتصال بعدها. وبلوغ السقف يُبطل التحدّي لا يُبطئه.
 */
export async function verifyOtp(
  challengeId: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifyOtpResult> {
  const challenge = await db.otpChallenge.findUnique({ where: { id: challengeId } });

  if (challenge === null) return { ok: false, reason: 'INVALID' };
  if (challenge.consumedAt !== null) return { ok: false, reason: 'CONSUMED' };
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'ATTEMPTS_EXHAUSTED' };
  }

  const { attempts } = await db.otpChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });

  if (!equalHashes(challenge.codeHash, hashCode(challengeId, code))) {
    const left = OTP_MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      // إبطال فوري — لا يُترك تحدٍّ مستنفَد صالحًا
      await db.otpChallenge.update({
        where: { id: challengeId },
        data: { consumedAt: now },
      });
      return { ok: false, reason: 'ATTEMPTS_EXHAUSTED', attemptsLeft: 0 };
    }
    return { ok: false, reason: 'INVALID', attemptsLeft: left };
  }

  await db.otpChallenge.update({
    where: { id: challengeId },
    data: { consumedAt: now },
  });

  const existing = await db.user.findUnique({ where: { phone: challenge.phone } });

  if (existing !== null) {
    if (existing.status === 'BANNED' || existing.status === 'SUSPENDED') {
      return { ok: false, reason: 'BLOCKED' };
    }
    return { ok: true, user: existing, isNew: false };
  }

  // الدخول والتسجيل خطوة واحدة (Wm): أول تحقّق ناجح يُنشئ الحساب
  const created = await db.user.create({ data: { phone: challenge.phone } });
  return { ok: true, user: created, isNew: true };
}
