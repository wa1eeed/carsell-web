import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { saleAgreementFor, settlementStatementFor } from '@/lib/domain/documents';

/**
 * ═══ المستند يُفتح — ولطرفَيه وحدهما ═══
 *
 * صفحة الطلب كانت تسرد المستندات الصادرة ولا تفتح واحدًا: «عقد
 * البيع ✓» وبلا رابط. ومن اشترى بسبعين ألفًا يحتاج عقده في المرور،
 * والبائعُ يحتاج كشفه ليعرف لماذا وصله هذا المبلغ بالذات.
 *
 * **والحارس في الخادم لا في الشاشة**: من يعرف مرجع الطلب يفتح
 * الرابط مباشرةً، وإخفاءُ الرابط ليس منعًا.
 */

afterAll(async () => {
  await db.$disconnect();
});

async function completed() {
  return db.order.findFirstOrThrow({
    where: { status: 'COMPLETED', agreement: { isNot: null }, settlement: { isNot: null } },
    select: { ref: true, buyerId: true, sellerId: true },
  });
}

describe('═══ عقد البيع وكشف التسوية ═══', () => {
  it('يُفتحان لطرفَي الطلب', async () => {
    const order = await completed();

    for (const viewer of [order.buyerId, order.sellerId]) {
      expect(await saleAgreementFor(order.ref, viewer)).not.toBeNull();
      expect(await settlementStatementFor(order.ref, viewer)).not.toBeNull();
    }
  });

  it('ولا يُفتحان لغيرهما', async () => {
    const order = await completed();
    const stranger = await db.user.findFirstOrThrow({
      where: { id: { notIn: [order.buyerId, order.sellerId] } },
      select: { id: true },
    });

    expect(await saleAgreementFor(order.ref, stranger.id)).toBeNull();
    expect(await settlementStatementFor(order.ref, stranger.id)).toBeNull();
  });

  it('وكشفُ التسوية يتوازن: القيمة ناقص الخصومات = الصافي', async () => {
    const order = await completed();
    const sheet = await settlementStatementFor(order.ref, order.sellerId);
    expect(sheet).not.toBeNull();
    if (sheet === null) return;

    /**
     * **والجمع يظهر للقارئ.** كشفٌ يقول «الصافي كذا» بلا سطورٍ
     * تُجمع إليه يُقرأ ادّعاءً — فالشاشة تعرض البنود، وهذا يفحص
     * أنها تُفضي إليه فعلًا.
     */
    /**
     * **وضريبةُ العمولة تُعرض ولا تُخصم.** القاعدة في `money.ts`:
     * «ولا رسم نقلٍ ولا ضريبة — والثانيةُ على توريداتنا لا على توريد
     * البائع»، والعمولةُ شاملةٌ لها. وجمعُها هنا كان يُنتج صافيًا
     * يخالف ما في الكشف بمقدارها بالضبط — **وقد سقط حين ضُبطت نسبةٌ
     * حقيقية من اللوحة**، لا قبلها.
     */
    const deductions =
      Number(sheet.commission) + Number(sheet.gatewayFee) + Number(sheet.servicesTotal);

    expect(Number(sheet.vehicleValue) - deductions).toBeCloseTo(Number(sheet.netToSeller), 2);
  });
});
