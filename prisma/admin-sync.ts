import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { MIN_ADMIN_PASSWORD, provisionSuperAdmin } from '../src/lib/domain/admin-provision';

/**
 * ═══ مزامنة حساب الأدمن من البيئة ═══
 *
 * يُنفَّذ عند كل إقلاع، بعد الترحيلات وقبل الخادم. ويجعل تغيير
 * `ADMIN_PASSWORD` في لوحة النشر **تغييرًا يقع فعلًا** — لا متغيّرًا
 * يُقرأ عند الزرع وحده ثم يُنسى، فيظنّ صاحبه أنه بدّل كلمته وهي كما
 * كانت.
 *
 * ═══ وغيابُ المتغيّرات ليس خطأً ═══
 *
 * من لا يريد هذا الباب يترك `ADMIN_EMAIL` فارغًا فلا يقع شيء —
 * والإقلاع يمضي. وسقوطُ الحاوية لأن مشغّلها لم يطلب ميزةً هو تحويل
 * الاختيار إلى عطل.
 *
 * ═══ وما يوقف الإقلاع ═══
 *
 * **كلمةٌ ضعيفة أو بريدٌ فاسد يوقفانه.** لأن المضيّ يعني خادمًا يعمل
 * ولوحةً لا تُدخَل — أو أسوأ: لوحةً بكلمةٍ قصيرة على عنوانٍ عامّ.
 * والفشل هنا صريحٌ في أوّل سطرٍ من السجلّ، لا صامتٌ يُكتشف عند الحاجة.
 */

try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

const email = process.env.ADMIN_EMAIL?.trim() ?? '';
const password = process.env.ADMIN_PASSWORD ?? '';

if (email === '' || password === '') {
  console.log('· مزامنة الأدمن: متخطّاة (ADMIN_EMAIL أو ADMIN_PASSWORD غير مضبوط)');
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ مزامنة الأدمن: DATABASE_URL غير مضبوط');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ['error'],
});

const HEADLINE = {
  created: '✓ مزامنة الأدمن: أُنشئ الحساب',
  password_set: '✓ مزامنة الأدمن: بُدّلت كلمة المرور',
  totp_reset: '✓ مزامنة الأدمن: أُعيد تسجيل TOTP',
  unchanged: '· مزامنة الأدمن: لا تغيير',
} as const;

/** `tsx` يُخرج CJS هنا فلا يقبل await في المستوى الأعلى — كما في الزرع. */
async function main(): Promise<void> {
  const result = await provisionSuperAdmin(prisma, {
    email,
    password,
    ...(process.env.ADMIN_NAME === undefined || process.env.ADMIN_NAME === ''
      ? {}
      : { name: process.env.ADMIN_NAME }),
    resetTotp: process.env.ADMIN_RESET_TOTP === '1',
  });

  if (!result.ok) {
    console.error(
      result.reason === 'WEAK_PASSWORD'
        ? `✗ مزامنة الأدمن: ADMIN_PASSWORD أقصر من ${MIN_ADMIN_PASSWORD} محرفًا.\n` +
            '  اللوحة تُفرج عن ضمانٍ وتطّلع على هويات، وعنوانها عامّ.\n' +
            '  ولّد واحدة:  openssl rand -base64 24'
        : `✗ مزامنة الأدمن: ADMIN_EMAIL ليس بريدًا صالحًا — «${email}»`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`${HEADLINE[result.outcome]}  —  ${email}`);

  /**
   * السرّ يُطبع مرّةً واحدة ولا يُخزَّن مقروءًا.
   *
   * **وكلمة المرور لا تُطبع أبدًا** — ولا حتى في التطوير: من ضبطها
   * يعرفها، وطباعتُها تجعل سرًّا اختير بعناية مقروءًا لكل من يفتح
   * السجلّات، وإلى الأبد.
   */
  if (result.totpSecret !== null) {
    console.log('');
    console.log('  ⚠ سرّ TOTP — احفظه الآن، لا يُطبع مرّةً ثانية:');
    console.log(`      ${result.totpSecret}`);
    console.log('    أضِفه يدويًّا في تطبيق المصادقة (Enter setup key).');
    console.log('');
  }
}

main()
  .catch((error: unknown) => {
    console.error('✗ مزامنة الأدمن سقطت:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
