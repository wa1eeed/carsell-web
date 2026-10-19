import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REQUIRED_APPROVALS } from '@/lib/domain/approvals';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const ADMIN = join(ROOT, 'src/app/admin');

const screens = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return screens(full);
    return entry.endsWith('.tsx') ? [full] : [];
  });

/**
 * ═══ كلامُ الشاشة يطابق رقمَ القاعدة ═══
 *
 * أُلغي نصابُ العضوين (ROADMAP §٣٥) **وبقيت اللوحة تقول للمشغّل إنّ
 * إجراءه ينتظر عضوًا ثانيًا في اثنتين وأربعين جملة عبر إحدى عشرة
 * شاشة** — أخطرُها «هذه الضغطة لا تحرك المبلغ» فوق زرٍّ صار يُفرج عن
 * الضمان فورًا. **والوعدُ يبقى بعد حذف ما وعد به ما لم يُفتَّش عن نصّه.**
 */
describe('نصوص اللوحة تطابق القاعدة النافذة', () => {
  it('لا شاشة تعد بعضو ثانٍ ما دام النصاب واحدًا', () => {
    expect(REQUIRED_APPROVALS).toBe(1);

    /** العلاماتُ بمهربها — كما في البوابة، ولنفس السبب. */
    const promise =
      /(\u0639\u0636\u0648\u064A\u0646|\u0639\u0636\u0648\u064B?\u0627 \u0622\u062E\u0631|\u0639\u0636\u0648 \u062B\u0627\u0646\u064D|\u0639\u0636\u0648 \u062B\u0627\u0646\u064A|\u0639\u0636\u0648\u064B?\u0627 \u062B\u0627\u0646\u064A\u064B?\u0627|\u0645\u0648\u0627\u0641\u0642\u0629 \u0634\u062E\u0635\u064A\u0646|\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629)/

    const offenders = screens(ADMIN)
      .flatMap((file) =>
        stripComments(readFileSync(file, 'utf8'))
          .split('\n')
          .map((line, index) => ({ file, index, line }))
          .filter((row) => promise.test(row.line)),
      )
      .map((row) => `${row.file.slice(ROOT.length + 1)}:${String(row.index + 1)}`);

    expect(offenders).toEqual([]);
  });

  /**
   * **والإفراجُ صار يقع بالضغطة** — فالتحذير فوقه يقول ذلك. وشاشةٌ
   * تقول «لا تحرك المبلغ» فوق زرٍّ يحرّكه أخطرُ من شاشةٍ صامتة.
   */
  it('وشاشة الضمان تقول إن الضغطة تفرج فورًا', () => {
    const table = readFileSync(join(ADMIN, 'settlements/SettlementsTable.tsx'), 'utf8');
    expect(table).toContain('تفرج عن المبلغ فورا');
    expect(table).not.toContain('لا تحرك المبلغ');
  });

  /**
   * **والصرفُ مرحلتان بطبعه** — مرجعُ الحوالة لا يُملَك ساعة الطلب.
   * فنصُّه يقول الخطوتين، لا «عضوًا ثانيًا».
   */
  it('وشاشتا الصرف تقولان الخطوتين', () => {
    for (const path of ['payouts/PayoutsTable.tsx', 'provider-payouts/ProviderPayoutsTable.tsx']) {
      const source = readFileSync(join(ADMIN, path), 'utf8');
      expect(source, path).toContain('مرجع الحوالة');
      expect(source, path).toContain('لا تحرك المبلغ');
    }
  });

  /** **والبوابةُ تُقاس بكسرِ ما تحرسه** — وتقرأ الرقمَ لا تحفظه. */
  it('والبوابة ٦٦ ترد النصَّ الكاذب وتسكت إن رُفع النصاب', () => {
    const target = join(ADMIN, 'payouts/page.tsx');
    const original = readFileSync(target, 'utf8');
    const quorum = join(ROOT, 'src/lib/domain/approvals.ts');
    const rule = readFileSync(quorum, 'utf8');

    const run = (): string => {
      try {
        execFileSync('node', ['scripts/check-tokens.mjs'], {
          cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
        return '';
      } catch (error) {
        return String((error as { stderr?: string }).stderr ?? '');
      }
    };

    const lying = original.replace('على خطوتين', 'ويحتاج التسجيل موافقة شخصين —');
    try {
      writeFileSync(target, lying, 'utf8');
      expect(run()).toContain('payouts/page.tsx');

      // ورفعُ النصاب يجعل الكلامَ نفسَه صحيحًا — فتسكت البوابة
      writeFileSync(quorum, rule.replace('REQUIRED_APPROVALS = 1', 'REQUIRED_APPROVALS = 2'), 'utf8');
      expect(run()).not.toContain('payouts/page.tsx');
    } finally {
      writeFileSync(target, original, 'utf8');
      writeFileSync(quorum, rule, 'utf8');
    }
  }, 120_000);
});
