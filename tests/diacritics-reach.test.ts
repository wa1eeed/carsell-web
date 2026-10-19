import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { isClippedNoun, CLIPPED_NOUNS } from '../scripts/clipped-nouns.mjs';

const ROOT = process.cwd();

/**
 * ═══ المسحُ بلغ الشيفرة ولم يبلغ المحتوى ═══
 *
 * البوابة ٦١ تقرأ `src/` و`seed-data/*.json` **ولا تقرأ
 * `prisma/migrations/*.sql`** — وقالبُ الفحص كلُّه زُرع بترحيل، فبقيت
 * أسماءُ بنوده مشكولةً في تقرير الفحص الذي يقرؤه المشتري. ومثلُه
 * أسماءُ التكاملات ونصُّ قوالب السيو في صفحات الهبوط العامّة.
 *
 * ولم يكشفه اختبارٌ بل **المشيُ على الصفحات**.
 */
describe('المسح يبلغ المحتوى لا الشيفرة وحدها', () => {
  const DIACRITIC = /[ً-ْٰ]/;

  /** الجداولُ المرجعية — يكتبها المشغّل أو البذرة، لا المستخدم. */
  const REFERENCE: readonly [string, readonly string[]][] = [
    ['integration', ['nameAr', 'failureBehavior']],
    ['seoTemplate', ['titleAr', 'introAr', 'outroAr']],
    ['adSlot', ['nameAr', 'placement']],
    ['inspectionItem', ['nameAr', 'nameEn']],
    ['inspectionCategory', ['nameAr', 'nameEn']],
    ['feature', ['nameAr']],
    ['service', ['nameAr']],
    ['notificationTemplate', ['subjectAr', 'bodyAr']],
  ];

  it('لا صف مرجعي في القاعدة يحمل تشكيلا', async () => {
    const dirty: string[] = [];
    for (const [model, columns] of REFERENCE) {
      const rows = (await (db as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[
        model
      ]?.findMany({ select: Object.fromEntries(columns.map((c) => [c, true])) })) ?? [];
      for (const row of rows) {
        for (const column of columns) {
          const value = row[column];
          if (typeof value === 'string' && DIACRITIC.test(value) && !isClippedNoun(value)) {
            dirty.push(`${model}.${column}: ${value.slice(0, 40)}`);
          }
        }
      }
    }
    expect(dirty).toEqual([]);
  });

  /**
   * **والبوابةُ تقرأ الترحيلات الآن** — ويُقاس ذلك بكسر ما تحرسه:
   * ترحيلٌ يكتب نصًّا معروضًا مشكولًا يجب أن يُردّ.
   */
  it('والبوابة ترد ترحيلا يكتب نصا مشكولا', () => {
    const probe = join(ROOT, 'prisma/migrations/29991230000000_diacritics_probe');
    mkdirSync(probe, { recursive: true });
    writeFileSync(
      join(probe, 'migration.sql'),
      "-- تعليقٌ مشكولٌ يبقى\nUPDATE \"Service\" SET \"nameAr\" = 'فحصٌ شامل' WHERE key='x';\n",
      'utf8',
    );
    try {
      let failed = false;
      let output = '';
      try {
        /**
         * **و`stderr` يُلتقط لا يُطبَع.** تركُه يسيل يجعل مخرَج
         * `verify` يحمل «✗ بوابة الجودة» والبوابةُ سليمة — ومن قرأ
         * الذيل حسبها سقطت. (وقعت في هذا الاختبار نفسِه.)
         */
        execFileSync('node', ['scripts/check-tokens.mjs'], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        failed = true;
        output = String((error as { stderr?: string }).stderr ?? '');
      }
      expect(failed).toBe(true);
      expect(output).toContain('29991230000000_diacritics_probe');
      /** **والتعليقُ لا يُحتسب** — تعليقاتُ هذا المستودع مشكولةٌ عمدًا. */
      expect(output).not.toContain('تعليقٌ مشكولٌ يبقى');
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
    /** تشغيلُ البوابة كاملةً يتجاوز المهلة الافتراضية. */
  }, 40_000);

  /**
   * **وفئةُ المسح تُكتب بمهاربها.** ملفُّ ترحيلٍ يكتبها بالعلامات
   * نفسِها يقع ضحيّةَ المسح التالي فيصير `[-]` بلا شكوى — وهو ما
   * يقوله ترحيلُ ١٨-١٠ في تعليقه ثمّ يخالفه في شيفرته.
   */
  it('وترحيل المسح الجديد يكتب فئته بالمهارب', () => {
    const sql = readFileSync(
      join(ROOT, 'prisma/migrations/20261019080000_strip_content_diacritics/migration.sql'),
      'utf8',
    );
    const body = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(DIACRITIC.test(body)).toBe(false);
    expect(body).toContain('u064B');
  });

  /** **والقائمةُ مصدرٌ واحد** — يقرؤها الماشي والبوابة معًا. */
  it('والمنقوص يُعرف في موضع واحد', () => {
    expect(isClippedNoun('مشترٍ')).toBe(true);
    expect(isClippedNoun('جارٍ')).toBe(true);
    expect(isClippedNoun('المكيّف')).toBe(false);
    expect(CLIPPED_NOUNS.length).toBeGreaterThan(10);

    const walker = readFileSync(join(ROOT, 'scripts/walk-surface.ts'), 'utf8');
    expect(walker).toContain('isClippedNoun');
    const gate = readFileSync(join(ROOT, 'scripts/check-tokens.mjs'), 'utf8');
    expect(gate).toContain('CLIPPED_NOUNS');
  });
});
