import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { MIN_ADMIN_PASSWORD, provisionSuperAdmin } from '@/lib/domain/admin-provision';
import { verifyPassword } from '@/lib/auth/password';

/**
 * ═══ حساب الأدمن من البيئة ═══
 *
 * كانت الكلمة تُقرأ عند الزرع وحده، فمن بدّل المتغيّر في لوحة النشر
 * ظنّ أنه بدّل كلمته — والقاعدة تحمل التجزئة القديمة. **وتغييرٌ
 * يُعتقد أنه وقع ولم يقع أسوأ من تغييرٍ يُرفض**: الثاني يُصلَح فورًا،
 * والأوّل يُكتشف يوم الحاجة.
 */

const T0 = new Date('2026-07-15T08:00:00Z');
const STRONG = 'Trial-Provision-2026';
const stamp = String(Date.now()).slice(-9);
const EMAIL = `prov${stamp}@carsell.one`;

async function cleanup(): Promise<void> {
  const rows = await db.adminUser.findMany({
    where: { email: { contains: `prov${stamp}` } },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.adminSession.deleteMany({ where: { adminUserId: { in: ids } } });
  await db.adminUser.deleteMany({ where: { id: { in: ids } } });
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe('admin.provision — الإنشاء', () => {
  it('يُنشئ سوبر أدمن يدخل بالكلمة وحدها', async () => {
    const result = await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe('created');

    const admin = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(admin.role).toBe('SUPER_ADMIN');
    // لا سرّ مصادقة يُولَّد — أُلغيت الثنائية بقرار المصمّم
    expect(admin.totpEnrolledAt).toBeNull();
    // من ضبطها في البيئة اختارها — فلا يُطالَب بتغييرها عند أوّل دخول
    expect(admin.mustChangePassword).toBe(false);
    expect(await verifyPassword(STRONG, admin.passwordHash)).toBe(true);
  });

  it('البريد يُطبَّع صغيرًا ومقلَّمًا', async () => {
    await provisionSuperAdmin(db, { email: `  ${EMAIL.toUpperCase()}  `, password: STRONG }, T0);
    expect(await db.adminUser.findUnique({ where: { email: EMAIL } })).not.toBeNull();
  });
});

describe('admin.provision — لا يكتب إن لم يتغيّر شيء', () => {
  /**
   * الخاصّية التي تجعله صالحًا للإقلاع: يُنفَّذ عند كل نشرة. فكتابةٌ
   * في كل مرّة تُنتج أثرًا يمتلئ بلا حدث، ويجعل «متى بُدّلت الكلمة؟»
   * سؤالًا بلا جواب.
   */
  it('التشغيل الثاني بالكلمة نفسها لا يكتب ولا يُسجّل', async () => {
    await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);
    const admin = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    const auditBefore = await db.auditLog.count({ where: { entityId: admin.id } });

    const again = await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);
    expect(again.ok && again.outcome).toBe('unchanged');

    const after = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(after.passwordHash).toBe(admin.passwordHash);
    expect(await db.auditLog.count({ where: { entityId: admin.id } })).toBe(auditBefore);
  });
});

describe('admin.provision — التبديل', () => {
  it('كلمةٌ جديدة تُطبَّق', async () => {
    await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);

    const changed = await provisionSuperAdmin(db, { email: EMAIL, password: `${STRONG}-2` }, T0);
    expect(changed.ok && changed.outcome).toBe('password_set');

    const after = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(await verifyPassword(`${STRONG}-2`, after.passwordHash)).toBe(true);
    expect(await verifyPassword(STRONG, after.passwordHash)).toBe(false);
  });

  it('القفل يُفكّ مع الكلمة الجديدة', async () => {
    await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);
    await db.adminUser.update({
      where: { email: EMAIL },
      data: { failedAttempts: 5, lockedUntil: new Date(T0.getTime() + 900_000) },
    });

    await provisionSuperAdmin(db, { email: EMAIL, password: `${STRONG}-2` }, T0);

    const after = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(after.failedAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });
});

describe('admin.provision — ما لا يفعله', () => {
  /**
   * رفعُ الصلاحية من متغيّر بيئة يجعل ترقية الدور **أثرًا جانبيًّا
   * لتغيير كلمة مرور** — وهو آخر مكانٍ تُراجَع فيه.
   */
  it('لا يرفع دور حسابٍ قائم', async () => {
    await db.adminUser.create({
      data: { email: EMAIL, name: 'ن', role: 'READONLY', passwordHash: 'x' },
    });

    const result = await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);
    expect(result.ok).toBe(true);

    const after = await db.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(after.role).toBe('READONLY');
    // والكلمة تُطبَّق رغم ذلك — الحساب يُدخَل، بصلاحياته هو
    expect(await verifyPassword(STRONG, after.passwordHash)).toBe(true);
  });

  it('لا يمسّ حسابًا آخر', async () => {
    const other = await db.adminUser.create({
      data: { email: `prov${stamp}-other@carsell.one`, name: 'آ', role: 'OPS', passwordHash: 'y' },
    });

    await provisionSuperAdmin(db, { email: EMAIL, password: STRONG }, T0);

    const after = await db.adminUser.findUniqueOrThrow({ where: { id: other.id } });
    expect(after.passwordHash).toBe('y');
    expect(after.role).toBe('OPS');
  });
});

describe('admin.provision — الحُرّاس', () => {
  it('كلمةٌ أقصر من الحدّ تُرفض ولا تُنشئ شيئًا', async () => {
    const short = 'a'.repeat(MIN_ADMIN_PASSWORD - 1);
    const result = await provisionSuperAdmin(db, { email: EMAIL, password: short }, T0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('WEAK_PASSWORD');
    expect(await db.adminUser.findUnique({ where: { email: EMAIL } })).toBeNull();
  });

  it('بريدٌ فاسد يُرفض', async () => {
    const result = await provisionSuperAdmin(db, { email: 'not-an-email', password: STRONG }, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INVALID_EMAIL');
  });
});
