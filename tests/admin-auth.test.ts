import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import {
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_FAILED,
  ADMIN_SESSION_HOURS,
  loginWithPassword,
  resolveAdminSession,
  revokeAllSessions,
} from '@/lib/domain/admin-auth';
import { can, canWrite, needsDualApproval } from '@/lib/domain/permissions';

const EMAIL = 'test-ops@carsell.one';
const PASSWORD = 'S3cret-Admin-Pass';
const T0 = new Date('2026-08-02T09:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

async function makeAdmin(): Promise<string> {
  const admin = await db.adminUser.create({
    data: {
      email: EMAIL,
      name: 'اختبار',
      role: 'OPS',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword: false,
    },
  });
  return admin.id;
}

async function cleanup(): Promise<void> {
  const admin = await db.adminUser.findUnique({ where: { email: EMAIL } });
  if (admin !== null) {
    await db.adminSession.deleteMany({ where: { adminUserId: admin.id } });
    await db.auditLog.deleteMany({ where: { actorId: admin.id } });
    await db.adminUser.delete({ where: { id: admin.id } });
  }
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe('كلمة المرور', () => {
  /**
   * كانت خطوةً أولى لا تُصدر جلسة، وTOTP إلزاميّ بعدها. أُلغيت
   * الثانية بقرار المصمّم، فالكلمة الصحيحة تدخل مباشرةً.
   */
  it('الكلمة الصحيحة تُصدر الجلسة مباشرةً', async () => {
    const id = await makeAdmin();
    const result = await loginWithPassword(EMAIL, PASSWORD, '1.2.3.4', null, T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await db.adminSession.findFirstOrThrow({ where: { adminUserId: id } });
    // الرمز مجزّأ — تسريب القاعدة لا يمنح جلسات
    expect(session.tokenHash).not.toBe(result.token);
    expect(session.tokenHash).toHaveLength(64);

    const hours = (session.expiresAt.getTime() - T0.getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(ADMIN_SESSION_HOURS);
  });

  it('بريد مجهول وكلمة خاطئة يعطيان نفس السبب — لا تعداد للحسابات', async () => {
    await makeAdmin();
    const unknown = await loginWithPassword('nobody@carsell.one', PASSWORD, null, null, T0);
    const wrong = await loginWithPassword(EMAIL, 'wrong-password', null, null, T0);
    expect(unknown.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (!unknown.ok && !wrong.ok) {
      expect(unknown.reason).toBe(wrong.reason);
      expect(unknown.reason).toBe('INVALID_CREDENTIALS');
    }
  });

  it('٥ محاولات فاشلة تقفل ١٥ دقيقة، والصحيحة ترتدّ أثناء القفل', async () => {
    await makeAdmin();
    for (let i = 1; i < ADMIN_MAX_FAILED; i += 1) {
      const r = await loginWithPassword(EMAIL, 'nope', null, null, T0);
      expect(r.ok, `المحاولة ${i}`).toBe(false);
      if (!r.ok) expect(r.reason).toBe('INVALID_CREDENTIALS');
    }
    const fifth = await loginWithPassword(EMAIL, 'nope', null, null, T0);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.reason).toBe('LOCKED');

    const during = await loginWithPassword(EMAIL, PASSWORD, null, null, at(1));
    expect(during.ok).toBe(false);
    if (!during.ok) expect(during.reason).toBe('LOCKED');

    const after = await loginWithPassword(EMAIL, PASSWORD, null, null, at(ADMIN_LOCK_MINUTES + 1));
    expect(after.ok, 'ينفتح بعد المهلة').toBe(true);
  });

  it('نجاح واحد يصفّر العدّاد', async () => {
    const id = await makeAdmin();
    await loginWithPassword(EMAIL, 'nope', null, null, T0);
    await loginWithPassword(EMAIL, 'nope', null, null, T0);
    await loginWithPassword(EMAIL, PASSWORD, null, null, T0);
    const admin = await db.adminUser.findUniqueOrThrow({ where: { id } });
    expect(admin.failedAttempts).toBe(0);
  });

  it('الحساب غير المفعّل لا يدخل ولو بكلمة صحيحة', async () => {
    const id = await makeAdmin();
    await db.adminUser.update({ where: { id }, data: { status: 'suspended' } });
    const result = await loginWithPassword(EMAIL, PASSWORD, null, null, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INACTIVE');
  });

  it('كل دخول ناجح أو فاشل يكتب AuditLog بالـIP', async () => {
    const id = await makeAdmin();
    await loginWithPassword(EMAIL, 'nope', '9.9.9.9', null, T0);
    await loginWithPassword(EMAIL, PASSWORD, '9.9.9.9', 'vitest', T0);

    const logs = await db.auditLog.findMany({ where: { actorId: id } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('admin.login.failed');
    expect(actions).toContain('admin.login.success');
    expect(logs.every((l) => l.ip === '9.9.9.9')).toBe(true);
  });
});

describe('الجلسة', () => {
  it('الجلسة تسقط بانتهائها وبإبطالها وبتغيير كلمة المرور', async () => {
    const id = await makeAdmin();
    const issued = await loginWithPassword(EMAIL, PASSWORD, null, null, T0);
    if (!issued.ok) throw new Error('لم تُصدر جلسة');
    const { token } = issued;

    expect(await resolveAdminSession(token, at(1))).not.toBeNull();
    expect(await resolveAdminSession(token, at(ADMIN_SESSION_HOURS * 60 + 1))).toBeNull();

    // `createdAt` من ساعة قاعدة البيانات لا من الزمن المحقون،
    // فتُقرأ فعليًا بدل افتراضها — وإلا صار الاختبار مقترنًا بالساعة
    const session = await db.adminSession.findFirstOrThrow({
      where: { adminUserId: id },
    });
    const created = session.createdAt.getTime();

    await db.adminUser.update({
      where: { id },
      data: { passwordChangedAt: new Date(created + 1000) },
    });
    expect(
      await resolveAdminSession(token, at(31)),
      'تغيير الكلمة يُبطل الجلسة',
    ).toBeNull();

    await db.adminUser.update({
      where: { id },
      data: { passwordChangedAt: new Date(created - 1000) },
    });
    expect(await resolveAdminSession(token, at(31))).not.toBeNull();

    await revokeAllSessions(id, at(32));
    expect(await resolveAdminSession(token, at(33))).toBeNull();
  });

  it('رمز مجهول لا يفتح شيئًا', async () => {
    expect(await resolveAdminSession('not-a-real-token', T0)).toBeNull();
    expect(await resolveAdminSession('', T0)).toBeNull();
  });
});

describe('مصفوفة الصلاحيات', () => {
  it('OPS لا يرى المالية — معيار قبول المهمة ٦', () => {
    expect(can('OPS', 'finance.view')).toBe(false);
    expect(can('FINANCE', 'finance.view')).toBe(true);
    expect(can('SUPER_ADMIN', 'finance.view')).toBe(true);
  });

  it('READONLY لا يرى المالية ولا الهوية إطلاقًا', () => {
    expect(can('READONLY', 'finance.view')).toBe(false);
    expect(can('READONLY', 'users.viewIdentity')).toBe(false);
  });

  it('READONLY يقرأ ولا يكتب', () => {
    expect(can('READONLY', 'orders.view')).toBe(true);
    expect(canWrite('READONLY', 'orders.view')).toBe(false);
  });

  it('تغيير مرحلة الطلب لـOPS وSUPER_ADMIN وحدهما', () => {
    expect(canWrite('OPS', 'orders.changeStage')).toBe(true);
    expect(canWrite('SUPER_ADMIN', 'orders.changeStage')).toBe(true);
    for (const role of ['FINANCE', 'SUPPORT', 'CONTENT', 'READONLY'] as const) {
      expect(can(role, 'orders.changeStage'), role).toBe(false);
    }
  });

  it('رفع شعار الماركة لـSUPER_ADMIN وCONTENT وحدهما', () => {
    expect(can('SUPER_ADMIN', 'catalog.uploadLogo')).toBe(true);
    expect(can('CONTENT', 'catalog.uploadLogo')).toBe(true);
    expect(can('OPS', 'catalog.uploadLogo')).toBe(false);
  });

  it('الفريق والصلاحيات لـSUPER_ADMIN وحده — أي وجهة غير مذكورة كذلك', () => {
    expect(can('SUPER_ADMIN', 'team.manage')).toBe(true);
    for (const role of ['OPS', 'FINANCE', 'SUPPORT', 'CONTENT', 'READONLY'] as const) {
      expect(can(role, 'team.manage'), role).toBe(false);
    }
  });

  it('الإفراج عن الضمان وتدوير المفاتيح يلزمهما عضوان', () => {
    expect(needsDualApproval('escrow.release')).toBe(true);
    expect(needsDualApproval('integrations.rotateKeys')).toBe(true);
    expect(needsDualApproval('orders.changeStage')).toBe(false);
  });
});
