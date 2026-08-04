import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { changeOwnPassword, ownAccount } from '@/lib/domain/admin-account';
import { loginWithPassword, resolveAdminSession } from '@/lib/domain/admin-auth';
import { MIN_ADMIN_PASSWORD } from '@/lib/domain/admin-provision';

/**
 * ═══ حسابي — تغيير كلمة الأدمن ═══
 *
 * الدخول بالكلمة وحدها منذ أُلغيت المصادقة الثنائية، **ولا باب كان
 * لتغييرها**: من ظنّ كلمتَه انكشفت لا يملك إلا أن يطلب من صاحب لوحة
 * النشر تغييرها — أطول طريقٍ لأعجل حاجة.
 */

const stamp = String(Date.now()).slice(-9);
const EMAIL = `pwtest${stamp}@carsell.one`;
const OLD = 'OldStrongPass2026!';
const NEW = 'NewStrongPass2026!';
const T0 = new Date('2026-08-04T10:00:00Z');

let adminId: string;

async function makeAdmin(): Promise<string> {
  if (adminId !== undefined) return adminId;
  const admin = await db.adminUser.create({
    data: {
      email: EMAIL,
      name: 'اختبار الكلمة',
      role: 'OPS',
      passwordHash: await hashPassword(OLD),
      mustChangePassword: false,
      passwordChangedAt: new Date(T0.getTime() - 86_400_000),
    },
  });
  adminId = admin.id;
  return adminId;
}

afterAll(async () => {
  if (adminId === undefined) return;
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.adminSession.deleteMany({ where: { adminUserId: adminId } });
  await db.adminUser.delete({ where: { id: adminId } });
});

describe('تغيير كلمة الأدمن', () => {
  /**
   * **الكلمة الحالية تُطلب.** الجلسة قد تكون مسروقة — وحاسوبٌ تُرك
   * مفتوحًا يكفي لتغيير الكلمة وإقصاء صاحبها عن حسابه.
   */
  it('يرفض بلا الكلمة الحالية الصحيحة', async () => {
    const id = await makeAdmin();
    const result = await changeOwnPassword(
      { adminId: id, currentPassword: 'not-the-one', newPassword: NEW, ip: null },
      T0,
    );
    expect(result).toEqual({ ok: false, reason: 'WRONG_PASSWORD' });
  });

  it('يرفض كلمةً أقصر من الحدّ', async () => {
    const id = await makeAdmin();
    const short = 'a'.repeat(MIN_ADMIN_PASSWORD - 1);
    const result = await changeOwnPassword(
      { adminId: id, currentPassword: OLD, newPassword: short, ip: null },
      T0,
    );
    expect(result).toEqual({ ok: false, reason: 'WEAK_PASSWORD' });
  });

  // كلمةٌ لم تتغيّر تُبطل الجلسات بلا سبب، وتُقرأ في السجلّ تغييرًا
  it('يرفض الكلمة نفسها', async () => {
    const id = await makeAdmin();
    const result = await changeOwnPassword(
      { adminId: id, currentPassword: OLD, newPassword: OLD, ip: null },
      T0,
    );
    expect(result).toEqual({ ok: false, reason: 'SAME_PASSWORD' });
  });

  /**
   * ═══ والتغيير يُنهي كل الجلسات — بما فيها الحالية ═══
   *
   * القاعدة قائمةٌ في `resolveAdminSession`: جلسةٌ أُنشئت قبل
   * `passwordChangedAt` لا تُحلّ. وإبقاءُ الحالية كان **قاعدةً ثانية**
   * تناقضها، والحارس يُسقطها عند أوّل طلبٍ على أي حال.
   */
  it('ينهي كل الجلسات ويقبل الجديدة وحدها', async () => {
    const id = await makeAdmin();

    const first = await loginWithPassword(EMAIL, OLD, null, null, T0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await loginWithPassword(EMAIL, OLD, null, null, T0);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const after = new Date(T0.getTime() + 60_000);
    const result = await changeOwnPassword(
      { adminId: id, currentPassword: OLD, newPassword: NEW, ip: null },
      after,
    );
    expect(result).toEqual({ ok: true, revokedSessions: 2, signedOut: true });

    // الجلستان ماتتا — والحالية منهما
    expect(await resolveAdminSession(first.token, after)).toBeNull();
    expect(await resolveAdminSession(second.token, after)).toBeNull();

    // والقديمة لا تدخل، والجديدة تدخل
    const stale = await loginWithPassword(EMAIL, OLD, null, null, after);
    expect(stale.ok).toBe(false);

    const fresh = await loginWithPassword(EMAIL, NEW, null, null, after);
    expect(fresh.ok).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: { actorId: id, action: 'admin.password_changed' },
    });
    expect(audit).not.toBeNull();
    // **ولا يُكتب شيءٌ من الكلمة** — ولا طولُها
    expect(JSON.stringify(audit?.after)).not.toContain(NEW);
    expect(JSON.stringify(audit?.after)).not.toContain(String(NEW.length));

    // نعيدها كي لا يعتمد ترتيبُ الاختبارات على ما غيّرناه
    await changeOwnPassword(
      { adminId: id, currentPassword: NEW, newPassword: OLD, ip: null },
      new Date(after.getTime() + 60_000),
    );
  });

  it('يقرأ الحساب بجلساته وحدّ كلمته', async () => {
    const id = await makeAdmin();
    const account = await ownAccount(id, T0);

    expect(account?.email).toBe(EMAIL);
    expect(account?.role).toBe('OPS');
    expect(account?.minPasswordLength).toBe(MIN_ADMIN_PASSWORD);
  });

  it('حسابٌ لا وجود له يُعيد فراغًا', async () => {
    expect(await ownAccount(`nope${stamp}`, T0)).toBeNull();
  });
});
