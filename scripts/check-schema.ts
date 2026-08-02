/**
 * معيار قبول المهمة ٢ في صورة قابلة للتشغيل:
 * كل جدول في مخطط القسم ٥ موجود وقابل للاستعلام عبر العميل.
 *
 * يقرأ قائمة النماذج من المخطط نفسه — فإن أُضيف نموذج ولم يُرحَّل، فشل الفحص.
 * التشغيل: npm run check:schema
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile();
} catch {
  // المتغيّرات من البيئة نفسها
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('✗ DATABASE_URL غير مضبوط — راجع .env.example');
  process.exit(1);
}

/** أسماء النماذج من المخطط، بأول حرف صغير كما يسمّيها العميل. */
const schema = readFileSync(
  join(process.cwd(), 'prisma', 'schema.prisma'),
  'utf8',
);
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => {
  const name = match[1] ?? '';
  return name.charAt(0).toLowerCase() + name.slice(1);
});

type Countable = { count: () => Promise<number> };

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ['error'],
  });

  const delegates = prisma as unknown as Record<string, Countable | undefined>;
  const failed: string[] = [];
  let ok = 0;

  for (const name of models) {
    const delegate = delegates[name];
    if (delegate === undefined) {
      failed.push(`${name} — لا يوجد في العميل المولَّد (شغّل prisma generate)`);
      continue;
    }
    try {
      await delegate.count();
      ok += 1;
    } catch (error) {
      const first = String(error).split('\n')[0] ?? '';
      failed.push(`${name} — ${first.slice(0, 140)}`);
    }
  }

  await prisma.$disconnect();

  if (failed.length > 0) {
    console.error(`\n✗ ${failed.length} نموذجًا غير قابل للاستعلام:\n`);
    for (const line of failed) console.error(`  ${line}`);
    console.error('\nهل نسيت `prisma migrate dev`؟\n');
    process.exit(1);
  }

  console.log(`✓ المخطط: ${ok} نموذجًا موجودًا وقابلًا للاستعلام.`);
}

void main();
