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
 *
 * ═══ والأسطر تُحفَظ ═══
 *
 * كانت تستبدل التعليق بمسافةٍ واحدة، **فتعليقٌ من عشرين سطرًا يطوي
 * الملفّ عشرين سطرًا**: أنذرت البوابة ٥٥ على «PriceGuidance.tsx:36»
 * والمخالفة في ٥٥ — فيذهب القارئ إلى سطرٍ سليم ويظنّ الإنذار كاذبًا.
 * فيُفرَّغ جسدُ التعليق ويبقى `\n` مكانه: النصّ يذهب والترقيم يبقى.
 */
function stripComments(source) {
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_match, lead, body) => `${lead}${blank(body)}`);
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
    /** والتعليق يُحذف — `from '@/lib/db'` في تعليقٍ ليس استيرادًا. */
    source = stripComments(readFileSync(entry, 'utf8'));
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

/**
 * **و`capture` سمةُ HTML أيضًا** — `<input type="file" capture="environment">`
 * تفتح الكاميرا مباشرةً، وهي ما يحتاجه فاحصٌ واقفٌ عند السيارة.
 *
 * وهي أختُ استثناء `authorization` فوقها: **ثانيةُ مرّةٍ تُنذر فيها
 * هذه البوابة على مفردةٍ تحمل معنًى آخر خارج الدفع**. والإنذارُ
 * الكاذب يُعلّم قارئَه تجاهُلَ القائمة كلِّها، فيُضيَّق النمط ولا
 * تُحذف الميزة.
 */
const HTML_CAPTURE_ATTR = /\bcapture\s*=\s*[{'"`]/;

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
        if (HTML_CAPTURE_ATTR.test(code)) return;
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
  /**
   * **والتعليق يُحذف قبل البحث.** هذا النصّ يُسأل «أيُنادى هذا
   * الموافِق؟ أتُفحص هذه الصلاحية؟» — وتعليقٌ يذكر الاسم يُجيب «نعم»
   * فتسكت البوابة على نصابٍ بلا باب. وهو الصنف الذي خدع البوابتين
   * ٥٠ و٥٢، وتعليقاتُ هذا المستودع تُسمّي الدوالّ في كل سطر.
   */
  const routeSource = routeFiles
    .map((file) => stripComments(readFileSync(file, 'utf8')))
    .join('\n');

  /* ① كل نوع موافقة يُنشأ لا بدّ له من موافِقٍ يُنادى من مسار */
  const approvers = [];
  const creators = new Map();
  for (const file of domainFiles) {
    const source = stripComments(readFileSync(file, 'utf8'));
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
    const source = stripComments(readFileSync(file, 'utf8'));
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
checkAdSlotsRendered();

/**
 * ═══ البوابة ٤٤ — كلُّ مساحةٍ مبيعة ينادي مفتاحَها موضع ═══
 *
 * `AdSlot` كتالوجُ مساحاتٍ تُباع من `/admin/ads` بأسعارها ومواضعها
 * المكتوبة، **وكلُّ مساحةٍ تُصيَّر بمفتاحٍ مكتوبٍ في شاشة**. فمساحةٌ لا
 * ينادي مفتاحَها أحد منتجٌ يُباع ولا يظهر: المعلن يدفع، والفاتورة
 * تُحرَّر، والإعلان لا يراه إنسان.
 *
 * وقِيس حين كُتبت هذه البوابة: **من سبعٍ كان المنتج ينادي واحدة**
 * (`search_inline`) — وهي نفسها كانت تُعرض في نمط الشبكة وحده بعد أن
 * صار الافتراضيّ القائمة. فستٌّ بلا موضع وواحدةٌ بموضعٍ لا يبلغه أحد.
 *
 * والاستثناء بسببٍ مكتوب لا بإغفال.
 */
function checkAdSlotsRendered() {
  /** والاستثناء داخل الدالّة — فنداؤها يسبق سطور الملفّ الأخيرة. */
  const SLOT_WITHOUT_PLACEMENT = {
    // ١٠٨٠×١٩٢٠ صيغةٌ لا بانر، ولا ترسمها أيٌّ من ملفّات التصميم — سؤالٌ
    // للمصمّم قبل أن تُخترع لها شاشة. وحتى يُجاب تبقى مستثناةً باسمها.
    home_story: 'لا تصميم لها في design/ — سؤالٌ معلَّق للمصمّم',
  };

  const file = join(ROOT, 'prisma/seed-data/ad-slots.json');
  if (!existsSync(file)) return;

  let slots;
  try {
    slots = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    problems.push('prisma/seed-data/ad-slots.json  تعذّرت قراءته — والبوابة لا تتخطّى بصمت');
    return;
  }

  // ويُقرأ النداء من الشجرة كلّها: الشاشة تجلب، والمكوّن قد يجلب
  let calls = '';
  for (const source of walk('src')) {
    if (/\.tsx?$/.test(source)) calls += readFileSync(source, 'utf8');
  }

  for (const slot of slots) {
    const key = typeof slot?.key === 'string' ? slot.key : '';
    if (key === '') continue;
    if (slot?.active === false) continue;
    if (key in SLOT_WITHOUT_PLACEMENT) continue;

    if (!calls.includes(`adsFor('${key}'`) && !calls.includes(`adsFor("${key}"`)) {
      problems.push(
        `prisma/seed-data/ad-slots.json  المساحة «${key}» مبيعةٌ ولا ينادي مفتاحَها موضع`,
      );
    }
  }
}

/**
 * ═══ البوابة ٤٥ ═══ **قالبٌ مزروع بلا كاتب = لحظةٌ لا يُخبَر فيها أحد.**
 *
 * الصفّ موجود، والشاشة تُصيَّر منه، **ولا شيء في المنتج يكتبه قطّ**. ولا
 * يسقط اختبار ولا يُرى في سجلّ: العطل كلُّه في ما **لم** يقع — جرسٌ لم
 * يرنّ في يد من ينتظر.
 *
 * وقِيس حين فُتح هذا الملفّ: **تسعةٌ وعشرون من واحدٍ وأربعين بلا كاتب**،
 * ومنها رحلةُ الطلب كلُّها و`auction.outbid` — وهي الآلة التي يدور عليها
 * المزاد. فبائعٌ تُطلب مركبتُه ويُدفع ثمنُها في ضمانه وتنتقل ملكيّتها
 * بلا سطرٍ واحد يصله، ومزايدٌ يُتجاوَز فلا يعود.
 *
 * **والبوابة قِيست قبل تفعيلها** (قاعدة العشرة): نُقل التسعةُ والعشرون
 * على ثلاث دفعات حتى بقي سبعةٌ لا لحظةَ صادقةً لها، فأُعلن صمتُها بسببه
 * ثمّ فُعِّلت.
 *
 * **والإعلان شرطُه السبب**: مفتاحٌ يُضاف إلى القائمة بلا تفسير يجعلها
 * سلّةً يسقط فيها كلُّ ما يشقّ وصلُه.
 */
function checkTemplatesWritten() {
  /**
   * صمتٌ معلَن — ولكلٍّ سببُه. ومراجعتُها جزءٌ من مراجعة أيّ مهمّة
   * تلمس الصنف الذي تذكره.
   */
  const DECLARED_SILENT = {
    'auth.otp': 'يُسلَّم رسالةً نصّية لا إشعارًا في التطبيق — خارج `notify` أصلًا.',
    'account.iban_required':
      'بنر اكتمال الملف يطلبه في كل شاشة حساب باستمرار، وهو أبلغ من جرسٍ يمرّ مرّة.',
    'order.payment_overdue':
      'المتأخّر لا يعيش لحظةً: `timeoutUnpaidOrders` تُلغيه في أوّل مرور وترسل `order.payment_timeout`.',
    'offer.rejected':
      'لا رفضَ يدويّ في التصميم — والرفض التلقائيّ `offer.auto_rejected` والخسارة لقبول غيره `offer.lost`، ولكلٍّ مفتاحُه.',
    'listing.expiring': 'لا انتهاءَ للإعلان في المخطّط — لا حقل ولا وظيفة. قرارُ منتجٍ لا وصلُ سطر.',
    'auth.new_device': 'يحتاج بصمةَ جهازٍ لا توجد في النموذج.',
  };

  const SEED = 'prisma/seed-data/notification-templates.json';
  const templates = JSON.parse(readFileSync(join(ROOT, SEED), 'utf8'));
  const keys = templates.map((row) => row.key);

  /**
   * **والمفتاح يُلتقط أينما كُتب نصًّا.** يُكتب حرفيًّا
   * (`templateKey: 'x'`) ومن ثلاثيّ (`cond ? 'a' : 'b'`) ومن خريطةٍ —
   * فالبحث عن النصّ المقتبَس نفسه، والتعليقات تُنزع أوّلًا كيلا يُحسب
   * ذِكرٌ في شرحٍ كتابةً.
   */
  const seen = new Set();
  for (const path of walk(join(ROOT, 'src', 'lib'))) {
    if (!/\.ts$/.test(path)) continue;
    const bare = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    for (const match of bare.matchAll(/'([a-z][a-z_]*\.[a-z_]+)'/g)) seen.add(match[1]);
  }

  for (const key of keys) {
    if (seen.has(key)) {
      if (DECLARED_SILENT[key] !== undefined) {
        problems.push(
          `${SEED}  «${key}» معلَنٌ صامتًا وله كاتب — احذفه من DECLARED_SILENT`,
        );
      }
      continue;
    }
    if (DECLARED_SILENT[key] === undefined) {
      problems.push(
        `${SEED}  «${key}» قالبٌ بلا كاتب — صِلْه بلحظته، أو أعلن صمتَه بسببه في DECLARED_SILENT`,
      );
    }
  }

  for (const key of Object.keys(DECLARED_SILENT)) {
    if (!keys.includes(key)) {
      problems.push(`${SEED}  «${key}» في DECLARED_SILENT ولا قالب له — احذفه`);
    }
  }
}

checkTemplatesWritten();

/**
 * ═══ البوابة ٤٦ — **لا رسمٌ مكتوبٌ في الشيفرة** ═══
 *
 * قرار المالك (٢٠٢٦-١٠-١٤): «مصفوفة الرسوم سواء للمزوّدين أو لبوابة
 * الدفع يجب أن تكون قابلة للضبط من لوحة التحكّم… فالرسوم تُضبط من
 * لوحة الأدمن **ولا نضعها داخل الكود**».
 *
 * وكانت `feePct: 2.75` ثابتًا في `adapters/moyasar.ts` بينما `resolve.ts`
 * يقرؤها من الصفّ — فمصدران لرقمٍ واحد، ومشغّلٌ يعدّل ما لا يُقرأ.
 *
 * **وثمنُ الثابت قِيس**: أوّل نداءٍ حقيقيّ لبوّابة المزوّدين ردّ ٤٠٠ على
 * `1.70` — والقيمة كسرٌ (`0.0170`) ومثالُ الوثيقة يكتبها مئويّةً.
 * فلو كان الحدُّ أوسع لمرّ رسمٌ **مئةَ ضعف** على شريك، ولا يكشفه نوعٌ
 * ولا اختبارٌ على خادمٍ وهميّ. ورقمٌ يراه مشغّلٌ في حقلٍ أأمنُ من رقمٍ
 * يمرّ في مراجعةٍ بين مئة سطر.
 *
 * **والصفرُ مسموح** حين يجاوره ما يُعطّله (`processingFeeEnabled: false`):
 * «لا صفّ إعدادات ⇒ لا رسم» ليست شرطًا تجاريًّا. وما سواه يُقرأ من
 * القاعدة.
 *
 * والبيانات غير الشيفرة: `prisma/seed-data/*.json` قيَمٌ ابتدائية
 * لقاعدةٍ جديدة، والشاشة تعدّلها بعدها.
 */
function checkNoHardCodedFees() {
  const FEE_KEYS = [
    'feePct', 'feeFixed',
    'madaRate', 'madaFixed', 'madaCap', 'madaRefundFixed',
    'cardRate', 'cardFixed', 'cardRefundFixed',
    'processingFeePct', 'processingFeeFixed',
  ];
  const FEE = new RegExp(`\\b(${FEE_KEYS.join('|')})\\s*:\\s*('|")?([0-9][0-9_.]*)`, 'g');

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx?$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    /** التعليق يصف ولا يُنفّذ — والشرح يذكر الثابت الذي حُذف. */
    const text = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');

    for (const match of text.matchAll(FEE)) {
      const value = Number((match[3] ?? '').replace(/_/g, ''));
      /** صفرٌ = «لا رسم» لا شرطًا تجاريًّا. */
      if (value === 0) continue;
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  \`${String(match[1])}: ${String(match[3])}\` رسمٌ مكتوبٌ في الشيفرة — `
          + 'يُقرأ من القاعدة ويُضبط من اللوحة (قرار المالك ٢٠٢٦-١٠-١٤)',
      );
    }
  }
}

checkNoHardCodedFees();

/**
 * ═══ البوابة ٤٧ — **حالةٌ تُبذَر من قائمةٍ تتقادم مع القائمة** ═══
 *
 * البوابة ٣٠ تمنع نسخ **خاصّية** إلى حالة حين يحمل المكوّن خاصّية
 * هوية. وهذه أختُها: `useState(rows[0]?.id)` — القيمة من **عنصرٍ في
 * قائمة**، فالقائمةُ نفسها هي الهوية، ولا يلزم أن يحمل المكوّن
 * `…Id`. فحين تتبدّل القائمة بالتنقّل (وهو لا يُعيد التركيب) يبقى
 * المعرّف القديم ولا يطابق صفًّا جديدًا.
 *
 * وقِيس بالنقر: `FaqAccordion` في مركز المساعدة يفتح أوّل سؤال، وبعد
 * أوّل نقرةٍ على موضوع **لا يُفتح شيء** — لأن `open` يحمل معرّف سؤالٍ
 * من الموضوع السابق. و`RequestService` أخطر: من فتح الخدمة من مركبةٍ
 * ثم من أخرى **يطلب الفحص للأولى**، والشاشة تعرض اسم الأولى.
 *
 * والعلاج واحد: تُحفظ هوية القائمة مع القيمة، وتُشتقّ القيمة حين
 * تختلف الهوية — بلا `useEffect`.
 *
 * وقِيست على الشجرة قبل التفعيل: أربعة مواضع، أُصلحت كلّها.
 */
function checkStateSeededFromList() {
  /** `useState(x[0]…)` · `x.at(0)` · `x.find(…)` — قيمةٌ من عنصرِ قائمة. */
  const SEEDED = /useState\(\s*([a-z_$][\w$]*)\s*(?:\[|\.at\(|\.find\(|\.filter\(|\.slice\()/g;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

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

    for (const match of text.matchAll(SEEDED)) {
      const list = match[1] ?? '';
      if (!props.has(list)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  \`useState(${list}…)\` يبذر حالةً من قائمةٍ خاصّية — `
          + 'تتقادم حين تتبدّل القائمة بالتنقّل؛ اختِم الاختيار بهوية القائمة واشتقّه',
      );
    }
  }
}

checkStateSeededFromList();

/**
 * ═══ البوابة ٤٨ — **رابطٌ يلفّ زرًّا ليس زرًّا** ═══
 *
 * `<Link><Button>…</Button></Link>` محتوًى تفاعليّ داخل تفاعليّ: HTML
 * لا يجيزه، والمستخدم بلوحة المفاتيح **يمرّ بموقفين** حيث يرى فعلًا
 * واحدًا، وقارئ الشاشة يعلن رابطًا فيه زرّ.
 *
 * وقِيس حين كُتبت هذه البوابة: **أربعة عشر موضعًا** في الشجرة، من
 * «بِع سيارتك» في الترويسة إلى كل حالةٍ فارغة في الحساب. وكلُّها
 * قابلة بـ`LinkButton`: عنصرٌ واحد يلبس شكل الزرّ من `buttonShape`.
 *
 * والعكس (`<button><Link>`) ممنوعٌ للسبب نفسه.
 */
function checkNestedInteractive() {
  const NESTED = /<(Link|a)\b[^>]*>\s*<(Button|button)\b|<(Button|button)\b[^>]*>\s*<(Link|a)\b/g;

  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.tsx$/.test(path)) continue;
    const rel = relative(ROOT, path);
    if (rel.includes('generated')) continue;

    /** التعليق يصف ولا يُنفّذ — وشرحُ `LinkButton` يذكر الشكل الممنوع. */
    const text = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');

    for (const match of text.matchAll(NESTED)) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  عنصرٌ تفاعليّ داخل تفاعليّ — `
          + 'استعمل `LinkButton` (رابطٌ بشكل الزرّ) بدل لفّ الزرّ برابط',
      );
    }
  }
}

checkNestedInteractive();

/**
 * ═══ البوابة ٤٩ — **تقريرُ فحصٍ لا يُقرأ بلا شرط النشر** ═══
 *
 * قرار المالك ٤: «تقرير البائع عامٌّ على الإعلان، وتقرير المشتري خاصٌّ
 * به حتى يشاركه أو يشتريه البائع».
 *
 * وقِيس: ثمانيةُ مواضع تقرأ `inspectionReports` بلا شرط — صفحةُ
 * المركبة، والبحث، والرئيسية، وصفحةُ المعرض، والواجهة العامّة،
 * وعدّادُ صفحة الهبوط، ووثائقُ الطلب. **فتقريرٌ دفع ثمنه مشترٍ كان
 * يُوسم به إعلانُ غيره ويُسلسَل كاملًا في حمولة الصفحة** — درجتُه
 * وفاحصُه وملاحظاتُه — لزائرٍ لم يدفع.
 *
 * ولا يكفي شرطٌ في الشاشة: **ما يُجلَب يُسلسَل**، ولو لم يُرسَم.
 *
 * والاستثناء بسببٍ مكتوب لا بإغفال.
 */
function checkReportVisibility() {
  /** ملفّاتٌ تقرأ التقارير لغير العرض العامّ — ولكلٍّ سببُه. */
  const ALLOWED = {
    'src/lib/domain/garage.ts': 'عدٌّ للملكية — أيجوز حذفُ المركبة؟ ولا يخرج منه شيء',
    'src/lib/domain/admin-monitors.ts': 'شاشةُ أدمن — ترى ما تديره، والحارس عند الباب',
    'src/lib/domain/inspection.ts': 'هي نفسها صاحبة القاعدة: تُرجع المنشور أو تقرير دافعه',
  };

  for (const path of walk(join(ROOT, 'src', 'lib'))) {
    if (!/\.ts$/.test(path)) continue;
    const rel = relative(ROOT, path).split('\\').join('/');
    if (ALLOWED[rel] !== undefined) continue;

    const text = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '');

    for (const match of text.matchAll(/\binspectionReports\s*[:=]/g)) {
      /** الكتلة التالية — حتى إغلاقها أو مئتَي محرف، أيُّهما أقرب. */
      const window = text.slice(match.index, match.index + 240);
      if (window.includes('publishedAt')) continue;
      /** قراءةٌ من نتيجةٍ مجلوبة (`rows[0]`) لا استعلام. */
      if (/^\s*inspectionReports\s*[\[.]/.test(window)) continue;
      /**
       * **وموضعُ النوع ليس استعلامًا.** `inspectionReports: { id: string }[]`
       * يصف شكلَ ما جُلب، والشرط يقع حيث يُجلب.
       */
      if (/^inspectionReports\s*:\s*\{\s*\w+\s*:\s*(string|number|boolean|Date)\b/.test(window)) {
        continue;
      }

      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  استعلامُ تقارير بلا شرط النشر — `
          + 'أضِف `publishedAt: { not: null }`، أو أعلن الاستثناء بسببه في ALLOWED',
      );
    }
  }
}

checkReportVisibility();

/**
 * ═══ البوابة ٥٠ — **دالّةُ نطاقٍ تكتب ولا يبلغها أحد** ═══
 *
 * الصنف تكرّر ثلاثَ عشرةَ مرّة: قدرةٌ تُبنى وتُختبَر ولا بابَ إليها —
 * `OrderSource.AUCTION` بلا كاتب، وقواعدُ التفاوض بلا زرّ قبول،
 * و`openAccount` مُثبَتًا بنداءٍ حقيقيّ ولا شيء ينادِيه.
 *
 * فقِيس آليًّا أوّلًا: **خمس عشرة دالّة** لا يبلغها شيء خارج
 * الاختبارات. والقاعدة يومها: «تجاوزُها عشرة يعني النقل أوّلًا ثم
 * البوابة». وقد بُنيت الأبواب واحدًا واحدًا حتى بلغ العدد صفرًا — فهذه
 * هي البوابة.
 *
 * **والمقياس: مرجعٌ في `src/` خارج ملفّها.** لا تتبُّعَ استدعاءٍ عابر
 * (يحتاج رسمَ نداءٍ كاملًا)، بل الصنفُ الذي بِتنا نقع فيه: شيفرةٌ
 * ميّتة تكتب مالًا أو حالًا. وآخرُ ما أُمسك بها `purchaseService` —
 * مسارُ شراءٍ كامل بالبوّابة والضريبة، **يفرض قاعدةً ألغاها المالك**
 * (أن طالب الفحص هو مالك المركبة)، وينتظر من يصله بزرّ.
 *
 * والاختبارات لا تُحسب: اختبارٌ يستدعي دالّةً يُثبت أنها تعمل، لا أن
 * أحدًا يستطيع بلوغها.
 */
function checkDomainWritersReachable() {
  const DOMAIN = join(ROOT, 'src', 'lib', 'domain');
  const WRITES = /\bdb\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

  /**
   * كلُّ ملفّات `src` ونصُّها — تُقرأ مرّةً لا لكل دالّة.
   *
   * **والتعليق يُحذف.** تعليقٌ في شاشةٍ أخرى يذكر اسم الدالّة كان
   * يُحسب بابًا: `/admin/push` تكتب «والحراسة الحقيقية في
   * `setPreference`» — فظنّت البوابةُ أنّ لها منادياً، و**لا شاشةَ
   * في المنتج كلّه تضبط تفضيلات الإشعار**. وهي ثاني مرّةٍ تُخدَع
   * بوابةٌ بتعليق (البوابة ٥٢ قبلها)، وتعليقاتُ هذا المستودع تُسمّي
   * الدوالّ في كل سطر.
   */
  const sources = [];
  for (const path of walk(join(ROOT, 'src'))) {
    if (!/\.(ts|tsx)$/.test(path)) continue;
    if (path.includes('generated')) continue;
    sources.push([path, stripComments(readFileSync(path, 'utf8'))]);
  }

  for (const path of walk(DOMAIN)) {
    if (!/\.ts$/.test(path)) continue;
    const rel = relative(ROOT, path);
    /** وملفُّها كذلك — فتعليقٌ فيها لا يُحسب نداءً من داخلها. */
    const text = stripComments(readFileSync(path, 'utf8'));

    for (const match of text.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const name = match[1] ?? '';
      /** جسدُ الدالّة: حتى التصدير التالي أو آخر الملفّ. */
      const after = text.slice(match.index + match[0].length);
      const next = /^export (?:async )?(?:function|const|type|class)/m.exec(after);
      const body = after.slice(0, next === null ? after.length : next.index);
      if (!WRITES.test(body)) continue;

      const word = new RegExp(`\\b${name}\\b`);
      const reachable = sources.some(
        ([other, source]) => other !== path && word.test(source),
      );
      if (reachable) continue;
      /** نداءٌ من داخل ملفّها نفسه — بابُها دالّةٌ أخرى فيه. */
      if (word.test(body.slice(1)) || text.split(name).length > 2) continue;

      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  \`${name}\` دالّةُ نطاقٍ تكتب ولا يبلغها شيء في \`src/\` — `
          + 'صِلْها بزرٍّ أو مسار، أو احذفها',
      );
    }
  }
}

checkDomainWritersReachable();

/**
 * ═══ البوابة ٥١ — **كلُّ حسابٍ في الدفتر له تسمية** ═══
 *
 * `LEDGER_ACCOUNT_LABEL` يُقرأ في ثلاث شاشات، والمفقودُ منه يُعرض
 * **مفتاحًا خامًا**: «PROVIDER_PAYABLE» في جدولٍ ماليّ يقرؤه محاسب.
 *
 * ووقع مرّتين: أوّلَ قيدِ محفظة (`WALLET_PAYABLE`) — والتعليق يشهد به
 * في الملفّ — ثمّ عند حسابَي الخدمات. **والثالثة تُغلق آليًّا**:
 * التعداد في المخطّط هو المصدر، والتسميات تُقابَل به.
 */
function checkLedgerAccountLabels() {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const block = /enum LedgerAccount \{([\s\S]*?)\n\}/.exec(schema);
  if (block === null) return;

  const values = [...(block[1] ?? '').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*$/gm)].map(
    (match) => match[1],
  );

  const LABELS = 'src/lib/labels/admin.ts';
  const labels = readFileSync(join(ROOT, LABELS), 'utf8');
  const map = /LEDGER_ACCOUNT_LABEL: Record<string, string> = \{([\s\S]*?)\n\};/.exec(labels);
  if (map === null) {
    problems.push(`${LABELS}  لم يُعثر على LEDGER_ACCOUNT_LABEL — البوابة ٥١ عمياء`);
    return;
  }

  const named = new Set(
    [...(map[1] ?? '').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((match) => match[1]),
  );

  for (const value of values) {
    if (named.has(value)) continue;
    problems.push(
      `${LABELS}  «${String(value)}» حسابٌ في الدفتر بلا تسمية — يُعرض مفتاحًا خامًا في ثلاث شاشات`,
    );
  }
}

checkLedgerAccountLabels();

/**
 * ═══ البوابة ٥٢ — **لا تسويةَ بلا مرجعها** ═══
 *
 * `reconcileYesterday` تُطابق دفترَنا بتقرير البوّابة على
 * `settleRef ?? holdRef` — والبوّابة تبلّغ تسوياتها **بمرجع التحصيل**.
 * فدفعةٌ تصير `SETTLED` بلا `settleRef` تُطابَق بمرجع الحجز، فلا
 * تُطابِق شيئًا: فرقٌ يوميّ لا سبب له، ورسالتُه لا تذكر مرجعًا ناقصًا.
 *
 * ووقع مرّتين: أُصلح في تسوية الطلبات والتسوية اليدوية — والتعليق في
 * `payments.ts` يشهد به — **وبقي مسارُ الويبهوك**، وهو الذي تمرّ منه
 * البوّابة الحقيقية. وكاد يقع ثالثةً في تحصيل الخدمات.
 *
 * تُفحص صورتان: كتابةٌ مباشرة على `payment`، ونداءُ `applyState`
 * بهدفٍ مكتوب.
 */
function checkSettleRefWritten() {
  const SETTLED = /^(?:'SETTLED'|'PARTIALLY_SETTLED')$/;

  for (const file of walk(join(ROOT, 'src'))) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    /**
     * **والتعليقُ يُحذف قبل الفحص.** قِيس فسكتت البوابة: حذفتُ السطر
     * وبقي تعليقٌ بجواره يذكر `settleRef`، فظنّته كتابةً. وتعليقاتُ
     * هذا المستودع تُسمّي الحقول في كل سطر — فبوابةٌ تقرؤها تُخدَع
     * بأرجح الاحتمالات لا بأندرها.
     */
    const text = stripComments(readFileSync(file, 'utf8'));
    const rel = relative(ROOT, file);

    /* ١ ─ كتابةٌ مباشرة: `data: { … status: 'SETTLED' … }` */
    for (const match of text.matchAll(/data:\s*\{/g)) {
      const body = braced(text, (match.index ?? 0) + match[0].length - 1);
      if (body === null) continue;
      if (!/status:\s*'(?:SETTLED|PARTIALLY_SETTLED)'/.test(body)) continue;
      if (/\bsettleRef\b/.test(body)) continue;
      problems.push(
        `${rel}  دفعةٌ تصير SETTLED بلا settleRef — والمطابقة تُطابق بمرجع الحجز فتفشل كل يوم`,
      );
    }

    /* ٢ ─ `applyState(id, 'SETTLED', …)` — والمراجع معاملُه السادس */
    for (const match of text.matchAll(/\bapplyState\(/g)) {
      const call = parened(text, (match.index ?? 0) + match[0].length - 1);
      if (call === null) continue;
      const target = (call.split(',')[1] ?? '').trim();
      if (!SETTLED.test(target)) continue;
      if (/\bsettleRef\b/.test(call)) continue;
      problems.push(
        `${rel}  applyState(…, ${target}, …) بلا settleRef — والمطابقة تقرأ settleRef ?? holdRef`,
      );
    }
  }
}

/** نصُّ ما بين قوسين معقوفين متوازنين، بدءًا من `{` عند `at`. */
function braced(text, at) {
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(at + 1, i);
    }
  }
  return null;
}

/** ومثلُها للأقواس الهلالية. */
function parened(text, at) {
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(at + 1, i);
    }
  }
  return null;
}

checkSettleRefWritten();

/**
 * ═══ البوابة ٥٣ — **الرابط يحمل لغته** ═══
 *
 * `Link` من `@/i18n/navigation` يضيف اللغة؛ و`next/link` — ومعه
 * `LinkButton` المبنيّ عليه — لا يفعل. فرابطٌ مكتوبٌ `"/sell"` داخل
 * الشجرة المترجَمة يصدر بلا لغة، فيردّ الوسيط ٣٠٧ **عند كل نقرة**.
 *
 * وقِيس: «بِع سيارتك» و«تسجيل الدخول» في ترويسةِ **تسعٍ وسبعين صفحة
 * من ثمانين**. ورابطٌ يُحوَّل عند كل نقرة ليس رابطًا صحيحًا فيه بطء:
 * هو إشارةٌ لمحرّك البحث أنّ عناويننا ليست نهائية — وهو الصنف الذي
 * أُصلح مرّةً في مسار المركبة.
 *
 * والقاعدة: **داخل الشجرة المترجَمة، المسار المكتوب حرفيًّا يكون على
 * `<Link>`** — وما سواه يُبنى بقالبٍ فيه `${locale}`.
 */
function checkLocaleInLinks() {
  /** ما ليس صفحةً: مسارات الواجهة البرمجية والملفّات والمرساة. */
  const NOT_A_PAGE = /^\/(api|_next)\b|\.(png|jpg|jpeg|svg|webp|ico|css|js|xml|txt|json|pdf)$/;
  /** الوسوم التي تعرف لغتها بنفسها. */
  const LOCALE_AWARE = new Set(['Link', 'NavLink', 'LocaleLink']);

  const trees = [join(ROOT, 'src', 'app', '[locale]'), join(ROOT, 'src', 'components', 'site')];

  for (const tree of trees) {
    for (const file of walk(tree)) {
      if (!file.endsWith('.tsx')) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      const rel = relative(ROOT, file);

      for (const match of text.matchAll(/href="(\/[^"]*)"/g)) {
        const href = match[1] ?? '';
        if (href === '' || NOT_A_PAGE.test(href)) continue;

        /** الوسم الحاوي: أقربُ `<Word` قبل الخاصّية. */
        const before = text.slice(0, match.index ?? 0);
        const tag = /<([A-Za-z][\w.]*)[^<>]*$/.exec(before);
        const name = tag?.[1] ?? '';
        if (LOCALE_AWARE.has(name)) continue;

        problems.push(
          `${rel}  <${name || '?'} href="${href}"> بلا لغة — الوسيط يردّ ٣٠٧ عند كل نقرة`,
        );
      }
    }
  }
}

checkLocaleInLinks();

/**
 * ═══ البوابة ٥٤ — **لا نصَّ دون حدّ القراءة** ═══
 *
 * الشكوى كانت «الخلفيةُ ثقيلة والخطوط باهتة»، وقِيس قبل أن يُنفَّذ:
 * النصّ الأساسيّ **13.95:1** — AAA أصلًا، فالعلّة ليست فيه.
 * والخافت هو العلّة: `opacity-55` يعطي **3.57** و`opacity-45` يعطي
 * **2.72**، وكلاهما دون حدّ AA (4.5) — **و٩٢٤ صنفًا في المنتج كانت
 * تحته**.
 *
 * فبعد تفتيح الخلفية وتغميق الحبر صار السلّم: ٦٥٪ ← 5.29 على
 * البطاقة · ٧٠٪ ← 6.27 · ٧٥٪ ← 7.36. والحدّ ٦٥.
 *
 * **وما ليس نصًّا يبقى باهتًا**: الفاصلةُ المخفيّة والأيقونةُ
 * والمعطَّل — وWCAG يستثني الثلاثة.
 */
function checkMutedTextContrast() {
  const TEXT = /\btext-(3xs|2xs|xs|sm|base|lg|xl)\b|\bfont-(bold|semibold|medium|num)\b|\bleading-/;
  const LOW = /\bopacity-(?:[0-5]?[0-9]|6[0-4])\b/;
  /** ما يُستثنى بحقّه — ولا يُوسَّع إلّا بقياس. */
  const EXEMPT = /aria-hidden|<svg\b|<path\b|cursor-not-allowed|disabled|line-through/;

  for (const file of walk(join(ROOT, 'src'))) {
    if (!file.endsWith('.tsx')) continue;
    const rel = relative(ROOT, file);
    /**
     * **والتعليق يُفرَّغ ولا يُحذف.** `stripComments` تُسقط أسطرًا
     * فتنزاح الأرقام — فيشير التقرير إلى سطرٍ لا علاقة له. فتُستبدل
     * محتوياتُه بفراغٍ ويبقى عددُ الأسطر كما هو.
     */
    const lines = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))
      .split('\n');

    lines.forEach((line, index) => {
      if (!LOW.test(line) || EXEMPT.test(line)) return;
      for (const match of line.matchAll(/(['"`])([^'"`]*)\1/g)) {
        const body = match[2] ?? '';
        if (!LOW.test(body) || !TEXT.test(body)) continue;
        problems.push(
          `${rel}:${String(index + 1)}  «${(LOW.exec(body) ?? [''])[0]}» على نصّ — دون حدّ AA (الحدّ opacity-65)`,
        );
      }
    });
  }
}

checkMutedTextContrast();

/**
 * ————— القاعدة ٥٥: علامةُ النسبة لغةٌ لا زينة —————
 *
 * `formatPercent` موجودةٌ منذ بُنيت وتردّ «٪» للعربية و«%» للإنجليزية،
 * **وخمسةُ مواضع كتبت «٪» بيدها** — فصفحةُ الأسعار والتمويل ولوحة
 * البيع وبوّابة المعارض تقول «15٪» لمن جاء إلى `/en` بعلامةٍ لا
 * يعرفها. وهي ليست ترجمةً مؤجَّلة: الإنجليزيّ **في يدنا** والدالّة
 * تعرفه، والمكتوب بيدٍ يطرحه.
 *
 * **والعلامةُ خارج العزل تنزلق.** كانت تُكتب بعد `<ArabicNumber/>`
 * لا داخله، و`dir="ltr"` على المكوّن وحده — فعلامةٌ محايدةٌ في مقطعٍ
 * يرث RTL تُرسم «٪15». فموضعها مع رقمها، وهي خاصّيةُ `percent`.
 *
 * **والأدمن عربيّ بقرار** فلا يُفحص، وكذلك `dev/ui`. و`arabic.ts`
 * مصدرُ العلامة الوحيد.
 */
function checkPercentSign() {
  const EXEMPT = /^src\/(components\/admin\/|app\/\[locale\]\/dev\/|app\/admin\/|lib\/arabic\.ts$)/;
  const trees = [
    join(ROOT, 'src', 'app', '[locale]'),
    join(ROOT, 'src', 'components'),
    join(ROOT, 'src', 'lib'),
  ];

  for (const tree of trees) {
    for (const file of walk(tree)) {
      if (!/\.tsx?$/.test(file)) continue;
      const rel = relative(ROOT, file).split(sep).join('/');
      if (EXEMPT.test(rel)) continue;

      /** **والتعليق يُجرَّد** — تعليقاتُ هذا المستودع تضرب أمثلةً بـ«٪». */
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          if (!line.includes('\u066a')) return;
          problems.push(
            `${rel}:${String(index + 1)}  «٪» مكتوبةً بيد — والعلامة من formatPercent أو خاصّية percent`,
          );
        });
    }
  }
}

checkPercentSign();

/**
 * ————— القاعدة ٥٦: كلُّ مسارٍ له منادٍ أو سببٌ معلَن —————
 *
 * الصنف وقع مرّتين في يومٍ واحد: مسارا `admin/models` يدعمان التعديل
 * والحذف ولا زرّ يبلغهما، و`me/entitlements` **بلا منادٍ أصلًا** —
 * ومعه محرّكُ خصائصَ كامل لا يقرؤه شيء، فمشغّلٌ يمنح تجاوزًا يراه
 * محفوظًا ولا يقع.
 *
 * **وما تقيسه هذه البوابة هو الصنف الثاني وحده**: مسارٌ لا تذكره
 * الواجهة بحال. والأوّل — مسارٌ يُنادى ببعض أفعاله — لا يُقاس نصًّا:
 * `send('models', 'POST')` و`send(\`trims/${id}\`, 'PATCH')` يجعلان
 * «models» و«PATCH» حاضرَين في الملفّ، والرابطُ بينهما في الاستدعاء
 * لا في النصّ. فمسحُه يدويّ ومكتوبٌ في `docs/NOTES.md`، **ولا تُدّعى
 * هنا تغطيةٌ ليست فيها** — بوابةٌ تُطمئن بما لا تفحصه أسوأ من غيابها.
 *
 * والقالبُ يُحسب: `` `/api/v1/admin/${path}` `` يجعل ما تحته مبلوغًا،
 * وهو تنازلٌ مقصود — الحرفيّةُ وحدها تُنذر كذبًا على كل مسارٍ يُبنى
 * رابطُه.
 */
const ROUTES_WITHOUT_A_SCREEN = new Map([
  [
    '/api/v1/me/entitlements',
    'للتطبيق لا للويب: المعالج مكوّنُ خادم يقرأ `sellingAllowance` مباشرةً (HANDOFF §١٤).',
  ],
]);

function checkEveryRouteHasACaller() {
  const callers = [];
  for (const dir of ['src/app', 'src/components', 'src/lib']) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (!/\.tsx?$/.test(rel) || rel.startsWith('src/app/api/')) continue;
      callers.push(stripComments(readFileSync(file, 'utf8')));
    }
  }
  const text = callers.join('\n');

  /** بوادئُ القوالب: ما قبل أوّل `${` في رابطٍ يُبنى. */
  const prefixes = [];
  for (const match of text.matchAll(/`([^`]*\/api\/[^`$]*)\$\{/g)) {
    const whole = match[1] ?? '';
    prefixes.push(whole.slice(whole.indexOf('/api/')).replace(/\/$/, ''));
  }

  const apiRoot = join(ROOT, 'src', 'app', 'api', 'v1');
  for (const file of walk(apiRoot)) {
    if (!file.endsWith('route.ts')) continue;
    const route =
      '/' + relative(ROOT, file).split(sep).join('/').replace('src/app/', '').replace('/route.ts', '');

    /** البادئة الثابتة — ما قبل أوّل مقطعٍ متغيّر. */
    const parts = [];
    for (const segment of route.split('/')) {
      if (segment.startsWith('[')) break;
      parts.push(segment);
    }
    const stat = parts.join('/');

    if (text.includes(stat)) continue;
    if (prefixes.some((prefix) => stat.startsWith(prefix))) continue;
    if (ROUTES_WITHOUT_A_SCREEN.has(route)) continue;

    problems.push(
      `${route}  مسارٌ لا تناديه شاشة — صِلْه بزرّ أو أعلن سببه في ROUTES_WITHOUT_A_SCREEN`,
    );
  }

  /** **والسببُ المعلَن يُراجَع**: مسارٌ حُذف يترك عذرًا يحرس لا شيء. */
  for (const route of ROUTES_WITHOUT_A_SCREEN.keys()) {
    const file = join(ROOT, 'src', 'app', route.replace(/^\//, ''), 'route.ts');
    if (!existsSync(file)) {
      problems.push(`${route}  سببٌ معلَن لمسارٍ لا وجود له — احذف السطر`);
    }
  }
}

checkEveryRouteHasACaller();

/**
 * ═══ ٥٧ · كتلةُ المراجع المزروعة لا تتقاطع ═══
 *
 * `npm run db:seed` كان ساقطًا منذ `bac2d43`: مرجعٌ مكتوب
 * `SRV-2026-3100` وطابورُ المزوّد يبدأ `3100 + n` — **فاصطدما عند
 * `n = 0`**، والرسالة تقول «Unique constraint failed on (ref)» فتتّهم
 * الإنشاء لا الرقم. **وبيئةٌ جديدة لا تُزرع أصلًا**، ولا شيء في
 * `verify` يمرّ بالبذرة فيقول.
 *
 * والقاعدة: **لكلِّ عائلةِ مراجعَ كتلةٌ مئوية** — فمرجعٌ مكتوبٌ بيد
 * لا يسقط داخل كتلةِ قالبٍ يعدّ، ولا قالبان يتقاطعان.
 *
 * وهو نمطُ «التسلسل يُبنى من الأعلى لا من العدد» نفسه من الجهة
 * الأخرى: هناك الفجوةُ تُصادم، وهنا الكتلتان تتراكبان.
 */
const REF_BLOCK = 100;

function checkSeedRefBlocksDoNotOverlap() {
  const file = join(ROOT, 'prisma', 'seed.ts');
  if (!existsSync(file)) return;
  const text = stripComments(readFileSync(file, 'utf8'));

  /** قالبٌ يعدّ: `` `XXX-2026-${String(BASE + i)}` `` → الكتلة [BASE, BASE+99] */
  const blocks = [];
  for (const match of text.matchAll(
    /`([A-Z]{3})-(\d{4})-\$\{String\((\d+)\s*\+\s*[A-Za-z_$][\w$]*\)\}`/g,
  )) {
    blocks.push({
      prefix: `${match[1]}-${match[2]}`,
      from: Number(match[3]),
      to: Number(match[3]) + REF_BLOCK - 1,
      kind: 'قالب',
    });
  }

  /** ومرجعٌ مكتوبٌ بيد — كتلتُه هو وحده */
  for (const match of text.matchAll(/'([A-Z]{3})-(\d{4})-(\d+)'/g)) {
    blocks.push({
      prefix: `${match[1]}-${match[2]}`,
      from: Number(match[3]),
      to: Number(match[3]),
      kind: 'مكتوب',
    });
  }

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.prefix !== b.prefix) continue;
      if (a.from > b.to || b.from > a.to) continue;
      problems.push(
        `prisma/seed.ts  مرجعان يتقاطعان: ${a.prefix}-${a.from} (${a.kind}) و` +
          `${b.prefix}-${b.from} (${b.kind}) — لكلِّ عائلةٍ كتلةٌ مئوية، فالبذرة تسقط بـUnique`,
      );
    }
  }
}

checkSeedRefBlocksDoNotOverlap();

/**
 * ═══ ٥٨ · مسارٌ لا يُصدِّر غير معالجاته ═══
 *
 * Next يرفض من ملفّ `route.ts` أيَّ تصدير غير المعالجات وإعدادات
 * المقطع — **و`tsc --noEmit` على مصادرنا يمرّ**: الرفضُ في أنواعٍ
 * يولّدها البناء (`.next/types`). فالخطأ لا يظهر في `verify`
 * **ويسقط بناءُ الإنتاج**، وهو الصنف المسجَّل: «`verify` لا يبني،
 * فخطأ الإنتاج يبقى غير مرئيّ».
 *
 * ووقع: `VIEWING_MESSAGES` صُدِّر من `viewings/route.ts` ليقرأه
 * مسارُ `[ref]` — وكشفه خادمُ التطوير صدفةً لا الفحص. والمشتركُ
 * موضعُه وحدةٌ خارج `app/`.
 */
const ROUTE_EXPORTS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  /** إعداداتُ المقطع — يقرؤها Next نفسُه */
  'runtime',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
]);

function checkRoutesExportOnlyHandlers() {
  const root = join(ROOT, 'src', 'app');
  if (!existsSync(root)) return;

  for (const file of walk(root)) {
    if (!file.endsWith(`${sep}route.ts`) && !file.endsWith(`${sep}route.tsx`)) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    const text = stripComments(readFileSync(file, 'utf8'));

    for (const match of text.matchAll(
      /^export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      const name = match[1] ?? '';
      if (ROUTE_EXPORTS.has(name)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  مسارٌ يُصدِّر «${name}» — وNext لا يقبل من المسار غير معالجاته، ` +
          'فينجح `tsc` ويسقط بناء الإنتاج. انقله إلى وحدةٍ خارج `app/`',
      );
    }

    /** و`export { x }` و`export * from` مثلُها */
    for (const match of text.matchAll(/^export\s*(\{|\*)/gm)) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  مسارٌ يُعيد التصدير — وNext لا يقبل من المسار غير معالجاته`,
      );
    }
  }
}

checkRoutesExportOnlyHandlers();

/**
 * ═══ البوابة ٥٩ ═══ **خريطةُ تسميةٍ مفتاحُها تعدادٌ تُفحَص بالتعداد.**
 *
 * وُلدت من الصنف نفسه ثلاث مرّات:
 *
 *   ١· قالبا إشعارٍ جديدان كانا سيُعرضان بمفتاحهما الخام في جرس
 *      المستخدم — صفٌّ أُضيف ولا قالب يقابله.
 *   ٢· حساباتُ الدفتر: مفتاحٌ خامّ («PROVIDER_PAYABLE») في جدولٍ ماليّ
 *      يقرؤه محاسب، وله بوابتُه منذ ذلك اليوم.
 *   ٣· و`TRANSFER` أُضيف إلى `ProviderType` ولم تُضَف تسميتُه، فعرضت
 *      شاشةُ صرف المستحقّات **«وكيل نقل الملكية · »** — صفًّا بلا صنف،
 *      بلا إنذار: الفهرسة بنصٍّ تُعيد `undefined` بلا شكوى.
 *
 * والشكلُ واحد: **قيمةُ تعدادٍ بلا تسمية**. وجذرُه أنّ الخريطة تُكتب
 * `Record<string, string>` — فلا المُصرِّف يعرف ما نقص ولا أحد.
 *
 * ═══ والحارسُ هو المُصرِّف لا هذه البوابة ═══
 *
 * فالفحص هنا لا يعدّ المفاتيح: يفرض أن تحمل الخريطةُ **تعهّدًا**
 * (`satisfies Record<Enum, string>`) يفحصه `tsc` عند كل بناء — وهو
 * أدقّ من نصٍّ يقرأ أقواسًا. و`Partial<…>` إعلانٌ صريح أنّ النقص
 * مقصود، فيُقبل.
 *
 * **و`satisfies` لا يوسّع النوع المُصدَّر**: الخريطة تبقى
 * `Record<string, string>` لنداءاتها، فلا يُكسَر موضعٌ واحد.
 *
 * والقياس قبل التفعيل: ٣٤ خريطة بلا تعهّد — نُقلت كلُّها، وأخرج
 * المُصرِّف ثلاث نواقصَ حقيقية (`UserStatus.CLOSED` وثلاثةَ أحوالٍ في
 * طابور المزوّد وردَّين في دفعة الخدمة) فكُتبت.
 */
function checkEnumLabelMaps() {
  const labels = join(ROOT, 'src', 'lib', 'labels');
  const schemaFile = join(ROOT, 'prisma', 'schema.prisma');
  if (!existsSync(labels) || !existsSync(schemaFile)) return;

  const schema = readFileSync(schemaFile, 'utf8');
  const enums = new Map();
  for (const match of schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const members = [...(match[2] ?? '').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:\/\/.*)?$/gm)].map(
      (row) => row[1],
    );
    if (members.length > 1) enums.set(match[1], members);
  }
  if (enums.size === 0) return;

  for (const file of walk(labels)) {
    if (!file.endsWith('.ts')) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    /**
     * **والتعليق يُحذف قبل القراءة**: تعليقاتُ هذا المستودع تُسمّي
     * القيَم في كل سطر، فمفتاحٌ مذكورٌ في شرحٍ يُقرأ مكتوبًا — وهو
     * الخداع الذي أسكت البوابتين ٥٠ و٥٢.
     */
    const text = stripComments(readFileSync(file, 'utf8'));

    for (const match of text.matchAll(/export const (\w+)\s*(:[^=]*)?=\s*\{([\s\S]*?)\n\}([^;]*);/g)) {
      const [whole, name, annotation, body, tail] = match;
      const keys = [...(body ?? '').matchAll(/^\s*'?([A-Z][A-Z0-9_]*)'?\s*:/gm)].map((row) => row[1]);
      if (keys.length < 2) continue;

      /** أقربُ تعدادٍ إلى مفاتيحها — والعتبةُ تمنع تطابقًا عارضًا. */
      let best = null;
      for (const [name_, members] of enums) {
        const overlap = keys.filter((key) => members.includes(key)).length;
        if (overlap === 0) continue;
        const score = overlap / Math.max(members.length, keys.length);
        if (best === null || score > best.score) best = { enum: name_, score };
      }
      if (best === null || best.score < 0.6) continue;

      /**
       * **والتعهّدان سواء**: `: Record<Enum, string>` إعلانًا، أو
       * `satisfies` بعد الحرفيّة. الأوّل أضيق (يمنع مفتاحًا زائدًا
       * أيضًا)، والثاني لا يوسّع النوع المُصدَّر فلا يكسر نداءً يفهرس
       * بنصّ. وكلاهما يجعل `tsc` يرفض قيمةً بلا تسمية — وهو المقصود.
       */
      const promise = /Record<\s*\w+\s*,/;
      if (promise.test(annotation ?? '') && !/Record<\s*string\s*,/.test(annotation ?? '')) continue;
      if (/\bsatisfies\s+(?:Partial<\s*)?Record<\s*\w+\s*,/.test(tail ?? '')) continue;

      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${rel}:${String(line)}  «${name}» مفتاحُها تعداد ${best.enum} بلا تعهّد — ` +
          `أضِف \`satisfies Record<${best.enum}, string>\` ليمنع المُصرِّف قيمةً بلا تسمية ` +
          '(أو `Partial<…>` إن كان النقص مقصودًا)',
      );
      void whole;
    }
  }
}

checkEnumLabelMaps();


/**
 * ═══ البوابة ٦٠ ═══ **حقلٌ يملؤه البائع ولا يصل الخادم.**
 *
 * وقع مرّتين في الموضع نفسه — حمولةُ المركبة في معالج البيع، تُبنى
 * بيدٍ في ثلاثة نداءات:
 *
 *   ١· اللونُ والحالة كانا في المخطّط وليسا في الحمولة، فيردّ الخادم
 *      ٤٢٢ — **نشرٌ لا يمكن أن ينجح من الشاشة أصلًا**، والنطاق
 *      مختبَرٌ والمسار مختبَر والاستمارة لم تُملأ قطّ.
 *   ٢· واللوحةُ: أُضيف حقلُها وخانةُ «أظهِرها مع الإعلان»، وحملتهما
 *      المسودّةُ والمرآب — **ونسيهما النشر**، وهو الطريق الغالب. فيملأ
 *      البائعُ لوحته ويؤشّر، ويُنشر إعلانٌ بلا لوحة ولا كلمة.
 *
 * والجذرُ واحد: **ثلاثةُ كُتّابٍ لحمولةٍ واحدة**. فصارت تُبنى مرّةً في
 * `vehiclePayload`، وهذه البوابة تفحص طرفيها:
 *
 *   · كلُّ حقلٍ في `VehicleDraft` — أي كلُّ ما تعرضه الاستمارة — يُرسَل.
 *     (صنفُ اللوحة: حقلٌ ظاهرٌ لا يصل.)
 *   · وكلُّ حقلٍ **يفرضه** مسارُ `vehicles` يُرسَل.
 *     (صنفُ اللون: حقلٌ يفرضه الخادم ولا تبعثه الشاشة.)
 *
 * والقياس قبل التفعيل: صفرُ إنذاراتٍ على الشجرة. وقِيست بكسرِ ما
 * تحرسه — حُذف `plateNumbers` من الحمولة فأنذرت، وجُعل `city` اختياريًّا
 * في المسار فسكتت عنه وحده.
 */
function checkVehiclePayloadComplete() {
  const fields = join(ROOT, 'src', 'components', 'site', 'VehicleFields.tsx');
  const route = join(ROOT, 'src', 'app', 'api', 'v1', 'vehicles', 'route.ts');
  if (!existsSync(fields) || !existsSync(route)) return;

  /** **والتعليق يُفرَّغ قبل القراءة** — وهو ما خدع البوابتين ٥٠ و٥٢. */
  const source = stripComments(readFileSync(fields, 'utf8'));
  const REL = 'src/components/site/VehicleFields.tsx';

  const draft = /export type VehicleDraft = \{([\s\S]*?)\n\};/.exec(source);
  const payload = /export function vehiclePayload\([\s\S]*?\{\s*return \{([\s\S]*?)\n  \};/.exec(
    source,
  );
  if (draft === null || payload === null) {
    problems.push(`${REL}  لم يُعثر على VehicleDraft أو vehiclePayload — البوابة ٦٠ عمياء`);
    return;
  }

  const sent = new Set(
    [...payload[1].matchAll(/^\s{4}(\w+):/gm)].map((row) => row[1]),
  );
  for (const row of draft[1].matchAll(/^\s{2}(\w+)\s*:/gm)) {
    const field = row[1];
    if (sent.has(field)) continue;
    problems.push(
      `${REL}  «${field}» حقلٌ في VehicleDraft تعرضه الاستمارة ولا ترسله vehiclePayload — ` +
        'يملؤه البائع ولا يصل الخادم',
    );
  }

  /** والطرفُ الآخر: ما يفرضه المسار. والاختياريّ لا يُفرَض. */
  const body = /const Body = z\.object\(\{([\s\S]*?)\n\}\);/.exec(
    stripComments(readFileSync(route, 'utf8')),
  );
  if (body === null) {
    problems.push('src/app/api/v1/vehicles/route.ts  لم يُعثر على Body — البوابة ٦٠ عمياء');
    return;
  }
  for (const row of body[1].matchAll(/^\s{2}(\w+):\s*(z\.[^\n]*)$/gm)) {
    const [, field, rule] = row;
    if (rule.includes('.optional()') || sent.has(field)) continue;
    problems.push(
      `${REL}  «${field}» يفرضه POST /api/v1/vehicles ولا ترسله vehiclePayload — ` +
        'الخادم يردّ ٤٢٢ ولا سبيل للشاشة أن تنجح',
    );
  }
}

checkVehiclePayloadComplete();


/**
 * ═══ البوابة ٦١ ═══ **لا تشكيلَ في نصٍّ يقرؤه مستخدم.**
 *
 * قرار المالك ٢٠٢٦-١٠-١٨: «نعم اسحب حذف التشكيل على كل الشاشات».
 * ومنتجٌ نصفُه مشكولٌ ونصفُه لا يُقرأ أسوأ من أيّ الاختيارين، والسطرُ
 * الواحد لا يُنتبَه له — فالحارسُ آليّ.
 *
 * ═══ وما يُفحَص وما لا يُفحَص ═══
 *
 *   · **يُفحَص**: `src/**` خارج التعليقات، و`src/messages/ar.json`،
 *     و`prisma/seed-data/*.json` — وهي النصّ الذي يبلغ شاشة.
 *   · **لا يُفحَص**: التعليقاتُ (مشكولةٌ عمدًا في هذا المستودع ولا
 *     يقرؤها إلّا من يكتب الشيفرة)، والاختباراتُ والأدواتُ ومخرجاتُ
 *     الطرفية — قارئُها مطوّر.
 *
 * ═══ وما يُستثنى باسمه ═══
 *
 *   · `colours.ts` يحمل الصورتين عمدًا (`فضّي` و`فضي`): اللون حقلٌ
 *     حرٌّ يكتبه البائع، والمخزَّنُ قد يكون أيًّا منهما.
 *
 * **والتطويل ليس تشكيلًا.** «ينتهي بـSA» و«بـ٣٥٠» عربيةٌ صحيحة،
 * و«هـ» في حروف اللوحة و«بـ» في معجم البحث رمزان يُطابَق بهما — فمحوُه
 * يُنتج مفتاحًا مكرّرًا بلا شكوى. فهو خارج الفئة، وقِيس: أربعةٌ
 * وعشرون موضعًا كلُّها من هذا الصنف.
 *
 * والقياس قبل التفعيل: ٥٬٣٩٤ علامةً في ٢٨١ ملفًّا — مُسحت كلُّها،
 * ومعها ترحيلٌ يمسح ما استقرّ في قاعدةٍ تعمل.
 */
const DIACRITICS = /[ً-ْٰ]/;

function checkNoDiacritics() {
  /** **والصورتان عمدًا** — انظر أعلاه. */
  const EXEMPT = new Set(['src/lib/labels/colours.ts']);

  const report = (rel, line, text) => {
    problems.push(
      `${rel}:${String(line)}  تشكيلٌ في نصٍّ معروض: «${text.trim().slice(0, 48)}» — ` +
        'النصّ المعروض بلا تشكيل (قرار المالك). والتعليقات تبقى مشكولة.',
    );
  };

  /* ١ ─ شيفرةُ المنتج، خارج التعليقات */
  const src = join(ROOT, 'src');
  if (existsSync(src)) {
    for (const file of walk(src)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const rel = relative(ROOT, file).split(sep).join('/');
      if (EXEMPT.has(rel)) continue;
      /** **والتعليق يُفرَّغ قبل القراءة** — وهو ما خدع البوابات ٥٠ و٥٢ و٥٩. */
      const text = stripComments(readFileSync(file, 'utf8'));
      text.split('\n').forEach((line, index) => {
        if (DIACRITICS.test(line)) report(rel, index + 1, line);
      });
    }
  }

  /* ٢ ─ الرسائلُ وبياناتُ البذرة المرجعية — قيَمًا لا مفاتيح */
  const files = [join(ROOT, 'src', 'messages', 'ar.json')];
  const seedData = join(ROOT, 'prisma', 'seed-data');
  if (existsSync(seedData)) {
    for (const file of walk(seedData)) if (file.endsWith('.json')) files.push(file);
  }

  for (const file of files) {
    if (!existsSync(file)) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      problems.push(`${rel}  تعذّرت قراءته — البوابة ٦١ عمياء عليه`);
      continue;
    }
    const seen = [];
    const walkValue = (node) => {
      if (Array.isArray(node)) node.forEach(walkValue);
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(walkValue);
      else if (typeof node === 'string' && DIACRITICS.test(node)) seen.push(node);
    };
    walkValue(data);
    /** والسطرُ يُستخرج من المصدر ليُقرأ موضعُه لا قيمتُه وحدها. */
    for (const value of seen.slice(0, 20)) {
      const at = raw.indexOf(value.slice(0, 24));
      report(rel, at === -1 ? 1 : raw.slice(0, at).split('\n').length, value);
    }
  }
}

checkNoDiacritics();


// ————— النتيجة —————
if (problems.length > 0) {
  console.error('\n✗ بوابة الجودة — القسم ١٤:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} مخالفة.\n`);
  process.exit(1);
}

console.log(
  '✓ بوابة الجودة: لا لون مكتوب · لا تسلسل رقميّ بمحايدٍ في نصّ عربيّ · لا سطر بيانات كنصّ واحد · لا # في جمع ICU · الوحدات مصرَّح بها · لا رقم في سلسلة نصّ · كل لون له توكن · كل ترحيل ماليّ له نقض · لا صفّ Prisma يعبر الحدّ · لا نقطة في مفتاح ترجمة · لا db في حزمة المتصفّح · لا مفردة مزوّد خارج المُهايئ · الضريبة تُحسب في tax.ts وحده · لا نصّ عربي في النطاق · لا رقم مُقحَم قبل كلمة عربية · لا نصاب عضوين بنصفه · حالة الإعلان من مدخلها الوحيد · لا دالّة تعبر حدّ الخادم · لا مفتاح تسمية ميّت · لا idVerified بلا identityStatus · لا حقل En نصُّه عربيّ · لا ترميز غير مُصيَّر في بيانات البذرة · كل مفتاح ترجمة يُفضي إلى نصّ · لا وعدَ قاعدةٍ أُلغيت · لا حقل flex بلا min-w-0 · لا قصّ لحقلٍ مشفَّر · لا حالة تُنسخ من خاصّية · لا جارَّ ولا صفةَ خارج صيغة الجمع · كل صلاحيةٍ معروضةٌ وممنوحة · كل وجهةٍ لها مسار · الضمان يُنشأ مع قيده · والسنة لا تُجمَّع · وكل سلّمٍ جانبيّ يتراكب على الهاتف · وكل مفتاح إشعارٍ له قالبٌ يُعرض · ولغة الشاشة لغة السوق · ولا عددَ بين قوسين فرارًا من الجمع · والحالةُ وانقضاءُ الوقت معًا · ولا مرحلةَ طلبٍ تُعرض وحدها · وكلُّ مساحةٍ مبيعة لها موضع · وكلُّ قالبِ إشعارٍ له كاتبٌ أو صمتٌ معلَن · ولا رسمٌ مكتوبٌ في الشيفرة · ولا حالةٌ تُبذَر من قائمة · ولا عنصرَ تفاعليّ داخل تفاعليّ · ولا تقريرَ فحصٍ بلا شرط النشر · ولا دالّةَ نطاقٍ تكتب بلا باب · وكلُّ حسابٍ في الدفتر له تسمية · ولا تسويةَ بلا مرجعها · وكلُّ رابطٍ يحمل لغته · ولا نصَّ دون حدّ القراءة · وعلامةُ النسبة لغةٌ لا زينة · وكلُّ مسارٍ له منادٍ أو سببٌ معلَن · ولا كتلتَي مراجعَ تتقاطعان في البذرة · ولا مسارَ يُصدِّر غير معالجاته · ولا خريطةَ تسميةٍ بلا تعهّدِ تعدادها · ولا حقلَ مركبةٍ يُملأ ولا يُرسَل · ولا تشكيلَ في نصٍّ معروض.',
);
