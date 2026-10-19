import { db } from '@/lib/db';
import { type SeoSurface, isSeoSurface, unknownPlaceholders } from '@/lib/seo/templates';

/**
 * ═══ قوالبُ السيو — وكانت بلا قارئٍ أصلًا ═══
 *
 * سمّتها البوابةُ ٦٣ «نموذجًا لا يعدّله شيء»، والقياسُ أخرج أسوأ:
 * **لا شيء يقرؤها كذلك**. صفٌّ واحد مزروع (`search_results`) ولا
 * استعلامَ يلمس الجدول في `src/` كلّه — فالقرار ٢٦ («قالب +
 * متغيّرات… يحرّرها الأدمن») لم يُوصَل من طرفيه.
 *
 * وما تطبعه صفحاتُ الهبوط اليوم من `src/messages/*.json`: فتغييرُ
 * عنوانٍ يُفهرسه محرّكُ بحثٍ يحتاج نشرًا كاملًا. **والمقدّمةُ
 * والخاتمة لم تُبنَ قطّ** — والصفحة عنوانٌ وسطرُ إحصاءٍ وشبكة.
 *
 * **والنطاق يعيد بيانات لا جُملًا** (البوابة ١٧): يُخرج صفَّ القالب
 * كما هو، والصياغةُ والأرقامُ في الشاشة التي تعرف لغتها.
 */

export type SeoTemplateRow = {
  key: string;
  surface: string;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  outroAr: string;
  outroEn: string;
  active: boolean;
};

const COLUMNS = {
  key: true, surface: true, titleAr: true, titleEn: true,
  introAr: true, introEn: true, outroAr: true, outroEn: true, active: true,
} as const;

/**
 * قالبُ سطحٍ واحد — **والمطفأُ لا يخرج**، فيعود السطحُ إلى نصّ
 * ملفّ الرسائل. وهو كيف يسحب المشغّلُ نصًّا كتبه ولم يُعجبه بلا أن
 * يترك صفحةً بلا عنوان.
 *
 * و`findFirst` لا `findUnique` لأنّ الفريد هو `surface` لا `key`:
 * قالبٌ لكلّ سطح، يفرضه فهرسٌ فريد في الترحيل نفسه.
 */
export async function seoTemplate(surface: SeoSurface): Promise<SeoTemplateRow | null> {
  return db.seoTemplate.findFirst({ where: { surface, active: true }, select: COLUMNS });
}

/** كلُّ القوالب للوحة — والمطفأةُ معها، فالإطفاءُ حالٌ يُعرض ويُبدَّل. */
export async function adminSeoTemplates(): Promise<SeoTemplateRow[]> {
  return db.seoTemplate.findMany({ orderBy: { surface: 'asc' }, select: COLUMNS });
}

export type SeoTemplateInput = {
  titleAr?: string;
  titleEn?: string;
  introAr?: string;
  introEn?: string;
  outroAr?: string;
  outroEn?: string;
  active?: boolean;
};

export type SeoTemplateResult =
  | { ok: true; template: SeoTemplateRow }
  | { ok: false; reason: 'NOT_FOUND' | 'UNKNOWN_SURFACE' | 'TOO_LONG'; detail?: string }
  | { ok: false; reason: 'UNKNOWN_VARIABLE'; detail: string };

/** حدٌّ يمنع نصًّا يكسر الصفحة، لا حدٌّ تحريريّ. */
const MAX_LENGTH = { title: 200, body: 1200 } as const;

const FIELDS = [
  ['titleAr', 'title'], ['titleEn', 'title'],
  ['introAr', 'body'], ['introEn', 'body'],
  ['outroAr', 'body'], ['outroEn', 'body'],
] as const;

/**
 * ═══ والمتغيّرُ المجهول يُرفض عند الحفظ ═══
 *
 * `{brnad}` خطأٌ مطبعيّ لا تملؤه الصفحة، و`renderSeo` تُسقط الفقرةَ
 * كاملةً حين لا تجد قيمةً — **فعنوانُ الصفحة يصير فارغًا بصمت**
 * ويعود إلى ملفّ الرسائل، والمحرِّر يرى نصَّه محفوظًا ولا يُعرض.
 *
 * **والحارسُ في الخادم لا في الشاشة**: نداءٌ مباشر يصل بلا نافذة.
 */
export async function updateSeoTemplate(
  admin: { id: string },
  key: string,
  input: SeoTemplateInput,
  ip: string | null,
): Promise<SeoTemplateResult> {
  const before = await db.seoTemplate.findUnique({ where: { key }, select: COLUMNS });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  const surface = before.surface;
  /**
   * **والقائمةُ تُشتقّ ولا تُنسخ**: نسخةٌ ثانية للأسطح هنا تتباعد عن
   * `SEO_SURFACES` أوّلَ صفحةٍ تُضاف، فيُرفض سطحٌ قائم أو يُقبل سطحٌ
   * بلا صفحة. فالفحصُ بالوحدة الخالية من `db` وحدها.
   */
  if (!isSeoSurface(surface)) return { ok: false, reason: 'UNKNOWN_SURFACE' };

  for (const [field, kind] of FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (value.length > MAX_LENGTH[kind]) return { ok: false, reason: 'TOO_LONG', detail: field };
    const unknown = unknownPlaceholders(value, surface);
    if (unknown.length > 0) {
      return { ok: false, reason: 'UNKNOWN_VARIABLE', detail: unknown.join(', ') };
    }
  }

  const data: SeoTemplateInput = {};
  for (const [field] of FIELDS) {
    const value = input[field];
    if (value !== undefined) data[field] = value.trim();
  }
  if (input.active !== undefined) data.active = input.active;

  const template = await db.seoTemplate.update({ where: { key }, data, select: COLUMNS });

  /** **وكلُّ إجراء أدمن يكتب `AuditLog`** — ونصٌّ يقرؤه محرّكُ بحثٍ أولاها. */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'SeoTemplate',
      entityId: key,
      action: 'seo.update',
      before: asJson(before),
      after: asJson(template),
      ip,
    },
  });

  return { ok: true, template };
}

function asJson(row: SeoTemplateRow): Record<string, string | boolean> {
  const { key: _key, surface: _surface, ...rest } = row;
  return rest;
}
