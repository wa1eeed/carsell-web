import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { nextCustomerRef } from './refs';
import { APP_ENV, isDevelopment, isStaging } from '@/lib/env';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TEST_CODE,
  OTP_TTL_SECONDS,
} from './otp-constants';
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

/** **والثوابتُ في ملفٍّ بلا `db`** — فمكوّنُ العميل يستوردها بلا أن يجرّ Prisma. */
export {
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TEST_CODE,
} from './otp-constants';

/**
 * أرقام تجربة بلا كلفة رسائل.
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

/**
 * ═══ وفي staging كلُّ رقمٍ رقمُ تجربة ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «**المفترض أن الـotp في staging دائمًا
 * `000000`**». وحجّتُه قاطعة: **كيف تُختبَر المنصّة لمستخدمي المتجر
 * والمعارض بغير ذلك؟**
 *
 * فبيئةُ التجربة فيها واحدٌ وخمسون إعلانًا وأربعةُ معارض **ولا يدخلها
 * أحدٌ كمستخدم**: الرمزُ يُولَّد ولا يُرسَل — إذ لا مزوّدَ رسائل بعد
 * (`TODO` أدناه) — فتبقى الشاشاتُ مبنيّةً لا تُفتح. وهو «**الشرط
 * يُفرَض ولا بابَ لاستيفائه**» بنصّه: قفلٌ بلا مفتاح.
 *
 * وقائمةُ `OTP_TEST_NUMBERS` تبقى — لرقمٍ بعينه على بيئةٍ أخرى — لكنها
 * **لا تصلح حلًّا لـstaging**: متغيّرٌ يُضاف في لوحةِ نشرٍ يُنسى، ولا
 * يُطبَّق إلّا بإعادة نشر، ويُحفظ باقتباسٍ فلا يطابق. وقد وقع الثلاثة.
 *
 * ═══ والشرطُ على `APP_ENV` لا على `NODE_ENV` ═══
 *
 * `NODE_ENV` يساوي `production` في staging أيضًا، فالحراسةُ به تُخطئ
 * في الاتّجاهين — قاعدةٌ مكتوبةٌ في هذا المستودع من عطلٍ وقع.
 * **والإنتاجُ لا يُستثنى منه رقمٌ إلّا بالقائمة الصريحة**، ويحرس ذلك
 * `tests/env-guards`.
 */
export function isTestNumber(phone: string): boolean {
  return isStaging || testNumbers().has(phone);
}

export type RequestOtpResult =
  | {
      ok: true;
      challengeId: string;
      expiresIn: number;
      /** الرمزُ نفسُه — **في التطوير وحده**، ولا يُرخى هذا الشرط. */
      devCode?: string;
      /**
       * ═══ رايةٌ لا رمز ═══
       *
       * في staging الرمزُ ثابتٌ معروف (`OTP_TEST_CODE`)، فالشاشة تحتاج
       * أن **تعرف** ذلك لتعرضه — ولا تحتاج أن يُرسَل إليها.
       *
       * وإعادةُ الراية بدل القيمة مقصودة: حارسُ «الرمز لا يخرج خارج
       * التطوير» يفحص تعبيرَ `devCode` بنصّه (`tests/env-guards`)،
       * وهو موضوعٌ لأخطر تسرّبٍ في هذا المنتج — **فلا يُمسّ لتسهيلِ
       * تجربة**. والرايةُ تُغني، إذ القيمةُ ثابتٌ منشور.
       */
      fixedCode?: boolean;
    }
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
    ...(isStaging ? { fixedCode: true } : {}),
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

  /**
   * الدخول والتسجيل خطوة واحدة (Wm): أول تحقّق ناجح يُنشئ الحساب.
   *
   * **ورقم العميل يُمنح عند الإنشاء داخل المعاملة نفسها** — ومنحُه
   * لاحقًا بوظيفةٍ تمرّ يترك عملاءَ بلا رقمٍ بين اللحظتين، وهم الذين
   * يتّصلون في يومهم الأوّل.
   */
  const created = await db.$transaction(async (tx) =>
    tx.user.create({
      data: { phone: challenge.phone, ref: await nextCustomerRef(tx, now) },
    }),
  );
  return { ok: true, user: created, isNew: true };
}
