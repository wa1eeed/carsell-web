import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listPublicDealers } from '@/lib/domain/dealer-page';

/**
 * ═══ المدينةُ مرّةً واحدة في السطر (Wp) ═══
 *
 * بطاقةُ الدليل تطبع «المدينة · العنوان»، والعنوانُ الذي يكتبه المعرض
 * ينتهي بمدينته عادةً — **فكان السطر «الرياض · طريق الملك عبدالعزيز،
 * حي الملقا، الرياض»**، والمدينةُ مرّتين فيه.
 *
 * وترميز `Wp` يكتبه «الرياض · حي الملقا».
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('عنوانُ بطاقة المعرض', () => {
  it('لا يُعيد اسمَ المدينة بعد أن طُبع بجواره', async () => {
    const dealers = await listPublicDealers('ar');
    expect(dealers.length, 'لا معارضَ مزروعة').toBeGreaterThan(0);

    for (const dealer of dealers) {
      if (dealer.address === null) continue;
      expect(
        dealer.address.endsWith(dealer.city),
        `${dealer.name}: «${dealer.city} · ${dealer.address}»`,
      ).toBe(false);
      expect(dealer.address.startsWith(dealer.city)).toBe(false);
    }
  });

  /**
   * **والنزعُ من الطرفين لا من الوسط.** «حي الرياض» في جدةَ حيٌّ لا
   * مدينة، فحذفُ الاسم أينما وقع يشوّه عناوينَ صحيحة.
   */
  it('ولا يمسّ اسمَ المدينة حين يقع وسط العنوان', async () => {
    const dealer = await db.dealer.findFirstOrThrow({
      where: { status: 'ACTIVE' },
      select: { id: true, city: true, address: true },
    });

    const original = dealer.address;
    await db.dealer.update({
      where: { id: dealer.id },
      data: { address: `شارع ${dealer.city} التجاري، حي النزهة` },
    });

    try {
      const rows = await listPublicDealers('ar');
      const row = rows.find((item) => item.city === dealer.city);
      expect(row?.address).toContain(`شارع ${dealer.city} التجاري`);
    } finally {
      /** **والاختبار يعيد ما غيّره.** */
      await db.dealer.update({ where: { id: dealer.id }, data: { address: original } });
    }
  });
});
