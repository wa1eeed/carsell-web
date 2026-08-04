import { afterEach, afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { computeOrderAmounts } from '@/lib/domain/order-amounts';
import { netToSeller } from '@/lib/domain/money';
import { MAX_COMMISSION_PCT, listCommissionRules, setCommissionRule } from '@/lib/domain/admin-commission';

/**
 * ═══ العمولة طرفان ═══
 *
 * كانت قاعدةً واحدة **تُضاف إلى إجمالي المشتري وتُخصم من صافي البائع
 * معًا**: عمولةٌ معلنة ٢٬٥٠٠ تأخذ ٥٬٠٠٠. ولم يسقط اختبار، لأن لا
 * اختبار جمع الطرفين في حسابٍ واحد ليرى أن المجموع لا يساوي المعلن.
 *
 * **والقواعد كيانٌ مشترك بين ملفّات الاختبار** — تُضاف ولا تُعدَّل،
 * فما يزرعه هذا الملف يُحذف في `afterEach` وإلّا حسبت جيرانُه بنسبةٍ
 * لم تكن سارية.
 */

const T0 = new Date('2026-07-25T12:00:00Z');
const PRICE = 100_000;

/** الصفوف التي زرعها هذا الملف — تُحذف كلها بعد كل حالة. */
const planted: string[] = [];

async function rule(input: {
  side: 'BUYER' | 'SELLER';
  enabled: boolean;
  pct: number;
  fixedFee?: number;
  minFee?: number | null;
  maxFee?: number | null;
  at?: Date;
}): Promise<void> {
  const row = await db.commissionRule.create({
    data: {
      scope: 'global',
      side: input.side,
      enabled: input.enabled,
      pct: input.pct,
      fixedFee: input.fixedFee ?? 0,
      minFee: input.minFee ?? null,
      maxFee: input.maxFee ?? null,
      activeFrom: input.at ?? T0,
    },
  });
  planted.push(row.id);
}

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { entity: 'CommissionRule', actorId: 'probe-admin' } });
  if (planted.length > 0) {
    await db.commissionRule.deleteMany({ where: { id: { in: planted } } });
    planted.length = 0;
  }
});

afterAll(async () => {
  await db.$disconnect();
});

// لحظةٌ بعد الصفوف المزروعة، وقبل أي صفٍّ مستقبليّ
const AFTER = new Date(T0.getTime() + 60_000);

describe('commission — الطرفان مستقلّان', () => {
  it('عمولة البائع وحدها: المشتري لا يدفعها', async () => {
    await rule({ side: 'SELLER', enabled: true, pct: 2.5 });
    await rule({ side: 'BUYER', enabled: false, pct: 0 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    expect(a.sellerCommission.toFixed(2)).toBe('2500.00');
    expect(a.buyerCommission.toFixed(2)).toBe('0.00');
    // الإجمالي بلا عمولة — رسم النقل وحده فوق السعر
    expect(a.totalAmount.minus(a.agreedPrice).minus(a.transferFee).toFixed(2)).toBe('0.00');
  });

  it('عمولة المشتري وحدها: البائع يستلم السعر كاملًا', async () => {
    await rule({ side: 'SELLER', enabled: false, pct: 0 });
    await rule({ side: 'BUYER', enabled: true, pct: 3 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    expect(a.buyerCommission.toFixed(2)).toBe('3000.00');
    expect(a.sellerCommission.toFixed(2)).toBe('0.00');

    const net = netToSeller({
      agreedPrice: a.agreedPrice,
      settlementAmount: null,
      sellerCommission: a.sellerCommission,
    });
    expect(net.toFixed(2)).toBe('100000.00');
  });

  it('الطرفان معًا بنسبتين مختلفتين', async () => {
    await rule({ side: 'SELLER', enabled: true, pct: 2 });
    await rule({ side: 'BUYER', enabled: true, pct: 1 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    expect(a.sellerCommission.toFixed(2)).toBe('2000.00');
    expect(a.buyerCommission.toFixed(2)).toBe('1000.00');
    // المجموع إيرادنا — وعليه تُحسب الضريبة
    expect(a.commissionAmount.toFixed(2)).toBe('3000.00');
  });

  /**
   * **الحساب الذي كان يُؤخذ مرّتين.**
   *
   * بنسبةٍ واحدة على الطرفين: المشتري يدفع السعر + نصيبه، والبائع
   * يُخصم نصيبه — ومجموعُ ما يبقى عندنا **يساوي المجموع المعلن**، لا
   * ضعفه.
   */
  it('ما يبقى عندنا = مجموع العمولتين، لا ضعف إحداهما', async () => {
    await rule({ side: 'SELLER', enabled: true, pct: 2.5 });
    await rule({ side: 'BUYER', enabled: true, pct: 2.5 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    const net = netToSeller({
      agreedPrice: a.agreedPrice,
      settlementAmount: null,
      sellerCommission: a.sellerCommission,
    });

    // رسم النقل يعبر إلى الجهة الحكومية فيُستبعد من نصيبنا
    const kept = a.totalAmount.minus(net).minus(a.transferFee);
    expect(kept.toFixed(2)).toBe(a.commissionAmount.toFixed(2));
    expect(kept.toFixed(2)).toBe('5000.00');
  });

  it('النسبة والمبلغ الثابت يجتمعان، والحدّان يقيّدان', async () => {
    await rule({ side: 'SELLER', enabled: true, pct: 1, fixedFee: 500, maxFee: 900 });
    await rule({ side: 'BUYER', enabled: false, pct: 0 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    // ١٬٠٠٠ + ٥٠٠ = ١٬٥٠٠ ثم يقصّها السقف
    expect(a.sellerCommission.toFixed(2)).toBe('900.00');
  });
});

describe('commission — التعطيل', () => {
  /**
   * **العطل الذي كاد يمرّ**: الاستعلام كان يصفّي `enabled: true`، فصفٌّ
   * معطَّل حديثًا يجعله يقع على **قاعدةٍ أقدم مفعَّلة** — فتُعطَّل
   * العمولة فتعود من تلقاء نفسها بنسبةٍ قديمة، ولا شيء يقول إن
   * التعطيل لم يقع.
   */
  it('صفٌّ معطَّل حديثًا لا يكشف قاعدةً أقدم مفعَّلة', async () => {
    await rule({ side: 'SELLER', enabled: true, pct: 5, at: new Date(T0.getTime() - 86_400_000) });
    await rule({ side: 'SELLER', enabled: false, pct: 0, at: T0 });
    await rule({ side: 'BUYER', enabled: false, pct: 0, at: T0 });

    const a = await computeOrderAmounts(db, PRICE, AFTER);
    expect(a.sellerCommission.toFixed(2)).toBe('0.00');
  });
});

describe('commission — حُرّاس الحفظ', () => {
  const admin = { adminId: 'probe-admin', ip: null };

  it('مفعَّلة بصفرٍ في كل حقولها تُرفض', async () => {
    const result = await setCommissionRule(
      { side: 'SELLER', enabled: true, pct: 0, fixedFee: 0, minFee: null, maxFee: null, ...admin },
      T0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_CHARGE_ENABLED');
  });

  it('نسبةٌ فوق الحدّ تُرفض', async () => {
    const result = await setCommissionRule(
      {
        side: 'BUYER', enabled: true, pct: MAX_COMMISSION_PCT + 1,
        fixedFee: 0, minFee: null, maxFee: null, ...admin,
      },
      T0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('PCT_OUT_OF_RANGE');
  });

  it('حدٌّ أدنى فوق الأقصى يُرفض', async () => {
    const result = await setCommissionRule(
      { side: 'SELLER', enabled: true, pct: 1, fixedFee: 0, minFee: 900, maxFee: 100, ...admin },
      T0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('MIN_ABOVE_MAX');
  });

  it('الحفظ يُضيف صفًّا ولا يعدّل، ويكتب الأثر', async () => {
    const before = await db.commissionRule.count({ where: { scope: 'global', side: 'SELLER' } });

    const result = await setCommissionRule(
      { side: 'SELLER', enabled: true, pct: 4, fixedFee: 0, minFee: null, maxFee: null, ...admin },
      T0,
    );
    expect(result.ok).toBe(true);

    const created = await db.commissionRule.findFirst({
      where: { scope: 'global', side: 'SELLER' },
      orderBy: { activeFrom: 'desc' },
    });
    if (created !== null) planted.push(created.id);

    expect(await db.commissionRule.count({ where: { scope: 'global', side: 'SELLER' } })).toBe(
      before + 1,
    );
    expect(
      await db.auditLog.count({
        where: { entity: 'CommissionRule', entityId: 'SELLER', actorId: 'probe-admin' },
      }),
    ).toBe(1);
  });
});

describe('commission — القراءة للشاشة', () => {
  it('كل طرفٍ يُعرض ولو لم تُضبط له قاعدة', async () => {
    const rows = await listCommissionRules(AFTER);
    expect(rows.map((row) => row.side).sort()).toEqual(['BUYER', 'SELLER']);
    for (const row of rows) expect(typeof row.enabled).toBe('boolean');
  });
});
