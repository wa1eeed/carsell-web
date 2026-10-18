/**
 * بيئة التشغيل — **صريحة ومنفصلة عن `NODE_ENV`**.
 *
 * `NODE_ENV` يخصّ أداة البناء: `production` في كل نشر بما فيه staging.
 * فلو اتّكلنا عليه لظنّت staging نفسها إنتاجًا، ولانفتح باب زرع بيانات
 * وهمية في قاعدة حقيقية. `APP_ENV` يجيب سؤالًا آخر: أي بيئة هذه فعلًا؟
 */

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

function readAppEnv(): AppEnv {
  const raw = process.env.APP_ENV;

  if (raw === undefined || raw === '') {
    // الغياب يعني تطوير محلي. لا نخمّن أبدًا أنها إنتاج ولا staging.
    return 'development';
  }

  if (!(APP_ENVS as readonly string[]).includes(raw)) {
    throw new Error(
      `APP_ENV=«${raw}» غير معروف. المسموح: ${APP_ENVS.join(' | ')}`,
    );
  }

  return raw as AppEnv;
}

export const APP_ENV: AppEnv = readAppEnv();

export const isProduction = APP_ENV === 'production';
export const isStaging = APP_ENV === 'staging';
export const isDevelopment = APP_ENV === 'development';

/**
 * بادئة مجلّد الوسائط في R2 — كل بيئة في مجلّدها.
 * لا تُبنى مفاتيح R2 يدويًا في أي مكان آخر.
 */
export const R2_PREFIX: string = isProduction ? 'production' : 'staging';

/**
 * العنوان العامّ — تُبنى عليه خريطة الموقع والروابط المطلقة.
 * والافتراضيّ محلّيّ: نشرٌ بلا `APP_URL` يُنتج خريطةً تشير إلى
 * `localhost`، وهي أوضح من نطاقٍ مكتوبٍ في الشيفرة يبقى بعد تغييره.
 */
export const APP_URL: string = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * ═══ نطاقُ المنصّة كما يُطبع على الورق ═══
 *
 * `APP_URL` عنوانُ **المضيف الذي يُصيّر**: محلّيٌّ في التطوير، ونطاقُ
 * التجريب في staging. وذلك صحيحٌ لخريطة الموقع والروابط المطلقة —
 * **وخطأٌ على وثيقةٍ تُطبع وتُسلَّم**: تقريرٌ في يد مشترٍ يحمل رمزًا
 * يقود إلى `localhost:3000` لا يقود إلى شيء، ويقرأ تحته عنوانًا لا
 * وجود له. قرار المالك ٢٠٢٦-١٠-١٨: «استبدل بالدومين الرسمي الذي تعمل
 * عليه المنصه».
 *
 * فالوثائقُ تقرأ هذا، والنطاقُ الرسميّ `carz.sa`. **ومسارُ الرابط
 * كما هو** — تفاصيلُ المركبة نفسها، ولا يتبدّل منه إلّا المضيف.
 *
 * وافتراضيُّه النطاقُ لا `localhost`: الورقةُ تُطبع من أيّ بيئة،
 * وبيئةٌ تنسى المتغيّر تطبع عنوانًا صحيحًا لا عنوانَ حاسوبٍ مطوّر.
 */
export const SITE_URL: string = (
  process.env.PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://carz.sa'
).replace(/\/+$/, '');

/** مفتاح كائن في R2 داخل مجلّد البيئة الحالية. */
export function r2Key(...segments: readonly string[]): string {
  return [R2_PREFIX, ...segments]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment !== '')
    .join('/');
}

/**
 * الرايات — تُقرأ على الخادم وتُمرَّر إلى الشاشة.
 *
 * **الراية المطفأة تُخفي لا تُعطّل** (قرار ٢٤): لا يُعرض ما لا يعمل.
 * والشاشة يجب أن تكون كاملة بدون كل ميزةٍ خلف راية — وإلا صارت الراية
 * وهمًا لا يمكن إطفاؤه.
 */
export function isFeatureOn(name: 'AI_PRICING' | 'NL_SEARCH' | 'ADS' | 'VIN_LOOKUP'): boolean {
  return process.env[`FEATURE_${name}`] === 'true';
}
