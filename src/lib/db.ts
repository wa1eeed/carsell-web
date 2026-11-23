import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * عميل Prisma واحد للعملية كلها.
 *
 * Prisma 7 يستقبل رابط الاتصال عبر مُهيّئ سائق لا من المخطط.
 * وفي التطوير يعيد Next تحميل الوحدات عند كل تعديل، فنحفظ العميل
 * على `globalThis` حتى لا تتراكم مجمّعات الاتصال حتى استنفاد Postgres.
 *
 * ═══ ووحدةٌ ترمي عند استيرادها لا تُستورَد ═══
 *
 * كان الفحص في صدر الملفّ، فـ**`next build` يسقط على كل بيئةٍ لا
 * `.env` فيها**: البناء يستورد كل مسارٍ ليجمع بياناته، فيرمي هذا عند
 * أوّل واحدٍ يلمس القاعدة. ولم يظهر قطّ — محلّيًّا يقرأ Next ملفّ
 * `.env`، وكوليفاي يمرّر متغيّراته إلى البناء. **فأوّلُ بناءٍ نظيف
 * (داخل Dockerfile بلا مُنسِّق يحقن البيئة) كشفه.**
 *
 * والرسالةُ تتّهم غيرَ الجاني: Next يطبع «Failed to collect page data
 * for /api/cron/run» — ومسارُها يتبدّل بترتيب الجمع، فيبحث القارئ في
 * مسارٍ سليم.
 *
 * فالعميل يُبنى عند أوّل استعمال لا عند الاستيراد، **والرسالة نفسُها
 * تبقى** — والحارس الحقيقيّ في `docker-entrypoint.sh`: يفحص المتغيّر
 * قبل الخادم ويطبع كلَّ ناقصٍ دفعةً واحدة.
 */

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL غير مضبوط — راجع .env.example');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let instance: PrismaClient | undefined;

function resolve(): PrismaClient {
  if (instance !== undefined) return instance;

  instance = globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = instance;
  return instance;
}

/**
 * العميل — يُبنى عند أوّل لمسةٍ له.
 *
 * والوسيط يمرّر كلَّ شيء إلى العميل الحقيقيّ: نماذجه (`db.user`)
 * ودوالَّه (`db.$transaction`). والدالّة تُربط بصاحبها، وإلّا ضاع
 * `this` داخلها.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolve();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, property, value) {
    return Reflect.set(resolve(), property, value);
  },
  has(_target, property) {
    return Reflect.has(resolve(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(resolve());
  },
});
