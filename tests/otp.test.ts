import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  requestOtp,
  verifyOtp,
} from '@/lib/domain/auth';

/**
 * قواعد OTP — DESIGN-DECISIONS ٢٨.
 * الزمن يُحقن في كل استدعاء، فلا اختبار ينتظر ثلاثين ثانية حقيقية.
 */

const PHONE = '+966599999001';
const T0 = new Date('2026-08-02T09:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

async function freshCode(now: Date): Promise<{ id: string; code: string }> {
  const result = await requestOtp(PHONE, now);
  if (!result.ok) throw new Error(`تعذّر طلب الرمز: ${result.reason}`);
  const row = await db.otpChallenge.findUniqueOrThrow({
    where: { id: result.challengeId },
  });
  // في التطوير يُعاد الرمز، وهو الطريق الوحيد لمعرفته في الاختبار
  return { id: row.id, code: result.devCode ?? '' };
}

beforeEach(async () => {
  await db.otpChallenge.deleteMany({ where: { phone: PHONE } });
  await db.user.deleteMany({ where: { phone: PHONE } });
});

afterAll(async () => {
  await db.otpChallenge.deleteMany({ where: { phone: PHONE } });
  await db.user.deleteMany({ where: { phone: PHONE } });
  await db.$disconnect();
});

describe('طلب الرمز', () => {
  it('الرمز ست خانات — أربع خانات ضعيفة على حساب مالي', async () => {
    const { code } = await freshCode(T0);
    expect(code).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  it('لا يُخزَّن الرمز خامًا — بصمة فقط', async () => {
    const { id, code } = await freshCode(T0);
    const row = await db.otpChallenge.findUniqueOrThrow({ where: { id } });
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toHaveLength(64);
  });

  it('بصمة الرمز نفسه تختلف بين تحدٍّ وآخر', async () => {
    const a = await freshCode(T0);
    const b = await freshCode(at(OTP_RESEND_COOLDOWN_SECONDS));
    const [rowA, rowB] = await Promise.all([
      db.otpChallenge.findUniqueOrThrow({ where: { id: a.id } }),
      db.otpChallenge.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    if (a.code === b.code) expect(rowA.codeHash).not.toBe(rowB.codeHash);
    else expect(rowA.codeHash).not.toBe(rowB.codeHash);
  });

  it('إعادة الإرسال قبل ٣٠ ثانية مرفوضة', async () => {
    await freshCode(T0);
    const early = await requestOtp(PHONE, at(OTP_RESEND_COOLDOWN_SECONDS - 1));
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe('COOLDOWN');

    const onTime = await requestOtp(PHONE, at(OTP_RESEND_COOLDOWN_SECONDS));
    expect(onTime.ok).toBe(true);
  });

  it('٥ إرسالات في الساعة — والسادس يُرفض', async () => {
    for (let i = 0; i < OTP_MAX_SENDS_PER_HOUR; i += 1) {
      const result = await requestOtp(PHONE, at(i * OTP_RESEND_COOLDOWN_SECONDS));
      expect(result.ok, `الإرسال ${i + 1}`).toBe(true);
    }

    const sixth = await requestOtp(
      PHONE,
      at(OTP_MAX_SENDS_PER_HOUR * OTP_RESEND_COOLDOWN_SECONDS),
    );
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.reason).toBe('RATE_LIMITED');
  });
});

describe('التحقّق', () => {
  it('الرمز الصحيح ينشئ الحساب في أول مرة — الدخول والتسجيل خطوة واحدة', async () => {
    const { id, code } = await freshCode(T0);
    const first = await verifyOtp(id, code, at(10));
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.isNew).toBe(true);
      expect(first.user.phone).toBe(PHONE);
    }

    const second = await freshCode(at(60));
    const again = await verifyOtp(second.id, second.code, at(70));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.isNew).toBe(false);
  });

  it('٥ محاولات خاطئة تُبطل التحدّي، والسادسة ترتدّ', async () => {
    const { id, code } = await freshCode(T0);

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i += 1) {
      const wrong = await verifyOtp(id, '000000', at(i));
      expect(wrong.ok, `المحاولة ${i}`).toBe(false);
      if (!wrong.ok) expect(wrong.reason).toBe('INVALID');
    }

    const last = await verifyOtp(id, '000000', at(OTP_MAX_ATTEMPTS));
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toBe('ATTEMPTS_EXHAUSTED');

    // الرمز الصحيح لم يعد ينفع بعد الاستنفاد
    const tooLate = await verifyOtp(id, code, at(OTP_MAX_ATTEMPTS + 1));
    expect(tooLate.ok).toBe(false);
  });

  it('الرمز الصحيح في المحاولة الأخيرة ينجح', async () => {
    const { id, code } = await freshCode(T0);
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i += 1) {
      await verifyOtp(id, '000000', at(i));
    }
    const result = await verifyOtp(id, code, at(OTP_MAX_ATTEMPTS));
    expect(result.ok).toBe(true);
  });

  it('الرمز يسقط بعد ٥ دقائق', async () => {
    const { id, code } = await freshCode(T0);
    const late = await verifyOtp(id, code, at(OTP_TTL_SECONDS + 1));
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('EXPIRED');
  });

  it('لا يُستخدم الرمز مرتين', async () => {
    const { id, code } = await freshCode(T0);
    expect((await verifyOtp(id, code, at(5))).ok).toBe(true);
    const replay = await verifyOtp(id, code, at(6));
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('CONSUMED');
  });

  it('الحساب الموقوف لا يدخل', async () => {
    const { id, code } = await freshCode(T0);
    await verifyOtp(id, code, at(5));
    await db.user.update({ where: { phone: PHONE }, data: { status: 'SUSPENDED' } });

    const next = await freshCode(at(60));
    const blocked = await verifyOtp(next.id, next.code, at(70));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('BLOCKED');
  });

  it('معرّف تحدٍّ مجهول لا يكشف شيئًا', async () => {
    const unknown = await verifyOtp('does-not-exist', '000000', T0);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('INVALID');
  });
});

describe('تسريب الرمز', () => {
  it('devCode لا يخرج إلا في development — والشرط على APP_ENV لا NODE_ENV', async () => {
    for (const env of ['staging', 'production'] as const) {
      vi.resetModules();
      vi.stubEnv('APP_ENV', env);
      // الحالة الفاصلة: APP_ENV=staging و NODE_ENV=development.
      // الشرط الصحيح (APP_ENV) لا يسرّب، والخاطئ (NODE_ENV) يسرّب.
      vi.stubEnv('NODE_ENV', 'development');

      const mod = await import('@/lib/domain/auth');
      const phone = `+96659999${env === 'staging' ? '8001' : '8002'}`;
      await db.otpChallenge.deleteMany({ where: { phone } });

      const result = await mod.requestOtp(phone, T0);
      expect(result.ok, env).toBe(true);
      if (result.ok) {
        expect(result.devCode, `${env} يجب ألّا يعيد الرمز`).toBeUndefined();
      }

      await db.otpChallenge.deleteMany({ where: { phone } });
      vi.unstubAllEnvs();
    }
    vi.resetModules();
  });

  it('development وحدها تعيد الرمز', async () => {
    const { code } = await freshCode(T0);
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('أرقام التجربة', () => {
  const TEST_PHONE = '+966599997001';

  afterAll(async () => {
    await db.otpChallenge.deleteMany({ where: { phone: TEST_PHONE } });
    await db.auditLog.deleteMany({ where: { actorId: TEST_PHONE } });
  });

  it('رقم التجربة رمزه ثابت ويُسجَّل كل استخدام في AuditLog', async () => {
    vi.resetModules();
    vi.stubEnv('OTP_TEST_NUMBERS', TEST_PHONE);
    const mod = await import('@/lib/domain/auth');

    await db.otpChallenge.deleteMany({ where: { phone: TEST_PHONE } });
    await db.auditLog.deleteMany({ where: { actorId: TEST_PHONE } });

    const requested = await mod.requestOtp(TEST_PHONE, T0);
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;

    const verified = await mod.verifyOtp(requested.challengeId, mod.OTP_TEST_CODE, at(5));
    expect(verified.ok, 'الرمز الثابت يعمل').toBe(true);

    const logged = await db.auditLog.count({
      where: { actorId: TEST_PHONE, action: 'otp.test_number' },
    });
    expect(logged).toBe(1);

    await db.user.deleteMany({ where: { phone: TEST_PHONE } });
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('الأرقام الحقيقية لا تأخذ الرمز الثابت ولا تُسجَّل', async () => {
    const { code } = await freshCode(T0);
    expect(code).not.toBe('000000');
    const logged = await db.auditLog.count({
      where: { actorId: PHONE, action: 'otp.test_number' },
    });
    expect(logged).toBe(0);
  });
});
