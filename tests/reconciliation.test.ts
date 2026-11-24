import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { latestRuns, listRuns, reconcileGateway, runMismatches } from '@/lib/domain/reconciliation';

afterAll(async () => {
  await db.$disconnect();
});

const DAY = new Date('2026-07-15T00:00:00.000Z');

async function clean(gatewayKey: string) {
  await db.reconciliationRun.deleteMany({ where: { gatewayKey } });
}

describe('المطابقة اليومية — دفترُنا مرآة', () => {
  /**
   * **بوابةٌ لم تُقرأ لم تُطابَق.** واختزال الغياب في تطابقٍ يجعل صمت
   * المزوّد يبدو سلامةً — وهو أسوأ ما يقوله تقرير مطابقة.
   */
  it('تعذّر القراءة يُسجَّل UNAVAILABLE لا MATCHED', async () => {
    await clean('moyasar');
    try {
      const result = await reconcileGateway('moyasar', DAY);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.gatewayTotal).toBeNull();
      // والسبب مكتوب لا مُبتلَع
      expect(result.note).not.toBeNull();
    } finally {
      await clean('moyasar');
    }
  });

  it('إعادة التشغيل تُحدّث ولا تُكرّر — صفٌّ لكل بوابةٍ ويوم', async () => {
    await clean('moyasar');
    try {
      await reconcileGateway('moyasar', DAY);
      await reconcileGateway('moyasar', DAY);
      expect(await db.reconciliationRun.count({ where: { gatewayKey: 'moyasar' } })).toBe(1);
    } finally {
      await clean('moyasar');
    }
  });

  /**
   * **الفرق حدثٌ يُعالَج لا رقمٌ يُتأمَّل.** فالصفّ يحمل قائمة المعاملات
   * المختلفة، ومجموعٌ وحده يجعل المشغّل يعرف أن ثمّة خطأً ولا يعرف أين.
   */
  it('الصفّ يحمل قائمة المعاملات لا المجموع وحده', async () => {
    await clean('probe-gw');
    try {
      await db.reconciliationRun.create({
        data: {
          gatewayKey: 'probe-gw',
          date: DAY,
          ourTotal: 1000,
          gatewayTotal: 580,
          diff: 420,
          status: 'DIFFERS',
          mismatches: [
            { ref: 'pay_1', ours: '420', theirs: null, kind: 'MISSING_THERE' },
          ],
        },
      });

      const rows = await listRuns();
      const row = rows.find((r) => r.gatewayKey === 'probe-gw');
      expect(row?.status).toBe('DIFFERS');
      expect(row?.mismatchCount).toBe(1);

      const details = await runMismatches('probe-gw', '2026-07-15');
      expect(details[0]?.ref).toBe('pay_1');
      expect(details[0]?.kind).toBe('MISSING_THERE');
    } finally {
      await clean('probe-gw');
    }
  });

  it('القراءة لا تكتب مالًا — لا دفعة تتغيّر ولا ضمان', async () => {
    await clean('moyasar');
    const before = await db.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } });
    const escrowBefore = await db.escrow.count();
    try {
      await reconcileGateway('moyasar', DAY);
      const after = await db.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } });
      expect(after._count._all).toBe(before._count._all);
      expect(String(after._sum.amount)).toBe(String(before._sum.amount));
      expect(await db.escrow.count()).toBe(escrowBefore);
    } finally {
      await clean('moyasar');
    }
  });
});

describe('المطابقة اليومية — الوظيفةُ التي لم تكن', () => {
  /**
   * ═══ مرآةٌ لا تُقارَن بأصلٍ قطّ ═══
   *
   * `reconcileGateway` مبنيّةٌ ومختبَرة، و`ReconciliationTable` تعرض
   * نتائجها في شاشة المدفوعات — **ولا شيء يُشغّلها**. فالجدول فارغٌ
   * أبدًا، وكلُّ ما نعرفه أن دفترنا متّسقٌ مع نفسه.
   *
   * وتعليقُ سجلّ الوظائف كان يذكرها قبل أن تُسجَّل فيه.
   */
  it('مُسجَّلة في سجلّ الوظائف الزمنية', async () => {
    const { JOB_NAMES } = await import('@/lib/jobs/run');
    expect(JOB_NAMES).toContain('reconcileYesterday');
  });

  it('وتُطابق أمسِ لا اليوم', async () => {
    /**
     * **اليومُ لم ينتهِ**، ومطابقتُه تُقارن نصف دفترٍ بنصف كشف فتُخرج
     * فروقًا كاذبة كل ساعة.
     */
    const { reconcileYesterday } = await import('@/lib/domain/reconciliation');
    const now = new Date();
    await reconcileYesterday(now);

    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const onToday = await db.reconciliationRun.count({ where: { date: today } });
    expect(onToday).toBe(0);
  });

  it('وما طُوبق لا يُعاد — فلا يُمحى عملُ من عالج فرقًا', async () => {
    const { reconcileYesterday } = await import('@/lib/domain/reconciliation');
    const now = new Date();
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000,
    );

    const planted = await db.reconciliationRun.upsert({
      where: { gatewayKey_date: { gatewayKey: 'sandbox', date: yesterday } },
      create: {
        gatewayKey: 'sandbox', date: yesterday,
        ourTotal: '0', diff: '0', status: 'DIFFERS',
        note: 'عالجها إنسان',
      },
      update: { note: 'عالجها إنسان', status: 'DIFFERS' },
    });

    await reconcileYesterday(now);

    const after = await db.reconciliationRun.findUniqueOrThrow({ where: { id: planted.id } });
    expect(after.note).toBe('عالجها إنسان');

    await db.reconciliationRun.delete({ where: { id: planted.id } });
  });
});

/**
 * ═══ ولا تسويةَ بلا مرجعها ═══
 *
 * المطابقة تقرأ `settleRef ?? holdRef` وتقارنه بتقرير البوّابة —
 * **وتقريرُها يحمل مرجع التحصيل**. فدفعةٌ صارت `SETTLED` ولم يُحفظ
 * مرجعُها تُطابَق بمرجع الحجز، فلا تُطابِق شيئًا: فرقٌ يوميّ ورسالةٌ
 * لا تذكر مرجعًا ناقصًا.
 *
 * وأُصلح مرّةً في تسوية الطلبات والتسوية اليدوية، **وبقي مسارُ
 * الويبهوك** — وهو مسار البوّابة الحقيقية. والبوابة ٥٢ تمنع الشكل،
 * وهذا يفحص الحال.
 */
describe('المطابقة اليومية — ومرجعُ التحصيل يُحفظ', () => {
  it('لا دفعةَ مسوّاة في القاعدة بلا settleRef', async () => {
    const blind = await db.payment.findMany({
      where: { status: { in: ['SETTLED', 'PARTIALLY_SETTLED'] }, settleRef: null },
      select: { id: true, purpose: true, status: true },
    });
    expect(blind, JSON.stringify(blind)).toEqual([]);
  });

  it('وجدولُ الويبهوك يُفضي إلى SETTLED — فمسارُه يحمل المراجع', async () => {
    /**
     * **والفحص على المصدر لا على الذاكرة**: `payment_captured` يُفضي
     * إلى `SETTLED`، فلو مرّ نداؤه بلا مراجع عاد العيبُ من بابه.
     */
    const { readFile } = await import('node:fs/promises');
    const route = await readFile('src/app/api/v1/webhooks/payments/route.ts', 'utf8');
    expect(route).toMatch(/settleRef:\s*holdRef/);

    /**
     * **والخريطةُ انتقلت إلى النطاق** لتقرأها الشاشةُ أيضًا — فالفحصُ
     * يتبع المصدر. وقراءتُها كقيمةٍ أصدقُ من نصٍّ على أيّ حال.
     */
    const { WEBHOOK_STATUS } = await import('@/lib/domain/webhooks');
    expect(WEBHOOK_STATUS['payment_captured']).toBe('SETTLED');
  });
});

/**
 * ═══ لوحةُ A25 — آخرُ مطابقةٍ لكلّ بوّابة ═══
 *
 * والمقيسُ ثلاثةٌ، كلُّها حدٌّ **يُعبَر لا يُنتظَر**: بوّابةٌ بلا صفٍّ
 * أصلًا، وبوّابةٌ أحدثُ صفَّيها هو المقروء، ومجموعُ الفروق على المعاملات
 * لا على المجاميع.
 *
 * **والبوّابةُ تُصنَع لتُقاس**: البذرة تُطابق كلَّ بوّابةٍ ثلاثةَ أيّام،
 * فلا خاليةَ في بيئةٍ مزروعة — والحالُ الذي وُضعت له `null` لا يقع إلّا
 * بزرعِه. ولوحةٌ تُسقط البوّابةَ التي لم تُطابَق قطّ تُخفي أوّلَ ما يجب
 * أن يُرى، فتُفحص بوجودها في القائمة لا بحالها وحده.
 */
describe('لوحةُ المطابقة في A25', () => {
  const KEY = 'probe-latest';

  async function gateway() {
    await db.paymentGateway.upsert({
      where: { key: KEY },
      update: {},
      create: {
        key: KEY,
        nameAr: 'بوابة قياس',
        nameEn: 'Probe gateway',
        capabilities: {},
        status: 'INACTIVE',
        sort: 99,
      },
    });
  }

  async function drop() {
    await db.reconciliationRun.deleteMany({ where: { gatewayKey: KEY } });
    await db.paymentGateway.deleteMany({ where: { key: KEY } });
  }

  async function plant(day: string, status: 'MATCHED' | 'DIFFERS', mismatches: unknown[]) {
    await db.reconciliationRun.create({
      data: {
        gatewayKey: KEY,
        date: new Date(`${day}T00:00:00.000Z`),
        ourTotal: 1000,
        gatewayTotal: status === 'MATCHED' ? 1000 : 580,
        diff: status === 'MATCHED' ? 0 : 420,
        status,
        mismatches: mismatches as never,
        ranAt: new Date(`${day}T03:00:00.000Z`),
      },
    });
  }

  it('بوّابةٌ بلا مطابقةٍ تُدرَج بـ null — ولا تُسقَط ولا تُقال «مطابقة»', async () => {
    await drop();
    try {
      await gateway();
      const summary = await latestRuns();
      const row = summary.gateways.find((entry) => entry.gatewayKey === KEY);

      expect(row, 'بوّابةٌ بلا مطابقةٍ يجب أن تبقى في القائمة').toBeDefined();
      expect(row?.status).toBeNull();
      expect(row?.ranAt).toBeNull();
      expect(row?.mismatchCount).toBe(0);
    } finally {
      await drop();
    }
  });

  /**
   * **وأحدثُ الصفَّين هو المقروء.** ولوحةٌ تقرأ الأقدم تطمئن المشغّل إلى
   * مطابقةٍ نُقضت أمس — وهو خطأٌ لا يُرى، إذ الرقمان كلاهما حقيقيّ.
   */
  it('الأحدث يغلب الأقدم، والفروق تُجمع على المعاملات', async () => {
    await drop();
    try {
      await gateway();
      await plant('2026-07-10', 'MATCHED', []);
      await plant('2026-07-12', 'DIFFERS', [
        { ref: 'pay_a', ours: '420', theirs: null, kind: 'MISSING_THERE' },
        { ref: 'pay_b', ours: '100', theirs: '90', kind: 'AMOUNT_DIFFERS' },
      ]);

      const summary = await latestRuns();
      const row = summary.gateways.find((entry) => entry.gatewayKey === KEY);

      expect(row?.status).toBe('DIFFERS');
      expect(row?.date).toBe('2026-07-12');
      expect(row?.mismatchCount).toBe(2);
      expect(summary.mismatches).toBeGreaterThanOrEqual(2);
      /** **والمجموعُ على المعاملات لا على المجاميع** — الفرقُ ٤٢٠ ومعاملتان. */
      expect(row?.diff).toBe('420');
    } finally {
      await drop();
    }
  });
});
