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
 * ═══ ويُنزَع التعليقُ قبل كلّ مطابقة ═══
 *
 * **«ظهر الاسمُ ⇒ إذن هو موصول»** هو الشكل الذي خدع البوابتين ٥٠ و٥٢
 * وتعليقاتُ هذا المستودع تسمّي الحقول والدوال في كل سطر. وهذا الملفُّ
 * كان يقرأ النصَّ خامًّا: تعليقٌ يكتب `db.seoTemplate.update` شرحًا
 * يجعل الجدولَ «مُعدَّلًا» وهو ليس كذلك، **وهو سكوتٌ لا إنذار** فلا
 * يكشفه أحد. وقِيس يومَ كُتب هذا: صفرُ نماذجَ تتبدّل بالنزع — فهو
 * إغلاقٌ للصنف قبل أن يقع، لا إصلاحٌ لعطلٍ قائم.
 *
 * **والأسطرُ تُحفَظ** كما في `stripComments` في `check-tokens`: النصُّ
 * يذهب و`\n` يبقى، فلا يَضلّ ترقيمُ سطرٍ يُطبع في إنذار.
 */
function stripComments(source) {
  const blank = (text) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_match, lead, body) => `${lead}${blank(body)}`);
}

const readCode = (path) => stripComments(read(path));

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

/**
 * **والقراءةُ فعلٌ ثالث.** صفٌّ لا يقرؤه أحد أسوأ من صفٍّ لا يعدّله
 * أحد، وفحصُ الكاتب لا يراه: `SeoTemplate` مرّ «مزروعًا» شهورًا ولا
 * استعلامَ في `src/` يلمس جدوله.
 */
export const READS = (model) =>
  verbs(model, 'findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy');

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
  const product = [...walkCode(join(root, 'src'))].map((path) => readCode(path));
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

/**
 * ═══ ومَن يقرأ هذا النموذج؟ — والعلائقيُّ يُقرأ باسم حقله ═══
 *
 * `TaxInvoiceLine` لا يظهر في استعلامٍ قطّ: يُقرأ عبر
 * `taxInvoice.include: { lines: true }`. ففحصٌ على `db.<model>.find*`
 * وحده يقول «بلا قارئ» عن ستّةٍ من ثمانية — **وإنذارٌ كاذبٌ متكرّر
 * يُعطّل القياس أشدَّ من غيابه**: من يقرأ تقريرًا خمسةُ أسداسه خطأ
 * يتخطّاه، فتغرق فيه الحالةُ الحقيقية.
 *
 * فالنموذجُ مقروءٌ إن لمسه استعلامٌ باسمه، **أو** إن كان لوالدٍ حقلٌ
 * من نوعه يُنتقى في استعلام (`field: true` أو `field: {`).
 */
export function unreadModels(root) {
  const product = [...walkCode(join(root, 'src'))].map((path) => readCode(path));
  const schema = read(join(root, 'prisma', 'schema.prisma'));

  const blocks = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)]
    .map((match) => [match[1], match[2]]);

  const unread = [];
  for (const model of schemaModels(root)) {
    const direct = READS(model);
    if (product.some((text) => direct.test(text))) continue;

    /** حقولُ الوالدين من نوعه — `lines TaxInvoiceLine[]` و`settlement SettlementStatement?`. */
    const fields = [];
    for (const [name, body] of blocks) {
      if (name === model) continue;
      for (const line of body.split('\n')) {
        const match = line.match(new RegExp(`^\\s*(\\w+)\\s+${model}(\\[\\])?\\s*\\??(\\s|$)`));
        if (match !== null) fields.push(match[1]);
      }
    }

    const viaRelation = fields.some((field) =>
      product.some((text) => new RegExp(`\\b${field}\\s*:\\s*(true|\\{)`).test(text)),
    );
    if (!viaRelation) unread.push(model);
  }
  return unread;
}

/**
 * ═══ ومن يقرأ السجلّ؟ — قائمةٌ واحدة لا نسختان ═══
 *
 * صار للسجلّ جدولان: ما لا يُعدَّل (البوابة ٦٣) وما لا يُقرأ (٦٤).
 * **وكلُّ فحصين يقيسان الشيءَ نفسه يقرآن قائمةً واحدة** — وإلّا
 * تباعدا، والأضعفُ منهما هو الذي يُقرأ. فالبوابةُ والاختبار يقرآن
 * هذه الدالّة، وقراءةُ الملفّ كلّه تجعل كلَّ جدولٍ يُنذر بصفوف الآخر
 * (وقع: أُنذِر على `WebhookEvent` بأنّه «صار له محرّر»).
 */
export function sectionOf(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

/** أسماءُ النماذج المعلَنة في جدولِ قسمٍ واحد. */
export function declaredModels(text, heading) {
  return [...sectionOf(text, heading).matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map(
    (match) => match[1] ?? '',
  );
}

/** عنوانا القسمين — تقرؤهما البوابتان والاختبار. */
export const EDITOR_SECTION = '## The register';
export const READER_SECTION = '## The second register';
