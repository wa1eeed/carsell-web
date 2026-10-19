import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ADMIN_NAV } from '@/components/admin/nav';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const SCHEDULER = join(ROOT, 'docs/workflows/scheduler.md');
const SCREENS = join(ROOT, 'docs/architecture/admin-screens.md');

const run = (file: string, args: string[] = []): string => {
  try {
    execFileSync('node', [file, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string };
    return `${e.stderr ?? ''}${e.stdout ?? ''}`;
  }
};

const docs = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return docs(full);
    return entry.endsWith('.md') ? [full] : [];
  });

/**
 * ═══ حُرّاسُ التوثيق ═══
 *
 * قِيس التوثيق ٢٠٢٦-١٠-١٩ فخرج أنّ ٨٥٪ منه بلا حارس، وخمسةُ أعطالٍ
 * قائمة. وهذه تُثبت أنّ الحُرّاس الثلاثة يعملون — **بكسرِ ما يحرسونه**،
 * فبوابةٌ لم تُقَس بكسرها قد تمرّ خضراءَ عمياء.
 */
describe('حراس التوثيق', () => {
  it('كل وثيقة تحمل تاريخ تحديثها', () => {
    const missing = docs(join(ROOT, 'docs'))
      .filter((path) => !path.endsWith('erd.md') && !path.endsWith('component-index.md'))
      .filter((path) => !/^_Last updated: \d{4}-\d{2}-\d{2}_$/m.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(ROOT.length + 1));
    expect(missing).toEqual([]);
  });

  /** **والبوابةُ تُقاس بكسرِ ما تحرسه** — في ثلاثة اتّجاهات. */
  it('والبوابة ٦٥ ترد الغياب والتقادم والمستقبل', () => {
    const target = join(ROOT, 'docs/RUNBOOK.md');
    const original = readFileSync(target, 'utf8');
    const swap = (line: string): void =>
      writeFileSync(target, original.replace(/^_Last updated: .*_$/m, line), 'utf8');

    try {
      swap('_Last updated: 2026-08-02_');
      expect(run('scripts/check-tokens.mjs')).toContain('RUNBOOK');

      writeFileSync(target, original.replace(/^_Last updated: .*_$\n\n/m, ''), 'utf8');
      expect(run('scripts/check-tokens.mjs')).toContain('Last updated');

      swap('_Last updated: 2099-01-01_');
      expect(run('scripts/check-tokens.mjs')).toContain('المستقبل');
    } finally {
      writeFileSync(target, original, 'utf8');
    }
  }, 120_000);

  /**
   * **وجدولُ المُجدوِل يُولَّد ولا يُكتب.** كان يقول «ثلاث عشرة وظيفة»
   * والسجلُّ سبعَ عشرة، ولا يعرف `recomputePriceStats` المضافة في
   * جلستها — وهي الوثيقةُ التي وُلدت من درسِ «المُجدوِل بلا سطر».
   */
  it('وكل وظيفة في السجل لها صف ولها سبب مكتوب', () => {
    const source = stripComments(readFileSync(join(ROOT, 'src/lib/jobs/run.ts'), 'utf8'));
    const jobs = [...source.slice(source.indexOf('const JOBS')).matchAll(/\{\s*name:\s*'([A-Za-z]+)'/g)]
      .map((match) => match[1] as string);
    expect(jobs.length).toBeGreaterThan(10);

    const doc = readFileSync(SCHEDULER, 'utf8');
    const rows = new Map(
      [...doc.matchAll(/^\|\s*\d+\s*\|\s*`(\w+)`\s*\|\s*(.*?)\s*\|\s*$/gm)].map((row) => [
        row[1] as string,
        row[2] as string,
      ]),
    );

    expect([...rows.keys()]).toEqual(jobs);
    expect(jobs.filter((job) => (rows.get(job) ?? '').trim() === '')).toEqual([]);
    expect(doc).toContain(`holds **${String(jobs.length)}** jobs`);
  });

  /** **وفهرسُ الشاشات من `nav.ts`** — ٤٥ مجلّدًا و٣٩ بندًا ولا وثيقةَ تعدّهما. */
  it('وكل بند ملاحة في الفهرس، وكل مجلد موصول أو معلن', () => {
    const doc = readFileSync(SCREENS, 'utf8');
    /** والبندُ المعطَّل (`href: null`) يُدرَج باسمه لا بمساره. */
    for (const item of ADMIN_NAV.flatMap((group) => group.items)) {
      if (item.href === null) {
        expect(doc, `${item.label} غائب عن الفهرس`).toContain(item.label);
        continue;
      }
      expect(doc, `${item.href} غائب عن الفهرس`).toContain(`\`${item.href}\``);
    }

    const linked = new Set(
      ADMIN_NAV.flatMap((group) => group.items).flatMap((item) =>
        item.href === null ? [] : [item.href.replace('/admin/', '')],
      ),
    );
    const folders = readdirSync(join(ROOT, 'src/app/admin'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const reach = new Map(
      [...doc.matchAll(/^\|\s*`\/admin\/([a-z-]+)`\s*\|\s*(.*?)\s*\|\s*$/gm)].map((row) => [
        row[1] as string,
        row[2] as string,
      ]),
    );
    const unexplained = folders
      .filter((folder) => !linked.has(folder))
      .filter((folder) => (reach.get(folder) ?? '').trim() === '');
    expect(unexplained).toEqual([]);
  });

  /** **والمولِّدُ يُقاس بكسرِ ما يولّده** — وإلّا مرّ `--check` أعمى. */
  it('و--check يرد جدولا تخلف عن الشيفرة', () => {
    const original = readFileSync(SCHEDULER, 'utf8');
    try {
      writeFileSync(SCHEDULER, original.replace(/^\| 17 \| .*$/m, ''), 'utf8');
      expect(run('scripts/generate-doc-tables.mjs', ['--check'])).toContain('scheduler.md');
    } finally {
      writeFileSync(SCHEDULER, original, 'utf8');
    }
  }, 60_000);
});
