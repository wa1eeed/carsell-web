import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listSegments, saveSegment } from '@/lib/domain/admin-campaigns';

/**
 * ═══ الشريحة تُعرَّف من الشاشة ═══
 *
 * `saveSegment` كانت مبنيّةً كاملة — تتحقّق من القواعد، وتمنع تكرار
 * المفتاح، وتكتب الأثر — **ولا مسارَ يبلغها ولا زرّ**. فالشاشة تعرض
 * الشرائح ولا تُنشئ واحدة، **والحملة بلا شريحة لا تُرسَل**.
 *
 * خامسَ عشرَ وقوعٍ لـ«مبنيٌّ لا يبلغه أحد».
 */

afterAll(async () => {
  await db.$disconnect();
});

async function admin() {
  return db.adminUser.create({
    data: {
      email: `seg${String(Date.now()).slice(-9)}@carsell.one`,
      name: 'محرّر',
      role: 'CONTENT',
      passwordHash: 'x',
    },
  });
}

const KEY = 'seg_test_favorites';

describe('═══ تعريف الشريحة ═══', () => {
  it('تُحفظ وتُقرأ محسوبةً، ولا يتكرّر مفتاحُها', async () => {
    const operator = await admin();

    try {
      const saved = await saveSegment(
        operator,
        { key: KEY, nameAr: 'قياس — لديه مفضلة', rules: [{ field: 'hasFavorites' }] },
        null,
      );
      expect(saved.ok).toBe(true);

      const rows = await listSegments();
      const row = rows.find((entry) => entry.key === KEY);

      expect(row).toBeDefined();
      /**
       * **والعدد يُحوسَب لا يُخزَّن**: الشريحة حيّة، فتُعاد حوسبتها
       * وقت الإرسال — ولا يُقرأ عمودٌ كُتب يوم الحفظ.
       */
      expect(row?.counts.matched).toBeGreaterThanOrEqual(row?.counts.consented ?? 0);
      expect(row?.counts.consented).toBeGreaterThanOrEqual(row?.counts.reachable ?? 0);

      /** **والمفتاح لا يتكرّر** — وشريحتان بمفتاحٍ واحد تُرسَلان معًا. */
      const again = await saveSegment(
        operator,
        { key: KEY, nameAr: 'مكرّرة', rules: [{ field: 'hasFavorites' }] },
        null,
      );
      expect(again).toEqual({ ok: false, reason: 'KEY_TAKEN' });

      /** وقواعدُ فارغة تُرفض — شريحةٌ بلا شرطٍ هي كلُّ المستخدمين. */
      const empty = await saveSegment(
        operator,
        { key: 'seg_test_empty', nameAr: 'بلا شرط', rules: [] },
        null,
      );
      expect(empty).toEqual({ ok: false, reason: 'INVALID_RULES' });
    } finally {
      /** والاختبار يعيد ما غيّره — **وإن سقط**. */
      await db.segment.deleteMany({ where: { key: { in: [KEY, 'seg_test_empty'] } } });
      await db.auditLog.deleteMany({ where: { actorId: operator.id } });
      await db.adminUser.deleteMany({ where: { id: operator.id } });
    }
  });
});
