import { readFileSync, readdirSync } from 'node:fs';
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

/** ═══ ١ · نماذجُ لا يكتبها إلّا الزرع ═══ */
function modelsWithoutWriter() {
  const schema = read(join(ROOT, 'prisma', 'schema.prisma'));
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  /**
   * الكتابة بأيّ من صيغها — و`db` و`tx` و`prisma` أسماءٌ لكاتبٍ واحد.
   *
   * **والسطر الواحد لا يكفي**: المنسِّق يكسر السلسلة فيصير
   * `db.idempotencyKey\n  .create(` — فأبلغتْ أوّلُ نسخةٍ من هذه
   * الأداة أن الجدول بلا كاتب **وهو مكتوبٌ ومستعمَل في مسارين**.
   * وفراغٌ بين الاسم والنداء يُسمح به، والبحث على النصّ كلّه لا سطرًا
   * سطرًا.
   */
  const writeOf = (model) => {
    const lower = model.charAt(0).toLowerCase() + model.slice(1);
    return new RegExp(
      `\\b(?:db|tx|prisma|writer|client)\\s*\\.\\s*${lower}\\s*\\.\\s*(?:create|createMany|upsert)\\b`,
    );
  };

  const product = [...walk(join(ROOT, 'src'))].map((path) => ({ path, text: read(path) }));

  const orphans = [];
  for (const model of models) {
    const pattern = writeOf(model);
    if (product.some((file) => pattern.test(file.text))) continue;

    /** يُكتب في الزرع وحده ⇒ يوجد في المخطّط ولا يُنشئه مستخدم. */
    const seeded = pattern.test(read(join(ROOT, 'prisma', 'seed.ts')));
    orphans.push({ model, seeded });
  }
  return orphans;
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

  const exported = new Map();
  for (const path of walk(domainDir)) {
    const text = read(path);
    for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
      const start = match.index ?? 0;
      const body = text.slice(start, start + 4000);
      if (!WRITES.test(body)) continue;
      exported.set(match[1], relative(ROOT, path));
    }
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
   * **والإغلاق العابر**: دالّةٌ يناديها مسارٌ تُعدّ مبلوغة، وما تناديه
   * هي كذلك. فيُعاد المسح حتى لا يُضاف شيء.
   */
  const domainText = new Map(
    [...walk(domainDir)].map((path) => [relative(ROOT, path), read(path)]),
  );

  let grew = true;
  const live = new Set();
  while (grew) {
    grew = false;
    for (const [name, file] of exported) {
      if (live.has(name)) continue;
      if (!new RegExp(`\\b${name}\\b`).test(reachable)) continue;
      live.add(name);
      reachable += `\n${domainText.get(file) ?? ''}`;
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

console.log('═══ نماذجُ لا يكتبها المنتج ═══');
if (models.length === 0) console.log('  لا شيء.');
for (const row of models) {
  console.log(`  ${row.model.padEnd(28)} ${row.seeded ? '— الزرع وحده يكتبه' : '— لا كاتب إطلاقًا'}`);
}

console.log('\n═══ قيَمُ تعدادٍ بلا كاتب ═══');
console.log(enums.length === 0 ? '  لا شيء.' : `  ${enums.join('\n  ')}`);

console.log('\n═══ دوالُّ نطاقٍ تكتب ولا يبلغها التطبيق ═══');
console.log(functions.length === 0 ? '  لا شيء.' : `  ${functions.join('\n  ')}`);

const total = models.length + enums.length + functions.length;
console.log(`\nالمجموع: ${String(total)} — وكلُّ واحدٍ منها إمّا بابٌ يُفتح أو قيمةٌ تُحذف.`);
