import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ═══ حُرّاس البيئة يقرؤون `APP_ENV` لا `NODE_ENV` ═══
 *
 * **`NODE_ENV` يساوي `production` في staging أيضًا** — فالحراسة به
 * تُخطئ في الاتّجاهين: تُغلق البوابة التجريبية على بيئة التجريب نفسها،
 * أو تُسرّب رمز الدخول على إنترنت عام إن قُلبت.
 *
 * والمستودع له إشارة واحدة صحيحة: `APP_ENV` (development · staging ·
 * production)، تُفحص عند الإقلاع وتبني عليها `isProduction` و
 * `effectiveEnvironment`. وهذا الاختبار يمنع عودة الإشارة الخاطئة.
 */
const GUARDED = [
  'src/lib/payments/adapters/sandbox.ts',
  'src/lib/storage/dev-store.ts',
  'src/lib/domain/auth.ts',
  'src/lib/domain/integration-env.ts',
];

describe('حدّ البيئة يُقرأ من APP_ENV', () => {
  it('لا ملفَّ حارسٍ يفحص NODE_ENV', () => {
    const offenders = GUARDED.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .some((line) => line.includes('NODE_ENV'));
    });

    expect(offenders).toEqual([]);
  });

  it('وكلٌّ منها يستورد الإشارة الصحيحة', () => {
    for (const file of ['src/lib/payments/adapters/sandbox.ts', 'src/lib/storage/dev-store.ts']) {
      expect(readFileSync(file, 'utf8')).toMatch(/from '@\/lib\/env'/);
    }
  });
});
