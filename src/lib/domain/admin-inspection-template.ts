import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import type { InspectionInputType } from '@/generated/prisma/enums';

/**
 * ═══ قالبُ الفحص يُحرَّر من اللوحة ═══
 *
 * كان ملفَّ بذرة: إضافةُ بندٍ تحتاج نشرًا، وتصحيحُ صياغةٍ كذلك. وقرار
 * المالك (٢٠٢٦-١٠-١٧) أن يُحرَّر — وهو سببُ نقله إلى جداول.
 *
 * ═══ والحذفُ يمحو أجوبةَ فاحصين ═══
 *
 * `InspectionDraftResult.item` بـ`onDelete: Cascade` — فحذفُ بندٍ
 * **يمحو كلَّ جوابٍ عنه** في كل مسودّة، ومسودّةٌ جارية تصير ناقصةً
 * بلا أن يعرف صاحبُها لماذا. فالحذفُ يُرفض ما دام أحدٌ أجاب عنه،
 * ويُقال العددُ لا «لا يمكن».
 *
 * ═══ والإصدارُ يرتفع مع كل تغيير ═══
 *
 * `version` كان حقلًا بلا كاتب. وهو الذي يُفرّق بين تقريرٍ صدر بقالبٍ
 * وتقريرٍ صدر بغيره — وبلا رفعِه لا يُعرف أيُّ نصٍّ رآه الفاحص.
 */

export type TemplateItem = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  inputType: InspectionInputType;
  unit: string | null;
  isCritical: boolean;
  sort: number;
  /** كم جوابًا عنه في المسودّات — وبه يُعرف أيُحذف أم يُحرَّر. */
  answers: number;
};

export type TemplateCategory = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  weight: number;
  sort: number;
  items: TemplateItem[];
};

export type TemplateView = {
  id: string;
  name: string;
  version: number;
  categories: TemplateCategory[];
  totalItems: number;
  criticalItems: number;
};

export async function activeTemplate(): Promise<TemplateView | null> {
  const template = await db.inspectionTemplate.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      name: true,
      version: true,
      categories: {
        orderBy: { sort: 'asc' },
        select: {
          id: true,
          key: true,
          nameAr: true,
          nameEn: true,
          icon: true,
          weight: true,
          sort: true,
          items: {
            orderBy: { sort: 'asc' },
            select: {
              id: true,
              key: true,
              nameAr: true,
              nameEn: true,
              inputType: true,
              unit: true,
              isCritical: true,
              sort: true,
              _count: { select: { results: true } },
            },
          },
        },
      },
    },
  });
  if (template === null) return null;

  const categories = template.categories.map((category) => ({
    id: category.id,
    key: category.key,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    icon: category.icon,
    weight: category.weight,
    sort: category.sort,
    items: category.items.map((item) => ({
      id: item.id,
      key: item.key,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      inputType: item.inputType,
      unit: item.unit,
      isCritical: item.isCritical,
      sort: item.sort,
      answers: item._count.results,
    })),
  }));

  return {
    id: template.id,
    name: template.name,
    version: template.version,
    categories,
    totalItems: categories.reduce((sum, category) => sum + category.items.length, 0),
    criticalItems: categories.reduce(
      (sum, category) => sum + category.items.filter((item) => item.isCritical).length,
      0,
    ),
  };
}

type Audit = { adminId: string; ip: string | null };

async function bumpVersion(templateId: string): Promise<void> {
  await db.inspectionTemplate.update({
    where: { id: templateId },
    data: { version: { increment: 1 } },
  });
}

/** حمولةُ التدقيق — بلا هويّة الفاعل، فهي في `actorId` لا في الجسد. */
function auditPayload(input: Record<string, unknown>): Prisma.InputJsonValue {
  const { adminId: _a, ip: _i, ...rest } = input;
  return rest as Prisma.InputJsonValue;
}

async function writeAudit(
  input: Audit & { entityId: string; action: string; after: Prisma.InputJsonValue },
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'InspectionItem',
      entityId: input.entityId,
      action: input.action,
      before: {},
      after: input.after,
      ip: input.ip,
      createdAt: now,
    },
  });
}

export type TemplateResult = { ok: true } | { ok: false; reason: string; count?: number };

export async function updateCategory(
  input: Audit & {
    categoryId: string;
    nameAr?: string;
    nameEn?: string;
    icon?: string | null;
    weight?: number;
    sort?: number;
  },
  now: Date = new Date(),
): Promise<TemplateResult> {
  const category = await db.inspectionCategory.findUnique({
    where: { id: input.categoryId },
    select: { templateId: true },
  });
  if (category === null) return { ok: false, reason: 'NOT_FOUND' };
  if (input.weight !== undefined && input.weight < 1) return { ok: false, reason: 'BAD_WEIGHT' };

  await db.inspectionCategory.update({
    where: { id: input.categoryId },
    data: {
      ...(input.nameAr === undefined ? {} : { nameAr: input.nameAr.trim() }),
      ...(input.nameEn === undefined ? {} : { nameEn: input.nameEn.trim() }),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      ...(input.weight === undefined ? {} : { weight: input.weight }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
    },
  });
  await bumpVersion(category.templateId);
  await writeAudit(
    { ...input, entityId: input.categoryId, action: 'inspection.category_updated', after: auditPayload(input) },
    now,
  );
  return { ok: true };
}

export async function updateItem(
  input: Audit & {
    itemId: string;
    nameAr?: string;
    nameEn?: string;
    unit?: string | null;
    isCritical?: boolean;
    sort?: number;
  },
  now: Date = new Date(),
): Promise<TemplateResult> {
  const item = await db.inspectionItem.findUnique({
    where: { id: input.itemId },
    select: { category: { select: { templateId: true } } },
  });
  if (item === null) return { ok: false, reason: 'NOT_FOUND' };

  await db.inspectionItem.update({
    where: { id: input.itemId },
    data: {
      ...(input.nameAr === undefined ? {} : { nameAr: input.nameAr.trim() }),
      ...(input.nameEn === undefined ? {} : { nameEn: input.nameEn.trim() }),
      ...(input.unit === undefined ? {} : { unit: input.unit }),
      ...(input.isCritical === undefined ? {} : { isCritical: input.isCritical }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
    },
  });
  await bumpVersion(item.category.templateId);
  await writeAudit(
    { ...input, entityId: input.itemId, action: 'inspection.item_updated', after: auditPayload(input) },
    now,
  );
  return { ok: true };
}

export async function addItem(
  input: Audit & {
    categoryId: string;
    nameAr: string;
    nameEn: string;
    inputType: InspectionInputType;
    unit: string | null;
    isCritical: boolean;
  },
  now: Date = new Date(),
): Promise<TemplateResult & { itemId?: string }> {
  const nameAr = input.nameAr.trim();
  if (nameAr === '') return { ok: false, reason: 'NAME_REQUIRED' };

  const category = await db.inspectionCategory.findUnique({
    where: { id: input.categoryId },
    select: { key: true, templateId: true, _count: { select: { items: true } } },
  });
  if (category === null) return { ok: false, reason: 'NOT_FOUND' };

  /**
   * **والمفتاحُ من الأعلى لا من العدد.** `count + 1` يصطدم بمفتاحٍ
   * قائم بعد أوّل حذف — وهي العلّة نفسها التي وقعت في `Order`
   * و`Listing` معًا.
   */
  const last = await db.inspectionItem.findFirst({
    where: { categoryId: input.categoryId },
    orderBy: { sort: 'desc' },
    select: { sort: true, key: true },
  });
  const nextSort = (last?.sort ?? -1) + 1;
  const key = `${category.key}_${String(nextSort).padStart(3, '0')}_v${String(Date.now()).slice(-6)}`;

  const created = await db.inspectionItem.create({
    data: {
      categoryId: input.categoryId,
      key,
      nameAr,
      nameEn: input.nameEn.trim() || nameAr,
      inputType: input.inputType,
      unit: input.unit,
      isCritical: input.isCritical,
      sort: nextSort,
    },
    select: { id: true },
  });

  await bumpVersion(category.templateId);
  await writeAudit(
    { ...input, entityId: created.id, action: 'inspection.item_added', after: { nameAr, key } },
    now,
  );
  return { ok: true, itemId: created.id };
}

/**
 * يحذف بندًا — **ويرفض ما دام أحدٌ أجاب عنه**.
 *
 * فجوابُ فاحصٍ يُمحى بالسلسلة بلا أثر، ومسودّةٌ جارية تصير ناقصةً
 * ولا يعرف صاحبُها لماذا. والعددُ يُقال: «عليه ١٢ جوابًا» لا
 * «لا يمكن الحذف».
 */
export async function removeItem(
  input: Audit & { itemId: string },
  now: Date = new Date(),
): Promise<TemplateResult> {
  const item = await db.inspectionItem.findUnique({
    where: { id: input.itemId },
    select: {
      nameAr: true,
      category: { select: { templateId: true } },
      _count: { select: { results: true } },
    },
  });
  if (item === null) return { ok: false, reason: 'NOT_FOUND' };
  if (item._count.results > 0) {
    return { ok: false, reason: 'HAS_ANSWERS', count: item._count.results };
  }

  await db.inspectionItem.delete({ where: { id: input.itemId } });
  await bumpVersion(item.category.templateId);
  await writeAudit(
    { ...input, entityId: input.itemId, action: 'inspection.item_removed', after: { nameAr: item.nameAr } },
    now,
  );
  return { ok: true };
}

/**
 * ═══ وقسمٌ يُضاف — وكان التحرير نصفَ تحرير ═══
 *
 * `updateCategory` و`addItem` و`removeItem` مبنيّةٌ منذ نُقل القالب
 * إلى الجداول، **ولا `addCategory` ولا `removeCategory`** — فالمشغّل
 * يُعيد تسمية قسمٍ ويحرّر بنودَه ولا يستطيع أن يفتح قسمًا جديدًا ولا
 * أن يُقاعد قسمًا. وقرار المالك ٢٠٢٦-١٠-١٨ أن يُدار الكلُّ من اللوحة.
 *
 * **والمفتاحُ يُولَّد ولا يُكتب**: `key` ثابتٌ تُطابَق به اللقطةُ
 * المجمَّدة بالقالب الجديد، فمفتاحٌ يكتبه مشغّلٌ بالعربية أو بمسافةٍ
 * يكسر المطابقة بعد شهور. ويُشتقّ من الاسم بحروفٍ لاتينية، ويُذيَّل
 * برقمٍ إن تكرّر — فلا يصطدم بقسمٍ قائم.
 */
function slugKey(name: string): string {
  const latin = name
    .normalize('NFKD')
    .replace(/[^ -~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return latin === '' ? 'section' : latin.slice(0, 24);
}

export async function addCategory(
  input: Audit & { nameAr: string; nameEn: string; weight: number; icon?: string | null },
  now: Date = new Date(),
): Promise<TemplateResult & { categoryId?: string }> {
  const nameAr = input.nameAr.trim();
  if (nameAr === '') return { ok: false, reason: 'NAME_REQUIRED' };
  if (input.weight < 1) return { ok: false, reason: 'BAD_WEIGHT' };

  const template = await db.inspectionTemplate.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (template === null) return { ok: false, reason: 'NO_TEMPLATE' };

  /** **والترتيبُ من الأعلى لا من العدد** — فجوةٌ واحدة تُنتج تصادمًا. */
  const last = await db.inspectionCategory.findFirst({
    where: { templateId: template.id },
    orderBy: { sort: 'desc' },
    select: { sort: true },
  });

  const base = slugKey(input.nameEn.trim() === '' ? nameAr : input.nameEn);
  const taken = new Set(
    (
      await db.inspectionCategory.findMany({
        where: { templateId: template.id },
        select: { key: true },
      })
    ).map((row) => row.key),
  );
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${String(n)}`;

  const created = await db.inspectionCategory.create({
    data: {
      templateId: template.id,
      key,
      nameAr,
      nameEn: input.nameEn.trim() || nameAr,
      weight: input.weight,
      sort: (last?.sort ?? -1) + 1,
      ...(input.icon === undefined ? {} : { icon: input.icon }),
    },
    select: { id: true },
  });

  await bumpVersion(template.id);
  await writeAudit(
    { ...input, entityId: created.id, action: 'inspection.category_added', after: { nameAr, key } },
    now,
  );
  return { ok: true, categoryId: created.id };
}

/**
 * يحذف قسمًا — **ويرفض ما دام فيه بند**.
 *
 * و`InspectionItem.category` بـ`onDelete: Cascade`، فحذفُ قسمٍ يمحو
 * بنودَه ومعها **كلَّ جوابٍ عنها في كل مسودّة** — بلا أن يرى المشغّل
 * رقمًا واحدًا. فالشرطُ أغلظُ من شرط البند: يُفرَّغ القسمُ بندًا بندًا
 * (وكلُّ بندٍ يُرفض حذفُه إن أُجيب عنه)، ثمّ يُحذف. وهكذا لا يمرّ
 * محوٌ جماعيّ تحت نقرةٍ واحدة.
 */
export async function removeCategory(
  input: Audit & { categoryId: string },
  now: Date = new Date(),
): Promise<TemplateResult> {
  const category = await db.inspectionCategory.findUnique({
    where: { id: input.categoryId },
    select: { nameAr: true, templateId: true, _count: { select: { items: true } } },
  });
  if (category === null) return { ok: false, reason: 'NOT_FOUND' };
  if (category._count.items > 0) {
    return { ok: false, reason: 'HAS_ITEMS', count: category._count.items };
  }

  await db.inspectionCategory.delete({ where: { id: input.categoryId } });
  await bumpVersion(category.templateId);
  await writeAudit(
    {
      ...input,
      entityId: input.categoryId,
      action: 'inspection.category_removed',
      after: { nameAr: category.nameAr },
    },
    now,
  );
  return { ok: true };
}
