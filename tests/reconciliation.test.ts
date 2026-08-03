import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listRuns, reconcileGateway, runMismatches } from '@/lib/domain/reconciliation';

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
