import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readFileSync } from 'node:fs';
import { dealerMembership } from '@/lib/domain/dealer-membership';
import { openDealerSession } from '@/lib/domain/dealer-auth';
import { getAccountData } from '@/lib/domain/account';

/**
 * ═══ العضويّةُ جوابٌ واحد لسؤالٍ واحد ═══
 *
 * بابُ صفحة الحساب كان يفحص `dealerId` وحده، و`openDealerSession` تفحص
 * `dealerRole` — **فحسابُ معرضٍ قديم يرى زرَّ «لوحة المعرض» ثمّ يُقال
 * له «لست عضوا في أي معرض»**. وهذه تفحص أنّ القارئين لا يتباعدان،
 * **وتُقاس بصنع الصفّ الذي كشفها** لا بحالٍ تنتظره البيانات.
 */

const PHONE = '+966598800001';
const made: string[] = [];

async function cleanup(): Promise<void> {
  await db.user.deleteMany({ where: { phone: { startsWith: '+9665988000' } } });
  if (made.length > 0) await db.dealer.deleteMany({ where: { id: { in: made } } });
}

afterAll(cleanup);

describe('dealerMembership', () => {
  it('يرفض `dealerId` بلا دور — وهو الصفّ الذي كان يُنتج الزرَّ الكاذب', () => {
    const row = {
      dealerRole: null,
      dealer: { id: 'd1', nameAr: 'معرض', status: 'ACTIVE', verified: true },
    };
    expect(dealerMembership(row).state).toBe('NOT_A_MEMBER');
  });

  it('يفرّق «لم يُعتمد» عن «لست عضوا»', () => {
    expect(
      dealerMembership({
        dealerRole: 'OWNER',
        dealer: { id: 'd1', nameAr: 'معرض', status: 'PENDING', verified: false },
      }).state,
    ).toBe('DEALER_NOT_ACTIVE');
    expect(dealerMembership(null).state).toBe('NOT_A_MEMBER');
  });

  /**
   * **والقارئان يُسألان عن الصفّ نفسِه.** لا يكفي أن تتّفق الدالّة مع
   * نفسها: الشاشةُ والحارسُ يُستدعيان على مستخدمٍ حقيقيّ في الحالين.
   */
  it('الشاشةُ والحارسُ يتّفقان على الصفّ القديم ثمّ على المُصلَح', async () => {
    await cleanup();
    const dealer = await db.dealer.create({
      data: {
        nameAr: 'معرض اختبار العضوية',
        nameEn: 'Membership Test Dealer',
        slug: `membership-test-${PHONE.slice(-6)}`,
        city: 'الرياض',
        status: 'ACTIVE',
      },
    });
    made.push(dealer.id);

    const user = await db.user.create({
      data: { phone: PHONE, name: 'مدير اختبار', role: 'DEALER', dealerId: dealer.id },
    });

    // ── الصفُّ القديم: معرضٌ بلا دور ──
    const before = await getAccountData(user, 'ar');
    const guardBefore = await openDealerSession(user.id);
    expect(before.dealerPanel).toBeNull();
    expect(guardBefore.ok).toBe(false);
    if (!guardBefore.ok) expect(guardBefore.reason).toBe('NOT_A_MEMBER');

    // ── وبعد الترحيل ──
    const fixed = await db.user.update({
      where: { id: user.id },
      data: { dealerRole: 'OWNER' },
    });
    const after = await getAccountData(fixed, 'ar');
    const guardAfter = await openDealerSession(fixed.id);
    expect(after.dealerPanel).toEqual({ name: dealer.nameAr });
    expect(guardAfter.ok).toBe(true);

    await db.dealerSession.deleteMany({ where: { userId: user.id } });
  });
});

/**
 * **والترحيلُ يُفحص نصًّا لا بالثقة.** هو الذي يُصلح البيئاتَ القائمة،
 * ولا يُشغَّل في الاختبار — فيُقرأ أنّه ضيّقٌ كما وُصف: صفٌّ واحد لكلّ
 * معرضٍ لا عضوَ له، ولا منحَ دورٍ لصفٍّ ثانٍ.
 */
describe('migration 20261126090000_dealer_role_backfill', () => {
  const sql = readFileSync('prisma/migrations/20261126090000_dealer_role_backfill/migration.sql', 'utf8');

  it('يمنح OWNER فقط لمعرضٍ لا عضوَ فيه، ولصفٍّ واحد', () => {
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('"dealerRole" IS NOT NULL');
    expect(sql).toContain('LIMIT 1');
    expect(sql).toContain(`'OWNER'::"DealerRole"`);
    // ولا يمنح دورًا ثانيًا بأيّ حال
    expect(sql).not.toContain('MANAGER');
    expect(sql).not.toContain('SALES');
  });
});
