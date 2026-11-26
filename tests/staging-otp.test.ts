import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * ═══ سلوكُ الرمز بحسب البيئة — لا بنصّ المصدر ═══
 *
 * `tests/env-guards` تفحص **شكلَ الشرط** في المصدر، وهذا يفحص **أثرَه**:
 * فمن يكتب الشرط صحيحًا ويقلب معناه يمرّ هناك ويسقط هنا.
 *
 * وسببُ وجود القاعدة: قرارُ المالك ٢٠٢٦-١١-٢٦ أنّ الرمزَ في staging
 * دائمًا `000000` — إذ **لا تُختبَر شاشةُ مستخدمٍ ولا لوحةُ معرضٍ
 * بغيره**: الرمزُ يُولَّد ولا يُرسَل، فبيئةٌ فيها واحدٌ وخمسون إعلانًا
 * لا يدخلها أحد. وهو «الشرط يُفرَض ولا بابَ لاستيفائه» بنصّه.
 *
 * **والإنتاجُ هو ما يُحرَس**: رمزٌ ثابتٌ معروف فيه يعني انتحالَ أيّ
 * رقمٍ بضغطة — لا اختراقَ حسابٍ بل انتحالَ كلّ الحسابات.
 */
describe('رمز staging الثابت', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('وفي staging كل رقم رقمُ تجربة', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    const { isTestNumber } = await import('@/lib/domain/auth');
    expect(isTestNumber('+966500000000')).toBe(true);
    expect(isTestNumber('+966599999999')).toBe(true);
  });

  it('وفي الإنتاج لا رقمَ إلا بالقائمة', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('OTP_TEST_NUMBERS', '+966500000001');
    const { isTestNumber } = await import('@/lib/domain/auth');
    expect(isTestNumber('+966500000000')).toBe(false);
    expect(isTestNumber('+966500000001')).toBe(true);
  });
});
