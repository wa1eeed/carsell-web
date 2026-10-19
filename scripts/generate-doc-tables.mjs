#!/usr/bin/env node
/**
 * ═══ جدولان يُولَّدان من الشيفرة — والنثرُ حولهما يبقى ═══
 *
 * قِيس التوثيقُ ٢٠٢٦-١٠-١٩ فخرج أنّ ٨٥٪ منه بلا حارس، وخمسةُ أعطالٍ
 * قائمة. اثنان منها هنا، ويموتان إلى الأبد:
 *
 *   · `workflows/scheduler.md` يقول «ثلاث عشرة وظيفة» والسجلُّ سبعَ
 *     عشرة، ولا يعرف `recomputePriceStats` المضافة في جلستها.
 *   · لا وثيقةَ تعدّ شاشات اللوحة: ٤٥ مجلّدًا و٣٩ بندَ ملاحة، وستٌّ
 *     بلا باب — وهو الصنف الذي أُغلق في هذا المستودع إحدى عشرة مرّة.
 *
 * ═══ والمولِّدُ يحفظ ما لا يستطيع كتابته ═══
 *
 * عمودُ «لماذا هنا» في جدول المُجدوِل **لا يُشتقّ**: ترتيبُ الوظائف
 * حاملٌ لمعنًى (التذكير بعد الإغلاق لا قبله)، وتوليدٌ يمسحه يشتري
 * الصحّةَ بثمن الفهم. فالمولِّد يقرأ الجدول القائم ويحتفظ بملاحظة كلّ
 * وظيفة باسمها، ويُخرج الصفوف **بترتيب الشيفرة**؛ ووظيفةٌ جديدة تأتي
 * بملاحظةٍ فارغة فيرفضها `--check` — فلا تمرّ بلا أن يكتب أحدٌ سببَها.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './strip-comments.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const check = process.argv.includes('--check');
const problems = [];

/** علامتا الكتلة المولَّدة — ما بينهما يُكتب آليًّا، وما حولهما بيد. */
const OPEN = '<!-- generated:begin -->';
const CLOSE = '<!-- generated:end -->';

function replaceBlock(path, body, label) {
  const full = join(ROOT, path);
  let current = '';
  try {
    current = readFileSync(full, 'utf8');
  } catch {
    problems.push(`${path} مفقود`);
    return;
  }

  const start = current.indexOf(OPEN);
  const end = current.indexOf(CLOSE);
  if (start === -1 || end === -1 || end < start) {
    problems.push(`${path} بلا كتلة مولَّدة — أضِف ${OPEN} و${CLOSE}`);
    return;
  }

  const next =
    current.slice(0, start + OPEN.length) + '\n' + body.trimEnd() + '\n' + current.slice(end);

  if (check) {
    if (next !== current) problems.push(`${path} قديم — شغّل npm run docs:generate`);
    else console.log(`✓ ${label} مطابق`);
    return;
  }
  if (next !== current) writeFileSync(full, next);
  console.log(`✓ ${label} → ${path}`);
}

// ————— ١ · جدول وظائف المُجدوِل —————
const SCHEDULER = join('docs', 'workflows', 'scheduler.md');

function jobNames() {
  const source = stripComments(readFileSync(join(ROOT, 'src/lib/jobs/run.ts'), 'utf8'));
  const list = source.slice(source.indexOf('const JOBS'));
  return [...list.matchAll(/\{\s*name:\s*'([A-Za-z]+)'/g)].map((match) => match[1]);
}

/** ملاحظةُ كلّ وظيفة من الجدول القائم — فلا يمحو التوليدُ ما كُتب بيد. */
function keptNotes() {
  const notes = new Map();
  let text = '';
  try {
    text = readFileSync(join(ROOT, SCHEDULER), 'utf8');
  } catch {
    return notes;
  }
  for (const row of text.matchAll(/^\|\s*\d+\s*\|\s*`(\w+)`\s*\|\s*(.*?)\s*\|\s*$/gm)) {
    notes.set(row[1], row[2]);
  }
  return notes;
}

const jobs = jobNames();
const notes = keptNotes();
const missingNote = jobs.filter((job) => (notes.get(job) ?? '').trim() === '');

const jobTable = [
  `The registry holds **${String(jobs.length)}** jobs, in this order.`,
  '',
  '| # | Job | Why here |',
  '| --- | --- | --- |',
  ...jobs.map(
    (job, index) => `| ${String(index + 1)} | \`${job}\` | ${notes.get(job) ?? ''} |`,
  ),
].join('\n');

replaceBlock(SCHEDULER, jobTable, `جدول المُجدوِل — ${String(jobs.length)} وظيفة`);

if (missingNote.length > 0) {
  problems.push(
    `docs/workflows/scheduler.md  وظيفةٌ بلا «لماذا هنا»: ${missingNote.join('، ')} — ` +
      'الترتيب حاملٌ لمعنًى، ووظيفةٌ بلا سببٍ مكتوب تُنقل بلا أن يعرف أحدٌ ما تكسره.',
  );
}

// ————— ٢ · فهرس شاشات اللوحة —————
const SCREENS = join('docs', 'architecture', 'admin-screens.md');

function navEntries() {
  const source = readFileSync(join(ROOT, 'src/components/admin/nav.ts'), 'utf8');
  const clean = stripComments(source);
  const groups = [];
  let current = null;
  for (const line of clean.split('\n')) {
    const title = line.match(/title:\s*'([^']+)'/);
    if (title !== null) {
      current = { title: title[1], items: [] };
      groups.push(current);
      continue;
    }
    /**
     * **والحقولُ تُقرأ فرادى لا بنمطٍ واحد.** أوّلُ نسخةٍ اشترطت
     * `permission` في السطر، **وثلاثةُ بنودٍ بلا صلاحية** (التقارير
     * والحملات وإشعارات الجوال) — فخرج الفهرس ناقصًا ثلاثًا وأعلن
     * شاشاتها «بلا باب» وهي في الشريط. ووثيقةٌ مولَّدة تكذب أسوأ من
     * وثيقةٍ مكتوبة بيد، لأنّ قارئها يصدّقها.
     */
    const href = line.match(/href:\s*('(\/admin[^']*)'|null)/);
    const label = line.match(/label:\s*'([^']+)'/);
    if (href !== null && label !== null && current !== null) {
      current.items.push({
        label: label[1],
        /**
         * **والبندُ المعطَّل يُدرَج ولا يُسقَط.** `href: null` شاشةٌ
         * لم تُصمَّم بعد، تُعرض بوسم «قريبًا» — وإسقاطُها من الفهرس
         * يجعل الوثيقةَ تقول إنّ الشريط أقصرُ ممّا هو.
         */
        href: href[2] ?? null,
        permission: line.match(/permission:\s*'([^']+)'/)?.[1] ?? '',
        description: line.match(/description:\s*'([^']*)'/)?.[1] ?? '',
      });
    }
  }
  return groups;
}

/**
 * **وسببُ الوصول يُكتب في الوثيقة لا في المولِّد.** قائمةٌ في الأداة
 * مصدرٌ ثانٍ يتباعد، والمولِّد يحفظ ما كُتب كما يحفظ ملاحظات الوظائف.
 */
function keptReach() {
  const reach = new Map();
  let text = '';
  try {
    text = readFileSync(join(ROOT, SCREENS), 'utf8');
  } catch {
    return reach;
  }
  for (const row of text.matchAll(/^\|\s*`\/admin\/([a-z-]+)`\s*\|\s*(.*?)\s*\|\s*$/gm)) {
    reach.set(row[1], row[2]);
  }
  return reach;
}

const groups = navEntries();
const reached = keptReach();
const linked = new Set(
  groups.flatMap((group) =>
    group.items.flatMap((item) => (item.href === null ? [] : [item.href.replace('/admin/', '')])),
  ),
);
const folders = readdirSync(join(ROOT, 'src/app/admin'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const orphans = folders.filter((folder) => !linked.has(folder));
const total = groups.reduce((sum, group) => sum + group.items.length, 0);

const screenTable = [
  `**${String(total)}** entries in the sidebar, across ${String(groups.length)} groups, against`,
  `**${String(folders.length)}** folders under \`src/app/admin\`.`,
  '',
  ...groups.flatMap((group) => [
    `### ${group.title}`,
    '',
    '| Screen | Path | Permission | What it is for |',
    '| --- | --- | --- | --- |',
    ...group.items.map(
      (item) =>
        `| ${item.label} | ${item.href === null ? '— قريبا' : `\`${item.href}\``} | ${item.permission === '' ? '—' : `\`${item.permission}\``} | ${item.description} |`,
    ),
    '',
  ]),
  '### Folders with no sidebar entry',
  '',
  'A screen with no door is the class this repository has closed eleven times,',
  'so the ones that are reached another way are listed rather than assumed.',
  '',
  '| Folder | How it is reached |',
  '| --- | --- |',
  ...orphans.map((folder) => `| \`/admin/${folder}\` | ${reached.get(folder) ?? ''} |`),
].join('\n');

replaceBlock(SCREENS, screenTable, `فهرس شاشات اللوحة — ${String(total)} بندًا`);

const unexplained = orphans.filter((folder) => (reached.get(folder) ?? '').trim() === '');
if (unexplained.length > 0) {
  problems.push(
    `docs/architecture/admin-screens.md  شاشةٌ بلا بند ملاحة ولا سببٍ معلَن: ${unexplained.join('، ')}`,
  );
}

if (problems.length > 0) {
  console.error('\n✗ جداول التوثيق:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('');
  process.exit(1);
}
