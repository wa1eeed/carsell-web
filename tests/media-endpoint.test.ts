import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const KEYS = [
  'MEDIA_ENDPOINT', 'MEDIA_REGION', 'MEDIA_ACCESS_KEY_ID', 'MEDIA_SECRET_ACCESS_KEY',
  'MEDIA_BUCKET', 'MEDIA_PUBLIC_URL',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL',
] as const;

const saved = new Map<string, string | undefined>();
function setEnv(values: Record<string, string | undefined>): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

/** الوحدةُ تقرأ البيئة عند النداء، فتُستورد طازجةً لكلّ حال. */
async function fresh() {
  vi.resetModules();
  return import('@/lib/r2');
}

/**
 * ═══ المخزنُ متغيّرُ بيئة لا مزوّدٌ مكتوب ═══
 *
 * كانت النقطةُ تُبنى على نطاق Cloudflare من `R2_ACCOUNT_ID`، فالانتقال
 * إلى مخزنٍ متوافقٍ مع S3 تعديلُ سطرٍ ونشر. **والتعليقُ فوق الملفّ كان
 * يَعِد بعكس ذلك** — وعدٌ بلا مقبض.
 */
describe('نقطة اتصال الوسائط', () => {
  it('وتشتق من حساب R2 حين لا تذكر — فنشر قائم لا يتغير', async () => {
    setEnv({
      R2_ACCOUNT_ID: 'acc123',
      R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKET: 'b', R2_PUBLIC_URL: 'https://media.example.sa',
    });
    const mod = await fresh();
    expect(mod.isR2Configured()).toBe(true);
  });

  /** **والمخزنُ غيرُ R2 لا يحتاج حسابَ R2 أصلًا.** */
  it('وتقبل نقطة صريحة بلا حساب R2', async () => {
    setEnv({
      MEDIA_ENDPOINT: 'https://oss-me-central-1.example.sa',
      MEDIA_REGION: 'me-central-1',
      MEDIA_ACCESS_KEY_ID: 'k', MEDIA_SECRET_ACCESS_KEY: 's',
      MEDIA_BUCKET: 'b', MEDIA_PUBLIC_URL: 'https://media.example.sa',
    });
    const mod = await fresh();
    expect(mod.isR2Configured()).toBe(true);
  });

  /** ولا نقطةَ ولا حساب ⇒ لا مخزن — ولا يُرفع شيء بصمت. */
  it('وبلا نقطة ولا حساب لا مخزن', async () => {
    setEnv({
      MEDIA_ACCESS_KEY_ID: 'k', MEDIA_SECRET_ACCESS_KEY: 's',
      MEDIA_BUCKET: 'b', MEDIA_PUBLIC_URL: 'https://media.example.sa',
    });
    const mod = await fresh();
    expect(mod.isR2Configured()).toBe(false);
  });

  /** **والفراغُ كالغياب** — متغيّرٌ مضبوطٌ على نصٍّ فارغ في لوحة نشر. */
  it('والمتغير الفارغ كالغائب', async () => {
    setEnv({
      MEDIA_ENDPOINT: '   ',
      MEDIA_ACCESS_KEY_ID: 'k', MEDIA_SECRET_ACCESS_KEY: 's',
      MEDIA_BUCKET: 'b', MEDIA_PUBLIC_URL: 'https://media.example.sa',
    });
    const mod = await fresh();
    expect(mod.isR2Configured()).toBe(false);
  });

  /**
   * ═══ ووجهةُ النسخ الاحتياطية تتبع القاعدة لا الوسائط ═══
   *
   * النسخةُ هي القاعدةُ كلُّها — سجلّاتُ العملاء وأرقامُ الهوية المشفّرة
   * والآيبانات. وكانت تُكتب إلى حاوية الوسائط نفسِها، فمن ينقل التطبيق
   * إلى سحابةٍ محلّية لأجل إقامة البيانات يبقى يشحن قاعدته يوميًّا إلى
   * خارجها وهو لا يدري.
   */
  it('ونسخة القاعدة لها وجهتها المستقلة، والتدريب يقرأ الوجهة نفسها', () => {
    const backup = readFileSync(join(ROOT, 'scripts/ops/backup.sh'), 'utf8');
    const drill = readFileSync(join(ROOT, 'scripts/ops/restore-drill.sh'), 'utf8');

    for (const [name, source] of [['backup', backup], ['drill', drill]] as const) {
      expect(source, name).toContain('BACKUP_ENDPOINT');
      expect(source, name).toContain('BACKUP_BUCKET');
      /** **ولا نطاقَ مزوّدٍ مكتوبًا إلّا في فرع السقوط المعلَن.** */
      const hard = source.split('\n').filter(
        (line) => line.includes('r2.cloudflarestorage.com') && !line.includes('R2_ACCOUNT_ID'),
      );
      expect(hard, name).toEqual([]);
    }
  });
});
