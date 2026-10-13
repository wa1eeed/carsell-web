import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { decideIdentity } from '@/lib/domain/admin-identity';
import { getAccountData } from '@/lib/domain/account';

/**
 * ═══ المراجع يسأل ولا يُسمَع ═══
 *
 * شاشةُ A18 تطلب الملاحظة بنصّها — **«ما الذي ينقص أو يمنع؟ — يقرؤه
 * صاحبه»** — وتُحفظ في `identityNote`. ولا شاشةَ تعرضها ولا إشعارَ
 * ينقلها: فيُكتب «صورة الهوية غير واضحة، أعِد رفعها» ولا يصل من يستطيع
 * أن يفعل ذلك. حلقةٌ يسأل فيها طرفٌ ولا يسمع الآخر.
 *
 * **والتوثيق يفتح كل معاملة** — نشرٌ وعرضٌ ومزايدةٌ وشراء. فمن وُثّق لا
 * يعرف أن البابَ فُتح، ومن رُفض لا يعرف أنه أُغلق ولا لماذا.
 *
 * وكان السطر في الحساب منطقيًّا: موثّقةٌ أو «غير موثقة» — **فالمنتظرُ
 * والمرفوضُ ومن لم يقدّم يقرؤون الجملة نفسها**.
 */

afterAll(async () => {
  await db.$disconnect();
});

type Snapshot = {
  id: string;
  identityStatus: string;
  identityNote: string | null;
  identityReviewedBy: string | null;
  idVerified: boolean;
  idVerifiedAt: Date | null;
};

/** حسابٌ يُقدَّم للمراجعة ثمّ يُعاد إلى حاله مهما فعل الجسد أو رمى. */
async function withApplicant(body: (before: Snapshot) => Promise<void>): Promise<void> {
  const user = await db.user.findFirstOrThrow({
    where: { role: 'USER' },
    select: {
      id: true,
      identityStatus: true,
      identityNote: true,
      identityReviewedBy: true,
      idVerified: true,
      idVerifiedAt: true,
    },
  });

  await db.user.update({
    where: { id: user.id },
    data: { identityStatus: 'PENDING', identityNote: null, idVerified: false },
  });

  const since = new Date();
  try {
    await body(user);
  } finally {
    const { id, ...fields } = user;
    await db.user.update({ where: { id }, data: fields });
    await db.notification.deleteMany({
      where: { userId: id, createdAt: { gte: since } },
    });
    await db.auditLog.deleteMany({
      where: { entityId: id, entity: 'User', createdAt: { gte: since } },
    });
  }
}

async function bells(userId: string, since: Date): Promise<string[]> {
  const rows = await db.notification.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { templateKey: true },
  });
  return rows.map((row) => row.templateKey);
}

describe('قرار التوثيق يصل صاحبه', () => {
  it('التوثيق يُخبَر به — فالبابُ فُتح ولا شيء كان يقوله', async () => {
    await withApplicant(async (user) => {
      const since = new Date();
      const done = await decideIdentity({
        userId: user.id,
        decision: 'VERIFY',
        note: null,
        adminId: 'test-admin',
        ip: null,
      });

      expect(done).toEqual({ ok: true, status: 'VERIFIED' });
      expect(await bells(user.id, since)).toEqual(['account.id_verified']);
    });
  });

  it('وطلبُ التوضيح يصل ومعه نصُّه', async () => {
    await withApplicant(async (user) => {
      const since = new Date();
      const note = 'صورة الهوية غير واضحة — أعِد رفعها بإضاءة أفضل.';

      const done = await decideIdentity({
        userId: user.id,
        decision: 'CLARIFY',
        note,
        adminId: 'test-admin',
        ip: null,
      });
      expect(done).toEqual({ ok: true, status: 'CLARIFICATION' });

      /** **والسبب في الحمولة** — «تعذّر التوثيق» وحدها تُعيد الدورة. */
      const row = await db.notification.findFirstOrThrow({
        where: { userId: user.id, createdAt: { gte: since } },
        select: { templateKey: true, payload: true },
      });
      expect(row.templateKey).toBe('account.id_rejected');
      expect((row.payload as { reason?: string }).reason).toBe(note);
    });
  });
});

describe('والحساب يعرض الحال لا المنطق', () => {
  it('الملاحظة تصل الشاشة، والحالة تُفرَّق عن «لم يقدّم»', async () => {
    await withApplicant(async (user) => {
      const note = 'الاسم لا يطابق الهوية — صحّحه وأعد الإرسال.';
      await decideIdentity({
        userId: user.id,
        decision: 'CLARIFY',
        note,
        adminId: 'test-admin',
        ip: null,
      });

      const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      const data = await getAccountData(fresh, 'ar');

      expect(data.user.identityStatus).toBe('CLARIFICATION');
      /** **وهي ما كتبه المراجع حرفيًّا** — لا صياغةً نخترعها. */
      expect(data.user.identityNote).toBe(note);
      expect(data.user.idVerified).toBe(false);
    });
  });
});
