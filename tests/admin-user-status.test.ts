import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { setUserStatus } from '@/lib/domain/admin-user-status';

/**
 * ═══ إيقافُ حساب — والقفلُ كان بلا مفتاح ═══
 *
 * الحارس مبنيٌّ منذ اليوم الأول: الدخول يرفض `SUSPENDED` و`BANNED`،
 * والصلاحية `users.suspend` معرَّفةٌ وممنوحة، واللوحة تعرض شريحتَي
 * «موقوفون» و«محظورون» بعدّاديهما — **ولا سطر في المنتج كلّه يكتب
 * `User.status`**. فالعدّادان صفرٌ أبدًا وبائعٌ محتالٌ لا يُوقفه أحد.
 */

const made: { users: string[]; admins: string[] } = { users: [], admins: [] };

async function scaffold(): Promise<{ userId: string; adminId: string }> {
  const stamp = `${String(Date.now()).slice(-9)}${String(made.users.length)}`;
  const user = await db.user.create({ data: { phone: `+9665309${stamp}` } });
  const admin = await db.adminUser.create({
    data: {
      email: `sus${stamp}@carsell.one`,
      name: 'مشغّل اختبار',
      role: 'OPS',
      passwordHash: 'x',
    },
  });
  made.users.push(user.id);
  made.admins.push(admin.id);
  return { userId: user.id, adminId: admin.id };
}

afterEach(async () => {
  /** الاختبار يعيد ما صنعه — والأثر الجديد يُتبَع في الاستعادة. */
  if (made.users.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: made.users } } });
    await db.auditLog.deleteMany({ where: { entity: 'User', entityId: { in: made.users } } });
    await db.user.deleteMany({ where: { id: { in: made.users } } });
  }
  if (made.admins.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: made.admins } } });
    await db.adminUser.deleteMany({ where: { id: { in: made.admins } } });
  }
  made.users = [];
  made.admins = [];
});

describe('حالُ الحساب يُكتب', () => {
  it('يُوقَف ويُسجَّل في التدقيق ويُخطَر صاحبُه', async () => {
    const { userId, adminId } = await scaffold();

    const result = await setUserStatus({
      userId,
      status: 'SUSPENDED',
      reason: 'بلاغان مؤكَّدان على إعلاناته — إيقافٌ حتى يردّ',
      adminId,
      ip: null,
    });
    expect(result).toEqual({ ok: true, status: 'SUSPENDED' });

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.status).toBe('SUSPENDED');

    /** **كلُّ إجراء أدمن يكتب `AuditLog`** — قاعدةٌ في المستودع. */
    const log = await db.auditLog.findFirstOrThrow({
      where: { entity: 'User', entityId: userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.action).toBe('user.suspended');
    expect((log.before as { status?: string }).status).toBe('ACTIVE');
    expect((log.after as { reason?: string }).reason).toContain('بلاغان');

    /** ومن أُوقف يُخبَر — والحارس يردّه برسالةٍ عامّة لا تقول شيئًا. */
    const bell = await db.notification.findFirst({
      where: { userId, templateKey: 'account.blocked' },
    });
    expect(bell).not.toBeNull();
  });

  /** سببٌ بكلمةٍ واحدة يُقرأ بعد شهور ولا يقول شيئًا. */
  it('ولا يُوقَف بلا سببٍ يُقرأ', async () => {
    const { userId, adminId } = await scaffold();
    expect(
      await setUserStatus({ userId, status: 'SUSPENDED', reason: 'احتيال', adminId, ip: null }),
    ).toEqual({ ok: false, reason: 'REASON_REQUIRED' });

    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
  });

  it('ويُرفع الإيقاف فيعود الحساب', async () => {
    const { userId, adminId } = await scaffold();
    await setUserStatus({
      userId,
      status: 'SUSPENDED',
      reason: 'إيقافٌ مؤقّت للتحقّق من بلاغ',
      adminId,
      ip: null,
    });

    expect(
      await setUserStatus({
        userId,
        status: 'ACTIVE',
        reason: 'انتهى التحقّق ولم يثبت شيء — يُرفع الإيقاف',
        adminId,
        ip: null,
      }),
    ).toEqual({ ok: true, status: 'ACTIVE' });

    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE');
    expect(
      await db.notification.findFirst({ where: { userId, templateKey: 'account.restored' } }),
    ).not.toBeNull();
  });

  /**
   * **ولا يُحظَر من عليه مالٌ جارٍ.** الحظر يقطع الجلسة، فمن له طلبٌ
   * حيّ يُترك بلا بابٍ يُكمل منه ولا يُلغي — ومالُه عند البوّابة.
   */
  it('والحظرُ يُمنع على من له طلبٌ حيّ — والإيقاف يُجاز', async () => {
    const { userId, adminId } = await scaffold();

    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
      select: { id: true, sellerId: true },
    });
    const order = await db.order.create({
      data: {
        ref: `ORD-SUS-${String(Date.now()).slice(-4)}`,
        listingId: listing.id,
        buyerId: userId,
        sellerId: listing.sellerId,
        stage: 'PAYMENT',
        status: 'ACTIVE',
        source: 'DIRECT',
        agreedPrice: 50_000,
        commissionPct: 0,
        commissionAmount: 0,
        transferFee: 350,
        vatAmount: 0,
        totalAmount: 50_350,
      },
      select: { id: true },
    });

    const blocked = await setUserStatus({
      userId,
      status: 'BANNED',
      reason: 'احتيالٌ مؤكَّد على ثلاث صفقات — حظرٌ دائم',
      adminId,
      ip: null,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('LIVE_OBLIGATIONS');

    /** **والإيقاف المؤقّت يُجاز** — وهو ما يُستعمل أثناء التحقيق. */
    expect(
      await setUserStatus({
        userId,
        status: 'SUSPENDED',
        reason: 'إيقافٌ أثناء التحقيق في الصفقات الثلاث',
        adminId,
        ip: null,
      }),
    ).toEqual({ ok: true, status: 'SUSPENDED' });

    await db.order.delete({ where: { id: order.id } });
  });
});
