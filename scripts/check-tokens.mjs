#!/usr/bin/env node
/**
 * بوابة الجودة — القسم ١٤ من BUILD-WEB-ADMIN.md
 *
 *  ٤. لا لون سادس عشري (ولا rgb/hsl) في src/components و src/app.
 *  ٥. لا رقم Latin يسبق كلمة عربية في نص الواجهة.
 *  ٦. لا سطر بيانات مبنيّ كنصّ واحد — الفصل بالتخطيط لا بالنصّ
 *     (DESIGN-DECISIONS · بعد المهمة ١).
 *  ٧. لا `#` في جمع ICU عربي — يطبع أرقامًا لاتينية.
 *  ٨. كل `unit` مستعمل في الكود مصرَّح به في الوحدات وفي نوع `Unit`.
 *  ٩. لا رقم من قاعدة البيانات يُلصق في سلسلة نصّ معروضة.
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

/**
 * `#` داخل جمع ICU يطبع بـ`Intl.NumberFormat('ar')` — وهو **لاتيني**،
 * فتخرج «9 طلبات». الرقم يُصاغ في المكوّن ويُمرَّر متغيّرًا جاهزًا.
 */
const ICU_HASH = /\{[^{}]*\bplural\b/;

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
    // القاعدة ٧
    if (checkArabicDigits && ICU_HASH.test(node) && node.includes('#')) {
      problems.push(
        `${file}:${path}  «#» في جمع ICU يطبع أرقامًا لاتينية — مرّر الرقم مصاغًا في متغيّر`,
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

// ————— القاعدة ٨: الوحدات المصرَّح بها —————
/**
 * ثلاثة مصادر يجب أن تتطابق: نوع `Unit` في المكوّن، ومفاتيح `units`
 * في ar وen، وما يُستعمل فعلًا في الشاشات.
 *
 * الفحص لا يمنع وحدة **صحيحة نحويًا وخاطئة دلاليًا** («سيارتان» لعدّ
 * الفئات) — لكنه يجعل القائمة المصرَّح بها قصيرة وظاهرة، فيُرى الخطأ
 * في المراجعة بدل أن يختفي بين عشرات السلاسل.
 */
function checkUnits() {
  const quantityPath = join(ROOT, 'src', 'components', 'ui', 'Quantity.tsx');
  let declared;
  try {
    const source = readFileSync(quantityPath, 'utf8');
    const union = source.match(/export type Unit =([\s\S]*?);/);
    if (union === null) {
      problems.push('src/components/ui/Quantity.tsx — تعذّر قراءة نوع Unit');
      return;
    }
    declared = new Set([...union[1].matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1]));
  } catch {
    problems.push('src/components/ui/Quantity.tsx — غير موجود');
    return;
  }

  for (const locale of ['ar', 'en']) {
    const file = `src/messages/${locale}.json`;
    const messages = JSON.parse(
      readFileSync(join(ROOT, 'src', 'messages', `${locale}.json`), 'utf8'),
    );
    const keys = new Set(Object.keys(messages.units ?? {}));

    for (const unit of declared) {
      if (!keys.has(unit)) {
        problems.push(`${file}  الوحدة «${unit}» مصرَّحة في نوع Unit وغائبة عن الترجمة`);
      }
    }
    for (const key of keys) {
      if (!declared.has(key)) {
        problems.push(`${file}  الوحدة «${key}» في الترجمة وغائبة عن نوع Unit`);
      }
    }
  }

  // ما يُستعمل فعلًا في الشاشات
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      const source = readFileSync(file, 'utf8');
      // مقصور على <Quantity>: `unit` في StatCard لاحقة لا وحدة معدودة
      for (const tag of source.matchAll(/<Quantity\b[^>]*>/g)) {
        for (const match of tag[0].matchAll(/\bunit=(?:"([^"]+)"|\{'([^']+)'\})/g)) {
          const used = match[1] ?? match[2];
          if (used !== undefined && !declared.has(used)) {
            problems.push(`${rel}  الوحدة «${used}» مستعملة وغير مصرَّح بها في نوع Unit`);
          }
        }
      }
    }
  }
}

// ————— القاعدة ٩: لا رقم يُلصق في سلسلة نصّ معروضة —————
/**
 * `` `${item.title} ${item.year}` `` ينتج «كامري EX 2021» — أرقام
 * لاتينية في نصّ عربي. القاعدة ٥ لا تلتقطها: هي تفحص ملفّات
 * الترجمة، والرقم هنا يأتي من قاعدة البيانات وقت التشغيل.
 *
 * **المصدر يعرّف نفسه**: أسماء الحقول الرقمية تُقرأ من
 * `schema.prisma` وتُفكَّك إلى كلماتها (`mileageKm` ⇒ mileage · km)،
 * فكل حقل رقمي جديد يُحرَس تلقائيًا بلا تعديل هنا.
 *
 * **والفحص مقصور على سياق النصّ المعروض** — خاصية نصّية، أو سمة
 * نصّية، أو محتوى عنصر. أوّل صياغة منه شملت كل سلسلة، فأطلقت تسع
 * إنذارات كاذبة على نِسَب CSS ومفاتيح ترجمة. وقاعدة تُصدر ضجيجًا
 * تُعطَّل، والمعطَّلة أسوأ من غير الموجودة.
 */
const TEXT_CONTEXT = [
  // خاصية نصّية في كائن: `title: ` · `label: `
  /\b(title|label|name|text|description|summary|caption|heading|subtitle)\s*:\s*$/,
  // سمة نصّية في JSX: `title={` · `alt={` · `placeholder={`.
  // و`aria-label` **ليست** منها: قارئ الشاشة ينطق الرقم اللاتيني
  // صحيحًا، وتحويله عربيًّا-هنديًّا هناك لا يفيد أحدًا.
  /\b(title|alt|placeholder)=\{\s*$/,
  // محتوى عنصر: `>{`
  />\s*\{\s*$/,
];

function numericFieldWords() {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const words = new Set();
  for (const line of schema.split('\n')) {
    const match = line.match(/^\s{2}(\w+)\s+(Int|Float|Decimal|BigInt)\b/);
    if (match === null) continue;
    for (const word of match[1].split(/(?=[A-Z])/)) {
      const lower = word.toLowerCase();
      // ما دون ثلاثة أحرف يلتقط ما ليس رقمًا
      if (lower.length >= 3) words.add(lower);
    }
  }
  return words;
}

function checkStringifiedNumbers() {
  const words = numericFieldWords();
  if (words.size === 0) {
    problems.push('prisma/schema.prisma — لم يُقرأ أي حقل رقمي (القاعدة ٩ معطّلة فعليًا)');
    return;
  }

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      const source = readFileSync(file, 'utf8');

      for (const literal of source.matchAll(/`[^`]*`/g)) {
        if (!literal[0].includes('${')) continue;
        const before = source.slice(Math.max(0, literal.index - 60), literal.index);
        if (!TEXT_CONTEXT.some((context) => context.test(before))) continue;

        for (const slot of literal[0].matchAll(/\$\{([^}]+)\}/g)) {
          const name = slot[1].split(/[.?[\]]/).filter(Boolean).pop() ?? '';
          if ([...words].some((word) => name.toLowerCase().includes(word))) {
            const line = source.slice(0, literal.index).split('\n').length;
            problems.push(
              `${rel}:${line}  «${slot[0]}» رقم داخل سلسلة نصّ — استعمل <ArabicNumber> أو <Quantity>`,
            );
          }
        }
      }
    }
  }
}

checkUnits();
checkStringifiedNumbers();

// ————— النتيجة —————
if (problems.length > 0) {
  console.error('\n✗ بوابة الجودة — القسم ١٤:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} مخالفة.\n`);
  process.exit(1);
}

console.log(
  '✓ بوابة الجودة: لا لون مكتوب · لا رقم Latin قبل كلمة عربية · لا سطر بيانات كنصّ واحد · لا # في جمع ICU · الوحدات مصرَّح بها · لا رقم في سلسلة نصّ.',
);
