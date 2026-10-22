import type { AdminRole } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { ADMIN_SESSION_HOURS } from './admin-auth';
import { ADMIN_ROLES } from './permissions';

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
  /** الأدوار **المشغولة** — وعدد المعرَّفة في `ADMIN_ROLES` */
  roles: number;
  /** الشاغرة بأسمائها — ومصفوفةٌ تحكم دورًا فارغًا جردٌ على الورق */
  emptyRoles: readonly AdminRole[];
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
    /**
     * **الأدوار المشغولة لا المعرَّفة.** وكانت تُعرض «أدوار (٣)»
     * فتُقرأ «في النظام ثلاثة أدوار» — والمعرَّف ستّة، وثلاثةٌ منها
     * لا يملكها أحد. ومصفوفةٌ تحكم أدوارًا فارغة جردٌ على الورق.
     */
    roles: roles.length,
    /** الأدوار الشاغرة بأسمائها — فيُعرف أيُّ عمودٍ نظريّ. */
    emptyRoles: ADMIN_ROLES.filter((role) => !roles.some((row) => row.role === role)),
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

export type MemberDetail = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: string;
  lastSeenAt: string | null;
  locked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  mustChangePassword: boolean;
  passwordChangedAt: string;
  /** جلساتُه — الحيّةُ أوّلًا، ولكلٍّ أينَ ومتى. */
  sessions: {
    id: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    live: boolean;
  }[];
  activeSessions: number;
  /**
   * ═══ ما فعله هذا العضو ═══
   *
   * **ولم يكن يُسأل في موضع**: شاشةُ التدقيق تصفّي بالصنف (مال ·
   * هوية · صلاحيات) ولا تصفّي بالفاعل، فسؤالُ «ماذا فعل فلان؟» —
   * وهو أوّلُ ما يُسأل في أيّ تحقيق — لا جواب له في اللوحة.
   */
  actions: {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    ip: string | null;
    createdAt: string;
  }[];
  actionCount: number;
};

/** سقفُ ما يُعرض من إجراءاتٍ وجلسات — والعدّادُ يقول العددَ كلَّه. */
export const MEMBER_ROWS = 40;

export async function memberDetail(
  id: string,
  now: Date = new Date(),
): Promise<MemberDetail | null> {
  const member = await db.adminUser.findUnique({ where: { id } });
  if (member === null) return null;

  const [sessions, actions, actionCount] = await Promise.all([
    db.adminSession.findMany({
      where: { adminUserId: id },
      orderBy: { createdAt: 'desc' },
      take: MEMBER_ROWS,
      select: {
        id: true, ip: true, userAgent: true,
        createdAt: true, expiresAt: true, revokedAt: true,
      },
    }),
    db.auditLog.findMany({
      where: { actorId: id, actorType: 'admin' },
      orderBy: { createdAt: 'desc' },
      take: MEMBER_ROWS,
      select: { id: true, action: true, entity: true, entityId: true, ip: true, createdAt: true },
    }),
    db.auditLog.count({ where: { actorId: id, actorType: 'admin' } }),
  ]);

  /** **والجلسةُ حيّةٌ بالوقت والإبطال معًا** — لا بالعمود وحده. */
  const live = (session: { expiresAt: Date; revokedAt: Date | null }): boolean =>
    session.revokedAt === null && session.expiresAt.getTime() > now.getTime();

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    locked: member.lockedUntil !== null && member.lockedUntil.getTime() > now.getTime(),
    lockedUntil: member.lockedUntil?.toISOString() ?? null,
    failedAttempts: member.failedAttempts,
    mustChangePassword: member.mustChangePassword,
    passwordChangedAt: member.passwordChangedAt.toISOString(),
    sessions: sessions.map((session) => ({
      id: session.id,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      live: live(session),
    })),
    activeSessions: sessions.filter(live).length,
    actions: actions.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      ip: row.ip,
      createdAt: row.createdAt.toISOString(),
    })),
    actionCount,
  };
}
