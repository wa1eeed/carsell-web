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

/** مفتاح كائن في R2 داخل مجلّد البيئة الحالية. */
export function r2Key(...segments: readonly string[]): string {
  return [R2_PREFIX, ...segments]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment !== '')
    .join('/');
}
