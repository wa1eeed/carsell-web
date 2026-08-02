import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * عميل Prisma واحد للعملية كلها.
 *
 * Prisma 7 يستقبل رابط الاتصال عبر مُهيّئ سائق لا من المخطط.
 * وفي التطوير يعيد Next تحميل الوحدات عند كل تعديل، فنحفظ العميل
 * على `globalThis` حتى لا تتراكم مجمّعات الاتصال حتى استنفاد Postgres.
 */

const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined || connectionString === '') {
  throw new Error('DATABASE_URL غير مضبوط — راجع .env.example');
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
