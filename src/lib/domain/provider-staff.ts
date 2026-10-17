import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '../auth/password';

/**
 * ═══ بابُ لوحة المزوّد — وكان مقفلًا ═══
 *
 * `providerUser.create` كان **في البذرة وحدها**: لا مسار أدمن ولا زرّ.
 * فمزوّدٌ يُضاف من اللوحة لا يستطيع الدخول أبدًا، ولا يرى طلبًا ولا
 * يؤكّد إنجازًا — وبطاقةُ «من يدخل لوحته» تقول العاقبة («بلا حساب لا
 * يرى المزوّد طلباته») **ولا تعرض علاجًا**. فالأربعةُ العاملون اليوم
 * مزروعون، وكلُّ جديدٍ مسدودٌ عليه.
 *
 * **والبابُ ثلاثةُ أجزاء لا جزء**: يُنشئ الأدمن الحساب، ويغيّر
 * المزوّد كلمته المؤقّتة، ويستطيع الأدمن إيقافه أو إعادة ضبط كلمته.
 * وبناءُ الأوّل وحده يترك المزوّد يُقال له «غيّر كلمتك» بلا مسارٍ
 * يغيّرها — قفلٌ ثانٍ مكان الأوّل.
 */

/** أدنى طولٍ لكلمةٍ يختارها المزوّد لنفسه. */
export const MIN_PROVIDER_PASSWORD = 10;

/**
 * الكلمةُ المؤقّتة **تُولَّد ولا تُكتب بيد**.
 *
 * كلمةٌ يخترعها المشغّل تكون «1234» في نصف الحالات، والمزوّد لا يغيّرها
 * ما لم يُجبَر. و`base64url` تتجنّب الخانات الملتبسة في النسخ واللصق.
 */
function tempPassword(): string {
  return randomBytes(12).toString('base64url');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateStaffResult =
  | { ok: true; id: string; tempPassword: string }
  | { ok: false; reason: 'PROVIDER_NOT_FOUND' | 'BAD_EMAIL' | 'NAME_REQUIRED' | 'EMAIL_TAKEN' };

/**
 * يُنشئ حسابَ دخولٍ لمزوّد ويُعيد كلمتَه المؤقّتة **مرّةً واحدة**.
 *
 * ولا تُكتب في `AuditLog` ولا في سجلّ: السجلّ يُقرأ بعد سنةٍ بعيونٍ
 * كثيرة، وكلمةٌ فيه كلمةٌ مكشوفة. والسطرُ يقول **أنّ حسابًا أُنشئ
 * ولمن**، لا بماذا يُدخَل إليه.
 */
export async function createProviderUser(
  input: { providerId: string; name: string; email: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<CreateStaffResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (name.length === 0) return { ok: false, reason: 'NAME_REQUIRED' };
  if (!EMAIL.test(email)) return { ok: false, reason: 'BAD_EMAIL' };

  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { id: true },
  });
  if (provider === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  const taken = await db.providerUser.findUnique({ where: { email }, select: { id: true } });
  if (taken !== null) return { ok: false, reason: 'EMAIL_TAKEN' };

  const plain = tempPassword();
  const user = await db.providerUser.create({
    data: {
      providerId: input.providerId,
      name,
      email,
      passwordHash: await hashPassword(plain),
      /** **ويُجبَر على تغييرها** — فالكلمة التي أنشأها الأدمن مرّت بعينه. */
      mustChangePassword: true,
      createdAt: now,
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: input.providerId,
      action: 'provider.staff_created',
      before: {},
      after: { providerUserId: user.id, email, name },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, id: user.id, tempPassword: plain };
}

export type StaffActionResult =
  | { ok: true }
  | { ok: false; reason: 'USER_NOT_FOUND' | 'NOT_THIS_PROVIDER' };

/**
 * إيقافُ حسابٍ أو إعادتُه.
 *
 * **والجلساتُ تُسحب مع الإيقاف.** `resolveProviderSession` يفحص
 * `active` في كل طلبٍ فالأثرُ فوريّ — لكنّ حسابًا يُعاد تفعيلُه بعد
 * شهرٍ يجب ألّا يستأنف جلسةً قديمة بقيت صالحة.
 */
export async function setProviderUserActive(
  input: {
    providerId: string;
    providerUserId: string;
    active: boolean;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<StaffActionResult> {
  const user = await db.providerUser.findUnique({
    where: { id: input.providerUserId },
    select: { id: true, providerId: true, email: true, active: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  /** **ولا بابَ خلفيًّا**: معرّفٌ مخمَّن لا يوقف حسابَ مزوّدٍ آخر. */
  if (user.providerId !== input.providerId) return { ok: false, reason: 'NOT_THIS_PROVIDER' };

  await db.$transaction(async (tx) => {
    await tx.providerUser.update({
      where: { id: user.id },
      data: { active: input.active },
    });
    await tx.providerSession.updateMany({
      where: { providerUserId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: input.providerId,
      action: input.active ? 'provider.staff_restored' : 'provider.staff_suspended',
      before: { active: user.active },
      after: { providerUserId: user.id, email: user.email, active: input.active },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true };
}

export type ResetResult =
  | { ok: true; tempPassword: string }
  | { ok: false; reason: 'USER_NOT_FOUND' | 'NOT_THIS_PROVIDER' };

/** يُعيد ضبط الكلمة ويسحب الجلسات — فمن سرقها لا يبقى داخلًا. */
export async function resetProviderUserPassword(
  input: { providerId: string; providerUserId: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ResetResult> {
  const user = await db.providerUser.findUnique({
    where: { id: input.providerUserId },
    select: { id: true, providerId: true, email: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (user.providerId !== input.providerId) return { ok: false, reason: 'NOT_THIS_PROVIDER' };

  const plain = tempPassword();
  await db.$transaction(async (tx) => {
    await tx.providerUser.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(plain), mustChangePassword: true },
    });
    await tx.providerSession.updateMany({
      where: { providerUserId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'ServiceProvider',
      entityId: input.providerId,
      action: 'provider.staff_password_reset',
      before: {},
      after: { providerUserId: user.id, email: user.email },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, tempPassword: plain };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'WRONG_CURRENT' | 'TOO_SHORT' | 'SAME_PASSWORD' | 'USER_NOT_FOUND' };

/**
 * ═══ والمزوّد يغيّر كلمتَه بنفسه ═══
 *
 * `mustChangePassword` يُرفع عند الإنشاء ويُردّ في الدخول — **ولا
 * مسار كان يغيّرها**. فيُقال للمزوّد «غيّر كلمتك» في كل دخول ولا
 * سبيل له، وهو الشرطُ المفروض بلا بابٍ لاستيفائه.
 */
export async function changeProviderPassword(
  input: { providerUserId: string; current: string; next: string },
): Promise<ChangePasswordResult> {
  if (input.next.length < MIN_PROVIDER_PASSWORD) return { ok: false, reason: 'TOO_SHORT' };
  if (input.next === input.current) return { ok: false, reason: 'SAME_PASSWORD' };

  const user = await db.providerUser.findUnique({
    where: { id: input.providerUserId },
    select: { id: true, passwordHash: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };

  if (!(await verifyPassword(input.current, user.passwordHash))) {
    return { ok: false, reason: 'WRONG_CURRENT' };
  }

  await db.providerUser.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.next),
      mustChangePassword: false,
    },
  });

  /**
   * **ولا تُسحب جلستُه هو.** من غيّر كلمتَه عمدًا لا يُخرَج من لوحته
   * عقابًا على ذلك — والسحبُ لمن أُعيد ضبطُ كلمته لا لمن غيّرها.
   */
  return { ok: true };
}
