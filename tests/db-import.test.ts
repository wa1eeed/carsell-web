import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══ وحدةٌ ترمي عند استيرادها لا تُستورَد ═══
 *
 * `next build` يستورد كلَّ مسارٍ ليجمع بياناته. و`src/lib/db.ts` كان
 * يفحص `DATABASE_URL` في صدره ويرمي، **فالبناء يسقط على كلّ بيئةٍ لا
 * `.env` فيها** — وهي حالُ أيّ بناءٍ داخل Dockerfile.
 *
 * ولم يظهر قطّ: محلّيًّا يقرأ Next ملفّ `.env`، وكوليفاي يمرّر
 * متغيّراته إلى البناء، و`build:check` يرث البيئة نفسها. **فأوّلُ
 * بناءٍ نظيف كشفه** — بعد شهور من «البناء يمرّ».
 *
 * ورسالةُ Next تتّهم غيرَ الجاني: «Failed to collect page data for
 * /api/cron/run»، ومسارُها يتبدّل بترتيب الجمع.
 *
 * فالفحص هنا على **الشكلين معًا**: يُستورَد بلا متغيّر، ويرمي الرسالة
 * نفسَها عند أوّل استعمال. ولو عاد الفحص إلى صدر الملفّ سقط الأوّل.
 */

type GlobalWithPrisma = { prisma?: unknown };

const saved = process.env.DATABASE_URL;
const g = globalThis as GlobalWithPrisma;
const savedGlobal = g.prisma;

afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
  g.prisma = savedGlobal;
  vi.resetModules();
});

describe('عميلُ القاعدة يُستورَد بلا بيئة', () => {
  it('الاستيرادُ بلا DATABASE_URL لا يرمي', async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete g.prisma;

    const loaded = await import('@/lib/db');
    expect(loaded.db).toBeDefined();
  });

  it('وأوّلُ استعمالٍ يرمي بالرسالة نفسِها', async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete g.prisma;

    const { db } = await import('@/lib/db');
    expect(() => db.user).toThrow(/DATABASE_URL/);
  });

  it('وبالمتغيّر يعمل كما كان', async () => {
    vi.resetModules();
    g.prisma = undefined;
    delete g.prisma;
    process.env.DATABASE_URL = saved ?? 'postgresql://x@127.0.0.1:5432/x';

    const { db } = await import('@/lib/db');
    expect(typeof db.user.findFirst).toBe('function');
    expect(typeof db.$transaction).toBe('function');
  });
});
