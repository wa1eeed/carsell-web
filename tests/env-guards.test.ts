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

/**
 * ═══ رمز الدخول لا يخرج خارج التطوير ═══
 *
 * **أخطر تسرّبٍ ممكن في هذا المنتج**: رمزٌ مكشوف على إنترنت عام يعني
 * انتحال أيّ رقم جوّال بضغطة — لا اختراق حساب، بل انتحال كل الحسابات.
 *
 * والفحص هنا على **المصدر** لا على السلوك: تشغيل الدالّة يتطلّب تغيير
 * `APP_ENV` وهو ثابتٌ يُقرأ عند الإقلاع، فيُقاس الشرط نفسه بدل أن
 * يُحاكى. ومن يحذف الشرط أو يبدّله بـ`NODE_ENV` يسقط هنا.
 */
describe('رمز الدخول محروس بـAPP_ENV', () => {
  it('يُعاد في التطوير وحده — والشرط على APP_ENV لا NODE_ENV', () => {
    const source = readFileSync('src/lib/domain/auth.ts', 'utf8');

    // يُعاد مشروطًا بـ`isDevelopment` — والأخيرة `APP_ENV === 'development'`
    expect(source).toMatch(/isDevelopment \? \{ devCode: code \} : \{\}/);
    expect(readFileSync('src/lib/env.ts', 'utf8')).toMatch(
      /isDevelopment = APP_ENV === 'development'/,
    );

    /*
      ولا يُعاد بلا شرط في أي موضع. وإعلانُ النوع (`devCode?: string`)
      ليس إعادةً — يصف ما قد يُعاد لا ما يُعاد.
    */
    const unconditional = source
      .split('\n')
      .filter((line) => line.includes('devCode') && !line.includes('isDevelopment'))
      .filter((line) => !/devCode\?:/.test(line))
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'));
    expect(unconditional).toEqual([]);
  });
});

/**
 * ═══ ما ليس إنتاجًا لا يُفهرَس ═══
 *
 * وstaging تُنشَر ببياناتٍ مزروعة: عشرات الإعلانات بأسعار وأرقام هياكل
 * وهمية. وفهرستُها **على النطاق الحقيقيّ** تُدخلها نتائج البحث، ثم
 * تنافس الحقيقية حين تأتي — وإخراجها يأخذ أسابيع.
 */
describe('الفهرسة محصورة بالإنتاج', () => {
  it('robots يمنع الكلّ خارج الإنتاج', async () => {
    const source = readFileSync('src/app/robots.ts', 'utf8');

    // الحدّ على البيئة لا على النطاق
    expect(source).toMatch(/if \(!isProduction\)/);
    expect(source).toMatch(/disallow: '\/'/);
    // ولا نطاق مكتوب في الشيفرة يبقى بعد تغييره
    expect(source).not.toMatch(/https:\/\/carsell\.one/);
  });
});

/**
 * ═══ حاجز البناء — سببه، وبوابتُه ═══
 *
 * **`next build` بـ`NODE_ENV=development` يسقط** عند تصدير `/404` بـ
 * «<Html> should not be imported outside of pages/_document» — رسالةٌ
 * لا تذكر `NODE_ENV` إطلاقًا، فيُبحث عن السبب في الشيفرة أسابيع وهو في
 * متغيّر بيئة. (وقع في هذا المستودع، وسُمّي أخيرًا في أوّل نشر.)
 *
 * والمرحلتان في الـDockerfile متمايزتان عمدًا: **الأولى تُثبّت**
 * بـ`development` لتأتي `devDependencies`، **والثانية تبني**
 * بـ`production` وتبعيّاتها منسوخةٌ من الأولى.
 */
describe('الـDockerfile يبني بـproduction ويُثبّت بـdevelopment', () => {
  it('مرحلة الاعتماديات development، ومرحلة البناء production', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');

    const deps = dockerfile.slice(dockerfile.indexOf('AS deps'), dockerfile.indexOf('AS build'));
    const build = dockerfile.slice(dockerfile.indexOf('AS build'), dockerfile.indexOf('AS run'));

    expect(deps).toMatch(/ENV NODE_ENV=development/);
    expect(deps).toMatch(/npm ci --include=dev/);

    // **والبناء لا يكون development أبدًا** — هو حاجز البناء بعينه
    expect(build).toMatch(/ENV NODE_ENV=production/);
    expect(build).not.toMatch(/ENV NODE_ENV=development/);
  });
});

/**
 * ═══ ما تحتاجه صورة التشغيل يُنسخ إليها ═══
 *
 * كل ملفٍّ ينساه الـDockerfile يظهر **عند الإقلاع لا عند البناء** —
 * فالبناء يمرّ والحاوية تموت، والرسالة تتّهم إعدادًا ناقصًا لا ملفًّا
 * غير منسوخ. وقع مرّتين: `prisma.config.ts` وتبعيّات أداة Prisma.
 */
describe('صورة التشغيل تحمل ما يلزم الترحيل', () => {
  it('المخطّط وملفّ الإعداد وأداة Prisma', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const run = dockerfile.slice(dockerfile.indexOf('AS run'));

    expect(run).toMatch(/COPY .*\/app\/prisma \.\/prisma/);
    // والأداة تُثبَّت في مجلّد معزول لا تُنسخ انتقائيًّا
    expect(run).toMatch(/\/opt\/prisma/);

    /*
      **والمخطّط والإعداد إلى جوار الأداة.** `prisma.config.ts` يستورد
      `prisma/config`، ومن `/app` لا يُحلّ — فالأداة ليست هناك.
    */
    expect(run).toMatch(/COPY .*\/app\/prisma \/opt\/prisma\/prisma/);
    expect(run).toMatch(/COPY .*prisma\.config\.ts \/opt\/prisma\/prisma\.config\.ts/);
  });

  /**
   * ═══ ونبضة المُجدوِل ═══
   *
   * `standalone` تحمل ما تتبّعه Next وحده، و`scripts/` ليست منه —
   * فبلا نسخٍ صريح لا يجد المُجدوِل ما يشغّله.
   *
   * **ولا `curl` في هذه الصورة**: `node:22-alpine` بلا أيّ `apk add`،
   * فأمرٌ يبدأ به يسقط بـ«curl: not found» ويقول المُجدوِل «failed»
   * ولا يذكر السبب. والوثيقة كانت تُملي `curl` سنةً كاملة.
   */
  it('ونبضة المُجدوِل منسوخة، ولا تعتمد على curl', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const run = dockerfile.slice(dockerfile.indexOf('AS run'));

    expect(run).toMatch(/COPY .*cron-tick\.mjs/);
    // ولا شيء يُثبّت `curl` — فلا يُملى في وثيقةٍ ولا يُستعمل في أمر
    expect(dockerfile).not.toMatch(/apk add[^\n]*curl/);

    const doc = readFileSync('docs/DEPLOY-STAGING.md', 'utf8');
    const section = doc.slice(doc.indexOf('## 3. The scheduler'), doc.indexOf('## 3b.'));
    expect(section).toMatch(/node scripts\/ops\/cron-tick\.mjs/);
    expect(section).not.toMatch(/```bash\ncurl/);
  });

  it('ونقطة الدخول تنادي الأداة من مكانها', () => {
    const entrypoint = readFileSync('docker-entrypoint.sh', 'utf8');
    // **من داخل** المجلّد — لا من `/app` باستدعاءٍ بمسار مطلق
    expect(entrypoint).toMatch(/cd \/opt\/prisma && \.\/node_modules\/\.bin\/prisma migrate deploy/);
    // الترحيل يسبق الخادم ويوقفه إن سقط
    expect(entrypoint).toMatch(/set -e/);
    expect(entrypoint.indexOf('migrate deploy')).toBeLessThan(entrypoint.indexOf('server.js'));
  });
});
