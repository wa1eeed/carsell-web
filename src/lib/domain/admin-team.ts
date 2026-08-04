import type { AdminRole } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { ADMIN_SESSION_HOURS } from './admin-auth';

/**
 * ═══ A35 — الفريق والصلاحيات ═══
 *
 * ستّة أدوار ومصفوفةٌ واحدة في `permissions.ts`، **ولا شاشة تعرضها**.
 * فمن يريد أن يعرف ماذا يرى `OPS` يقرأ الشيفرة — والمصفوفة قرارُ
 * حَوكمةٍ يُراجَع لا تفصيلُ تنفيذ.
 *
 * ═══ والشاشة تعرض ولا تمنح ═══
 *
 * إنشاء عضوٍ أو تغيير دوره **ليس فيها**: رفعُ الصلاحية أخطر ما في
 * اللوحة، ويمرّ بـ`ADMIN_EMAIL` في مزامنة الإقلاع — أي بمن يملك لوحة
 * النشر لا بمن يملك جلسةً في اللوحة. وزرٌّ هنا يجعل من سرق جلسةَ
 * `SUPER_ADMIN` يصنع لنفسه حسابًا ثانيًا.
 *
 * فما تقوله: من الفريق · بأي دور · ومتى دخل · وكم جلسةً حيّة له.
 */

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: string;
  lastSeenAt: string | null;
  /** جلسات لم تنتهِ ولم تُبطَل — والعدد يكشف حسابًا مشتركًا */
  activeSessions: number;
  /** أُقفل بعد محاولات فاشلة — ويُفكّ بتعيين كلمة من البيئة */
  locked: boolean;
  mustChangePassword: boolean;
};

export type TeamStats = {
  members: number;
  roles: number;
  activeSessions: number;
  locked: number;
  sessionHours: number;
};

export async function teamMembers(now: Date = new Date()): Promise<TeamMember[]> {
  const admins = await db.adminUser.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      lastSeenAt: true,
      lockedUntil: true,
      mustChangePassword: true,
    },
  });

  if (admins.length === 0) return [];

  const sessions = await db.adminSession.groupBy({
    by: ['adminUserId'],
    where: { expiresAt: { gt: now }, revokedAt: null },
    _count: true,
  });

  return admins.map((admin) => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    lastSeenAt: admin.lastSeenAt?.toISOString() ?? null,
    activeSessions: sessions.find((row) => row.adminUserId === admin.id)?._count ?? 0,
    locked: admin.lockedUntil !== null && admin.lockedUntil.getTime() > now.getTime(),
    mustChangePassword: admin.mustChangePassword,
  }));
}

export async function teamStats(now: Date = new Date()): Promise<TeamStats> {
  const [members, roles, sessions, locked] = await Promise.all([
    db.adminUser.count(),
    db.adminUser.groupBy({ by: ['role'] }),
    db.adminSession.count({ where: { expiresAt: { gt: now }, revokedAt: null } }),
    db.adminUser.count({ where: { lockedUntil: { gt: now } } }),
  ]);

  return {
    members,
    roles: roles.length,
    activeSessions: sessions,
    locked,
    sessionHours: ADMIN_SESSION_HOURS,
  };
}

export type RevokeResult =
  | { ok: true; revoked: number }
  | { ok: false; reason: 'ADMIN_NOT_FOUND' | 'SELF' };

/**
 * إنهاء جلسات عضو — **وهو الفعل الوحيد في هذه الشاشة**.
 *
 * لأنه الفعل الذي يُحتاج في اللحظة: جهازٌ ضاع، أو عضوٌ غادر، أو جلسةٌ
 * يُشكّ فيها. ولا يحتاج نشرةً ولا وصولًا إلى لوحة النشر.
 *
 * **ولا يُنهي المرء جلسات نفسه من هنا**: الخروج زرٌّ في مكانه، وخلطُ
 * الفعلين يجعل من أراد إنهاء جلسة غيره يُخرج نفسه بنقرةٍ خاطئة.
 */
export async function revokeMemberSessions(
  input: { targetId: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<RevokeResult> {
  if (input.targetId === input.adminId) return { ok: false, reason: 'SELF' };

  const target = await db.adminUser.findUnique({
    where: { id: input.targetId },
    select: { id: true, email: true },
  });
  if (target === null) return { ok: false, reason: 'ADMIN_NOT_FOUND' };

  const { count } = await db.adminSession.updateMany({
    where: { adminUserId: target.id, revokedAt: null },
    data: { revokedAt: now },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'AdminUser',
      entityId: target.id,
      action: 'admin.sessions_revoked',
      before: {},
      after: { email: target.email, revoked: count },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, revoked: count };
}
