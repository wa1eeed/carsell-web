import { describe, expect, it } from 'vitest';
import {
  AD_SESSION_COOKIE,
  HOME_SESSION_AD_CAP,
  HOME_SLOTS,
  afterImpression,
  allowanceFromHeader,
  remainingHomeAds,
  seenAds,
} from '@/lib/domain/ad-session';

/**
 * ═══ سقفُ إعلانات الجلسة — ويُفرَض في الخادم ═══
 *
 * ترميز A30: «٤ إعلانات كحدّ أقصى في جلسة الرئيسية، والسقف يُفرَض في
 * الخادم لا في التطبيق». وكان الثابت موجودًا **لا يقرؤه أحد**.
 *
 * والمقيسُ هنا أنّ السقف **يُعبَر فيُمنع**، وأنّ قيمة الكوكي — وهي
 * بيد العميل — لا تفتح ما أُغلق.
 */
describe('سقفُ إعلانات جلسة الرئيسية', () => {
  it('الجلسةُ الجديدة تبدأ بالسقف كاملًا', () => {
    expect(remainingHomeAds(undefined)).toBe(HOME_SESSION_AD_CAP);
    expect(seenAds(undefined)).toBe(0);
  });

  /** **والحدُّ يُختبَر بعبوره** — لا بوصفه. */
  it('ويُستهلك ظهورًا ظهورًا حتى يُغلق', () => {
    let cookie: string | undefined;
    const seen: number[] = [];

    for (let i = 0; i < HOME_SESSION_AD_CAP + 3; i += 1) {
      seen.push(remainingHomeAds(cookie));
      cookie = afterImpression(cookie);
    }

    expect(seen.slice(0, HOME_SESSION_AD_CAP)).toEqual(
      Array.from({ length: HOME_SESSION_AD_CAP }, (_, i) => HOME_SESSION_AD_CAP - i),
    );
    /** وما بعد السقف صفرٌ ثابت — لا سالبٌ ولا عودةٌ إلى الفتح. */
    expect(seen.slice(HOME_SESSION_AD_CAP)).toEqual([0, 0, 0]);
  });

  /**
   * ═══ والكوكي بيد العميل ═══
   *
   * يكتبه الخادم، ويملك العميلُ تبديلَه. فقيمةٌ سالبة أو نصٌّ أو رقمٌ
   * خياليّ لا تفتح ما أُغلق ولا تُسقط الصفحة — **وسقفٌ يُلتفّ عليه
   * بتعديل كوكي ليس سقفًا مفروضًا في الخادم**.
   */
  it('وقيمةٌ مفتعلة لا تفتح ما أُغلق ولا ترمي', () => {
    for (const forged of ['-5', 'abc', '', '9999999999', '٤', '3.9', 'NaN']) {
      const left = remainingHomeAds(forged);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(HOME_SESSION_AD_CAP);
    }
    /** والسالبُ يُقرأ «لم يُرَ شيء» لا «رصيدٌ زائد». */
    expect(remainingHomeAds('-5')).toBe(HOME_SESSION_AD_CAP);
    /** وما فوق السقف يُقرأ سقفًا — فلا يصير العدّاد رصيدًا سالبًا. */
    expect(remainingHomeAds('9999999999')).toBe(0);
  });

  /**
   * **والرأسُ الغائب يُعطي السقف كاملًا — والعدُّ عند الظهور يمنع.**
   *
   * صفحةٌ تصل بلا وسيط (تصييرٌ ساكن أو مسارٌ خارج `matcher`) لا تعرف
   * الباقي. وإسكاتُ إعلانٍ بيع أسوأ من عرضه مرّةً زائدة، إذ العدُّ
   * يقع عند الظهور وهو الموضع الذي لا يُتجاوَز.
   */
  it('والرأسُ الغائب لا يُسكت إعلانًا بيع', () => {
    expect(allowanceFromHeader(null)).toBe(HOME_SESSION_AD_CAP);
    expect(allowanceFromHeader('0')).toBe(0);
    expect(allowanceFromHeader('2')).toBe(2);
    expect(allowanceFromHeader('99')).toBe(HOME_SESSION_AD_CAP);
    expect(allowanceFromHeader('-1')).toBe(0);
    expect(allowanceFromHeader('ما')).toBe(0);
  });

  /**
   * **وسقفُ الرئيسية لمساحاتها وحدها.** بطاقةُ المموّل في النتائج
   * والبنرُ داخل صفحة السيارة لكلٍّ `maxPerSession` الخاصّ به، وعدُّها
   * هنا يُسكت إعلانًا بيع بشروطٍ أخرى.
   */
  it('والمساحاتُ المحكومةُ بسقف الرئيسية هي مساحاتُها', () => {
    expect(HOME_SLOTS).toContain('home_banner');
    expect(HOME_SLOTS).toContain('brand_featured');
    expect(HOME_SLOTS).not.toContain('search_inline');
    expect(HOME_SLOTS).not.toContain('vehicle_inline');
  });

  /** والكوكي كوكي جلسة — واسمُه ثابتٌ يقرؤه الوسيط والمسار معًا. */
  it('واسم الكوكي واحدٌ في الموضعين', () => {
    expect(AD_SESSION_COOKIE).toBe('carz_ads');
  });
});
