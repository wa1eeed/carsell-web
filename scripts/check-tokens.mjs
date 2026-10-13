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
 * ١٦. الضريبة تُحسب في `tax.ts` وحده · لا ضريبة على قيمة المركبة · لا «فاتورة مركبة».
 * ١٧. النطاق يعيد بيانات لا جُملًا — لا حرف عربي في src/lib/domain عدا التعليقات.
 *
 * قائمة الاستثناءات في القاعدة ٥ من DESIGN-DECISIONS.md بند ٧:
 * العدّادات HH:MM:SS · المعرّفات · اللوحة · الرموز الفنية —
 * وكلّها لا يليها حرف عربي، فالفحص أدناه لا يمسّها.
 *
 * الملف الوحيد المسموح فيه بقيَم لونية خام: src/app/globals.css.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const TOKENS_FILE = join('src', 'app', 'globals.css');

const SCAN_DIRS = [join('src', 'app'), join('src', 'components')];
const SCAN_EXT = new Set(['.ts', '.tsx', '.css']);

const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(/;

/** رقم لاتيني يليه (بمسافة واحدة على الأكثر) حرف عربي. */
/**
 * ═══ البوابة ٥ — انقلبت بقرار المالك ═══
 *
 * كانت تمنع **أيّ** رقمٍ لاتينيّ قبل كلمة عربية: «استخدم الأرقام
 * العربية-الهندية». وقد وُحِّدت الأرقام لاتينيّةً، فصار المنع يمنع
 * القاعدة نفسها.
 *
 * **والعلّة التي وُلدت منها باقية** — لكنّها ليست في الرقم المفرد:
 * خوارزمية bidi تضع «210 نقطة» في موضعها الصحيح داخل فقرةٍ عربية.
 * العلّة في **تسلسلٍ رقميّ بينه محرفٌ محايد**: «2026-10-12» و«15/115»
 * و«3–5» — المحايد بين رقمين يلتقط اتّجاه ما حوله فينقلب الترتيب،
 * فيُقرأ «12-10-2026» تاريخًا آخر، و«5–3» مدًى مقلوبًا.
 *
 * فالمنع على المدى والتاريخ والكسر داخل نصٍّ عربيّ، لا على الرقم.
 * وعلاجُه `<ArabicNumber>` أو `dir="ltr"` على مقطعه.
 */
const NEUTRAL_BETWEEN_DIGITS = /\d\s*[-/:×–]\s*\d/;
const ARABIC_LETTER = /[ء-ي]/;

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
    if (
      checkArabicDigits
      && NEUTRAL_BETWEEN_DIGITS.test(node)
      && ARABIC_LETTER.test(node)
    ) {
      problems.push(
        `${file}:${path}  تسلسلٌ رقميّ بينه محايد داخل نصٍّ عربيّ — ينقلب ترتيبه في RTL؛`
          + ' افصل المقطع ولُفّه بـ`dir="ltr"`',
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
      /**
       * **ولا تُجرَّد التعليقات هنا**: مهرب هذه البوابة `check-9-ok:`
       * **تعليقٌ في السطر أو قبله**، فتجريدُه يُلغي المخرج الموثَّق
       * ويُطلق البوابة على الاستثناء الذي أُقرّ لها. (وقع: جُرّدت
       * فسقط JSON-LD وهو حقل آلةٍ يتطلّب أرقامًا لاتينية.)
       */
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
      const source = stripComments(readFileSync(file, 'utf8'));

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

/**
 * يُسقط التعليقات قبل الفحص.
 *
 * **وأسلوب هذا المستودع تعليقاتٌ طويلة تشرح القرار**، فيها أسماء خصائص
 * CSS ومقاسات حرفية مقتبسة من التصميم. وفحصُ النصّ الخام يجعل تعليقًا
 * يقول «`border-radius: 999px`» إنذارًا كاذبًا — ثم يتعلّم القارئ أن
 * يتجاهل البوابة، وتلك أسوأ من غيابها.
 *
 * (وقعت أوّل ما وُثّقت مقاسات شريط الشرائح.)
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
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
    /**
     * `import type` لا يصل الحزمة — يُمحى وقت الترجمة.
     *
     * **والنظر يقف عند بداية السطر لا عند ١٢٠ محرفًا خلفه.** كانت
     * النافذة الثابتة تبتلع نهاية السطر السابق، فسطرا استيرادٍ من
     * الوحدة نفسها — أحدهما نوع والآخر قيمة — يجعلان الثاني يُقرأ
     * نوعًا فيمرّ. وهو ما وقع فعلًا: مكوّن عميل استورد ثابتًا من وحدة
     * نطاق فجرّ Prisma إلى المتصفّح، **والبوابة صامتة**، وسقط البناء
     * بـ«Can't resolve 'fs'» — رسالةٌ لا تذكر لا العميل ولا `db`.
     */
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    if (/\bimport\s+type\b/.test(source.slice(lineStart, match.index))) continue;

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
/**
 * ═══ البوابة ٢٠ ═══ **دفتر الأستاذ يُكتب من `postEntries` وحدها.**
 *
 * التوازن شرطُ كتابةٍ لا فحصٌ لاحق، و`postEntries` هي التي تفحصه.
 * فكتابةٌ مباشرة بـ`ledgerEntry.create` تتجاوز الفحص وتُدخل قيدًا لا
 * يتوازن — ودفترٌ مزدوج فيه قيدٌ واحد لا يتوازن ليس مزدوجًا.
 *
 * ولا يُستثنى إلا `ledger.ts` نفسه (فيه الكاتب) والاختبارات.
 */
const LEDGER_WRITE = /\bledgerEntry\s*\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\b/;
const LEDGER_ALLOWED = /(src[/\\]lib[/\\]domain[/\\]ledger\.ts|^tests[/\\]|[/\\]tests[/\\]|scripts[/\\])/;

/**
 * ═══ البوابة ٣٤ ═══ **الضمان يُنشأ حيث يُحجز المال.**
 *
 * `holdEscrow` بقيت في `orders.ts` من المهمّة ١٨ — حين كان الضمان
 * وهميًّا بلا مزوّد دفع — وتكتب `Escrow` بـ`gatewayRef: null`
 * **وبلا قيدِ دفتر**. ثمّ صار الحجز الحقيقيّ في `payments.ts` مع
 * `recordOrderPaid`، وبقيت الأولى حيّةً مصدَّرة.
 *
 * فمن ناداها أنشأ مالًا محجوزًا لا يعرفه الدفتر — وهو الصنف نفسه
 * الذي بُنيت له البوابة ٢٠.
 *
 * والتحديث غيرُ الإنشاء فلا يُمنع: النزاعُ والإلغاء يُبدّلان حالَ
 * ضمانٍ قائم، ولا يخلقان مالًا.
 */
const ESCROW_CREATE = /\bescrow\s*\.\s*(create|createMany|upsert)\b/;
const ESCROW_ALLOWED = /(src[/\\]lib[/\\]domain[/\\]payments\.ts|^tests[/\\]|[/\\]tests[/\\]|scripts[/\\])/;

const GATEWAY_VOCAB = /\b(authorize|authorization|capture|voidPayment|preauth)\b/;

/**
 * و`authorization` **ترويسة HTTP قياسية** أيضًا — فتُستثنى حين تُقرأ
 * كترويسة لا كمفردة بطاقة. وبلا هذا الاستثناء يُبلَّغ كل قارئٍ لترويسة
 * `Bearer` مخالفةً، فتُعطَّل البوابة في يومها الأوّل. (وقع في مسار
 * الوظائف الزمنية: `headers.get('authorization')`.)
 */
const HTTP_AUTH_HEADER = /(headers\.get\(\s*['"`]authorization|['"`]authorization['"`]\s*:)/i;

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
        if (LEDGER_WRITE.test(code) && !LEDGER_ALLOWED.test(rel)) {
          problems.push(
            `${rel}:${i + 1}  كتابةٌ مباشرة في دفتر الأستاذ — استعمل postEntries: هي التي تفحص التوازن`,
          );
        }
        if (ESCROW_CREATE.test(code) && !ESCROW_ALLOWED.test(rel)) {
          problems.push(
            `${rel}:${i + 1}  إنشاءُ ضمانٍ خارج مسار الدفع — المال يُحجز ويُقيَّد معًا`,
          );
        }
        if (HTTP_AUTH_HEADER.test(code)) return;
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


/**
 * ————— القاعدة ١٦: الضريبة تُحسب في `tax.ts` وحده —————
 *
 * ولا حساب ضريبة على قيمة المركبة، ولا مستند يسمّي نفسه فاتورة مركبة.
 *
 * والسبب أكبر من الترتيب: تعديل ضريبة القيمة المضافة قد يجعل المنصّة
 * «موِردًا مفترضًا»، فتُستحقّ الضريبة على كامل قيمة المركبة لا على
 * العمولة — الفرق بين ١٥٠ و١٥٬٠٠٠ في صفقة واحدة. والتصنيف ينتظر مذكرة
 * ضريبية، فحسابه اليوم بأي نسبة هو تخمينٌ في وثيقة قانونية.
 *
 * والفحص **مقيَّد بسياق ضريبي** لا بالرقم وحده: `take: 15` و
 * `ADMIN_LOCK_MINUTES = 15` و`flex-[1.15]` كلّها ١٥ لا علاقة لها —
 * وقاعدةٌ تُصدر ضجيجًا تُعطَّل.
 */
const TAX_CONTEXT = /vat|tax|ضريب/i;
const RATE_LITERAL = /(?<![\w.])(?:15(?:\.0+)?|0\.15)(?![\w.%])|١٥\s*٪/;

/**
 * **مقياسٌ لا نسبة.**
 *
 * `VAT_LENGTH = 15` طولُ الرقم الضريبيّ لا نسبته، و`taxStatusSetAt`
 * ليس معدَّلًا. والسياق الضريبيّ وحده لا يميّز — فالاسم يميّز: ما حمل
 * وحدةَ قياسٍ في اسمه ليس نسبة.
 */
const MEASURE_NAME = /\b\w*(LENGTH|DIGITS|COUNT|SIZE|MINUTES|HOURS|DAYS|MS|CHARS|MAX|MIN)\w*\b/i;

/**
 * **الضريبة تُحسب في `tax.ts` وحده.**
 *
 * ودالّةٌ ثانية تحسبها في مكان آخر تصير مصدرًا ثانيًا للحقيقة: تُعدَّل
 * القاعدة فتتبعها إحداهما وتتخلّف الأخرى، والفرق يظهر في فاتورة.
 */
const TAX_DEFINITION = /\b(function|const)\s+(vatIncluded|netOfVat|computeTax)\b/;

/** حسابُ ضريبةٍ على قيمة المركبة — بالتسمية، فالنيّة تظهر في الاسم. */
const VEHICLE_TAX = /\b(vehicleVat|vatOnVehicle|carVat|vehicleTax|taxOnVehicle)\b/i;

/** مستندٌ يسمّي نفسه فاتورة مركبة — وهو ليس فاتورة حتى يُصنَّف. */
/**
 * والنفي ليس تسمية: «بلا فاتورة مركبة» تصف **الامتناع** عن إصدارها —
 * وهو السلوك الصحيح نفسه الذي تحرسه هذه القاعدة. فحرفُ النفي قبلها
 * يُخرجها.
 */
const VEHICLE_INVOICE =
  /\b(vehicleInvoice|carInvoice)\b|(?<!(?:بلا|لا|دون|بغير|عدم)\s)فاتورة\s+(ال)?مركبة/;


/**
 * ————— القاعدة ١٨: رقمٌ مُقحَم في قالب لا تليه كلمة عربية —————
 *
 * `` `و${String(n)} طلبًا` `` تُخرج **رقمًا لاتينيًّا** وجمعًا مكتوبًا
 * بيد كاتبه — والعربية ستّ حالات جمع فيُصيب واحدة ويُخطئ خمسًا: «و١
 * طلبًا» و«و٢ طلبًا» و«و١٠ طلبًا».
 *
 * والقاعدة ٥ تمنع هذا في JSX، لكن رسائل الـToast **نصوصٌ لا عناصر**
 * فلا يبلغها `<Quantity>` ولا تمرّ على تلك القاعدة. فوقع الخطأ مرّتين:
 * في A7 وفي بطاقة رسوم المعالجة.
 *
 * والعلاج في النصّ: تُصاغ الجملة فلا يحكم العددُ المعدودَ — «الطلبات
 * القائمة (١٠)» بدل «١٠ طلبات» — والرقم يمرّ على `toArabicDigits`.
 *
 * **والقوس هو العلامة**: عددٌ يفتح قوسًا لا يحكم ما بعده، فيُستثنى. وهو
 * الصيغة الموصى بها نفسها، فاستثناؤها يكافئ اتّباعها.
 *
 * ويُستثنى `src/lib/arabic.ts` — فيه يُبنى التنسيق نفسه.
 */
const NUMERIC_INTERP =
  /(?<!\()\$\{[^}]*(?:String\(|Number\(|\.length|count|total|Count)[^}]*\}\s*[\u0621-\u064A]/;

function checkInterpolatedNumbers() {
  const roots = [join('src', 'lib'), join('src', 'app'), join('src', 'components')];

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      if (rel.includes('generated')) continue;
      // موضع بناء التنسيق نفسه
      if (rel.endsWith(join('lib', 'arabic.ts'))) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*[*]/.test(line)) return;
        if (NUMERIC_INTERP.test(line)) {
          problems.push(
            `${rel}:${i + 1}  رقم مُقحَم تليه كلمة عربية — الأرقام عربية-هندية، والجمع لا يُكتب بيد`,
          );
        }
      });
    }
  }
}

function checkTaxRate() {
  const roots = [join('src', 'lib'), join('src', 'app'), join('src', 'components')];

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      if (rel.includes('generated')) continue;
      const isTaxFile =
        rel.endsWith(join('domain', 'tax.ts')) || rel.endsWith('domain/tax.ts');

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.split('//')[0] ?? '';
        const isComment = /^\s*[*]/.test(line);

        if (
          !isTaxFile &&
          !isComment &&
          TAX_CONTEXT.test(code) &&
          RATE_LITERAL.test(code) &&
          !MEASURE_NAME.test(code)
        ) {
          problems.push(
            `${rel}:${i + 1}  نسبة ضريبة مكتوبة خارج tax.ts — النسبة تُقرأ من TaxRule`,
          );
        }
        /**
         * **الاستدعاء مسموح والتعريف ممنوع**: الشاشات والمجال يستدعون،
         * و`tax.ts` وحده يُعرّف. ولهذا يلزم الاسمُ بعد `function` أو
         * `const` مباشرةً — و`const x = vatIncluded(…)` استدعاءٌ يمرّ.
         */
        if (!isTaxFile && !isComment && TAX_DEFINITION.test(code)) {
          problems.push(
            `${rel}:${i + 1}  تعريف حساب ضريبة خارج tax.ts — الحساب في موضع واحد`,
          );
        }
        if (!isComment && VEHICLE_TAX.test(code)) {
          problems.push(
            `${rel}:${i + 1}  حساب ضريبة على قيمة المركبة — التصنيف ينتظر المذكرة (المهمة ٣٥)`,
          );
        }
        if (!isComment && VEHICLE_INVOICE.test(code)) {
          problems.push(
            `${rel}:${i + 1}  مستند يسمّي نفسه فاتورة مركبة — وهو ليس فاتورة حتى يُصنَّف`,
          );
        }
      });
    }
  }
}


/**
 * ————— القاعدة ١٧: النطاق يعيد بيانات لا جُملًا —————
 *
 * لا حرف عربي في `src/lib/domain` و`src/lib/payments` — **عدا التعليقات**.
 *
 * والسبب أن النطاق **لا يستطيع** الصياغة: لا يعرف اللغة ولا يملك
 * `Quantity`. فجملةٌ يبنيها تُنتج «6 يومًا» — رقمًا لاتينيًّا وجمعًا
 * خاطئًا داخل جملة عربية — ولا يكشفها المترجم ولا الاختبار الذي يفحص
 * «هل النصّ صحيح»، لأنه يمرّ بنصٍّ مبنيّ بعناية ثم ينكسر في الجملة
 * التالية.
 *
 * فالفحص على **غياب الصنف** لا على صحّة أفراده: لا نصّ هنا أصلًا.
 * والتسميات في `src/lib/labels/`، والأخطاء رموزٌ تترجمها الشاشة.
 */
const DOMAIN_ROOTS = [join('src', 'lib', 'domain'), join('src', 'lib', 'payments')];
const ARABIC = /[؀-ۿ]/;

function checkDomainHasNoProse() {
  for (const dir of DOMAIN_ROOTS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.ts')) continue;
      const rel = relative(ROOT, file);

      const lines = readFileSync(file, 'utf8').split('\n');
      let inBlockComment = false;

      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('/*')) inBlockComment = true;
        const wasComment = inBlockComment || trimmed.startsWith('*') || trimmed.startsWith('//');
        if (trimmed.includes('*/')) inBlockComment = false;
        if (wasComment) return;

        // السطر قد يحمل شفرةً ثم تعليقًا — والتعليق مسموح
        const code = line.split('//')[0] ?? '';
        if (ARABIC.test(code)) {
          problems.push(
            `${rel}:${i + 1}  نصّ عربي في النطاق — أعِد مفتاحًا، والتسمية في src/lib/labels/`,
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
      const source = stripComments(readFileSync(file, 'utf8'));
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

/**
 * ═══ البوابة ١٩ — نصاب العضوين يُبنى كاملًا أو لا يُبنى ═══
 *
 * **وقع ثلاث مرّات، فأُغلِق آليًا:**
 *
 *   ١· تدوير المفاتيح كان يفحص `integrations.view` لا `rotateKeys` —
 *      و`OPS` يملك العرض ولا يملك التدوير، فكان عضوان من `OPS`
 *      يستوفيان النصاب على سرٍّ حيّ. النصاب قائم، وأهله غير أهله.
 *   ٢· تبديل بوابة الدفع كان يكتب طلبًا بنصاب عضوين **ولا دالّة
 *      موافقةٍ في الملف كلّه** — فلا يُطبَّق تبديلٌ أبدًا.
 *   ٣· تعديل القاعدة الضريبية كانت له دالّة ومسار **ولا زرّ** —
 *      فيبقى معلَّقًا حتى ينقضي.
 *
 * والثلاثة صنفٌ واحد: **نصفُ نصاب**. والشاشة تقول «ينتظر عضوًا ثانيًا»
 * والنظام لا يملك ما يُنتظَر — وعدٌ لا يقابله مسار.
 *
 * فالفحص ثلاثيّ لكل نوع موافقة يُنشأ في النطاق:
 *   • دالّة موافقة تقابل دالّة الطلب
 *   • مسار API ينادي دالّة الموافقة
 *   • والصلاحية المسمّاة في `DUAL_APPROVAL` تُفحص باسمها لا بأضعف منها
 *
 * **وحدُّها معلوم**: الشطر الثالث يسأل «أيفحصها مسارٌ ما؟» لا «أيفحصها
 * هذا المسار؟» — فلو حُرِس مسارٌ واحد بأضعف منها وحُرِس آخر بها لم تُرفع
 * مخالفة. الربط بين المسار وصلاحيته المقصودة لا يُشتقّ من النصّ، والفحص
 * يمسك ما وقع فعلًا: صلاحية نصاب **لا يفحصها شيء**.
 */
function checkApprovalQuorum() {
  const domain = join(ROOT, 'src', 'lib', 'domain');
  const api = join(ROOT, 'src', 'app', 'api');
  if (!existsSync(domain) || !existsSync(api)) return;

  const domainFiles = walk(domain).filter((file) => file.endsWith('.ts'));
  const routeFiles = walk(api).filter((file) => file.endsWith('route.ts'));
  const routeSource = routeFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

  /* ① كل نوع موافقة يُنشأ لا بدّ له من موافِقٍ يُنادى من مسار */
  const approvers = [];
  const creators = new Map();
  for (const file of domainFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^export async function (approve\w+)/gm)) {
      approvers.push({ name: match[1], file });
    }
    for (const match of source.matchAll(/kind:\s*'([A-Z_]+)'/g)) {
      const kind = match[1];
      if (!creators.has(kind)) creators.set(kind, file);
    }
  }

  for (const [kind, file] of creators) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, 'utf8');
    /* نصاب العضوين وحده معنيّ — طلبٌ بعضوٍ واحد ليس نصابًا */
    if (!/requiredApprovals:\s*[2-9]/.test(source) && !/REQUIRED_APPROVALS/.test(source)) continue;

    const local = approvers.filter((entry) => entry.file === file);
    if (local.length === 0) {
      problems.push(
        `${rel}  «${kind}» يُنشأ بنصاب عضوين ولا دالّة `
          + `approve* في ملفه — طلبٌ لا يُعتمد أبدًا`,
      );
      continue;
    }
    /* ② والموافِق يُنادى من مسار — دالّةٌ لا يبلغها أحد كأنها ليست */
    const reachable = local.some((entry) => routeSource.includes(entry.name));
    if (!reachable) {
      problems.push(
        `${rel}  «${local.map((entry) => entry.name).join('/')}» لا يناديها مسار — `
          + `الموافقة الثانية بلا باب`,
      );
    }
  }

  /* ③ صلاحيات DUAL_APPROVAL تُفحص بأسمائها */
  const permissionsFile = join(domain, 'permissions.ts');
  if (!existsSync(permissionsFile)) return;
  const permissions = readFileSync(permissionsFile, 'utf8');
  const block = /DUAL_APPROVAL[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(permissions);
  if (block === null) return;

  for (const match of (block[1] ?? '').matchAll(/'([\w.]+)'/g)) {
    const permission = match[1];
    // النقطة تُهرَّب مرّة واحدة — `\\.` في الحرفيّة تصير `\.` في النمط
    const pattern = new RegExp(`requireAdmin\\([^)]*'${permission.replaceAll('.', '\\.')}'`);
    if (!pattern.test(routeSource)) {
      problems.push(
        `src/lib/domain/permissions.ts  «${permission}» في DUAL_APPROVAL ولا مسار يفحصها — `
          + `الإجراء محروسٌ باسمٍ آخر أو بلا حارس`,
      );
    }
  }
}

/**
 * ═══ البوابة ٢١ ═══ **حالة الإعلان تُكتب من `listing-state.ts` وحدها.**
 *
 * وُلدت من الصنف نفسه مرّتين: طلبٌ يكتمل والإعلان يبقى `RESERVED` فلا
 * يصير `SOLD` أبدًا (وعدّاد «المُباع» صفرٌ دائمًا)، ثم نزاعٌ يُحسم بردٍّ
 * كامل والإعلان يبقى محجوزًا لطلبٍ أُلغي.
 *
 * والسبب واحد: **الحالة تُكتب حيث يقع الحدث**، فكل كاتبٍ يتذكّر ما
 * كان يعرفه يوم كُتب. وستّة كتّاب تباعدوا فعلًا — اثنان يكتبان
 * `RESERVED` بلا `closedAt` ولا `closeReason` وثالثٌ يكتب الثلاثة.
 *
 * فالانتقال يمرّ بمدخله الوحيد، ومن يضيف حدثًا جديدًا يجد الانتقالات
 * كلها أمامه فيرى أيّها ينقص.
 */
const LISTING_WRITE = /\blisting\s*\.\s*(update|updateMany|upsert)\b/;
const LISTING_ALLOWED = /(src[/\\]lib[/\\]domain[/\\]listing-state\.ts|^tests[/\\]|[/\\]tests[/\\]|scripts[/\\]|prisma[/\\])/;

function checkListingState() {
  const roots = [join('src', 'lib'), join('src', 'app'), join('src', 'components')];

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const rel = relative(ROOT, file);
      if (LISTING_ALLOWED.test(rel)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.split('//')[0] ?? '';
        if (/^\s*[*]/.test(line)) return;
        if (!LISTING_WRITE.test(code)) return;

        /**
         * والنافذة ستّة أسطر لأن `data: { status }` يقع بعد `where`
         * في الاستدعاء متعدّد الأسطر. وتحديثٌ لا يمسّ الحالة (سعر،
         * وصف، عدّاد مشاهدات) يمرّ — البوابة على الحالة لا على الجدول.
         */
        const window = lines.slice(i, i + 6).join('\n');
        if (/\bstatus\s*:/.test(window)) {
          problems.push(
            `${rel}:${i + 1}  كتابةٌ مباشرة لحالة الإعلان — استعمل listing-state.ts: reserveListing · markListingSold · republishListing · suspendListing`,
          );
        }
      });
    }
  }
}

/**
 * ═══ البوابة ٢٢ — دالّةٌ لا تعبر حدّ الخادم ═══
 *
 * مكوّن `'use client'` يقبل خاصّيةً من نوع دالّة (`cell` في `DataTable`،
 * `onChange`، `onSelect`)، وتمريرُها من مكوّن خادم يرمي:
 * **«Functions cannot be passed directly to Client Components»** —
 * والصفحة تردّ ٥٠٠ كاملةً، لا جدولًا ناقصًا.
 *
 * ووقع مرّتين في يومٍ واحد: `/admin/ledger` كان يردّ ٥٠٠ منذ بنائه،
 * و`/admin/tax` كان يردّ ٢٠٠ **لأن لا فاتورة في القاعدة** فالفرع لا
 * يُصيَّر — وأوّل فاتورةٍ تُصدَر تُسقطه. ولم يكشفهما اختبار: **الاختبارات
 * لا تفتح شاشة**، وكشفهما `curl` على كل وجهةٍ في الشريط.
 *
 * والفحص على **الاستعمال لا الاستيراد**: استيرادُ `Countdown` من صفحة
 * خادم سليمٌ ما دامت لا تمرّر إليه دالّة.
 */
/**
 * ═══ ٢٣ · مفتاحٌ في خريطة تسميات لا يكتبه أحد ═══
 *
 * `EVENT_LABEL[event.type] ?? event.type` يبتلع المفتاح الميّت: لا خطأ،
 * ولا تحذير — يُعرض الرمز الإنجليزيّ الخام لمشغّلٍ عربيّ ويبدو مقصودًا.
 *
 * وقع ثلاث مرّات: فئات الأسئلة الشائعة (`inspection` · `account` خامًا
 * في الشريط)، وأحداث الطلب (خمسةٌ من ثمانية مفاتيح ميّتة و`stage.advanced`
 * — أكثرها تكرارًا — بلا تسمية)، وأسباب حجب الفاتورة.
 *
 * فيُقاس: كل مفتاح نقطيّ (`a.b`) في خريطة `Record<string, string>` اسمُها
 * `*_LABEL` أو `*_REASON` **يجب أن يُكتب في مكانٍ ما** كـ`type: '…'` أو
 * `reason: '…'` أو `'…'` داخل تعداد نصّيّ. ولا يُفحص العكس (مفتاحٌ ناقص)
 * لأن الخريطة قد تغطّي جزءًا عن قصد.
 */
/**
 * ═══ ٢٤ · `idVerified` من مدخله الوحيد ═══
 *
 * `identityStatus` هي الحقيقة، و`idVerified` مشتقٌّ منها —
 * و`identity-state.ts` تكتب الاثنين معًا وتقول «ولا يُكتب `idVerified`
 * في غيرها». **والبذرة كانت تكتب الراية وحدها**، فصار ٥٣ مستخدمًا
 * يشترون بـ`idVerified: true` وشاشةُ توثيق الهوية تقول «موثّق ٠»
 * وطابورُها فارغ — ورقمان متناقضان لحقيقةٍ واحدة في شاشتين متجاورتين.
 *
 * وهو الصنف نفسه الذي أُغلق في الدفتر (البوابة ٢٠) وفي حالة الإعلان:
 * **قيمةٌ لها مدخلٌ واحد تُكتب من خارجه**. ثالثُ مرّة، فيُقاس.
 */
function checkIdentityFlag() {
  const roots = [join('src', 'lib'), join('src', 'app'), 'prisma', 'scripts'];
  const ALLOWED = /identity-state\.ts$/;

  for (const dir of roots) {
    let files;
    try {
      files = [...walk(join(ROOT, dir))];
    } catch {
      continue;
    }
    for (const file of files) {
      if (!/\.tsx?$/.test(file)) continue;
      const rel = relative(ROOT, file);
      if (ALLOWED.test(rel) || rel.includes('generated')) continue;

      const text = readFileSync(file, 'utf8');

      /**
       * **الكتابة وحدها تُفحص.** `idVerified: boolean` تصريحُ نوع،
       * و`{ idVerified: true }` داخل `where` شرطُ بحث — وكلاهما قراءة.
       * فيُبحث عن نداء كتابةٍ على `user` ثم يُقرأ ما بعده.
       */
      for (const call of text.matchAll(
        /\b(?:db|prisma|tx)\.user\.(create|createMany|update|updateMany|upsert)\s*\(/g,
      )) {
        const window = text.slice(call.index, call.index + 1400);
        if (!/\bidVerified\s*:/.test(window)) continue;

        /**
         * **والقاعدة «لا أحدهما دون الآخر» لا «لا تكتبها».** البذرة
         * تُنشئ مستخدمين بحالةٍ ابتدائية، وكتابتُها صحيحة متى ضبطت
         * الحقلين معًا — والخطأ أن يُكتب أحدهما وحده.
         */
        if (/\bidentityStatus\s*:/.test(window)) continue;
        const line = text.slice(0, call.index).split('\n').length;
        problems.push(
          `${rel}:${String(line)}  idVerified يُكتب بلا identityStatus — وحقلان لحقيقةٍ واحدة يتباعدان`,
        );
      }
    }
  }
}

function checkDeadLabelKeys() {
  const roots = [join('src', 'app'), join('src', 'components'), join('src', 'lib')];
  const written = new Set();
  const prefixes = new Set();

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!/\.tsx?$/.test(file)) continue;
      /**
       * **وخرائط التسميات تُنزع قبل العدّ.** المفتاح الميّت مكتوبٌ في
       * الخريطة نفسها، فلو عُدَّت لكانت كل خريطة تُزكّي نفسها ولم
       * تُطلق البوابة أبدًا. (أُثبتت فلم تُطلق، فصُحّحت.)
       */
      const text = readFileSync(file, 'utf8').replace(
        /const\s+[A-Z][A-Z0-9_]*(?:_LABEL|_REASON)\s*:\s*Record<string,\s*string>\s*=\s*\{[\s\S]*?\n\};/g,
        '',
      );
      for (const m of text.matchAll(/'([a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*)'/g)) {
        written.add(m[1]);
      }

      /**
       * **والفعل يُبنى بقالب.** `` `listing.review.${decision}` `` يكتب
       * ثلاثة أفعال ولا يظهر أيٌّ منها نصًّا — فبلا هذا السطر تُطلق
       * البوابة عشرة إنذاراتٍ كاذبة وتُعطَّل في يومها الأوّل.
       * فتُجمع البادئة، ويُقبل كل مفتاحٍ يبدأ بها.
       */
      for (const m of text.matchAll(/`([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\.\$\{/g)) {
        prefixes.add(m[1]);
      }
    }
  }

  for (const dir of roots) {
    for (const file of walk(join(ROOT, dir))) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file);

      for (const map of text.matchAll(
        /const\s+([A-Z][A-Z0-9_]*(?:_LABEL|_REASON))\s*:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/g,
      )) {
        const name = map[1];
        for (const entry of map[2].matchAll(/^\s*'([a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*)'\s*:/gm)) {
          const key = entry[1];
          const byTemplate = [...prefixes].some((pre) => key.startsWith(`${pre}.`));
          if (!written.has(key) && !byTemplate) {
            problems.push(
              `${rel}  ${name}['${key}'] مفتاحٌ لا يكتبه أحد — يُعرض الرمز الخام ويبدو مقصودًا`,
            );
          }
        }
      }
    }
  }
}

function checkFunctionPropsAcrossBoundary() {
  const clientComponents = new Set();

  // مكوّنات عميل تعلن خاصّيةً من نوع دالّة
  for (const file of walk(join(ROOT, 'src', 'components'))) {
    if (!file.endsWith('.tsx')) continue;
    const source = readFileSync(file, 'utf8');
    if (!/^\s*'use client'/.test(source)) continue;
    if (!/^\s*\w+\??:\s*\(.*\)\s*=>/m.test(source) && !/\bcell:\s*\(/.test(source)) continue;

    /**
     * ═══ والاسم من التصدير لا من اسم الملفّ ═══
     *
     * كانت تسجّل اسم الملفّ وحده، **فملفٌّ يصدّر ستّة مكوّنات يُسجَّل
     * منها واحد**. أخرجتُ قطع لوحة المزاد إلى `AuctionSettings.tsx`،
     * فمرّت `PriceField` و`Toggle` و`Choice` على البوابة — وردّت
     * `/dev/ui` **٥٠٠ كاملة** بالعطل نفسه الذي وُلدت منه.
     *
     * والاسم يُجمع من كل `export function X` و`export const X =`.
     */
    clientComponents.add(basename(file, '.tsx'));
    for (const exported of source.matchAll(
      /^export\s+(?:function|const)\s+([A-Z]\w*)/gm,
    )) {
      clientComponents.add(exported[1]);
    }
  }

  if (clientComponents.size === 0) return;
  const names = [...clientComponents].join('|');

  for (const dir of [join('src', 'app'), join('src', 'components')]) {
    for (const file of walk(join(ROOT, dir))) {
      if (!file.endsWith('.tsx')) continue;
      const source = readFileSync(file, 'utf8');
      if (/^\s*'use client'/.test(source)) continue;

      const rel = relative(ROOT, file);
      const open = new RegExp(`<(${names})[\\s\\n]`, 'g');
      let match;

      while ((match = open.exec(source)) !== null) {
        // جسم العنصر حتى إغلاق وسمه الافتتاحيّ
        /**
         * ═══ نهاية الوسم الافتتاحيّ — بعدّ الأقواس لا بسطرٍ جديد ═══
         *
         * كان البحث عن سطرٍ جديد يتلوه شَرطةُ إغلاق، **فوسمٌ يُغلق في
         * سطره** مثل `<Countdown endsAt={x} /` + `>` لا يُطابقه — فيمتدّ إلى
         * أوّل `/>` بعده مهما بعد، ويبتلع ما ليس منه. وأطلقت البوابة
         * على `Countdown` **لأن سهمًا في كتلةٍ تالية وقع داخل المدى**.
         *
         * فيُمشى الحرفُ حرفًا: `>` على عمق صفرٍ من `{}` هو النهاية،
         * وما داخل الأقواس لا يُحسب.
         */
        const rest = source.slice(match.index);
        let depth = 0;
        let end = -1;
        for (let at = 0; at < rest.length && at < 6000; at += 1) {
          const ch = rest[at];
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
          else if (ch === '>' && depth === 0) {
            end = at;
            break;
          }
        }
        const body = end === -1 ? rest.slice(0, 4000) : rest.slice(0, end);

        if (/=\{[^}]*=>/.test(body) || /\bcell:\s*\(/.test(body) || /\browKey=\{/.test(body)) {
          const line = source.slice(0, match.index).split('\n').length;
          problems.push(
            `${rel}:${line}  دالّة تُمرَّر إلى ${match[1]} من مكوّن خادم — الصفحة تردّ ٥٠٠. اسحب الجدول إلى مكوّن 'use client'`,
          );
        }
      }
    }
  }
}

/**
 * ═══ ٢٥ · حقل `En` يحمل عربيّة = لغةٌ معروضة بلا ترجمة ═══
 *
 * `legal.json` كان فيه **ثمانية وعشرون** حقلًا إنجليزيًّا نصُّها عربيّ:
 * فـ`/en/legal/terms` يعرض مستندًا عربيًّا كاملًا تحت واجهةٍ إنجليزية،
 * ولا شيء يسقط — الحقل مملوء، والنوع `string`، والشاشة تُصيَّر.
 *
 * **ونسخُ العربيّ في حقل الترجمة أسوأ من تركه فارغًا**: الفارغ يُرى
 * فيُملأ، والمنسوخ يُحتسب مترجَمًا فلا يُراجَع أبدًا.
 *
 * وقِيست على الشجرة قبل التفعيل: كل ملفات البذرة الأخرى نظيفة.
 */
function checkEnglishFieldsAreEnglish() {
  const ARABIC = /[\u0600-\u06FF]/;
  const dir = join(ROOT, 'prisma', 'seed-data');

  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }

  for (const name of files) {
    const rel = join('prisma', 'seed-data', name);
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch {
      problems.push(`${rel}  JSON غير صالح`);
      continue;
    }

    /** يمشي الشجرة كلّها: الحقل قد يكون داخل مصفوفة بنودٍ داخل مستند. */
    const walkJson = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walkJson(item, `${path}[${String(i)}]`));
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          walkJson(value, path === '' ? key : `${path}.${key}`);
        }
        return;
      }
      if (typeof node !== 'string') return;

      /**
       * **والاسم وحده يدلّ** — `titleEn` و`bodyEn` و`nameEn`. ولا
       * يُفحص `En` داخل كلمة (`Engine`): الشرط أن ينتهي به المفتاح.
       */
      const key = path.split('.').pop() ?? '';

      /**
       * ═══ وترميزٌ لا يُصيَّره أحد يُطبَع حرفيًّا ═══
       *
       * `legal.json` كان فيه **ثمانية وعشرون** علامة `**…**`، ولا
       * مُصيِّر لها في المنتج — فصفحة الشروط تعرض «المنصة \*\*وسيط
       * تقني\*\*» لكل زائر. والنصّ مملوء والنوع `string` ولا شيء يسقط.
       *
       * والتصميم يكتب متن المستندات بوزنٍ واحد (`font:400`)، فالعلامة
       * لا موضع لها أصلًا.
       */
      if (typeof node === 'string' && /\*\*[^*]+\*\*/.test(node)) {
        problems.push(
          `${rel}  ${path} ترميز Markdown في نصٍّ يُعرض كما هو — «${node.slice(0, 28)}…»`,
        );
      }

      if (!/[a-z]En$/.test(key)) return;
      if (!ARABIC.test(node)) return;

      problems.push(
        `${rel}  ${path} حقل إنجليزيّ نصُّه عربيّ — «${node.slice(0, 28)}…»`,
      );
    };

    walkJson(data, '');
  }
}

/**
 * ═══ ٢٦ · مفتاح ترجمة لا يُفضي إلى نصّ يُطبَع حرفيًّا ═══
 *
 * `FindingsTable` كانت تنادي `t('state')` و`ui.state` **خريطةُ تسميات**
 * (`NOTE`/`PAINT`/`FAIL`) لا نصًّا — فردّت `next-intl` اسم المفتاح،
 * وقرأ كلُّ من فتح تقرير فحصٍ «ui.state» عنوانًا لعمودٍ في جدول.
 *
 * **ولا شيء يسقط**: الأنواع تمرّ، والاختبارات لا تفتح شاشة، والسطر
 * يُصيَّر — بنصٍّ هو اسم المفتاح. وكذلك المفتاح الغائب تمامًا.
 *
 * وتُفحص الملفّات ذات النطاق الواحد: ملفٌّ ينادي نطاقين لا يُنسب
 * نداؤه بثقة، ومفتاحٌ مبنيّ بقالب يُترك لبوابة ٢٣.
 */
function checkTranslationKeysResolve() {
  const file = join(ROOT, 'src', 'messages', 'ar.json');
  if (!existsSync(file)) return;

  let messages;
  try {
    messages = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    problems.push('src/messages/ar.json  JSON غير صالح');
    return;
  }

  /** يمشي المسار بالنقاط — و«غائب» و«كائن» كلاهما يُطبَع حرفيًّا. */
  const resolve = (path) => {
    let node = messages;
    for (const part of path.split('.')) {
      if (node === null || typeof node !== 'object' || !(part in node)) return 'غائب';
      node = node[part];
    }
    return typeof node === 'string' ? 'نصّ' : 'كائن';
  };

  const SCOPE = /\b(?:use|get)Translations\(\s*\{?\s*(?:locale[^}]*namespace:\s*)?'([^']+)'/g;
  const CALL = /\bt\(\s*'([^']+)'/g;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx?$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    const text = readFileSync(path, 'utf8');
    /**
     * **والشرط أن تتّفق النطاقات لا أن تكون واحدة.** `InspectionReport`
     * ينادي `useTranslations('ui')` ثلاث مرّات — مكوّنات ثلاثة في ملفّ —
     * فـ«نطاقٌ واحد بالعدد» تخطّته، وهو **الملفّ الذي وُلدت منه البوابة**.
     * وملفٌّ بنطاقين مختلفين يُترك: لا يُنسب نداؤه إلى أحدهما بثقة.
     */
    const scopes = [...new Set([...text.matchAll(SCOPE)].map((m) => m[1]))];
    if (scopes.length !== 1) continue;
    const namespace = scopes[0];

    for (const call of text.matchAll(CALL)) {
      const key = call[1];
      if (key.includes('${')) continue;

      const kind = resolve(`${namespace}.${key}`);
      if (kind === 'نصّ') continue;

      const line = text.slice(0, call.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  t('${key}') في نطاق «${namespace}» ${kind} — يُطبَع اسم المفتاح للزائر`,
      );
    }
  }
}

/**
 * ═══ ٢٧ · سجلّ الوعود المتقاعدة ═══
 *
 * **القاعدة في ملفّ والوعد في ستّة.** أُلغيت نافذة الاسترجاع في المهمّة
 * ٣٧ — فالمال يصل البائع لحظة تأكيد النقل، و`returnWindowEndsAt` لا
 * يكتبه شيء. وبقي نصُّها يُعرض في **ثمانية مواضع**، آخرُها اكتُشف بعد
 * خمس مهامّ: بند في الشروط المنشورة، وسطرٌ يَعِد البائع بموعد وصول
 * ماله، وتسمية في دفتر الأدمن.
 *
 * ولا يمسكها اختبار: النصّ يُصيَّر، والأنواع تمرّ، ولا أحد يسأل الشاشة
 * «هل ما تقوله واقع؟».
 *
 * **فكلُّ قاعدةٍ تُحذف تُقيَّد هنا بنصّها**، ويبقى الحارس بعد أن يُنسى
 * الحذف. والسطر المعلَّق مستثنى: شرحُ الإلغاء نفسه يحتاج أن يسمّيه.
 */
const RETIRED_PROMISES = [
  {
    /**
     * **ولا يكفي اسم النافذة.** تاسعُ موضعٍ وُجد في إجابةٍ تقول «ولك
     * سبعة أيام **للاسترجاع**» — صيغةٌ لا تذكر «نافذة» ولا «من
     * الاستلام»، فكان النمط الأوّل يمرّ عليها.
     *
     * ويُفحص النمط في الاتّجاهين قبل تصديقه: «خلال سبعة أيام» لمهلة
     * النقل قاعدةٌ قائمة ويجب أن تمرّ، و«سياسة الضمان والاسترجاع»
     * عنوانُ مستندٍ لا وعد.
     */
    pattern:
      /نافذة (?:الإرجاع|الاسترجاع)|مدّة الاسترجاع|أيام (?:من|بعد) (?:تاريخ )?الاستلام|أيام للاسترجاع/,
    since: 'المهمّة ٣٧',
    instead: 'الإفراج يتبع تأكيد نقل الملكية — ولا نافذة بعده',
  },
];

function checkRetiredPromises() {
  /**
   * ═══ والوعد نصٌّ أينما كُتب ═══
   *
   * اقتصرت البوابة على `src/`، والموضع التاسع كان في `faqs.json`:
   * «كيف تُحمى أموالي؟ … ولك سبعة أيام للاسترجاع». إجابةٌ يقرؤها
   * المشتري في مركز المساعدة، ولا تمرّ بسطرِ شيفرةٍ واحد.
   */
  const seedDir = join(ROOT, 'prisma', 'seed-data');
  let seedFiles = [];
  try {
    seedFiles = readdirSync(seedDir).filter((name) => name.endsWith('.json'));
  } catch {
    seedFiles = [];
  }

  for (const name of seedFiles) {
    const rel = join('prisma', 'seed-data', name);
    const lines = readFileSync(join(seedDir, name), 'utf8').split('\n');

    lines.forEach((line, index) => {
      for (const promise of RETIRED_PROMISES) {
        if (!promise.pattern.test(line)) continue;
        problems.push(
          `${rel}:${String(index + 1)}  وعدٌ أُلغي في ${promise.since} — ${promise.instead}`,
        );
      }
    });
  }

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx?$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    const lines = readFileSync(path, 'utf8').split('\n');

    lines.forEach((line, index) => {
      /** الشرحُ يسمّي ما أُلغي — وهو الموضع الوحيد الذي يجوز فيه. */
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

      for (const promise of RETIRED_PROMISES) {
        if (!promise.pattern.test(line)) continue;
        problems.push(
          `${rel}:${String(index + 1)}  وعدٌ أُلغي في ${promise.since} — ${promise.instead}`,
        );
      }
    });
  }
}

/**
 * ═══ ٢٨ · حقلٌ بـ`flex-1` بلا `min-w-0` لا ينكمش أبدًا ═══
 *
 * **عطلٌ قاسه المالك**: ستّ خانات رمز التحقّق بـ٢٢١px لكلٍّ على شاشة
 * ٣٧٥ — فتظهر واحدةٌ ونصف والباقي خارج الصفحة.
 *
 * والسبب أن `<input>` له **حدٌّ أدنى تلقائيّ** من سمة `size` (عشرون
 * محرفًا افتراضًا)، و`flex-1` لا تنزل تحته لأن `min-width: auto`.
 * فالخانة تطلب عرضَ محتواها مهما ضاقت الحاوية — **و`flex-1` وحدها
 * تبدو كافيةً وليست كذلك**، وهو ما يجعل العطل يمرّ على المراجعة.
 *
 * ولا يُطلق على حقلٍ اختار كاتبُه حدًّا صريحًا (`min-w-56` داخل حاوية
 * تلتفّ): ذاك قرارٌ لا سهو.
 */
function checkFlexInputsCanShrink() {
  const ELEMENT = /<(input|textarea|select)\b[\s\S]{0,900}?\/>/g;
  const CLASSES = /'([^']*\bflex-1\b[^']*)'/g;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    const text = readFileSync(path, 'utf8');

    for (const element of text.matchAll(ELEMENT)) {
      for (const match of element[0].matchAll(CLASSES)) {
        const classes = match[1];
        /** حدٌّ صريح — صفرًا كان أو غيره — يعني أن الكاتب فكّر فيه. */
        if (/\bmin-w-|\bw-0\b/.test(classes)) continue;

        const line = text.slice(0, element.index).split('\n').length;
        problems.push(
          `${rel}:${String(line)}  حقل بـflex-1 بلا min-w-0 — لا ينكمش تحت عرض محتواه فيفيض`,
        );
      }
    }
  }
}


/**
 * ═══ البوابة ٢٩ ═══ **القيمةُ المشفَّرة تُقرأ بفاكّها لا بمِقَصّ.**
 *
 * `User.iban` يُكتب مشفَّرًا (`profile-edit`)، وكان **ثلاثةُ مواضع**
 * تقصّه كنصٍّ صريح في وقتٍ واحد:
 *
 *   · شاشة الحساب تعرض لصاحبه آيبانه `v1._••••w4Ij`.
 *   · شاشة الطلب تعرض للأدمن `w4Ij` «آخر أربع من آيبانه» — وبها
 *     يطابق حوالةً بنكية.
 *   · والبذرة تكتبه صريحًا، فصار في العمود صيغتان وكلُّ قارئٍ
 *     يصيب على نصف الصفوف.
 *
 * **ولا شيء يشتكي**: `slice` على نصٍّ مشفَّر تعيد نصًّا — فالعطل
 * يُعرض رقمًا خاطئًا لا خطأً، ويُقرأ صحيحًا حتى تُطابَق حوالة.
 *
 * فالقراءة من `src/lib/domain/iban.ts` وحده، والبذرة تُشفّر.
 */
function checkEncryptedFieldReaders() {
  /** الحقول المشفَّرة في العمود — وكلٌّ له مدخلُ قراءةٍ واحد. */
  const FIELDS = [{ name: 'iban', reader: 'src/lib/domain/iban.ts' }];

  for (const field of FIELDS) {
    /* ① لا قصٌّ ولا طولٌ على القيمة الخام خارج مدخلها */
    const SLICE = new RegExp(
      `\\b\\w*\\.?${field.name}\\b[^\\n;]{0,80}?\\.(slice|substring|substr|length|replace|padStart)\\(`,
      'i',
    );

    for (const path of walk(join(ROOT, 'src'))) {
      if (!/\.tsx?$/.test(path)) continue;
      const rel = relative(ROOT, path);
      if (rel.includes('generated') || rel === field.reader) continue;

      const text = readFileSync(path, 'utf8');
      for (const [index, line] of text.split('\n').entries()) {
        /* التعليقات تصف ولا تُنفّذ */
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (!SLICE.test(code)) continue;

        problems.push(
          `${rel}:${String(index + 1)}  \`${field.name}\` مشفَّر في العمود — `
            + `يُقرأ من ${field.reader} لا بقصّ النصّ الخام`,
        );
      }
    }

    /*
     * ② وكلُّ كاتبٍ يكتبه بالشكل الذي يكتبه المنتج — البذرةُ والطقم.
     *
     * **والطقم ليس استثناءً**: `inbox.test.ts` كان يزرعه صريحًا ويفحص
     * الناتج الصحيح، فيمرّ **لأن القارئ كان يقصّ الخام** — فيثبّت
     * العطل ويجعل تصحيحه يبدو كسرًا.
     *
     * **والفحص داخل `data:` وحدها.** أوّل صياغةٍ فحصت كل سطرٍ فيه
     * `iban: '…'`، فأطلقت على `redact({ iban: 'SA03…' })` — وهو مفتاحٌ
     * في كائنِ اختبارٍ لا كتابةٌ في عمود. وبوابةٌ نصفُ إنذارها كاذب
     * تُعطَّل في يومها الأول.
     */
    const writers = [join(ROOT, 'prisma'), join(ROOT, 'tests'), join(ROOT, 'src')]
      .filter((dir) => existsSync(dir));
    const LITERAL = new RegExp(`\\b${field.name}:\\s*['\`"]`);

    for (const dir of writers) {
      for (const path of walk(dir)) {
        if (!/\.tsx?$/.test(path)) continue;
        const rel = relative(ROOT, path);
        if (rel.includes('generated')) continue;

        const text = readFileSync(path, 'utf8');

        /* مدى كل `data: {` بعدّ الأقواس — فلا يبتلع الكائن التالي */
        for (const open of text.matchAll(/\bdata:\s*\{/g)) {
          let depth = 0;
          let end = open.index;
          for (let at = open.index + open[0].length - 1; at < text.length; at += 1) {
            if (text[at] === '{') depth += 1;
            else if (text[at] === '}') {
              depth -= 1;
              if (depth === 0) { end = at; break; }
            }
          }
          const body = text.slice(open.index, end);
          if (!LITERAL.test(body)) continue;

          const line = text.slice(0, open.index + body.search(LITERAL)).split('\n').length;
          problems.push(
            `${rel}:${String(line)}  \`${field.name}\` يُكتب صريحًا والمنتج يكتبه `
              + 'مشفَّرًا — صيغتان في عمودٍ واحد',
          );
        }
      }
    }
  }
}


/**
 * ═══ البوابة ٣٠ ═══ **حالةٌ تُنسخ من خاصّية تتقادم عند التنقّل.**
 *
 * `useState(prop)` يُقرأ عند **التركيب وحده**. والتنقّل داخل التطبيق
 * بين صفحتين من المسار نفسه لا يُعيد تركيب المكوّن، فتبقى حالتُه من
 * الصفحة السابقة — **بلا خطأ ولا تحذير**.
 *
 * ووقع مرّتين في شاشةٍ واحدة:
 *   · «احفظ البحث» يقول «محفوظ» بعد حذف شارةٍ — وهو بحثٌ آخر لم يُحفظ.
 *   · وقلبُ المفضّلة يحمل حال المركبة السابقة عند الانتقال إلى أختها.
 *
 * **والعلاج اشتقاقٌ لا مزامنة**: تُحفظ هوية ما تغيّر مع قيمته، فتصدُق
 * على صاحبها وتكذب على غيره بلا `useEffect`.
 *
 * ═══ وحدُّها: مكوّنٌ يحمل هوية ═══
 *
 * وقِيست أوّلًا على كل نسخٍ من خاصّية فأخرجت تسعة، **خمسةٌ منها
 * مشروعة**: استمارةٌ تُبذَر من الخادم ثمّ يكتب فيها صاحبها، ونسخُها
 * هو الصواب — ولو اشتُقّت لمُسح ما كتبه عند كل تحديث.
 *
 * فالفرق أن المعطوب يحمل **خاصّية هوية** (`listingRef` · `query`)
 * تتغيّر تحت التركيب نفسه، فتتقادم النسخة معها. واستمارةٌ بلا هوية
 * لا يتغيّر تحتها شيء.
 */
function checkStateCopiedFromProps() {
  /** `useState(x)` حيث `x` معرّفٌ بسيط أو `a.b` — لا استدعاء ولا حرفيّة. */
  const COPY = /useState\(\s*([a-z_$][\w$]*(?:\.[\w$]+)*)\s*(?:\?\?[^)]*)?\)/gi;
  /** قيمٌ لا تأتي من خاصّية: ثابتٌ أعلى الملفّ أو قيمة من `use…`. */
  const SAFE = /^(window|document|globalThis|crypto|Date|Math|String|Number|Boolean)\b/;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    /** التعليق يصف ولا يُنفّذ — وأوّل قياسٍ أطلق على شرح العلّة نفسه. */
    const text = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');
    if (!text.includes("'use client'")) continue;

    /* أسماء الخاصّيات — ما يُفكّك في توقيع المكوّن */
    const props = new Set();
    for (const block of text.matchAll(/^export function \w+\(\{([\s\S]*?)\}:/gm)) {
      for (const name of (block[1] ?? '').matchAll(/^\s*(\w+)\s*(?:,|$)/gm)) {
        props.add(name[1]);
      }
    }
    if (props.size === 0) continue;

    /**
     * خاصّيةُ هويةٍ تتغيّر تحت التركيب نفسه — وبلا واحدةٍ منها لا
     * يتقادم شيء، فالنسخ مشروع.
     */
    const IDENTITY = /^(.*(Ref|Id|Slug)|query|ref|id|slug)$/;
    if (![...props].some((name) => IDENTITY.test(name))) continue;

    for (const match of text.matchAll(COPY)) {
      const expression = match[1] ?? '';
      if (SAFE.test(expression)) continue;
      const root = expression.split('.')[0] ?? '';
      if (!props.has(root)) continue;

      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  \`useState(${expression})\` ينسخ خاصّية — `
          + 'تتقادم عند التنقّل داخل التطبيق؛ اشتقّ القيمة بدل نسخها',
      );
    }
  }
}


/**
 * ═══ البوابة ٣١ ═══ **ما يوافق العددَ يدخل داخل صيغة الجمع.**
 *
 * `<Quantity>` تُصيب واحدةً من ستّ صيغ، **وما يُضَمّ إليها من خارجها
 * لا يُصيب شيئًا**: حرفُ جرٍّ قبلها يترك المثنّى مرفوعًا، وصفةٌ بعدها
 * تلزم صيغةً واحدة بينما المعدود يتغيّر.
 *
 * ووقع مرّتين في يومٍ واحد:
 *   · `«قبل» + <Quantity unit="months">` ⇒ **«قبل شهران»** (وصوابه
 *     «قبل شهرين») — على كل بطاقةٍ في صفحة النتائج.
 *   · `<Quantity unit="dealers"/> + «موثّقًا» + «في» + <Quantity/>`
 *     ⇒ **«٣ معارض موثّقًا في مدينتان»** — سطران خاطئان في جملة.
 *
 * والعلاج واحد: الجارّ والصفة داخل الرسالة بصيغها الستّ.
 *
 * (وهو امتدادُ القاعدة المسجَّلة في صفر `Quantity`: «منذ لا ساعات».
 * صيغةٌ تصلح وحدها لا تصلح مضمومةً.)
 */
/**
 * آخرُ كلمةٍ عربية في رسالةٍ بمفتاحها — فيُكشف الجارُّ ولو كان في
 * ملفّ الترجمة. ويُبحث بآخر مقطعٍ من المفتاح لأن المساحة تُحدَّد في
 * `useTranslations` لا عند الاستدعاء — ومفتاحٌ مكرَّر يُترك، فظنٌّ
 * بلا يقين يُنتج إنذارًا كاذبًا.
 */
function lastWordOfMessage(key) {
  const file = join(ROOT, 'src', 'messages', 'ar.json');
  if (!existsSync(file)) return '';
  const leaf = key.split('.').pop() ?? key;

  const collect = (node) => {
    if (typeof node !== 'object' || node === null) return [];
    const found = [];
    for (const [name, child] of Object.entries(node)) {
      if (name === leaf && typeof child === 'string') found.push(child);
      else found.push(...collect(child));
    }
    return found;
  };

  /**
   * **ورسائلُ الجمع تُطرح**: هي العلاج لا العلّة — تحمل الجارَّ
   * داخلها. ولولا طرحُها لصار إصلاحُ عطلٍ (بإضافة صيغةٍ بالمفتاح
   * نفسه في `counted`) يُعمي البوابةَ عن العطل الأصليّ. وقد وقع.
   */
  const values = collect(JSON.parse(readFileSync(file, 'utf8'))).filter(
    (value) => !/^\s*\{\s*count\s*,/.test(value),
  );
  if (values.length !== 1) return '';
  const words = (values[0] ?? '').match(/[ء-ي]+/g) ?? [];
  return words[words.length - 1] ?? '';
}

function checkQuantityAdjacency() {
  /** حروفُ جرٍّ وظروفٌ تُغيّر إعراب ما بعدها. */
  const BEFORE = ['في', 'من', 'إلى', 'على', 'عن', 'قبل', 'بعد', 'منذ', 'خلال', 'حتى', 'لـ', 'بـ'];
  /** صفاتٌ ونعوتٌ شائعة تتبع المعدود فتلزمه صيغةً واحدة. */
  const AFTER = /^(موثّق|موثق|مفتوح|مغلق|جديد|قديم|نشط|معلّق|متبقّي|باق)/;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    /* التعليق يصف ولا يُنفّذ — وشرحُ العلّة نفسه يذكرها */
    const text = readFileSync(path, 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');

    for (const hit of text.matchAll(/<Quantity\b[^>]*\/>/g)) {
      const line = text.slice(0, hit.index).split('\n').length;

      /*
       * ① حرفُ جرٍّ قبلها — في الشاشة **أو في ملفّ الترجمة**.
       *
       * وأخفت البوابة أوّلَ مرّةٍ عدّادَ «إعادة الإرسال بعد» لأن
       * الجارّ كان في `t('resendIn')` لا مكتوبًا في JSX. ونصٌّ ينتهي
       * بحرف جرٍّ ثمّ عدّادٌ بعده هو الصنف نفسه.
       */
      /**
       * **ووسمٌ مغلقٌ بينهما لا يفصل.** `<span>{t('basedOn')}</span>`
       * ثمّ عدّادٌ هو الضمُّ نفسه — والقارئ يرى جملةً واحدة. فتُطرح
       * الوسوم من النظر إلى الوراء. (أخفت البوابة «مبني على صفقتان»
       * في `RangeBar` حتى طُرحت.)
       */
      const before = text
        .slice(Math.max(0, hit.index - 90), hit.index)
        .replace(/<\/?[A-Za-z][^>]*>/g, ' ');
      const viaKey = /\{\s*t\w*\(\s*'([\w.]+)'\s*\)\s*\}\s*$/.exec(before.trimEnd());
      const fromMessages = viaKey === null ? '' : lastWordOfMessage(viaKey[1] ?? '');
      const words = before.match(/[ء-ي]+/g) ?? [];
      const last = fromMessages !== '' ? fromMessages : (words[words.length - 1] ?? '');
      if (BEFORE.includes(last)) {
        problems.push(
          `${rel}:${String(line)}  «${last}» قبل <Quantity> — الجارّ يُدخَل في صيغة `
            + 'الجمع، وإلّا بقي المثنّى مرفوعًا («قبل شهران»)',
        );
        continue;
      }

      /* ② صفةٌ بعدها تلزم المعدودَ صيغةً واحدة */
      const after = text.slice(hit.index + hit[0].length, hit.index + hit[0].length + 60);
      const next = (after.match(/[ء-ي]+/) ?? [''])[0];
      if (AFTER.test(next)) {
        problems.push(
          `${rel}:${String(line)}  «${next}» بعد <Quantity> — الصفة تُدخَل في صيغة `
            + 'الجمع، وإلّا خالفت معدودها («٣ معارض موثّقًا»)',
        );
      }
    }
  }
}


/**
 * ═══ البوابة ٣٢ ═══ **صلاحيةٌ في الاتّحاد تُعرض وتُمنح.**
 *
 * `Permission` اتّحادٌ يحرس به الكود، و`PERMISSION_LIST` القائمة
 * **الوحيدة التي تراها عين** (شاشة A35)، و`MATRIX.SUPER_ADMIN` من
 * يملك كلّ شيء. وثلاثتها تُكتب بيد، فتتباعد صامتةً.
 *
 * ووقع: `payouts.send` أُضيفت إلى الاتّحاد والمصفوفة في المهمّة ١٠٣
 * **ونُسيت في القائمة** — فصارت صلاحيةُ تحويلِ مالٍ **نافذةً وغير
 * معروضة**، ومن يراجع «من يملك ماذا» يقرأ جردًا ناقصًا ولا يعلم.
 */
/**
 * ═══ البوابة ٣٣ ═══ **كلُّ وجهةٍ نُرسل إليها لها مسار**.
 *
 * الشراءُ الفوريّ ينجح، والطلب صحيح، والخادم يردّ
 * `next: "/orders/ORD-…"` — **و٤٠٤**. المسار القائم
 * `/account/orders/{ref}`، وكُشف بمشي الرحلة لا بقراءتها.
 *
 * والصنف تكرّر: ستُّ شاشات حسابٍ كانت ٤٠٤ والحساب يربط إليها، وصفحةُ
 * هبوطٍ تموت حين تُباع مركبة، وهذه الثالثة. **ووجهةٌ ميّتة بعد نجاحٍ
 * أسوأ من فشلٍ صريح**: الفعل وقع والمستخدم لا يعرف أين ذهب.
 *
 * والفحص على **وجهات التنقّل وحدها** — `href` و`router.push` و
 * `location.href` و`redirect` و`next:` — لا على أيّ نصٍّ يبدأ بشرطة.
 * و`${…}` قطعةٌ متغيّرة تُطابق `[param]`. (قِيست فأخرجت صفرًا.)
 */
/**
 * ═══ البوابة ٣٥ ═══ **السنة لا تُجمَّع.**
 *
 * `<ArabicNumber value={row.year} />` تُخرج «2,026»: الفاصلة تجعل
 * السنة مبلغًا، فيقرأ المشغّل «ألفين وستة وعشرين ريالًا» في موضع
 * الموديل. ووقع في أربعة مواضع قبل أن يُلاحَظ — ولم يُلاحَظ إلّا حين
 * صارت الأرقام لاتينيّة، فـ«٢٬٠٢٦» كانت تمرّ على العين.
 *
 * و`<Year>` تمنعه بالبناء: لا خيار يُنسى.
 */
function checkYearGrouping() {
  const YEAR_IN_NUMBER = /<ArabicNumber[^>]*value=\{[^}]*\byear\b[^}]*\}/;

  for (const file of walk(join(ROOT, 'src'))) {
    if (!file.endsWith('.tsx') || file.includes(`${sep}generated${sep}`)) continue;
    /**
     * **والتعليق يُفرَّغ ولا يُحذف.** أوّل تشغيلٍ بلّغ عن `Year.tsx`
     * نفسها: شرحُها يكتب المثال الخاطئ ليقول لا تفعله. وحذفُ
     * التعليقات يُزيح أرقام الأسطر، فتُبلَّغ مخالفةٌ في سطرٍ غير
     * سطرها — فتُستبدل بفراغٍ بالطول نفسه.
     */
    const text = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/(?<!:)\/\/[^\n]*/g, (line) => line.replace(/./g, ' '));

    for (const [index, line] of text.split('\n').entries()) {
      if (!YEAR_IN_NUMBER.test(line)) continue;
      if (line.includes('grouped={false}')) continue;
      problems.push(
        `${relative(ROOT, file)}:${index + 1}  سنةٌ في <ArabicNumber> بلا grouped={false} — `
          + 'استعمل <Year>: الفاصلة تجعلها مبلغًا',
      );
    }
  }
}

function checkNavTargets() {
  const appDir = join(ROOT, 'src', 'app');
  if (!existsSync(appDir)) return;

  const routes = [];
  const walkRoutes = (dir, segs) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkRoutes(full, entry.name.startsWith('(') ? segs : [...segs, entry.name]);
      } else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
        routes.push(segs.filter((seg) => seg !== '[locale]'));
      }
    }
  };
  walkRoutes(appDir, []);

  const resolves = (parts) => routes.some((route) => {
    if (route.length !== parts.length) return false;
    return route.every((seg, i) => seg.startsWith('[') || parts[i] === '*' || seg === parts[i]);
  });

  const NAV = /(?:href=|router\.(?:push|replace)\(|location\.href\s*=\s*|redirect\(|permanentRedirect\(|next:\s*)[`'"]([^`'"]*)[`'"]/g;

  const files = walk(join(ROOT, 'src'))
    .filter((file) => /\.tsx?$/.test(file) && !file.includes(`${sep}generated${sep}`));

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(NAV)) {
      const raw = match[1].replace(/\$\{[^}]*\}/g, '*').split('?')[0].split('#')[0];
      if (!raw.startsWith('/') || raw.startsWith('/*')) continue;
      if (/^\/(api|_next|diagrams)\b/.test(raw)) continue;

      const parts = raw.replace(/\/$/, '').split('/')
        .filter(Boolean)
        .filter((seg) => seg !== 'ar' && seg !== 'en');
      if (parts.length === 0 || resolves(parts)) continue;

      problems.push(
        `${relative(ROOT, file)}  «${match[1]}» وجهةٌ بلا مسار — `
          + 'ومن يصلها بعد نجاحٍ يقرأ ٤٠٤',
      );
    }
  }
}

function checkPermissionCatalogue() {
  const file = join(ROOT, 'src', 'lib', 'domain', 'permissions.ts');
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');

  const union = /export type Permission =([\s\S]*?);/.exec(text);
  const list = /export const PERMISSION_LIST[^=]*=\s*\[([\s\S]*?)\]/.exec(text);
  const superRow = /SUPER_ADMIN:\s*\{([\s\S]*?)\n  \}/.exec(text);
  if (union === null || list === null || superRow === null) return;

  const names = (block) => new Set([...(block ?? '').matchAll(/'([\w.]+)'/g)].map((m) => m[1]));

  const declared = names(union[1]);
  const shown = names(list[1]);
  const granted = names(superRow[1]);

  /**
   * **والتسمية العربية ثالثُ الواجبات.** صلاحيةٌ بلا تسمية تُعرض
   * مفتاحًا لاتينيًّا في مصفوفة A35 — فتقول الشاشة إنها تُغني عن
   * فتح الشيفرة وهي تعرضها. ووقع في الاثنتين والعشرين كلّها.
   */
  const labels = join(ROOT, 'src', 'lib', 'labels', 'permissions.ts');
  const labelled = existsSync(labels)
    ? names(/export const PERMISSION_LABEL[^=]*=\s*\{([\s\S]*?)\n\};/.exec(readFileSync(labels, 'utf8'))?.[1])
    : null;
  const modules = existsSync(labels)
    ? names(/export const PERMISSION_MODULES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(readFileSync(labels, 'utf8'))?.[1])
    : null;

  for (const permission of declared) {
    if (labelled !== null && !labelled.has(permission)) {
      problems.push(
        `src/lib/labels/permissions.ts  «${permission}» بلا تسمية عربية — `
          + 'تُعرض في المصفوفة مفتاحًا لاتينيًّا',
      );
    }
    if (modules !== null && !modules.has(permission)) {
      problems.push(
        `src/lib/labels/permissions.ts  «${permission}» خارج PERMISSION_MODULES — `
          + 'تُعرض تحت «أخرى»',
      );
    }
    if (!shown.has(permission)) {
      problems.push(
        `src/lib/domain/permissions.ts  «${permission}» في الاتّحاد وليست في `
          + 'PERMISSION_LIST — نافذةٌ لا تراها شاشة الفريق',
      );
    }
    if (!granted.has(permission)) {
      problems.push(
        `src/lib/domain/permissions.ts  «${permission}» لا يملكها SUPER_ADMIN — `
          + 'صلاحيةٌ لا يستطيعها أحد',
      );
    }
  }
}


/**
 * ═══ البوابة ٣٦ ═══ **السلّم الجانبيّ يتراكب على الهاتف أو يُخفى.**
 *
 * `<aside className="w-[250px] shrink-0">` داخل صفٍّ أفقيّ: على شاشة
 * ٣٧٥ يأخذ ٢٥٠ ويترك للوحة المجاورة **٧٧px** — جدولٌ بستّة أعمدة في
 * عرض كلمة. و`shrink-0` تقول صراحةً «لا تنكمش»، فالضيق لا يُصلحه
 * المتصفّح.
 *
 * **ولا شيء يسقط**: الصفحة تُصيَّر، والاختبارات تمرّ (لا تفتح شاشة)،
 * والعطل لا يُرى إلّا بعينٍ على جهاز. وقع في `CatalogTree` بينما
 * `AdminShell` و`SearchScreen` كلاهما محروس بالصيغة نفسها
 * (`hidden … lg:flex`) — فالصنف معروفٌ وحلُّه مكتوبٌ في الشجرة.
 *
 * **والقياس على السلالم وحدها** (`aside` و`nav`): عنصرٌ بعرضٍ ثابت
 * داخل `flex-wrap` ينزل سطرًا بنفسه ولا يضيّق جاره — فتعميمُ الفحص
 * على كل `shrink-0` يُنذر على ما لا عطب فيه.
 */
function checkSidebarsStack() {
  const OPENING = /<(aside|nav)\b[^>]*?className=(?:'([^']*)'|"([^"]*)"|\{cn\(([\s\S]{0,400}?)\)\})/g;
  /** عرضٌ ثابت — `w-[250px]` أو `w-64` (وسُلَّم tailwind ‎×4px‎). */
  const WIDTH = /(?:^|[\s'"`])w-\[(\d+)px\]|(?:^|[\s'"`])w-(\d+(?:\.\d+)?)(?:[\s'"`]|$)/g;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    const text = readFileSync(path, 'utf8');

    for (const tag of text.matchAll(OPENING)) {
      const classes = tag[2] ?? tag[3] ?? tag[4] ?? '';
      if (!/\bshrink-0\b/.test(classes)) continue;

      let widest = 0;
      for (const w of classes.matchAll(WIDTH)) {
        const px = w[1] !== undefined ? Number(w[1]) : Number(w[2]) * 4;
        if (px > widest) widest = px;
      }
      if (widest < 200) continue;

      /**
       * الحارسان المقبولان: **يُخفى** تحت `lg` ثم يظهر، أو **عرضُه
       * نفسه** مشروطٌ بنقطة توقّف. وأيّهما يعني أن الكاتب رأى الهاتف.
       */
      const hiddenBelow = /\bhidden\b/.test(classes) && /\b(sm|md|lg|xl):(flex|block|grid)\b/.test(classes);
      const responsiveWidth = /\b(sm|md|lg|xl):w-/.test(classes);
      if (hiddenBelow || responsiveWidth) continue;

      const line = text.slice(0, tag.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  <${tag[1]}> بعرضٍ ثابت ${String(widest)}px وshrink-0 بلا نقطة توقّف — `
          + 'يبتلع عرض الهاتف ويترك لجاره ما لا يُقرأ',
      );
    }
  }
}


/**
 * ═══ البوابة ٣٧ ═══ **مفتاحٌ يُكتب لا قالبَ له = إشعارٌ يصل فارغًا.**
 *
 * `notify({ templateKey: 'offer.lost' })` يكتب صفًّا، والعرض يُصيَّر من
 * `NotificationTemplate` — فمفتاحٌ لا قالب له **يصل سطرًا فارغًا** في
 * مركز الإشعارات. ولا شيء يسقط: الصفّ كُتب، والمعاملة نجحت، والعطل
 * لا يُرى إلّا في عين المستلم.
 *
 * **وكان الكاتب يعرف**: تعليقٌ في `auction-order.ts` يشرح الصنف
 * حرفيًّا («إشعارٌ بمفتاحٍ بلا قالب يصل فارغًا») — وثلاثةُ مفاتيح
 * سقطت فيه بعده: `offer.lost` و`listing.relisted` و
 * `order.payment_timeout`. فالتعليق لا يحرس، والبوابة تحرس.
 *
 * **ويُفحص `channelInApp`** كذلك: قالبٌ مُطفأ في القناة التي نعرض
 * منها هو غيابٌ بصيغة أخرى.
 */
function checkNotificationTemplates() {
  const SEED = 'prisma/seed-data/notification-templates.json';
  const templates = JSON.parse(readFileSync(join(ROOT, SEED), 'utf8'));
  const byKey = new Map(templates.map((row) => [row.key, row]));

  const WRITE = /templateKey:\s*'([a-z_.]+)'/g;

  for (const path of walk(join(ROOT, 'src', 'lib', 'domain'))) {
    if (!/\.ts$/.test(path)) continue;
    const rel = relative(ROOT, path);
    const text = readFileSync(path, 'utf8');

    for (const match of text.matchAll(WRITE)) {
      const key = match[1];
      const line = text.slice(0, match.index).split('\n').length;
      const template = byKey.get(key);

      if (template === undefined) {
        problems.push(
          `${rel}:${String(line)}  «${key}» يُكتب ولا قالب له في ${SEED} — الإشعار يصل فارغًا`,
        );
        continue;
      }
      if (template.channelInApp !== true) {
        problems.push(
          `${rel}:${String(line)}  «${key}» قالبُه مُطفأ في channelInApp — يُكتب ولا يُعرض`,
        );
      }
      if (template.bodyAr === null || template.bodyAr === undefined || template.bodyAr === '') {
        problems.push(`${rel}:${String(line)}  «${key}» قالبُه بلا bodyAr — سطرٌ بلا نصّ`);
      }
    }
  }
}


/**
 * ═══ البوابة ٣٨ ═══ **لغة الشاشة لغة السوق لا لغة الكتب.**
 *
 * المنصة تُعرض على مستثمرين وتُستعمل في السعودية، وكلماتٌ مثل
 * «الطابور» و«نيابةً» و«اطّلاع» لا تُكتب في أي منصة سعودية كبيرة —
 * تُقرأ ترجمةً أو تكلّفًا، وكلاهما يُضعف الثقة قبل أن يُقرأ المحتوى.
 *
 * **وكلمةٌ لا تُقرأ بلا شكل أخطر**: «بِيعت» بلا كسرة تصير «بَيعت»،
 * و«قُبل عرضك» تصير «قبل عرضك» — ومعناها ينقلب من «تم القبول» إلى
 * «قبل أن تعرض». فالعلاج إعادة صياغة («تم قبول عرضك») لا إضافة شكل.
 *
 * **والتعليقات لا تُفحص**: أسلوب المستودع قرار صاحبه، والمقصود نصّ
 * الشاشة وحده.
 *
 * وقِيست على الشجرة قبل تفعيلها فأخرجت ثمانيةً وأربعين — فنُقلت كلها
 * ثم فُعّلت.
 */
function checkPlainArabic() {
  /** كلمات بديلها مكتوبٌ بجانبها — والرسالة تقترح ولا تكتفي بالمنع. */
  const HEAVY = [
    ['الطابور', 'القائمة'],
    ['نيابةً', 'بدلًا عن / بالنيابة'],
    ['اطّلاع', 'اطلاع'],
    ['المكوث', 'المدة'],
    ['البتّ', 'الحسم / القرار'],
    ['يُقتطع', 'سيُختصر'],
    ['مُسترجَع', 'مسترجع'],
    ['مُفرَج', 'تم تحويله'],
    ['بِيعت', 'تم البيع'],
    ['ثمَّة', 'هناك'],
    ['حينئذٍ', 'عندها'],
  ];

  const MESSAGES = 'src/messages/ar.json';
  const text = readFileSync(join(ROOT, MESSAGES), 'utf8');
  for (const [word, better] of HEAVY) {
    if (text.includes(word)) {
      problems.push(`${MESSAGES}  «${word}» — لغة شاشة لا كتب؛ استعمل «${better}»`);
    }
  }

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx?$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    /* التعليق أسلوبٌ لا واجهة — ويُفرَّغ بفراغٍ بالطول نفسه فتبقى الأسطر */
    const source = readFileSync(path, 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (b) => b.replace(/[^\n]/g, ' '))
      .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (b) => b.replace(/[^\n]/g, ' '));

    for (const [word, better] of HEAVY) {
      let at = source.indexOf(word);
      while (at !== -1) {
        const line = source.slice(0, at).split('\n').length;
        problems.push(
          `${rel}:${String(line)}  «${word}» — لغة شاشة لا كتب؛ استعمل «${better}»`,
        );
        at = source.indexOf(word, at + word.length);
      }
    }
  }
}


/**
 * ═══ ٤١ · العدد لا يُوضع بين قوسين ليَسلم من الجمع ═══
 *
 * بوابةُ الجمع (١٦) تمنع رقمًا يسبق كلمةً عربية مباشرةً، لأن العربية
 * ستُّ صيغ: «٢ ساعة» خطأ وصوابُها «ساعتان». فنشأ التفافٌ عليها:
 * **«ساعات (٢)»** — الكلمةُ أوّلًا والرقمُ بين قوسين فلا يتجاوران.
 *
 * وهو يُمرّ البوابة ويفشل في القراءة: «أقدمها منذ أيّام (٣)» ليست
 * عربيّةً يكتبها إنسان، و«المخزون (٥)» و«مزايدون (٦)» مثلها. وقد صار
 * النمطُ في **ثلاثين موضعًا** في اللوحة، فكان أوّل ما يُقرأ على أنّ
 * نصّ المنتج مولَّد.
 *
 * والصواب `<Quantity unit>` و`<Duration hours>` — وهما يصوغان الحالات
 * الستّ من `units` في ملفّ الترجمة.
 *
 * **والاستثناء رسائلُ الـToast** (ونظائرُها من النصوص الخالصة): لا
 * يبلغها مكوّن، والقاعدة فيها مكتوبة — تُصاغ الجملة فلا يحكم العددُ
 * المعدود، «الطلبات القائمة (١٠)». فالفحص على JSX وحده: `({displayDigits`
 * داخل نصٍّ معروض، لا `` `(${displayDigits` `` داخل قالبٍ نصّيّ.
 */
function checkParentheticalCounts() {
  for (const file of walk('src')) {
    if (!file.endsWith('.tsx')) continue;
    const source = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    const lines = source.split('\n');
    for (const [n, line] of lines.entries()) {
      if (!line.includes('({displayDigits(')) continue;
      problems.push(
        `${rel}:${String(n + 1)}  «كلمة (رقم)» التفافٌ على بوابة الجمع — استعمل <Quantity unit> أو <Duration hours>`,
      );
    }
  }
}

/**
 * ═══ ٤٢ · الحالة المخزَّنة لا تكفي متى كان لها وقت ═══
 *
 * مزادٌ حالتُه `LIVE` وقد انقضى وقتُه **ليس جاريًا**: الوظيفة الدورية
 * تمرّ كل خمس دقائق، وما بين الانقضاء ومرورها يقرؤه كلُّ استعلامٍ
 * يسأل عن الحالة وحدها حيًّا.
 *
 * والصنف وقع **خمس مرّات**: في العروض، ثمّ في شاشة المزادات بلوحة
 * الأدمن، ثمّ في كرت المزاد، ثمّ في عدّاد الرئيسية — وآخرُها شريطٌ في
 * أعلى الصفحة الأولى يقول «الأقرب إغلاقًا» ويرسم عدّادًا على
 * `00:00:00`، وهو أوّلُ ما يراه الزائر.
 *
 * فكلُّ `status: 'LIVE'` في **قراءةٍ** يصحبه حدٌّ على `endsAt`.
 * والكتابة (`data: { status: 'LIVE' }`) مستثناة: هي التي تُنشئ
 * الحالة لا تسأل عنها.
 */
/**
 * ═══ ومرحلةُ طلبٍ لا تُعرض وحدها ═══
 *
 * **الإلغاء حالةٌ لا مرحلة** (قرار المصمّم ١٧، ٢٠٢٦-٠٨-٠٢): الطلب يبقى
 * عند المرحلة التي مات فيها، فطلبٌ أُلغي عند الدفع **مرحلتُه `PAYMENT`
 * إلى الأبد**. فمن عرض المرحلة وحدها قال «الدفع» عن طلبٍ ميّت.
 *
 * والصنف وقع **في ثمانية مواضع** كُشفت في مسحٍ واحد: بنر الحساب،
 * وشارة بطاقة الحساب، وصفّ «طلباتي»، ووسمان متجاوران في شاشة الطلب
 * («ملغى» بالأخضر وبجانبه «دفع»)، وصندوق «ادفع قبل ‹تاريخ›»، وكرت
 * الأدمن، وشاشة الطلب في اللوحة، وصفوف الطلبات في شاشتي الإعلان
 * والمستخدم (المرحلة بالعربية و`status` خامًّا بالإنجليزية بجوارها).
 *
 * **والجذر هو المحكّ**: `order.stage` و`row.stage` حالٌ قائمة تُقيَّد،
 * و`event.toStage` و`metric.stage` ليستا كذلك — الأولى انتقالٌ وقع
 * في ماضيه، والثانية تجميعٌ عبر طلباتٍ كثيرة لا حالَ لها.
 *
 * فالمرور بـ`OrderStatusBadge` (الموقع) أو `orderStateLabel` (اللوحة)،
 * وهما الموضعان المستثنيان.
 */
function checkStageNeedsStatus() {
  const ALLOWED = new Set([
    'src/components/ui/OrderStatusBadge.tsx',
    'src/components/ui/StageTracker.tsx',
    'src/lib/labels/orders.ts',
  ]);
  /**
   * ═══ المستثنى: التجميع وحده ═══
   *
   * `metric.stage` تجميعٌ عبر طلباتٍ كثيرة لا حالَ لها.
   *
   * **و`event.toStage` لا تحتاج استثناءً**: النمط يطلب `.stage` حرفيًّا
   * فلا يبلغها أصلًا.
   *
   * **و`row` ليست مستثناة** — وكانت كذلك في أوّل نسخةٍ من هذه البوابة،
   * فمرّت على `STAGE_LABEL[row.stage]` في كرت الأدمن وهو العطل الذي
   * كُتبت له. (أُثبت بالإرجاع فلم تسقط، فصُحّحت.)
   */
  const NOT_AN_ORDER = /^metric$/;

  for (const file of walk('src')) {
    if (!/\.tsx?$/.test(file)) continue;
    const rel = relative(ROOT, file);
    if (ALLOWED.has(rel)) continue;

    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');

    lines.forEach((line, n) => {
      // التعليقات لا تُحاسب — والشرح يذكر ما يمنعه
      const code = line.trimStart();
      if (code.startsWith('*') || code.startsWith('//')) return;

      const hits = [
        ...line.matchAll(/orderStage\.\$\{([A-Za-z_$][\w$.]*)\.stage\}/g),
        ...line.matchAll(/STAGE(?:_LABEL)?\[\s*([A-Za-z_$][\w$.]*)\.stage\s*\]/g),
      ];

      for (const hit of hits) {
        const expr = hit[1];
        if (expr === undefined) continue;
        const root = expr.split('.')[0] ?? '';
        if (NOT_AN_ORDER.test(root)) continue;

        problems.push(
          `${rel}:${String(n + 1)}  «${expr}.stage» معروضةً وحدها — والإلغاء حالةٌ لا مرحلة.` +
            ' استعمل <OrderStatusBadge> أو orderStateLabel(status, stage)',
        );
      }
    });
  }
}

function checkLiveNeedsTime() {
  for (const file of walk('src')) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    if (!source.includes("status: 'LIVE'")) continue;

    const rel = relative(ROOT, file);

    for (const match of source.matchAll(/status:\s*'LIVE'/g)) {
      const at = match.index ?? 0;

      /**
       * **والنطاق هو الكائن نفسه لا نافذةٌ من الأسطر.** أوّلُ صيغةٍ
       * فحصت ±ستّة أسطر، فالتقطت `endsAt` من **استعلامٍ مجاور**
       * ومرّت على العطل الذي بُنيت له. والحدّ يُقرأ بالعدّ: نرجع إلى
       * `{` الذي يفتح الكائن، ثمّ نتقدّم إلى ما يقابله.
       */
      let depth = 0;
      let open = at;
      while (open > 0) {
        open -= 1;
        const ch = source[open];
        if (ch === '}') depth += 1;
        else if (ch === '{') {
          if (depth === 0) break;
          depth -= 1;
        }
      }

      depth = 0;
      let close = open;
      while (close < source.length) {
        const ch = source[close];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        close += 1;
      }

      const object = source.slice(open, close + 1);
      /** كتابةٌ لا قراءة — `data: { status: 'LIVE' }` تُنشئ الحالة. */
      if (/\bdata:\s*$/.test(source.slice(Math.max(0, open - 8), open).trimEnd().slice(-8))) continue;
      if (object.includes('endsAt')) continue;

      /** وقد يكون الحدّ على الكائن الأب — `{ OR: [{ status: 'LIVE', … }] }`. */
      const line = source.slice(0, at).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  «status: 'LIVE'» بلا حدٍّ على endsAt — الحالة وانقضاء الوقت معًا`,
      );
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
checkTaxRate();
  checkInterpolatedNumbers();
checkDomainHasNoProse();
checkApprovalQuorum();
checkListingState();
checkFunctionPropsAcrossBoundary();
checkDeadLabelKeys();
checkIdentityFlag();
checkEnglishFieldsAreEnglish();
checkTranslationKeysResolve();
checkRetiredPromises();
checkFlexInputsCanShrink();
checkEncryptedFieldReaders();
checkStateCopiedFromProps();
checkQuantityAdjacency();
checkPermissionCatalogue();
checkNavTargets();
checkYearGrouping();
checkSidebarsStack();
checkNotificationTemplates();
checkPlainArabic();
checkParentheticalCounts();
checkLiveNeedsTime();
checkStageNeedsStatus();

// ————— النتيجة —————
if (problems.length > 0) {
  console.error('\n✗ بوابة الجودة — القسم ١٤:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} مخالفة.\n`);
  process.exit(1);
}

console.log(
  '✓ بوابة الجودة: لا لون مكتوب · لا تسلسل رقميّ بمحايدٍ في نصّ عربيّ · لا سطر بيانات كنصّ واحد · لا # في جمع ICU · الوحدات مصرَّح بها · لا رقم في سلسلة نصّ · كل لون له توكن · كل ترحيل ماليّ له نقض · لا صفّ Prisma يعبر الحدّ · لا نقطة في مفتاح ترجمة · لا db في حزمة المتصفّح · لا مفردة مزوّد خارج المُهايئ · الضريبة تُحسب في tax.ts وحده · لا نصّ عربي في النطاق · لا رقم مُقحَم قبل كلمة عربية · لا نصاب عضوين بنصفه · حالة الإعلان من مدخلها الوحيد · لا دالّة تعبر حدّ الخادم · لا مفتاح تسمية ميّت · لا idVerified بلا identityStatus · لا حقل En نصُّه عربيّ · لا ترميز غير مُصيَّر في بيانات البذرة · كل مفتاح ترجمة يُفضي إلى نصّ · لا وعدَ قاعدةٍ أُلغيت · لا حقل flex بلا min-w-0 · لا قصّ لحقلٍ مشفَّر · لا حالة تُنسخ من خاصّية · لا جارَّ ولا صفةَ خارج صيغة الجمع · كل صلاحيةٍ معروضةٌ وممنوحة · كل وجهةٍ لها مسار · الضمان يُنشأ مع قيده · والسنة لا تُجمَّع · وكل سلّمٍ جانبيّ يتراكب على الهاتف · وكل مفتاح إشعارٍ له قالبٌ يُعرض · ولغة الشاشة لغة السوق · ولا عددَ بين قوسين فرارًا من الجمع · والحالةُ وانقضاءُ الوقت معًا · ولا مرحلةَ طلبٍ تُعرض وحدها.',
);
