import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import type { AdminUser, Prisma } from '@/generated/prisma/client';

/**
 * مصادقة الأدمن — كلمة مرور، وجلسةٌ تنتهي بثمان ساعات.
 *
 * **منفصلة تمامًا عن مصادقة المستخدمين**: جدول آخر، وكوكي آخر،
 * ولا JWT مشترك ولا وسيط مشترك. خلط هوية موظّف بهوية مستخدم سوق
 * يجعل ثغرة في أحدهما ثغرة في الآخر.
 */

export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_MAX_FAILED = 5;
export const ADMIN_LOCK_MINUTES = 15;

export type LoginResult =
  | { ok: true; token: string; admin: AdminUser; mustChangePassword: boolean }
  | {
      ok: false;
      reason: 'INVALID_CREDENTIALS' | 'LOCKED' | 'INACTIVE';
      lockedUntil?: Date;
    };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function writeAudit(
  action: string,
  adminUserId: string,
  ip: string | null,
  after?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: adminUserId,
      actorType: 'admin',
      entity: 'AdminUser',
      entityId: adminUserId,
      action,
      ip,
      after: after ?? {},
    },
  });
}

/**
 * ═══ الدخول: البريد وكلمة المرور — والجلسة تصدر هنا ═══
 *
 * كانت خطوةً أولى لا تُصدر جلسة، وTOTP إلزاميّ بعدها لكل الأدوار.
 * **أُلغي بقرار المصمّم.**
 *
 * ═══ وما يحرس الباب بعده ═══
 *
 * القفل وحده: **خمس محاولات فاشلة ⇒ ربع ساعة**، والعدّاد على الحساب
 * لا على الاتصال فلا يلتفّ عليه تبديلُ عنوان. وكل محاولة — ناجحة أو
 * فاشلة — تُكتب في `AuditLog`.
 *
 * وهو حارسٌ ضدّ التخمين لا ضدّ التسريب: من عرف الكلمة دخل. فكلمةٌ
 * قويّة هنا ليست توصية.
 *
 * والرسالة واحدة لبريد مجهول ولكلمة خاطئة: تمييزهما يجعل النقطة
 * أداةَ تعداد لحسابات الفريق.
 */
export async function loginWithPassword(
  email: string,
  password: string,
  ip: string | null,
  userAgent: string | null = null,
  now: Date = new Date(),
): Promise<LoginResult> {
  const admin = await db.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (admin === null) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  if (admin.lockedUntil !== null && admin.lockedUntil.getTime() > now.getTime()) {
    await writeAudit('admin.login.failed', admin.id, ip, { reason: 'locked' });
    return { ok: false, reason: 'LOCKED', lockedUntil: admin.lockedUntil };
  }

  if (admin.status !== 'active') {
    await writeAudit('admin.login.failed', admin.id, ip, { reason: 'inactive' });
    return { ok: false, reason: 'INACTIVE' };
  }

  if (!(await verifyPassword(password, admin.passwordHash))) {
    const failed = admin.failedAttempts + 1;
    const locked = failed >= ADMIN_MAX_FAILED;

    await db.adminUser.update({
      where: { id: admin.id },
      data: {
        failedAttempts: locked ? 0 : failed,
        lockedUntil: locked
          ? new Date(now.getTime() + ADMIN_LOCK_MINUTES * 60_000)
          : null,
      },
    });
    await writeAudit('admin.login.failed', admin.id, ip, { attempt: failed, locked });

    return locked
      ? {
          ok: false,
          reason: 'LOCKED',
          lockedUntil: new Date(now.getTime() + ADMIN_LOCK_MINUTES * 60_000),
        }
      : { ok: false, reason: 'INVALID_CREDENTIALS' };
  }

  const token = randomBytes(32).toString('base64url');
  await db.adminSession.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(token),
      ip,
      userAgent,
      expiresAt: new Date(now.getTime() + ADMIN_SESSION_HOURS * 3_600_000),
    },
  });

  // نجاح واحد يصفّر العدّاد
  await db.adminUser.update({
    where: { id: admin.id },
    data: { failedAttempts: 0, lockedUntil: null, lastSeenAt: now },
  });
  await writeAudit('admin.login.success', admin.id, ip, { role: admin.role });

  return { ok: true, token, admin, mustChangePassword: admin.mustChangePassword };
}

/** يحلّ رمز الجلسة إلى صاحبها، ويعيد `null` لأي رمز منتهٍ أو مُبطَل. */
export async function resolveAdminSession(
  token: string,
  now: Date = new Date(),
): Promise<AdminUser | null> {
  if (token === '') return null;

  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });

  if (session === null) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (session.adminUser.status !== 'active') return null;

  // الجلسة تُبطَل بتغيير الكلمة — ولو كانت صالحة زمنيًا
  if (session.adminUser.passwordChangedAt.getTime() > session.createdAt.getTime()) {
    return null;
  }

  return session.adminUser;
}

export async function revokeAdminSession(
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await db.adminSession
    .update({ where: { tokenHash: hashToken(token) }, data: { revokedAt: now } })
    .catch(() => undefined);
}

/** تُستدعى عند تغيير الكلمة أو الدور — كل جلسات الحساب تسقط. */
export async function revokeAllSessions(
  adminUserId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: now },
  });
  return count;
}

/** مقارنة ثابتة الزمن للرموز القصيرة — تُستعمل في اختبارات التكافؤ. */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
