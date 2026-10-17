import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  changeProviderPassword,
  createProviderUser,
  resetProviderUserPassword,
  setProviderUserActive,
} from '@/lib/domain/provider-staff';
import { loginProvider, resolveProviderSession } from '@/lib/domain/provider-auth';
import type { AdminUser, ServiceProvider } from '@/generated/prisma/client';

/**
 * ═══ بابُ لوحة المزوّد — وكان مقفلًا ═══
 *
 * `providerUser.create` كان في البذرة وحدها: مزوّدٌ يُضاف من اللوحة
 * لا يدخل أبدًا. وهذه تمشي البابَ كلَّه — يُفتح الحساب، ويُدخَل به،
 * وتُغيَّر الكلمة، ويُوقَف فينقطع.
 */

let provider: ServiceProvider;
let admin: AdminUser;
const made: string[] = [];

beforeAll(async () => {
  provider = await db.serviceProvider.findFirstOrThrow({ orderBy: { id: 'asc' } });
  admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
});

afterEach(async () => {
  if (made.length > 0) {
    await db.providerSession.deleteMany({ where: { providerUserId: { in: made } } });
    await db.providerUser.deleteMany({ where: { id: { in: made } } });
    made.length = 0;
  }
  await db.auditLog.deleteMany({
    where: { entity: 'ServiceProvider', entityId: provider.id, action: { startsWith: 'provider.staff' } },
  });
});

async function open(): Promise<{ id: string; email: string; password: string }> {
  const email = `probe-${String(Date.now())}@provider.test`;
  const result = await createProviderUser({
    providerId: provider.id,
    name: 'مشغّل اختبار',
    email,
    adminId: admin.id,
    ip: null,
  });
  if (!result.ok) throw new Error(result.reason);
  made.push(result.id);
  return { id: result.id, email, password: result.tempPassword };
}

describe('الأدمن يفتح الباب', () => {
  it('يُنشئ حسابًا بكلمةٍ مؤقّتة تصلح للدخول', async () => {
    const account = await open();
    expect(account.password.length).toBeGreaterThan(10);

    const login = await loginProvider({ email: account.email, password: account.password, ip: null, userAgent: null });
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.mustChangePassword).toBe(true);
  });

  /** **ولا تُكتب الكلمة في السجلّ** — يُقرأ بعد سنةٍ بعيونٍ كثيرة. */
  it('ويُكتب سطرُ تدقيقٍ بلا كلمة', async () => {
    const account = await open();
    const log = await db.auditLog.findFirstOrThrow({
      where: { entity: 'ServiceProvider', entityId: provider.id, action: 'provider.staff_created' },
    });
    expect(JSON.stringify(log.after)).toContain(account.email);
    expect(JSON.stringify(log.after)).not.toContain(account.password);
  });

  it('وبريدٌ مكرَّر يُرفض', async () => {
    const account = await open();
    const again = await createProviderUser({
      providerId: provider.id,
      name: 'آخر',
      email: account.email,
      adminId: admin.id,
      ip: null,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('EMAIL_TAKEN');
  });

  /** **ولا بابَ خلفيًّا** — معرّفٌ مخمَّن لا يوقف حسابَ مزوّدٍ آخر. */
  it('ولا يوقف حسابًا لمزوّدٍ غيره', async () => {
    const account = await open();
    const stranger = await db.serviceProvider.findFirstOrThrow({
      where: { id: { not: provider.id } },
      select: { id: true },
    });
    const result = await setProviderUserActive({
      providerId: stranger.id,
      providerUserId: account.id,
      active: false,
      adminId: admin.id,
      ip: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_THIS_PROVIDER');
  });
});

describe('والمزوّد يغيّر كلمته', () => {
  it('فيسقط `mustChangePassword` وتعمل الجديدة وحدها', async () => {
    const account = await open();

    const changed = await changeProviderPassword({
      providerUserId: account.id,
      current: account.password,
      next: 'كلمةٌ جديدةٌ طويلة',
    });
    expect(changed.ok).toBe(true);

    const row = await db.providerUser.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.mustChangePassword).toBe(false);

    const old = await loginProvider({ email: account.email, password: account.password, ip: null, userAgent: null });
    expect(old.ok).toBe(false);

    const fresh = await loginProvider({ email: account.email, password: 'كلمةٌ جديدةٌ طويلة', ip: null, userAgent: null });
    expect(fresh.ok).toBe(true);
  });

  it('وكلمةٌ حاليةٌ خاطئة تُرفض', async () => {
    const account = await open();
    const result = await changeProviderPassword({
      providerUserId: account.id,
      current: 'ليست كلمته',
      next: 'كلمةٌ جديدةٌ طويلة',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('WRONG_CURRENT');
  });
});

describe('والإيقافُ يقطع الجلسة القائمة', () => {
  it('جلسةٌ صالحة تموت بإيقاف الحساب', async () => {
    const account = await open();
    const login = await loginProvider({ email: account.email, password: account.password, ip: null, userAgent: null });
    if (!login.ok) throw new Error('لم يدخل');

    expect(await resolveProviderSession(login.token)).not.toBeNull();

    await setProviderUserActive({
      providerId: provider.id,
      providerUserId: account.id,
      active: false,
      adminId: admin.id,
      ip: null,
    });

    expect(await resolveProviderSession(login.token)).toBeNull();
  });

  /** **وإعادةُ الضبط تُخرج من سرق الكلمة** — لا تكتفي بتبديلها. */
  it('وإعادةُ ضبط الكلمة تسحب الجلسات وتُعيد الإجبار', async () => {
    const account = await open();
    const login = await loginProvider({ email: account.email, password: account.password, ip: null, userAgent: null });
    if (!login.ok) throw new Error('لم يدخل');

    const reset = await resetProviderUserPassword({
      providerId: provider.id,
      providerUserId: account.id,
      adminId: admin.id,
      ip: null,
    });
    expect(reset.ok).toBe(true);

    expect(await resolveProviderSession(login.token)).toBeNull();
    const row = await db.providerUser.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.mustChangePassword).toBe(true);
  });
});
