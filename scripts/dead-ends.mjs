import { readFileSync, readdirSync } from 'node:fs';
import { classifyModels } from './model-writers.mjs';
import { join, relative } from 'node:path';

/**
 * ═══ قياسُ ما بُني ولا يبلغه أحد ═══
 *
 * تكرّر الصنف **ثلاث عشرة مرّة**: قيمةٌ في المخطّط لا يكتبها كاتب،
 * أو دالّةٌ مصدَّرة لا ينادیها زرّ. وكلُّها وُجدت **بالصدفة** — وهي
 * تُقاس في ثوانٍ.
 *
 * وأمثلةٌ ممّا وجدته هذه الأداة بعد كتابتها:
 * `Auction` (طريقةُ بيعٍ كاملة لا يستطيع بائعٌ إنشاءها) ·
 * `ServiceRequest` (خطُّ إيرادٍ بلا مدخل) · `OrderStatus.CANCELLED` ·
 * `viewingCity` · `minAcceptPrice` عند النشر.
 *
 * ═══ وما لا تقيسه ═══
 *
 * **الفرعُ الميّت داخل دالّةٍ حيّة.** `resolveSellerDecision(id, true)`
 * لها منادٍ، ومنادیها يمرّر `false` دائمًا — فالفرع الآخر لا يقع أبدًا
 * والتغطية خضراء. ذاك يحتاج قياسًا على الوسائط لا على الأسماء.
 */

const ROOT = process.cwd();

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === 'node_modules') continue;
      yield* walk(path);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * ═══ ١ · نماذجُ لا يكتبها إلّا الزرع ═══
 *
 * **والتصنيفُ في `model-writers.mjs`** — تقرؤه البوابة ٦٣ أيضًا حين
 * تفرض أن يكون لكلّ نموذجٍ بلا محرّرٍ سببٌ معلَن. ونسختان منه
 * تتباعدان أوّلَ تغيير، والأضعفُ هو الذي يُقرأ.
 */
function modelsWithoutWriter() {
  return classifyModels(ROOT)
    .filter((row) => !row.created)
    .map((row) => ({ model: row.model, seeded: row.seeded, edited: row.edited }));
}

/** ═══ ٢ · قيَمُ تعدادٍ لا يكتبها أحد ═══ */
function enumValuesWithoutWriter() {
  const schema = read(join(ROOT, 'prisma', 'schema.prisma'));
  const product = [...walk(join(ROOT, 'src'))]
    .map((path) => read(path))
    .join('\n');

  const orphans = [];
  for (const block of schema.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
    const name = block[1];
    const values = [...block[2].matchAll(/^\s*([A-Z][A-Z0-9_]*)/gm)].map((m) => m[1]);

    for (const value of values) {
      /**
       * **القراءة ليست كتابة.** `status === 'CANCELLED'` فحصٌ،
       * و`'CANCELLED'` وحدها قد تكون تسميةً في خريطة. فيُبحث عن
       * الاسم مسبوقًا بعلامة إسناد أو داخل `data:` — وهو تقريبٌ،
       * فالأداة **تدلّ ولا تحكم**.
       */
      const written = new RegExp(
        `(?::\\s*'${value}'|=\\s*'${value}'|\\.${value}\\b|'${value}'\\s*(?:,|\\}))`,
      ).test(product);
      if (!written) orphans.push(`${name}.${value}`);
    }
  }
  return orphans;
}

/** ═══ ٣ · دوالُّ نطاقٍ مصدَّرة لا يبلغها التطبيق ═══ */
function domainFunctionsWithoutCaller() {
  const domainDir = join(ROOT, 'src', 'lib', 'domain');
  const WRITES = /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(|postEntries\(/;

  /**
   * **والكتابة تُقاس على جسم الدالّة لا على نافذةٍ بطول ثابت.**
   * أربعة آلاف حرفٍ بعد المطلع تتجاوز القصيرة إلى جارتها، فأبلغت
   * الأداة أن `transferDeadlineFrom` تكتب — وهي سطرٌ يحسب تاريخًا.
   */
  const exported = new Map();
  for (const path of walk(domainDir)) {
    const text = read(path);
    const marks = [...text.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)];

    marks.forEach((mark, i) => {
      const from = mark.index ?? 0;
      const to = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length;
      if (!WRITES.test(text.slice(from, to))) return;
      exported.set(mark[1], relative(ROOT, path));
    });
  }

  /** الجذور: ما يبلغه المستخدم — شاشاتٌ ومسارات ومكوّنات ووظائف دورية. */
  const roots = [
    join(ROOT, 'src', 'app'),
    join(ROOT, 'src', 'components'),
    join(ROOT, 'scripts'),
  ];
  let reachable = roots
    .flatMap((dir) => [...walk(dir)])
    .map((path) => read(path))
    .join('\n');

  /**
   * ═══ والإغلاق على الأجسام لا على الملفّات ═══
   *
   * **ضمُّ ملفٍّ كاملًا يجعل كل صادراته مبلوغة.** `forfeitDeposit`
   * تسكن `auctions.ts` مع `closeEndedAuctions` — وتلك تُنادى من
   * الوظيفة الدورية، فضمُّ الملفّ جعل الأولى تبدو حيّةً وهي بلا منادٍ.
   * فأبلغت الأداة **صفرَ دوالّ ميّتة** وفي اليد تسعٌ يثبت الفحص
   * اليدويّ أنها كذلك.
   *
   * **والأمرُ مقلوبٌ عن المرّة السابقة**: ضيّقتُ فأبلغت عن حيٍّ،
   * ووسّعتُ فسكتت عن ميّت. فالقياس على **جسم الدالّة**: من مطلعها إلى
   * أوّل تصديرٍ بعدها.
   */
  const bodies = new Map();
  for (const path of walk(join(ROOT, 'src', 'lib'))) {
    const text = read(path);
    /**
     * **والمعرَّفُ غير المصدَّر يُتبَع أيضًا.** قائمةُ الوظائف الدورية
     * `const JOBS` ليست مصدَّرة، وفيها وحدها تُذكر `expireOffers` و
     * `closeEndedAuctions` — فاقتصارُ المسح على المصدَّر قطع السلسلة عند
     * `runJobs` وأبلغ عن ثلاثِ وظائفَ حيّة أنها ميّتة.
     */
    const marks = [
      ...text.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|class)\s+(\w+)/gm),
    ];

    marks.forEach((mark, i) => {
      const from = mark.index ?? 0;
      const to = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.length;
      bodies.set(mark[1], text.slice(from, to));
    });
  }

  let grew = true;
  const live = new Set();
  while (grew) {
    grew = false;
    for (const name of bodies.keys()) {
      if (live.has(name)) continue;
      if (!new RegExp(`\\b${name}\\b`).test(reachable)) continue;
      live.add(name);
      /** وجسمُها وحده يُضمّ — فما تناديه هي يصير مبلوغًا، لا ما يجاورها. */
      reachable += `\n${bodies.get(name) ?? ''}`;
      grew = true;
    }
  }

  return [...exported.entries()]
    .filter(([name]) => !live.has(name))
    .map(([name, file]) => `${name}  ·  ${file}`);
}

const models = modelsWithoutWriter();
const enums = enumValuesWithoutWriter();
const functions = domainFunctionsWithoutCaller();

/**
 * **والترتيبُ بالخطورة**: ما لا يلمسه شيء أوّلًا، ثمّ ما يُزرع ولا
 * يُعدَّل (طابورُ العمل الحقيقيّ)، ثمّ المرجعيُّ السليم — وهذا الأخير
 * يُعدّ ولا يُسرَد، فسردُه يُغرق ما قبله.
 */
const dead = models.filter((row) => !row.seeded && !row.edited);
const frozen = models.filter((row) => row.seeded && !row.edited);
const reference = models.filter((row) => row.edited);

console.log('═══ نماذجُ لا يُنشئها المنتج ═══');
if (models.length === 0) console.log('  لا شيء.');

if (dead.length > 0) {
  console.log('\n  ▸ لا يُنشئها ولا يعدّلها شيء — ميّتة أو ناقصةُ حلقة:');
  for (const row of dead) console.log(`      ${row.model}`);
}

if (frozen.length > 0) {
  console.log('\n  ▸ يزرعها الزرع ولا شيء يعدّلها — لا تتغيّر إلّا بنشر:');
  for (const row of frozen) console.log(`      ${row.model}`);
}

if (reference.length > 0) {
  console.log(
    `\n  ▸ يزرعها الزرع ويكتب عليها المنتج: ${String(reference.length)} — ` +
      reference.map((row) => row.model).join(' · '),
  );
  /**
   * **ولا يقول هذا السطرُ إنّ لها محرّرًا.** المقياسُ نصّيّ: يرى
   * `update` ولا يعرف ما تكتبه. و`ApiKey` منها — وكلُّ ما يلمسه
   * ختمُ `lastUsedAt` عند كل قراءة، فلا أحد يُصدر مفتاحًا أصلًا.
   * فمن أراد يقينًا **يفتح الشاشة**، كما تقول قاعدةُ المستودع.
   */
  console.log(
    '      (كتابةٌ قد تكون ختمَ استعمالٍ لا تحريرًا — تُقاس بفتح الشاشة)',
  );
}

console.log('\n═══ قيَمُ تعدادٍ بلا كاتب ═══');
console.log(enums.length === 0 ? '  لا شيء.' : `  ${enums.join('\n  ')}`);

console.log('\n═══ دوالُّ نطاقٍ تكتب ولا يبلغها التطبيق ═══');
console.log(functions.length === 0 ? '  لا شيء.' : `  ${functions.join('\n  ')}`);

const total = models.length + enums.length + functions.length;
console.log(`\nالمجموع: ${String(total)} — وكلُّ واحدٍ منها إمّا بابٌ يُفتح أو قيمةٌ تُحذف.`);
