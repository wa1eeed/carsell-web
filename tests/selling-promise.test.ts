import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hiddenFaqKeys, sellingIsFree } from '@/lib/domain/selling-promise';
import { helpFaqs } from '@/lib/domain/content';
import { faqForListing } from '@/lib/domain/listing-detail';

/**
 * ═══ وعدُ «صفر عمولة» يتبع القاعدة النافذة ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٧): «الوعدُ المكتوب يتغيّر حسب حالة العمولة —
 * إن قمنا بتفعيلها يُزال الوعد … من الرئيسية ومن الأسئلة الشائعة».
 *
 * **وكان أربعةَ نصوصٍ ثابتة** لا يقرأ واحدٌ منها `CommissionRule`:
 * «صفر عمولة على كل عملية بيع» في الرئيسية، و«بلا عمولة» في بطاقة
 * البيع، و«صفر عمولة على البيع» في شاشة الدخول، وسؤالٌ في الأسئلة
 * الشائعة يجيب «صفر بالمئة حاليًا».
 *
 * **وصفحةُ المعارض تقرؤها** وتعرض النسبة الحيّة — فتفعيلُ العمولة كان
 * يجعل صفحتين من صفحات المنصّة تتناقضان، والقارئُ لا يعرف أيَّهما
 * يصدّق. وهو صنف «النصّ المعروض وعدٌ لا وصف» في أكثر شاشةٍ يصلها
 * الناس.
 *
 * **والاختبارُ يعيد ما غيّره**: قاعدةُ العمولة مرجعيّةٌ مشتركة.
 */
const CREATED: string[] = [];

afterAll(async () => {
  if (CREATED.length > 0) {
    await db.commissionRule.deleteMany({ where: { id: { in: CREATED } } });
  }
  await db.$disconnect();
});

/** يُفعّل عمولةَ بائعٍ بصفٍّ جديد — كما تفعل لوحةُ الباقات */
async function enableSellerCommission(pct: string): Promise<void> {
  const row = await db.commissionRule.create({
    data: {
      scope: 'global',
      side: 'SELLER',
      enabled: true,
      pct,
      fixedFee: '0',
      activeFrom: new Date(),
    },
    select: { id: true },
  });
  CREATED.push(row.id);
}

describe('الوعدُ يتبع القاعدة', () => {
  let seeded = false;

  beforeAll(async () => {
    seeded = await sellingIsFree();
  });

  /**
   * **والمفتاحُ شرطُ الترشيح.** المطابقةُ بنصّ السؤال هشّة: يعدّله
   * المشغّل من `/admin/faq` فينفكّ الشرط صامتًا.
   */
  it('ولسؤال العمولة مفتاحٌ ثابت', async () => {
    const row = await db.faqItem.findUnique({
      where: { key: 'selling_commission' },
      select: { questionAr: true },
    });
    expect(row?.questionAr).toContain('عمولة');
  });

  it('وما دامت صفرًا يبقى الوعد وتبقى الإجابة', async () => {
    if (!seeded) return;
    expect(await hiddenFaqKeys()).toEqual([]);

    const help = await helpFaqs(undefined, 50);
    expect(help.some((row) => row.questionAr.includes('عمولة على البيع'))).toBe(true);
  });

  /**
   * **وتفعيلُها يرفع الوعد من كلّ سطح** — والشرطُ حيث يُجلَب لا حيث
   * يُعرض، فلا يبقى في حمولة RSC ولا في بيانات الصفحة المنظَّمة.
   */
  it('وتفعيلُها ترفعه من الأسئلة ومن صفحة المركبة', async () => {
    await enableSellerCommission('2.50');

    expect(await sellingIsFree()).toBe(false);
    expect(await hiddenFaqKeys()).toEqual(['selling_commission']);

    const help = await helpFaqs(undefined, 50);
    expect(help.some((row) => row.questionAr.includes('عمولة على البيع'))).toBe(false);

    const onListing = await faqForListing('DIRECT');
    expect(onListing.some((row) => row.questionAr.includes('عمولة على البيع'))).toBe(false);
  });

  /**
   * **وعمولةٌ مفعَّلةٌ بصفرٍ ليست عمولة** — فالوعدُ صادقٌ معها. والصفُّ
   * يُكتب كذلك حين يُعطَّل الرسم من اللوحة.
   */
  it('ومفعَّلةٌ بصفرٍ يبقى معها الوعد', async () => {
    await enableSellerCommission('0');
    expect(await sellingIsFree()).toBe(true);
    expect(await hiddenFaqKeys()).toEqual([]);
  });
});
