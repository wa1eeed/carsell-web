import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { completeRegistration, validateRegistration, MIN_PASSWORD } from '@/lib/domain/registration';
import { verifyPassword } from '@/lib/auth/password';
import { profileCompletion } from '@/lib/domain/profile';

/**
 * ═══ التسجيل — ولم يكن تسجيلًا ═══
 *
 * الدخول رقمٌ ورمزٌ لمرّة واحدة، ومن دخل أوّل مرّة صار له حسابٌ بلا
 * اسمٍ ولا مدينةٍ ولا كلمة — فيُفتح له «حسابي» على «بلا اسم»، ولا
 * تُرشَّح له نتيجةٌ قريبة، ولا سبيل له إلى الدخول إلّا رمزٌ جديد في
 * كل مرّة.
 */

const stamp = String(Date.now()).slice(-9);
const made: string[] = [];

async function freshUser(): Promise<string> {
  const user = await db.user.create({
    data: { phone: `+96650${String(Date.now()).slice(-7)}` },
    select: { id: true },
  });
  made.push(user.id);
  return user.id;
}

afterAll(async () => {
  if (made.length > 0) await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

describe('تسجيل الفرد', () => {
  it('يكتب الاسم والمدينة وكلمة المرور', async () => {
    const userId = await freshUser();
    const result = await completeRegistration(userId, {
      accountType: 'INDIVIDUAL',
      name: 'بدر الشمري',
      city: 'الرياض',
      password: 'Carz!2026pass',
    });
    expect(result.ok).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, city: true, accountType: true, passwordHash: true, businessName: true },
    });
    expect(row.name).toBe('بدر الشمري');
    expect(row.city).toBe('الرياض');
    expect(row.accountType).toBe('INDIVIDUAL');
    expect(row.businessName).toBeNull();
    // الكلمة تُجزَّأ ولا تُخزَّن
    expect(row.passwordHash).not.toBe('Carz!2026pass');
    expect(await verifyPassword('Carz!2026pass', row.passwordHash ?? '')).toBe(true);
  });

  it('ونسبةُ الاكتمال تبدأ من واحدٍ من ستّة', async () => {
    const userId = await freshUser();
    await completeRegistration(userId, {
      accountType: 'INDIVIDUAL',
      name: 'بدر الشمري',
      city: 'الرياض',
      password: 'Carz!2026pass',
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const completion = profileCompletion(user);
    expect(completion.missing).not.toContain('city');
    expect(completion.percent).toBe(17);
  });
});

describe('تسجيل المعرض', () => {
  /**
   * **والمعرض يُسأل بريدَه لا مدينتَه**: عنوانُه يُستكمل في التهيئة مع
   * سجلّه وآيبانه، وسؤالُه عن مدينةٍ مفردة الآن ثمّ عن عنوانٍ بعد قليل
   * سؤالان عن شيءٍ واحد.
   */
  it('يكتب اسم المعرض في الاسم وفي اسم المنشأة معًا', async () => {
    const userId = await freshUser();
    const result = await completeRegistration(userId, {
      accountType: 'BUSINESS',
      name: `معرض اختبار ${stamp}`,
      email: `dealer${stamp}@example.sa`,
      password: 'Carz!2026pass',
    });
    expect(result.ok).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, businessName: true, email: true, city: true, accountType: true },
    });
    // الشاشات تقرأ `name` وحدها — وحسابٌ باسمٍ فارغ يُعرض «بلا اسم»
    expect(row.name).toBe(`معرض اختبار ${stamp}`);
    expect(row.businessName).toBe(`معرض اختبار ${stamp}`);
    expect(row.email).toBe(`dealer${stamp}@example.sa`);
    expect(row.city).toBeNull();
    expect(row.accountType).toBe('BUSINESS');
  });

  it('وما ينقصه بعد التسجيل هو تهيئتُه', async () => {
    const userId = await freshUser();
    await completeRegistration(userId, {
      accountType: 'BUSINESS',
      name: `معرض اختبار ${stamp}`,
      email: `dealer2${stamp}@example.sa`,
      password: 'Carz!2026pass',
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const completion = profileCompletion(user);
    expect(completion.missing).toContain('crNumber');
    expect(completion.missing).toContain('address');
    expect(completion.missing).toContain('iban');
    expect(completion.missing).not.toContain('city');
  });

  it('وبريدٌ مستعمل يُردّ', async () => {
    const first = await freshUser();
    const email = `twin${stamp}@example.sa`;
    expect(
      (await completeRegistration(first, {
        accountType: 'BUSINESS', name: 'الأوّل', email, password: 'Carz!2026pass',
      })).ok,
    ).toBe(true);

    const second = await completeRegistration(await freshUser(), {
      accountType: 'BUSINESS', name: 'الثاني', email, password: 'Carz!2026pass',
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('EMAIL_TAKEN');
  });
});

describe('التحقّق', () => {
  it('يردّ كل الحقول الخاطئة دفعةً', () => {
    expect(
      validateRegistration({
        accountType: 'INDIVIDUAL', name: 'ا', city: '', password: 'short',
      }),
    ).toEqual({ name: 'REQUIRED', city: 'REQUIRED', password: 'SHORT' });

    expect(
      validateRegistration({
        accountType: 'BUSINESS', name: '', email: 'not-an-email', password: 'short',
      }),
    ).toEqual({ name: 'REQUIRED', email: 'INVALID', password: 'SHORT' });
  });

  /** **والطول يُقاس على ما كُتب لا على ما عُرض** — كلمةٌ من مسافاتٍ ليست كلمة. */
  it('وكلمةٌ من مسافات تُردّ', () => {
    const fields = validateRegistration({
      accountType: 'INDIVIDUAL',
      name: 'بدر الشمري',
      city: 'الرياض',
      password: ' '.repeat(MIN_PASSWORD + 2),
    });
    expect(fields.password).toBe('SHORT');
  });
});
