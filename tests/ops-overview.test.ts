import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { opsOverview, UNCATEGORISED_CANCEL } from '@/lib/domain/admin-charts';
import { OrderCancelCategory, OrderStatus } from '@/generated/prisma/enums';

/**
 * ═══ كلُّ شريحةٍ تجمع رأسَها ═══
 *
 * بطاقتان في `A2` كانتا تناقضان نفسَيهما في سطرين متجاورين:
 *
 * - «١١ طلبا هذا الشهر» وشرائحُها تجمع **تسعة** — القائمةُ أربعُ حالاتٍ
 *   مكتوبةٌ بيد بلا `DISPUTED`، وهي القاعدةُ المكتوبة في الملفّ نفسِه
 *   («القائمةُ تُشتقّ من التعداد لا تُكتب بجواره») مطبَّقةً على
 *   جارتها لا عليها.
 * - «الإلغاءات ١» وتحتها خمسةُ أصفار — `cancelCategory` اختياريّ،
 *   والإلغاءُ بلا صنفٍ يدخل الإجماليَ ولا يدخل شريحة.
 *
 * ولا يُفحص برقمٍ مكتوب (البيانات تتبدّل) بل **بعلاقة**: المجموعُ هو
 * الرأس.
 */
describe('A2 — كل مجموعة تجمع إجماليها', () => {
  it('الشرائح تجمع الرأس في المجموعات كلها', async () => {
    const overview = await opsOverview();
    const groups = [
      ['live', overview.live],
      ['queues', overview.queues],
      ['risks', overview.risks],
      ['month', overview.month],
      ['cancellations', overview.cancellations],
    ] as const;

    for (const [name, group] of groups) {
      const sum = group.parts.reduce((total, part) => total + part.count, 0);
      expect(`${name}:${String(sum)}`).toBe(`${name}:${String(group.total)}`);
    }
  });

  /**
   * **والقائمةُ تُشتقّ، فلا تتقادم.** قيمةُ حالٍ تُضاف إلى المخطّط
   * تظهر في البطاقة بلا تعديل — وإلّا صمتت خارجها كما صمت
   * `DISPUTED` شهورًا.
   */
  it('حالات الشهر كل قيم التعداد، والإلغاءات كلها ومعها بلا صنف', async () => {
    const overview = await opsOverview();

    expect(overview.month.parts.map((part) => part.key).sort()).toEqual(
      Object.values(OrderStatus).sort(),
    );
    expect(overview.cancellations.parts.map((part) => part.key).sort()).toEqual(
      [...Object.values(OrderCancelCategory), UNCATEGORISED_CANCEL].sort(),
    );
  });

  /**
   * **ولا يُصدَّق تطابقٌ لا يميّز.** لو لم يكن في القاعدة إلغاءٌ بلا
   * صنفٍ ولا طلبٌ متنازَعٌ عليه لمرّ الفحصُ الأوّل على الشيفرة
   * المكسورة — فيُطلَب وجودُ ما كان يسقط.
   */
  it('البيانات تبلغ الحالتين اللتين كانتا تسقطان', async () => {
    const [uncategorised, disputed] = await Promise.all([
      db.order.count({ where: { status: 'CANCELLED', cancelCategory: null } }),
      db.order.count({ where: { status: 'DISPUTED' } }),
    ]);
    expect(uncategorised).toBeGreaterThan(0);
    expect(disputed).toBeGreaterThan(0);
  });
});
