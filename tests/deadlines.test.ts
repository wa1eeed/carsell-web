import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import {
  DEADLINE_DEFAULTS,
  DEADLINE_KEYS,
  currentDeadlines,
  deadline,
  listDeadlines,
  setDeadline,
} from '../src/lib/domain/deadlines';

const ADMIN = 'test-admin-deadlines';

beforeEach(async () => {
  await db.deadlineSetting.deleteMany({});
});

afterAll(async () => {
  // الاختبار يعيد ما غيّره — وصفٌّ باقٍ يغيّر مهل كل اختبارٍ بعده
  await db.deadlineSetting.deleteMany({});
  await db.auditLog.deleteMany({ where: { actorId: ADMIN } });
});

describe('المهل إعدادٌ لا ثابت', () => {
  it('الغائب يأخذ افتراضيّه — فالترحيل بلا أثر', async () => {
    const values = await currentDeadlines();
    expect(values).toEqual(DEADLINE_DEFAULTS);
  });

  it('المحفوظ يسبق الافتراضيّ', async () => {
    await setDeadline({ key: 'paymentWindowHours', value: 48, adminId: ADMIN, ip: null });
    expect(await deadline('paymentWindowHours')).toBe(48);
    // ولا يمسّ غيره
    expect(await deadline('offerTtlHours')).toBe(DEADLINE_DEFAULTS.offerTtlHours);
  });

  /**
   * **بلا حدّ يصير الإعداد سلاحًا**: مهلة دفعٍ بصفر تُسقط كل طلب فور
   * إنشائه، ومهلة نقلٍ بألف يوم تحبس مال المشترين سنوات.
   */
  it('خارج الحدّ يُرفض — من الطرفين', async () => {
    expect(await setDeadline({ key: 'paymentWindowHours', value: 0, adminId: ADMIN, ip: null }))
      .toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
    expect(await setDeadline({ key: 'transferDeadlineDays', value: 1000, adminId: ADMIN, ip: null }))
      .toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' });
    expect(await db.deadlineSetting.count()).toBe(0);
  });

  it('مفتاحٌ مجهول يُرفض ولا يُكتب', async () => {
    expect(await setDeadline({ key: 'adminSessionHours', value: 99, adminId: ADMIN, ip: null }))
      .toEqual({ ok: false, reason: 'UNKNOWN_KEY' });
    expect(await db.deadlineSetting.count()).toBe(0);
  });

  it('كل تعديل يكتب أثرًا بقيمته قبلُ وبعدُ', async () => {
    await setDeadline({ key: 'offerTtlHours', value: 72, adminId: ADMIN, ip: '10.0.0.1' });
    const log = await db.auditLog.findFirstOrThrow({
      where: { actorId: ADMIN, entity: 'DeadlineSetting' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.action).toBe('deadline.changed');
    expect(log.before).toEqual({ value: DEADLINE_DEFAULTS.offerTtlHours });
    expect(log.after).toEqual({ value: 72 });
  });

  it('الشاشة تميّز المعدَّل عن الافتراضيّ، وتعرض حدوده', async () => {
    await setDeadline({ key: 'disputeSlaHours', value: 24, adminId: ADMIN, ip: null });
    const rows = await listDeadlines();

    expect(rows).toHaveLength(DEADLINE_KEYS.length);
    const changed = rows.find((row) => row.key === 'disputeSlaHours');
    expect(changed?.isDefault).toBe(false);
    expect(changed?.value).toBe(24);
    expect(rows.find((row) => row.key === 'offerTtlHours')?.isDefault).toBe(true);
    // الحدّ يُعرض قبل المحاولة لا بعد الرفض
    expect(changed?.min).toBeGreaterThan(0);
    expect(changed?.max).toBeGreaterThan(changed?.min ?? 0);
  });
});
