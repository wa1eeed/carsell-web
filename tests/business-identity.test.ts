import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { submitBusinessIdentity } from '@/lib/domain/business-identity';
import { identityQueue } from '@/lib/domain/admin-identity';

/**
 * ═══ KYB — توثيقُ المنشأة ═══
 *
 * `identityMethod` يحمل `commercial_register` منذ المخطّط الأوّل **ولا
 * كاتب له**: لا شيء في المنتج كان يعرّف حسابًا بأنه منشأة، فتوثيقُ
 * وكالةٍ يمرّ بمسار الفرد ويُسأل صاحبُها عن رقم هويّته وحده — ولا
 * يُعرَف من الحساب أنه معرضٌ ولا باسم مَن تُصدَر فاتورته.
 *
 * عاشرُ مرّةٍ لنمط «قيمةٌ في المخطّط بلا كاتب».
 */

const stamp = String(Date.now()).slice(-9);
const T0 = new Date('2026-08-04T10:00:00Z');

const made: string[] = [];

async function freshUser(): Promise<string> {
  const user = await db.user.create({
    data: { phone: `+96650${String(Date.now()).slice(-7)}`, name: `طالب ${stamp}` },
    select: { id: true },
  });
  made.push(user.id);
  return user.id;
}

function draft(over: Partial<Parameters<typeof submitBusinessIdentity>[1]> = {}) {
  return {
    signatoryName: 'سعد بن محمد القحطاني',
    signatoryNationalId: '1012345678',
    businessName: `وكالة اختبار ${stamp}`,
    crNumber: '1010998877',
    crExpiresAt: '2027-12-31',
    ...over,
  };
}

afterAll(async () => {
  // الاختبار يعيد ما صنعه — وإلّا سقط جارُه في التشغيل التالي
  if (made.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: made } } });
    await db.user.deleteMany({ where: { id: { in: made } } });
  }
  await db.$disconnect();
});

describe('توثيق المنشأة', () => {
  it('يكتب نوع الحساب وحقول السجلّ والطريقة', async () => {
    const userId = await freshUser();
    const result = await submitBusinessIdentity(userId, draft({ vatNumber: '300998877600003' }), T0);
    expect(result.ok).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true, accountType: true, businessName: true, crNumber: true,
        crExpiresAt: true, vatNumber: true, identityMethod: true, nationalIdEncrypted: true,
      },
    });
    expect(row.accountType).toBe('BUSINESS');
    expect(row.businessName).toBe(`وكالة اختبار ${stamp}`);
    expect(row.crNumber).toBe('1010998877');
    expect(row.vatNumber).toBe('300998877600003');
    expect(row.identityMethod).toBe('commercial_register');
    // اسمُ المفوَّض هو اسمُ الحساب — فهو من يتصرّف عنها
    expect(row.name).toBe('سعد بن محمد القحطاني');
    // والرقم مشفَّر لا نصًّا
    expect(row.nationalIdEncrypted).not.toBe('1012345678');
  });

  /** **والحقل يقبل كل صيغة لصق ويطبّعها** — ومن يمنع اللصق يصنع الخطأ. */
  it('السجلّ والرقم الضريبيّ يُطبَّعان', async () => {
    const userId = await freshUser();
    const result = await submitBusinessIdentity(
      userId,
      draft({ crNumber: '1010-998 877', vatNumber: '3009 9887 7600 003' }),
      T0,
    );
    expect(result.ok).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { crNumber: true, vatNumber: true },
    });
    expect(row.crNumber).toBe('1010998877');
    expect(row.vatNumber).toBe('300998877600003');
  });

  it('ومنشأةٌ دون حدّ التسجيل تُقبل بلا رقم ضريبيّ', async () => {
    const userId = await freshUser();
    const result = await submitBusinessIdentity(userId, draft({ vatNumber: null }), T0);
    expect(result.ok).toBe(true);

    const row = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { accountType: true, vatNumber: true },
    });
    expect(row.accountType).toBe('BUSINESS');
    expect(row.vatNumber).toBeNull();
  });

  /**
   * **والسجلّ المنتهي يُردّ عند التقديم لا عند المراجعة** — محرّرٌ يفتح
   * طلبًا ليجد سجلًّا انتهى الشهر الماضي يردّه، وقد انتظر صاحبُه يومين.
   */
  it('يردّ كل الحقول الخاطئة دفعةً — والسجلّ المنتهي منها', async () => {
    const userId = await freshUser();
    const result = await submitBusinessIdentity(
      userId,
      {
        signatoryName: 'ا',
        signatoryNationalId: '999',
        businessName: '',
        crNumber: '12',
        crExpiresAt: '2020-01-01',
        vatNumber: '123',
      },
      T0,
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'VALIDATION') throw new Error('توقّعتُ رفضًا');
    expect(result.fields).toEqual({
      signatoryName: 'REQUIRED',
      signatoryNationalId: 'INVALID',
      businessName: 'REQUIRED',
      crNumber: 'LENGTH',
      crExpiresAt: 'EXPIRED',
      vatNumber: 'LENGTH',
    });
  });

  it('ومن وُثّق لا يُعاد توثيقه', async () => {
    const userId = await freshUser();
    expect((await submitBusinessIdentity(userId, draft(), T0)).ok).toBe(true);

    const again = await submitBusinessIdentity(userId, draft(), T0);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe('ALREADY_VERIFIED');
  });

  /** ومراجعةُ المنشأة غيرُ مراجعة الفرد — فالصفّ يقولها قبل أن تُفتح. */
  it('والطابور يحمل بيانات المنشأة', async () => {
    const userId = await freshUser();
    const result = await submitBusinessIdentity(userId, draft(), T0);
    expect(result.ok).toBe(true);

    const rows = await identityQueue('VERIFIED');
    const row = rows.find((entry) => entry.userId === userId);
    expect(row?.business).not.toBeNull();
    expect(row?.business?.crNumber).toBe('1010998877');
    expect(row?.method).toBe('commercial_register');
  });

  it('وحسابُ الفرد يبقى بلا كتلة منشأة', async () => {
    const rows = await identityQueue();
    for (const row of rows) {
      if (row.method === 'commercial_register') continue;
      expect(row.business, row.userId).toBeNull();
    }
  });
});
