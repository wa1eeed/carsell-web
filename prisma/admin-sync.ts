import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { AdminRole } from '../src/generated/prisma/enums';
import {
  MIN_ADMIN_PASSWORD,
  provisionAdmin,
  provisionSuperAdmin,
} from '../src/lib/domain/admin-provision';

/**
 * ═══ مزامنة حساب الأدمن من البيئة ═══
 *
 * يُنفَّذ عند كل إقلاع، بعد الترحيلات وقبل الخادم. ويجعل تغيير
 * `ADMIN_PASSWORD` في لوحة النشر **تغييرًا يقع فعلًا** — لا متغيّرًا
 * يُقرأ عند الزرع وحده ثم يُنسى، فيظنّ صاحبه أنه بدّل كلمته وهي كما
 * كانت.
 *
 * ولا يُولَّد سرّ TOTP: أُلغيت المصادقة الثنائية بقرار المصمّم، والدخول
 * بالبريد والكلمة وحدهما.
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
  role_changed: '✓ مزامنة الأدمن: بُدّل الدور — وأُبطلت جلساته',
  unchanged: '· مزامنة الأدمن: لا تغيير',
} as const;

/** `tsx` يُخرج CJS هنا فلا يقبل await في المستوى الأعلى — كما في الزرع. */
/**
 * ═══ بقيّة الفريق — `ADMIN_TEAM` ═══
 *
 * صيغتُها `email:ROLE:password` مفصولةً بفاصلة منقوطة:
 *
 *   `ops@x.com:OPS:كلمة؛finance@x.com:FINANCE:كلمة`
 *
 * **ولمَ من النشر لا من اللوحة**: شاشة الفريق تقول صراحةً «لا يُنشأ
 * عضو ولا يُرفع دور من هنا — ذلك يمرّ بمتغيّرات النشر، فمن سرق
 * جلسةً لا يصنع لنفسه حسابًا ثانيًا». والقرار قائم، **والباب لم يكن
 * موجودًا**: التوفير يكتب `SUPER_ADMIN` حرفيًّا، فخمسةُ أدوارٍ من
 * ستّة لا تُنشأ بشيء.
 *
 * وسطرٌ معطوب يُقال ويُتخطّى — ولا يُسقِط مزامنةَ البقيّة.
 */
async function syncTeam(): Promise<void> {
  const raw = process.env.ADMIN_TEAM?.trim() ?? '';
  if (raw === '') return;

  const ROLES = new Set<AdminRole>(['SUPER_ADMIN', 'OPS', 'FINANCE', 'SUPPORT', 'CONTENT', 'READONLY']);

  for (const entry of raw.split(';')) {
    const text = entry.trim();
    if (text === '') continue;

    // الكلمة قد تحوي نقطتين، فالتقسيم على أوّل اثنتين وحدهما
    const first = text.indexOf(':');
    const second = text.indexOf(':', first + 1);
    if (first < 1 || second < 0) {
      console.error(`✗ الفريق: سطرٌ لا يطابق email:ROLE:password — «${text.slice(0, 24)}…»`);
      continue;
    }

    const memberEmail = text.slice(0, first).trim();
    const role = text.slice(first + 1, second).trim().toUpperCase() as AdminRole;
    const memberPassword = text.slice(second + 1);

    if (!ROLES.has(role)) {
      console.error(`✗ الفريق: دورٌ غير معروف «${role}» لـ${memberEmail}`);
      continue;
    }

    const outcome = await provisionAdmin(prisma, {
      email: memberEmail,
      password: memberPassword,
      role,
    });

    console.log(
      outcome.ok
        ? `${HEADLINE[outcome.outcome]} — ${memberEmail} (${role})`
        : `✗ الفريق: ${memberEmail} — ${outcome.reason}`,
    );
  }
}

async function main(): Promise<void> {
  const result = await provisionSuperAdmin(prisma, {
    email,
    password,
    ...(process.env.ADMIN_NAME === undefined || process.env.ADMIN_NAME === ''
      ? {}
      : { name: process.env.ADMIN_NAME }),
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

  /**
   * **وكلمة المرور لا تُطبع أبدًا** — ولا حتى في التطوير: من ضبطها
   * يعرفها، وطباعتُها تجعل سرًّا اختير بعناية مقروءًا لكل من يفتح
   * السجلّات، وإلى الأبد.
   */
  console.log(`${HEADLINE[result.outcome]}  —  ${email}`);

  // وبقيّة الفريق بعده — فلا يمنع عطلٌ في سطرٍ مزامنةَ السوبر أدمن
  await syncTeam();
}

main()
  .catch((error: unknown) => {
    console.error('✗ مزامنة الأدمن سقطت:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
