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
 * ١٠. كل أداة لون في المكوّنات تشير إلى توكن معرَّف فعلًا.
 * ١١. كل ترحيل يمسّ المال له نصّ نقض بجواره.
 * ١٢. صفوف Prisma لا تعبر حدّ الخادم/العميل.
 * ١٣. لا نقطة في مفتاح ترجمة — next-intl يقرؤها تداخلًا.
 * ١٤. لا مكوّن عميل يصل إلى `db` عبر سلسلة استيرادات.
 * ١٥. مفردات المزوّد (authorize/capture/void) لا تعبر المُهايئ.
 *
 * قائمة الاستثناءات في القاعدة ٥ من DESIGN-DECISIONS.md بند ٧:
 * العدّادات HH:MM:SS · المعرّفات · اللوحة · الرموز الفنية —
 * وكلّها لا يليها حرف عربي، فالفحص أدناه لا يمسّها.
 *
 * الملف الوحيد المسموح فيه بقيَم لونية خام: src/app/globals.css.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
      /**
       * القاعدة ١٣: **النقطة في المفتاح تعني التداخل لا الحرف.**
       *
       * `"stage.advanced"` مفتاحًا مسطَّحًا يقرؤه next-intl مسارًا، فلا
       * يجده. وهو يصرخ في التطوير ويصمت في الإنتاج: النصّ يخرج مفتاحًا
       * خامًا أمام المستخدم. والمفتاح المشتقّ من قيمة قاعدة بيانات
       * (`t(`event.${row.type}`)`) هو أكثر ما يقع فيه.
       */
      if (key.includes('.')) {
        problems.push(
          `${file}:${path ? `${path}.` : ''}${key}  نقطة في مفتاح ترجمة — عشّشه بدل تسطيحه`,
        );
      }
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
        /**
         * مهرب موثَّق: كل بوابة تحتاج مخرجًا صريحًا، وإلا أُضعِفت
         * البوابة نفسها لتمرير حالة واحدة. والسبب مكتوب في السطر
         * فيراه المراجع — JSON-LD حقل آلة يتطلّب أرقامًا لاتينية.
         */
        const line = source.slice(0, literal.index).split('\n').length;
        const own = source.split('\n')[line - 1] ?? '';
        const previous = source.split('\n')[line - 2] ?? '';
        if (/check-9-ok:/.test(own) || /check-9-ok:/.test(previous)) continue;

        for (const slot of literal[0].matchAll(/\$\{([^}]+)\}/g)) {
          const name = slot[1].split(/[.?[\]]/).filter(Boolean).pop() ?? '';
          if ([...words].some((word) => name.toLowerCase().includes(word))) {
            problems.push(
              `${rel}:${line}  «${slot[0]}» رقم داخل سلسلة نصّ — استعمل <ArabicNumber> أو <Quantity>`,
            );
          }
        }
      }
    }
  }
}

// ————— القاعدة ١٠: أداة لون بلا توكن —————
/**
 * لوحة Tailwind **معطّلة** (`--color-*: initial`)، فأداةٌ تشير إلى
 * توكن غير معرَّف لا تُنتج خطأ — تُنتج **أسود** أو شفافًا. و`fill-accent-2`
 * ظهرت سوداء في مخطط الهيكل، و`bg-accent-2` قبلها في Wc: نفس العطب
 * مرّتين، فالبوابة بدل التصحيح الثالث.
 *
 * الأسماء تُقرأ من `globals.css` نفسه — إضافة توكن جديد تُحرَس تلقائيًا،
 * وحذف توكن يُظهر مستعمليه فورًا.
 */
const COLOUR_UTILITIES =
  /\b(?:bg|text|border|fill|stroke|ring|outline|decoration|divide|shadow|from|via|to|accent|caret|placeholder)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/\d{1,3})?\b/g;

/**
 * جانب الحدّ ليس لونًا: `border-b` و`border-s` اتجاه، و`border-b-2`
 * سماكة. اللون — إن وُجد — هو ما بعد الاتجاه.
 */
const EDGES = new Set(['t', 'b', 'l', 'r', 's', 'e', 'x', 'y']);

/** ما ليس لونًا وإن شارك البادئة: `text-sm` مقاس و`shadow-lg` ظلّ. */
const NOT_COLOURS = new Set([
  'sm', 'md', 'lg', 'xl', 'xs', 'base', 'auto', 'none', 'full', 'solid', 'dashed',
  'dotted', 'double', 'hidden', 'left', 'right', 'center', 'start', 'end', 'justify',
  'top', 'bottom', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
  'inherit', 'initial', 'unset', 'revert', 'contain', 'cover', 'fixed', 'local',
  'scroll', 'repeat', 'round', 'space', 'reverse', 'offset', 'inset', 'collapse',
  'separate', 'spacing', 'display', 'num', 'body', 'heading', 'page', 'thumb',
  'isolate', 'ltr', 'nums', 'tabular', 'current', 'transparent', 'loose', 'snug',
  'tight', 'relaxed', 'normal', 'bold', 'medium', 'semibold', 'extrabold', 'light',
  'thin', 'black', 'wide', 'wider', 'widest',
]);

/** يعيد اسم اللون المقصود، أو `null` إن لم تكن الأداة لونًا أصلًا. */
function colourName(raw) {
  const parts = raw.split('-');
  // اتجاه في الصدارة: `border-b-line` ⇒ line · `border-b` ⇒ لا لون
  if (parts.length > 0 && EDGES.has(parts[0])) parts.shift();
  const name = parts.join('-');
  if (name === '') return null;
  // كلمة غير لونية في الصدارة تكفي: `outline-offset-2` إزاحة لا لون
  if (NOT_COLOURS.has(name) || NOT_COLOURS.has(parts[0] ?? '')) return null;
  // أرقام السلّم وكسوره: `2` · `0.5` · `3xs`
  if (/^\d/.test(name)) return null;
  return name;
}

function declaredColours() {
  const css = readFileSync(join(ROOT, TOKENS_FILE), 'utf8');
  const names = new Set();
  for (const match of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) names.add(match[1]);
  return names;
}

function checkColourUtilities() {
  const declared = declaredColours();
  if (declared.size === 0) {
    problems.push(`${TOKENS_FILE} — لم يُقرأ أي توكن لون (القاعدة ١٠ معطّلة فعليًا)`);
    return;
  }

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      const source = readFileSync(file, 'utf8');

      const seen = new Set();
      for (const match of source.matchAll(COLOUR_UTILITIES)) {
        const name = colourName(match[1] ?? '');
        if (name === null || declared.has(name) || seen.has(name)) continue;
        seen.add(name);
        problems.push(`${rel}  «${match[0]}» يشير إلى توكن غير معرَّف — سيُرسم أسود`);
      }
    }
  }
}

// ————— القاعدة ١١: ترحيل ماليّ بلا نقض —————
/**
 * ترحيل يمسّ جدول مال يحتاج طريق عودة **مكتوبًا وقت كتابته**، لا وقت
 * الحاجة إليه: من يكتب النقض تحت ضغط عطلٍ في الإنتاج يكتبه خطأً.
 *
 * والجداول تُعرَّف بأسمائها لا بحدسٍ: ما يحمل مبلغًا أو التزامًا ماليًّا.
 * والنصّ لا يُفحَص محتواه — يُفحَص وجوده. محتواه مسؤولية من كتبه، ووجوده
 * هو ما يُنسى.
 */
const MONEY_TABLES = [
  'Order', 'Escrow', 'Invoice', 'CommissionRule', 'Deposit', 'Payout',
  'Refund', 'Transaction', 'Wallet', 'FinanceSetting', 'PlatformSetting',
  'Subscription', 'Plan', 'PlanEntitlement', 'FinanceInput', 'ApprovalRequest',
];

function checkMoneyMigrations() {
  const root = join(ROOT, 'prisma', 'migrations');
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return; // لا ترحيلات بعد
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const up = join(dir, 'migration.sql');

    let sql;
    try {
      sql = readFileSync(up, 'utf8');
    } catch {
      continue;
    }

    const touched = MONEY_TABLES.filter((table) => sql.includes(`"${table}"`));
    if (touched.length === 0) continue;

    try {
      readFileSync(join(dir, 'migration.down.sql'), 'utf8');
    } catch {
      problems.push(
        `prisma/migrations/${entry.name}  يمسّ ${touched.join('، ')} وبلا migration.down.sql`,
      );
    }
  }
}

// ————— القاعدة ١٢: صفّ Prisma لا يعبر الحدّ —————
/**
 * صفٌّ يعبر إلى مكوّن عميل **يصل المتصفّح كاملًا** ولو عرض العمود منه
 * أربعة أرقام. الإخفاء بالعرض ليس إخفاءً.
 *
 * وقع هذا فعلًا في A5: مئة رقم جوال كامل في حمولة الصفحة. وكان رقم
 * جوال في شاشة أدمن؛ وقد يكون في المرّة القادمة `minAcceptPrice` في
 * صفحة إعلان عامة — وهو ما بُنيت حوله عشر قواعد.
 *
 * **الفحص على النوع لا على المحتوى**: النوع يُمسك في كل حال، والمحتوى
 * يُمسك حين يصادف الفحصُ صفًّا فيه بيانات.
 *
 * شقّان:
 *   أ. مكوّن عميل لا يستورد نوع نموذج من `@/generated/prisma/client`.
 *      التعدادات مسموحة — سلاسل نصّية لا تحمل شيئًا.
 *   ب. متغيّر يحمل نتيجة استعلام مباشرةً لا يُمرَّر خاصّيةً في JSX.
 *      بينهما يجب أن يقف مُسلسِل صريح يعلن ما يخرج.
 */
const PRISMA_CLIENT_IMPORT = /from\s+'@\/generated\/prisma\/client'/;
const PRISMA_TYPE_USE = /\bPrisma\.\w+GetPayload\b|\bPrisma\.\w+(Create|Update|Where)\w*\b/;

/** أساليب تُعيد صفوفًا. `count` يعيد عددًا، فليس منها. */
const ROW_QUERY =
  /db\.\w+\.(findMany|findUnique|findFirst|findUniqueOrThrow|findFirstOrThrow|groupBy|aggregate)\s*\(/;

/**
 * يقسم محتوى `Promise.all([...])` إلى عناصره على المستوى الأعلى.
 * القسمة بالفاصلة وحدها تكسر عند أوّل كائن داخلي — فالعدّ بالأقواس.
 */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/** يعيد أسماء المتغيّرات التي تحمل صفوفًا فعلًا. */
function rowBindings(source) {
  const bound = new Set();

  // `const rows = await db.x.findMany(...)`
  for (const match of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+(db\.\w+\.\w+)/g)) {
    const name = match[1];
    if (name !== undefined && ROW_QUERY.test(`${match[2] ?? ''}(`)) bound.add(name);
  }

  /**
   * `const [a, b, c] = await Promise.all([...])` — **بمطابقة الموضع**:
   * `cities` المشتقّة بـ`.then(rows => rows.map(...))` مصفوفة نصوص لا
   * صفوف، وحصرُها بالاسم وحده يُنتج إنذارًا كاذبًا يُعطِّل البوابة.
   */
  for (const match of source.matchAll(/(?:const|let)\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[/g)) {
    const names = (match[1] ?? '').split(',').map((n) => n.trim().split(/[:=\s]/)[0] ?? '');
    const from = (match.index ?? 0) + match[0].length;

    let depth = 1;
    let end = from;
    while (end < source.length && depth > 0) {
      const char = source[end];
      if (char === '[' || char === '(' || char === '{') depth += 1;
      if (char === ']' || char === ')' || char === '}') depth -= 1;
      end += 1;
    }

    const elements = splitTopLevel(source.slice(from, end - 1));
    names.forEach((name, i) => {
      const element = elements[i] ?? '';
      // `.then(` يعني تحويلًا — والمحوَّل ليس صفًّا
      if (name !== '' && ROW_QUERY.test(element) && !element.includes('.then(')) {
        bound.add(name);
      }
    });
  }

  return bound;
}

/**
 * ————— القاعدة ١٤: `db` لا يصل حزمة المتصفّح —————
 *
 * **الحدّ يمرّ عبر الاستيرادات لا عبر التوجيهات.** مكوّن `'use client'`
 * يستورد وحدةً تستورد `db` يجرّ Prisma إلى المتصفّح فيُسقط البناء —
 * ورسالة الخطأ تتحدّث عن `node:process` لا عن الاستيراد الذي سبّبها.
 *
 * وقع مرّتين: `CategoryFilter` في المهمة ١٤، ومحرّر القوالب في ٢٤.
 * والمرّة الثانية بوابة لا تصحيح ثالث.
 *
 * والقاعدة ١٢ لا تمسكه: هي تفحص النوع والصفّ، وهذا استيراد لا نوع له.
 */
const BANNED_LEAVES = [/from\s+'@\/lib\/db'/, /from\s+'@\/generated\/prisma\/client'/];

/** يتتبّع استيرادات `@/…` من ملفٍ ما، ويعيد أوّل سلسلة تصل إلى `db`. */
function pathToDb(entry, seen = new Set()) {
  if (seen.has(entry)) return null;
  seen.add(entry);

  let source;
  try {
    source = readFileSync(entry, 'utf8');
  } catch {
    return null;
  }

  // الورقة تعيد سلسلة فارغة — ومن استوردها هو من يُسمّيها
  for (const pattern of BANNED_LEAVES) {
    if (pattern.test(source)) return [];
  }

  for (const match of source.matchAll(/from\s+'(@\/[^']+)'/g)) {
    const specifier = match[1] ?? '';
    // `import type` لا يصل الحزمة — يُمحى وقت الترجمة
    const line = source.slice(Math.max(0, match.index - 120), match.index);
    if (/\bimport\s+type\b/.test(line)) continue;

    const base = join(ROOT, 'src', specifier.slice(2));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
      if (!existsSync(candidate)) continue;
      const rest = pathToDb(candidate, seen);
      if (rest !== null) return [relative(ROOT, candidate), ...rest];
      break;
    }
  }

  return null;
}

function checkClientDbImports() {
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const source = readFileSync(file, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(source)) continue;

      const chain = pathToDb(file);
      if (chain === null) continue;

      problems.push(
        chain.length === 0
          ? `${relative(ROOT, file)}  مكوّن عميل يستورد db مباشرةً`
          : `${relative(ROOT, file)}  مكوّن عميل يصل إلى db عبر: ${chain.join(' ← ')} — افصل ما يحتاجه المتصفّح في وحدة بلا db`,
      );
    }
  }
}


/**
 * ————— القاعدة ١٥: مفردات المزوّد لا تعبر المُهايئ —————
 *
 * الواجهة **بلغة الضمان لا بلغة البطاقة**: `hold` و`settle` و`cancel`.
 * و`authorize`/`capture`/`void` مفردات بطاقةٍ صالحة **داخل المُهايئ
 * وحده** — فهو المكان الذي يترجم فيه.
 *
 * ولمَ بوابة لا مراجعة: ترتيب الضمان قد يتغيّر بنيويًّا لا اسميًّا —
 * حساب أمانة بنكيّ يجعل `hold` تحويلًا يستغرق يومًا. وشاشةٌ سمّت
 * المفهوم `authorize` تصير كاذبة يومها، ولا يكشفها المترجم لأن
 * الاسم يظلّ يترجم.
 */
const GATEWAY_VOCAB = /\b(authorize|authorization|capture|voidPayment|preauth)\b/;

/** المُهايئات وحدها تترجم — وهي الاستثناء المُعلن. */
const ADAPTER_PATH = /src[\\/]lib[\\/]payments[\\/]adapters[\\/]/;

function checkGatewayVocabulary() {
  const roots = [join('src', 'lib', 'domain'), join('src', 'app'), join('src', 'components')];

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      if (ADAPTER_PATH.test(rel)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // التعليق يشرح ولا ينفّذ — والشرح قد يذكر ما يُترجَم منه
        const code = line.split('//')[0] ?? '';
        if (/^\s*[*]/.test(line)) return;
        const match = code.match(GATEWAY_VOCAB);
        if (match) {
          problems.push(
            `${rel}:${i + 1}  «${match[0]}» مفردة مزوّد خارج المُهايئ — الواجهة بلغة الضمان: hold · settle · cancel · partialReturn`,
          );
        }
      });
    }
  }
}

function checkPrismaBoundary() {
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      const source = readFileSync(file, 'utf8');
      const isClient = /^\s*['"]use client['"]/m.test(source);

      // ——— أ. النوع لا يعبر ———
      if (isClient) {
        if (PRISMA_CLIENT_IMPORT.test(source)) {
          problems.push(
            `${rel}  مكوّن عميل يستورد نوعًا من @/generated/prisma/client — أعلن نوعًا خاصًّا يبنيه مُسلسِل`,
          );
        }
        if (PRISMA_TYPE_USE.test(source)) {
          problems.push(
            `${rel}  مكوّن عميل يستعمل نوع Prisma داخليًّا — النوع يعبر بما يحمله`,
          );
        }
        continue;
      }

      // ——— ب. القيمة لا تعبر ———
      if (!ROW_QUERY.test(source)) continue;

      const bound = rowBindings(source);
      if (bound.size === 0) continue;

      /**
       * الاستعلام المباشر داخل الخاصّية يُلتقط أيضًا:
       * `rows={await db.user.findMany()}` لا اسم له لكنه يعبر.
       */
      for (const attribute of source.matchAll(/\b(\w+)=\{([^}]{1,80})\}/g)) {
        const name = attribute[1] ?? '';
        const value = (attribute[2] ?? '').trim();
        if (name === 'key' || name === 'className') continue;

        const direct = ROW_QUERY.test(value);
        const named = bound.has(value);
        if (!direct && !named) continue;

        problems.push(
          `${rel}  «${name}={${value}}» صفّ Prisma يعبر إلى مكوّن — مرّره عبر مُسلسِل يعلن ما يخرج`,
        );
      }
    }
  }
}

checkUnits();
checkStringifiedNumbers();
checkColourUtilities();
checkMoneyMigrations();
checkPrismaBoundary();
checkClientDbImports();
checkGatewayVocabulary();

// ————— النتيجة —————
if (problems.length > 0) {
  console.error('\n✗ بوابة الجودة — القسم ١٤:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} مخالفة.\n`);
  process.exit(1);
}

console.log(
  '✓ بوابة الجودة: لا لون مكتوب · لا رقم Latin قبل كلمة عربية · لا سطر بيانات كنصّ واحد · لا # في جمع ICU · الوحدات مصرَّح بها · لا رقم في سلسلة نصّ · كل لون له توكن · كل ترحيل ماليّ له نقض · لا صفّ Prisma يعبر الحدّ · لا نقطة في مفتاح ترجمة · لا db في حزمة المتصفّح · لا مفردة مزوّد خارج المُهايئ.',
);
