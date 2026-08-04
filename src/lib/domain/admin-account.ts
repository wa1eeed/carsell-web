import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { revokeAllSessions } from './admin-auth';
import { MIN_ADMIN_PASSWORD } from './admin-provision';

/**
 * ═══ حساب الأدمن — تغيير كلمته ═══
 *
 * الدخول بالكلمة وحدها (أُلغيت المصادقة الثنائية بقرار المصمّم)، ولا
 * باب لتغييرها: من دخل بكلمةٍ مؤقّتة يبقى عليها، ومن ظنّ كلمتَه
 * انكشفت لا يملك إلا أن يطلب من صاحب لوحة النشر تغييرها.
 *
 * ═══ والكلمة الجديدة تُنهي كل الجلسات — بما فيها هذه ═══
 *
 * القاعدة قائمةٌ في `resolveAdminSession`: جلسةٌ أُنشئت قبل
 * `passwordChangedAt` لا تُحلّ. فأبقيتُ الجلسة الحالية أوّلًا ثم رأيتُ
 * أنّ ذلك **قاعدةٌ ثانية** تناقض الأولى — والحارس سيُسقطها عند أوّل
 * طلبٍ بعدها على أي حال، فيُخرَج المستخدم بلا أن يقول له أحدٌ لماذا.
 *
 * فالقاعدة واحدة: تُبطَل كلها، والشاشة تقول «سجّل دخولك من جديد».
 *
 * ═══ ولا تُغيَّر كلمةُ غيرك من هنا ═══
 *
 * الهدف هو المتصرّف نفسه دائمًا، ولا معرّف يُمرَّر. ورفعُ الصلاحية أو
 * الاستيلاء على حسابٍ آخر يمرّ بلوحة النشر (`ADMIN_EMAIL`) لا بجلسة.
 */

export type PasswordChangeResult =
  | { ok: true; revokedSessions: number; signedOut: true }
  | {
      ok: false;
      reason: 'ADMIN_NOT_FOUND' | 'WRONG_PASSWORD' | 'WEAK_PASSWORD' | 'SAME_PASSWORD';
    };

export async function changeOwnPassword(
  input: {
    adminId: string;
    currentPassword: string;
    newPassword: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<PasswordChangeResult> {
  const admin = await db.adminUser.findUnique({
    where: { id: input.adminId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (admin === null) return { ok: false, reason: 'ADMIN_NOT_FOUND' };

  /**
   * **الكلمة الحالية تُطلب.** الجلسة قد تكون مسروقة — وحاسوبٌ تُرك
   * مفتوحًا يكفي لتغيير الكلمة وإقصاء صاحبها عن حسابه.
   */
  if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) {
    return { ok: false, reason: 'WRONG_PASSWORD' };
  }

  if (input.newPassword.length < MIN_ADMIN_PASSWORD) {
    return { ok: false, reason: 'WEAK_PASSWORD' };
  }

  // كلمةٌ لم تتغيّر تُبطل الجلسات بلا سبب، وتُقرأ في السجلّ تغييرًا
  if (await verifyPassword(input.newPassword, admin.passwordHash)) {
    return { ok: false, reason: 'SAME_PASSWORD' };
  }

  const passwordHash = await hashPassword(input.newPassword);

  await db.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      // **الختم هو ما يُبطل الجلسات** — والحارس يقرؤه في كل طلب
      passwordChangedAt: now,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  const count = await revokeAllSessions(admin.id, now);

  /**
   * **ولا يُكتب شيءٌ من الكلمة في السجلّ** — لا طولُها ولا بصمتُها.
   * الطول وحده يُضيّق البحث على من يقرأ السجلّ.
   */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'AdminUser',
      entityId: admin.id,
      action: 'admin.password_changed',
      before: {},
      after: { email: admin.email, revokedSessions: count },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, revokedSessions: count, signedOut: true };
}

export type OwnAccount = {
  name: string;
  email: string;
  role: string;
  lastSeenAt: string | null;
  activeSessions: number;
  mustChangePassword: boolean;
  minPasswordLength: number;
};

export async function ownAccount(
  adminId: string,
  now: Date = new Date(),
): Promise<OwnAccount | null> {
  const admin = await db.adminUser.findUnique({
    where: { id: adminId },
    select: {
      name: true,
      email: true,
      role: true,
      lastSeenAt: true,
      mustChangePassword: true,
    },
  });
  if (admin === null) return null;

  const activeSessions = await db.adminSession.count({
    where: { adminUserId: adminId, expiresAt: { gt: now }, revokedAt: null },
  });

  return {
    name: admin.name,
    email: admin.email,
    role: admin.role,
    lastSeenAt: admin.lastSeenAt?.toISOString() ?? null,
    activeSessions,
    mustChangePassword: admin.mustChangePassword,
    minPasswordLength: MIN_ADMIN_PASSWORD,
  };
}
