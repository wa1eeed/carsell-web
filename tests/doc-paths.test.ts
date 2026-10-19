import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** جذورُ المستودع — ونصٌّ بلا جذرٍ ليس مسارًا يُفحص. */
const ROOTS = [
  'src/', 'scripts/', 'prisma/', 'tests/', 'docs/',
  'public/', 'eslint-rules/', 'design/', '.github/',
];
const PATH_RE =
  /`([A-Za-z0-9_][A-Za-z0-9_\-./[\]@]*\.(?:ts|tsx|mjs|js|json|css|md|sql|prisma|yml|yaml|sh|webp|png|svg))`/g;
const GONE = /محذوف|حُذف|removed|deleted|no longer exists/;

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * ═══ وثيقةٌ تذكر مسارًا لا وجود له ═══
 *
 * **والمرجعُ الميّت لا يشكو منه شيء**: يقرؤه القارئ فيبحث عمّا حُذف أو
 * نُقل، ويظنّ الخللَ في فهمه. وهو أرخصُ أوجه تعفّن التوثيق حراسةً.
 *
 * وقِيس قبل التفعيل: **١٧٩ مرجعًا فريدًا، اثنان مكسوران** — فدون حدّ
 * العشرة. وكلاهما `totp` من مصادقةٍ ثنائية ألغاها المصمّم، وأحدُهما
 * قسمٌ كامل يصف الميزة **بصيغة الحاضر**. (طلب المالك ٢٠٢٦-١٠-١٩.)
 */
describe('كل مسار تذكره وثيقة موجود', () => {
  it('لا مرجع مكسور في أي وثيقة', () => {
    const broken: string[] = [];
    for (const file of markdownFiles(join(ROOT, 'docs'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const match of line.matchAll(PATH_RE)) {
          const target = match[1] ?? '';
          if (!ROOTS.some((root) => target.startsWith(root))) continue;
          if (existsSync(join(ROOT, target))) continue;
          if (GONE.test(line)) continue;
          broken.push(`${file.replace(`${ROOT}/`, '')}:${String(index + 1)} → ${target}`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  /**
   * **والبوابةُ تُقاس بكسرِ ما تحرسه** — ولولاه لمرّت خضراءَ عمياء،
   * وهو ما وقع للبوابات ٥٠ و٥٢ و١٩ قبل أن تُقاس.
   */
  it('والبوابة ترد مسارا مخترعا، وتقبل ما قيل إنه محذوف', () => {
    const probe = join(ROOT, 'docs/_gate-probe.md');
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

    try {
      writeFileSync(probe, 'مرجعٌ مكسور: `src/lib/no-such-file.ts`\n', 'utf8');
      const caught = run();
      expect(caught).toContain('src/lib/no-such-file.ts');

      /** **والتاريخُ يبقى مقروءًا**: ما قيل إنّه محذوف يمرّ. */
      writeFileSync(probe, 'مرجعٌ محذوف: `src/lib/no-such-file.ts`\n', 'utf8');
      expect(run()).not.toContain('src/lib/no-such-file.ts');
    } finally {
      rmSync(probe, { force: true });
    }
  }, 60_000);

  /**
   * **وأوّلُ ما أخرجته البوابة كذبةٌ حقيقية**: قسمٌ يصف TOTP بصيغة
   * الحاضر بعد حذفه — ميزةٌ تَعِد بها الوثيقةُ ولا يملكها المنتج.
   */
  it('ووثيقة دخول الأدمن لا تعد بمصادقة ثنائية', () => {
    const doc = readFileSync(join(ROOT, 'docs/api/admin-auth.md'), 'utf8');
    expect(doc).toContain('## TOTP — removed');
    expect(doc).toContain('There is no second factor');
    /** ولا يبقى في المنتج ما ينفّذها. */
    expect(existsSync(join(ROOT, 'src/lib/auth/totp.ts'))).toBe(false);
  });
});
