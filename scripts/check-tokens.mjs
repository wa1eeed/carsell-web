#!/usr/bin/env node
/**
 * بوابة الجودة — القسم ١٤ من BUILD-WEB-ADMIN.md
 *
 *  ٤. لا لون سادس عشري (ولا rgb/hsl) في src/components و src/app.
 *  ٥. لا رقم Latin يسبق كلمة عربية في نص الواجهة.
 *  ٦. لا سطر بيانات مبنيّ كنصّ واحد — الفصل بالتخطيط لا بالنصّ
 *     (DESIGN-DECISIONS · بعد المهمة ١).
 *
 * قائمة الاستثناءات في القاعدة ٥ من DESIGN-DECISIONS.md بند ٧:
 * العدّادات HH:MM:SS · المعرّفات · اللوحة · الرموز الفنية —
 * وكلّها لا يليها حرف عربي، فالفحص أدناه لا يمسّها.
 *
 * الملف الوحيد المسموح فيه بقيَم لونية خام: src/app/globals.css.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const TOKENS_FILE = join('src', 'app', 'globals.css');

const SCAN_DIRS = [join('src', 'app'), join('src', 'components')];
const SCAN_EXT = new Set(['.ts', '.tsx', '.css']);

const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(/;

/** رقم لاتيني يليه (بمسافة واحدة على الأكثر) حرف عربي. */
const LATIN_BEFORE_ARABIC = /[0-9] ?[ء-ي]/;

/** الفاصل الوسطي — لا يجوز أن يعيش داخل سلسلة ترجمة. */
const MIDDLE_DOT = /·/;

/** متغيّر ICU (`{count}`) أو رقم صريح (لاتيني أو عربي-هندي). */
const NUMERIC_CONTENT = /\{[^}]+\}|[0-9٠-٩]/;

/** @type {string[]} */
const problems = [];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

// ————— القاعدة ٤: لا لون خام خارج ملف التوكنات —————
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (rel === TOKENS_FILE || rel === TOKENS_FILE.split(sep).join('/')) continue;

    const ext = file.slice(file.lastIndexOf('.'));
    if (!SCAN_EXT.has(ext)) continue;

    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const match = line.match(COLOUR_LITERAL);
      if (match) {
        problems.push(
          `${rel}:${i + 1}  لون مكتوب «${match[0]}» — استخدم توكنات globals.css`,
        );
      }
    });
  }
}

// ————— القاعدتان ٥ و٦: نصوص الواجهة —————
/**
 * @param {unknown} node
 * @param {string} path
 * @param {string} file
 * @param {boolean} checkArabicDigits
 */
function walkMessages(node, path, file, checkArabicDigits) {
  if (typeof node === 'string') {
    if (checkArabicDigits && LATIN_BEFORE_ARABIC.test(node)) {
      problems.push(
        `${file}:${path}  رقم Latin يسبق كلمة عربية — استخدم الأرقام العربية-الهندية`,
      );
    }
    // القاعدة ٦: «·» + رقم داخل سلسلة واحدة = سطر بيانات مبنيّ كنصّ.
    // ينزلق الفاصل إلى الجهة الخطأ في RTL، ولا يمكن عزل مقاطعه.
    if (MIDDLE_DOT.test(node) && NUMERIC_CONTENT.test(node)) {
      problems.push(
        `${file}:${path}  «·» ورقم في سلسلة واحدة — افصل المقاطع بالتخطيط ولُفّ كلًّا منها بـ bidi-isolate`,
      );
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walkMessages(value, path ? `${path}.${key}` : key, file, checkArabicDigits);
    }
  }
}

for (const locale of ['ar', 'en']) {
  const file = `src/messages/${locale}.json`;
  try {
    walkMessages(
      JSON.parse(readFileSync(join(ROOT, 'src', 'messages', `${locale}.json`), 'utf8')),
      '',
      file,
      locale === 'ar',
    );
  } catch (error) {
    problems.push(`${file} — تعذّرت قراءته: ${String(error)}`);
  }
}

// ————— النتيجة —————
if (problems.length > 0) {
  console.error('\n✗ بوابة الجودة — القسم ١٤:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} مخالفة.\n`);
  process.exit(1);
}

console.log(
  '✓ بوابة الجودة: لا لون مكتوب · لا رقم Latin قبل كلمة عربية · لا سطر بيانات كنصّ واحد.',
);
