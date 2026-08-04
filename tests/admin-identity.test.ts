import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decideIdentity, identityQueue, identityStats } from '@/lib/domain/admin-identity';
import { submitIdentity } from '@/lib/domain/identity-state';
import { MIN_IDENTITY_NOTE } from '@/lib/domain/identity-rules';

/**
 * ═══ A18 — توثيق الهوية ═══
 *
 * **لم يكن أحدٌ يوثَّق إطلاقًا**: `idVerified` منطقيّ بلا كاتب، ولا
 * شاشة تعرض من قدّم هويته — وحارس الشراء يقرؤه. فكل حساب ممنوع من كل
 * معاملة، والباب الذي يُستوفى منه غير موجود.
 */

const stamp = String(Date.now()).slice(-9);
const T0 = new Date('2026-08-03T09:00:00Z');
const ADMIN = { adminId: `adm${stamp}`, ip: null };

let userId: string;

beforeEach(async () => {
  const user = await db.user.create({ data: { phone: `+96659${stamp}` } });
  userId = user.id;
});

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { entityId: userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('identity — الحقلان يُكتبان معًا', () => {
  /**
   * `identityStatus` هي الحقيقة و`idVerified` مشتقٌّ منها، ويقرؤه
   * `seller.ts` و`public-api.ts` وحارس الشراء. **وحقلان لحقيقةٍ واحدة
   * يتباعدان أوّل كتابةٍ تنسى أحدهما** — فيصير المستخدم موثَّقًا في
   * شاشةٍ ومنتظرًا في أخرى.
   */
  it('التقديم اليدويّ ينتظر ولا يوثِّق', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

    expect(user.identityStatus).toBe('PENDING');
    expect(user.idVerified).toBe(false);
  });

  it('والنفاذ الوطنيّ يمرّ آليًّا — لا يدخل الطابور', async () => {
    await submitIdentity(db, userId, 'nafath', T0);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

    expect(user.identityStatus).toBe('VERIFIED');
    expect(user.idVerified).toBe(true);
    expect(user.idVerifiedAt).not.toBeNull();

    const queue = await identityQueue(null, T0);
    expect(queue.map((row) => row.userId)).not.toContain(userId);
  });
});

describe('decideIdentity — القرارات الثلاثة', () => {
  it('التوثيق يرفع الرايتين معًا', async () => {
    await submitIdentity(db, userId, 'manual', T0);

    const result = await decideIdentity({ userId, decision: 'VERIFY', note: null, ...ADMIN }, T0);
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.identityStatus).toBe('VERIFIED');
    expect(user.idVerified).toBe(true);
    // والملاحظة تُمحى — سببُ تعليقٍ سابق لا يبقى على حسابٍ وُثّق
    expect(user.identityNote).toBeNull();
  });

  /**
   * رفضٌ بلا سبب يجعل صاحبه يرفع الصورة نفسها فيُرفض ثانيةً — الدورة
   * نفسها التي عولجت في إرجاع الإعلان.
   */
  it('الرفض وطلب التوضيح يشترطان سببًا مكتوبًا', async () => {
    await submitIdentity(db, userId, 'manual', T0);

    const short = await decideIdentity({ userId, decision: 'REJECT', note: 'لا', ...ADMIN }, T0);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('NOTE_REQUIRED');
    // ولم يتحرّك شيء: الرفض قبل كل كتابة
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).identityStatus).toBe(
      'PENDING',
    );

    const note = 'ص'.repeat(MIN_IDENTITY_NOTE + 4);
    const done = await decideIdentity({ userId, decision: 'CLARIFY', note, ...ADMIN }, T0);
    expect(done.ok && done.status).toBe('CLARIFICATION');
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).identityNote).toBe(note);
  });

  it('والمُعلَّق يبقى في الطابور — لأنه ينتظر ردًّا', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    await decideIdentity(
      { userId, decision: 'CLARIFY', note: 'ص'.repeat(MIN_IDENTITY_NOTE + 4), ...ADMIN },
      T0,
    );

    const queue = await identityQueue(null, T0);
    expect(queue.map((row) => row.userId)).toContain(userId);
  });

  it('والمرفوض يخرج ولا يبقى موثَّقًا', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    await decideIdentity(
      { userId, decision: 'REJECT', note: 'ص'.repeat(MIN_IDENTITY_NOTE + 4), ...ADMIN },
      T0,
    );

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.identityStatus).toBe('REJECTED');
    expect(user.idVerified).toBe(false);
    expect((await identityQueue(null, T0)).map((row) => row.userId)).not.toContain(userId);
  });

  it('ومن خرج لا يُقرَّر فيه ثانيةً', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    await decideIdentity({ userId, decision: 'VERIFY', note: null, ...ADMIN }, T0);

    const again = await decideIdentity({ userId, decision: 'VERIFY', note: null, ...ADMIN }, T0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('NOT_IN_QUEUE');
  });

  /** **ولا يُسجَّل رقم الهوية في الأثر** — السجلّ يُقرأ لاحقًا. */
  it('الأثر يحمل القرار والملاحظة، لا الرقم', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    await decideIdentity({ userId, decision: 'VERIFY', note: null, ...ADMIN }, T0);

    const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: userId } });
    expect(entry.action).toBe('identity.verify');
    expect(JSON.stringify(entry.after)).not.toContain('nationalId');
  });
});

describe('identityStats', () => {
  it('يعدّ المنتظر ويقيس نصيب النفاذ', async () => {
    await submitIdentity(db, userId, 'manual', T0);
    const stats = await identityStats(T0);

    expect(stats.waiting).toBeGreaterThanOrEqual(1);
    expect(stats.nafathSharePct).toBeGreaterThanOrEqual(0);
    expect(stats.nafathSharePct).toBeLessThanOrEqual(100);
  });
});
