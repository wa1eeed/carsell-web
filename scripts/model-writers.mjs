import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ═══ مَن يكتب هذا النموذج؟ — مصدرٌ واحد لقارئيه ═══
 *
 * يقرؤه اثنان: `dead-ends` حين يُسأل عن الطابور، والبوابةُ ٦٣ حين
 * تفرض أن يكون لكلّ نموذجٍ بلا محرّرٍ **سببٌ معلَن**. ونسختان منه
 * تتباعدان أوّلَ تغييرٍ في أحدهما — والأضعفُ هو الذي يُقرأ.
 *
 * **والإنشاءُ غيرُ التعديل.** كان المقياسُ يسأل عن الإنشاء وحده، فصفٌّ
 * مرجعيٌّ تزرعه البذرة ويعدّله المشغّل يُقرأ «لا كاتب إطلاقًا» — كأنّه
 * ميّت. وكشفه أنّه **لم يتغيّر بعد إصلاحه**: بُني محرّر علامات
 * الموثوقية وبقي التقرير يقول ما كان يقوله حرفًا بحرف.
 *
 * **والحذفُ ليس تعديلًا** كذلك: `DeviceToken` لا يلمسه إلّا
 * `deleteMany` عند إغلاق الحساب — جدولٌ يُمحى ولا يُنشَأ ولا يُعدَّل.
 */

function* walkCode(dir) {
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
      yield* walkCode(path);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

function* walkSql(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkSql(path);
    else if (entry.name.endsWith('.sql')) yield path;
  }
}

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

/**
 * **والسطرُ الواحد لا يكفي**: المنسِّق يكسر السلسلة فيصير
 * `db.idempotencyKey\n  .create(` — فأبلغتْ أوّلُ نسخةٍ أن الجدول بلا
 * كاتبٍ وهو مكتوبٌ في مسارين. فالبحث على النصّ كلّه لا سطرًا سطرًا.
 */
function verbs(model, names) {
  const lower = model.charAt(0).toLowerCase() + model.slice(1);
  return new RegExp(
    `\\b(?:db|tx|prisma|writer|client)\\s*\\.\\s*${lower}\\s*\\.\\s*(?:${names})\\b`,
  );
}

export const CREATES = (model) => verbs(model, 'create|createMany|upsert');
export const EDITS = (model) => verbs(model, 'update|updateMany|upsert');

export function schemaModels(root) {
  const schema = read(join(root, 'prisma', 'schema.prisma'));
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

/**
 * تصنيفُ كلّ نموذج: أينشئه المنتج؟ أيعدّله؟ أيزرعه الزرع أو ترحيل؟
 *
 * والحالاتُ ثلاثٌ لا اثنتان، وثالثتُها الطابور الحقيقيّ: صفٌّ يزرعه
 * الزرع **ولا شيء يعدّله** — لا يتغيّر إلّا بنشرٍ جديد.
 */
export function classifyModels(root) {
  const product = [...walkCode(join(root, 'src'))].map((path) => read(path));
  const seed = read(join(root, 'prisma', 'seed.ts'));
  const migrations = [...walkSql(join(root, 'prisma', 'migrations'))]
    .map((path) => read(path))
    .join('\n');

  const rows = [];
  for (const model of schemaModels(root)) {
    const creates = CREATES(model);
    const edits = EDITS(model);
    const created = product.some((text) => creates.test(text));
    const edited = product.some((text) => edits.test(text));
    /** **والزرعُ يصل بترحيلٍ كما يصل بملفّ بذرة** — قالبُ الفحص مثالُه. */
    const seeded =
      creates.test(seed) || new RegExp(`INSERT\\s+INTO\\s+"${model}"`, 'i').test(migrations);
    rows.push({ model, created, edited, seeded });
  }
  return rows;
}

/** ما لا يُنشئه المنتج ولا يعدّله — ويزرعه الزرع: لا يتغيّر إلّا بنشر. */
export function frozenModels(root) {
  return classifyModels(root)
    .filter((row) => !row.created && !row.edited && row.seeded)
    .map((row) => row.model);
}

/** ما لا يلمسه شيء — ميّتٌ أو ناقصُ حلقة. */
export function untouchedModels(root) {
  return classifyModels(root)
    .filter((row) => !row.created && !row.edited && !row.seeded)
    .map((row) => row.model);
}
