import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';

/**
 * ═══ ما لا يُزرع لا يُرى ═══
 *
 * شاشتان كانتا تُفتحان على حالهما الفارغ وحده: مفاتيحُ الواجهة العامّة
 * («لا مفتاح بعد») والحملاتُ الإعلانية («لا حملات بعد») — **والعدّاداتُ
 * والنطاقاتُ وأعمدةُ الظهور والنقر لا تُرى في بيئةٍ قطّ**. فمن فتحهما
 * لم يعرف أتعملان أم لا، وهو ما قرأه المالك «صفحاتٌ ناقصة».
 *
 * والقياسُ على ما يُنشئه المنتج لا على شكل الجدول.
 */
describe('الشاشات التي كانت تفتح على فراغها', () => {
  it('ومفاتيح الواجهة العامة مزروعة — فعال ومسحوب', async () => {
    const keys = await db.apiKey.findMany({ select: { active: true, scopes: true, prefix: true } });
    expect(keys.length).toBeGreaterThanOrEqual(2);
    /** **والحالان كلاهما**: شاشةٌ بلا مسحوبٍ لا تُري شكلَ السحب قطّ. */
    expect(keys.some((key) => key.active)).toBe(true);
    expect(keys.some((key) => !key.active)).toBe(true);
    /** ولكلٍّ نطاقٌ معلَن — والفارغ يعني كلَّ سطح القراءة. */
    expect(keys.every((key) => key.prefix.startsWith('csk_'))).toBe(true);
  });

  /**
   * **والمفتاحُ الخامّ لا يُزرع**: يُعرض مرّةً عند إصداره، والمخزَّن
   * مُجزَّأ — فبذرةٌ تكتب مفتاحًا يعمل تُسلّم كلَّ بيئةٍ مفتاحًا معروفًا.
   */
  it('ولا يخزن مفتاح خام', async () => {
    const keys = await db.apiKey.findMany({ select: { keyHash: true, prefix: true } });
    for (const key of keys) {
      /** التجزئة ستٌّ وستّون خانةً سداسية — لا مفتاحًا بصيغته. */
      expect(key.keyHash, key.prefix).toMatch(/^[0-9a-f]{64}$/);
      expect(key.keyHash.startsWith('csk_')).toBe(false);
    }
  });

  it('وللمساحات الإعلانية حملات بأثرها', async () => {
    const campaigns = await db.adCampaign.findMany({
      select: { status: true, impressions: true, clicks: true, slotKey: true },
    });
    expect(campaigns.length).toBeGreaterThanOrEqual(2);
    /** حملةٌ جارية وأخرى منتهية — فالشريحتان تُفتحان على صفوف. */
    expect(campaigns.some((row) => row.status === 'LIVE')).toBe(true);
    expect(campaigns.some((row) => row.status === 'ENDED')).toBe(true);

    /**
     * **والأثرُ يُحاكي الحقيقيّ**: نقرٌ بلا ظهورٍ مستحيل، ونسبةُ نقرٍ
     * فوق العُشر رقمٌ لا يقع — وبيانةٌ كهذه تُفسد كلَّ قراءةٍ للوحة.
     */
    for (const row of campaigns) {
      expect(row.impressions, row.slotKey).toBeGreaterThan(0);
      expect(row.clicks).toBeLessThanOrEqual(row.impressions);
      expect(row.clicks / row.impressions).toBeLessThan(0.1);
    }

    /** وكلُّ حملةٍ على مساحةٍ قائمة — والمفتاحُ الأجنبيّ يفرضه. */
    const slots = await db.adSlot.findMany({ select: { key: true } });
    const keys = new Set(slots.map((slot) => slot.key));
    for (const row of campaigns) expect(keys.has(row.slotKey), row.slotKey).toBe(true);
  });

  /**
   * ═══ ولا ضمانَ لطلبٍ **عند** مرحلة الدفع ═══
   *
   * حالٌ **لا يُنتجها المنتج**: `startHold` تحجز بـ`applyState` التي
   * تُقدّم المرحلة معها، فالمحجوزُ قد تجاوز الدفع بالضرورة.
   *
   * وكانت البذرة تزرعها (`>=` بدل `>`)، **فاختفى «ادفع الآن» من كل
   * طلبٍ عند الدفع**: `canPay` تشترط `escrow === null` بحقّ. وقرأت
   * بطاقةُ الضمان للمشتري «المبلغ محجوز ولم يصل البائع» وهو لم يدفع
   * ريالًا — فما يُزرع خطأً يُرى خطأً، والشاشة تُبنى على ما تراه.
   */
  it('ولا ضمان لطلب عند مرحلة الدفع — وإلا اختفى زر الدفع', async () => {
    const held = await db.order.findMany({
      where: { stage: 'PAYMENT', escrow: { isNot: null } },
      select: { ref: true, status: true, escrow: { select: { status: true } } },
    });
    expect(held.map((row) => `${row.ref}:${row.escrow?.status ?? ''}`)).toEqual([]);
  });

  /**
   * **وطلبٌ واحدٌ على الأقلّ قابلٌ للدفع** — وإلّا لم تُفتح شاشةُ
   * الدفع قطّ ولا قِيست. وما لا يُزرع لا يُرى.
   */
  it('وفي البذرة طلب عند الدفع بلا ضمان — فشاشة الدفع تُفتح', async () => {
    const payable = await db.order.count({
      where: { stage: 'PAYMENT', status: 'ACTIVE', escrow: null },
    });
    expect(payable).toBeGreaterThan(0);
  });
});
