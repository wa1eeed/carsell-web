import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { ListingType } from '@/generated/prisma/enums';

/**
 * ═══ A33 · A34 — الأسئلة الشائعة والصفحات القانونية ═══
 *
 * كلتاهما محتوًى **مزروعٌ ولا يُدار**: `FaqItem` و`LegalDocument`
 * موجودان منذ الزرع، ولا شاشة تعدّلهما. فتغييرُ نصٍّ قانونيّ يحتاج
 * نشرةً، وسؤالٌ يُكتشف نقصُه يبقى ناقصًا.
 *
 * ═══ والقانونيّ نسخٌ موقّتة لا تحريرٌ حيّ ═══
 *
 * عنوان A34 حرفيًّا. والفرق ليس أسلوبًا: من قبِل الشروط قبِل **نسخةً
 * بعينها**، وتحريرُها في مكانها يجعل موافقته على نصٍّ لم يقرأه. فكل
 * تغييرٍ نسخةٌ جديدة بتاريخ سريان، والقديمة تبقى.
 */

export type FaqRow = {
  id: string;
  questionAr: string;
  /** نصُّ الصفّ كاملًا — تُفتح به استمارة التحرير، فلا حقلَ تجهل قيمته. */
  questionEn: string;
  answerAr: string;
  answerEn: string;
  category: string;
  sort: number;
  active: boolean;
  /** أين يظهر — والصياغة في الشاشة */
  surfaces: string[];
  /** طريقة بيعٍ بعينها، أو `null` لكلّها */
  listingTypes: string[];
  /** لا ترجمة إنجليزية — يظهر بالعربية وحدها */
  missingEn: boolean;
};

export type FaqStats = {
  total: number;
  onListingPage: number;
  missingEn: number;
  byCategory: { category: string; count: number }[];
};

export async function faqList(category: string | null = null): Promise<FaqRow[]> {
  const items = await db.faqItem.findMany({
    where: category === null ? {} : { category },
    orderBy: [{ category: 'asc' }, { sort: 'asc' }],
    select: {
      id: true,
      questionAr: true,
      questionEn: true,
      answerAr: true,
      answerEn: true,
      category: true,
      sort: true,
      active: true,
      placements: { select: { surface: true, listingType: true, active: true } },
    },
  });

  return items.map((item) => ({
    id: item.id,
    questionAr: item.questionAr,
    questionEn: item.questionEn,
    answerAr: item.answerAr,
    answerEn: item.answerEn,
    category: item.category,
    sort: item.sort,
    active: item.active,
    surfaces: [...new Set(item.placements.filter((p) => p.active).map((p) => p.surface))],
    listingTypes: [
      ...new Set(
        item.placements
          .filter((p) => p.active && p.listingType !== null)
          .map((p) => p.listingType as string),
      ),
    ],
    /**
     * **الترجمة الناقصة تُعرض ولا تُخفى.** سؤالٌ بلا إنجليزية يظهر
     * بالعربية للزائر الإنجليزيّ — وهو عطلٌ صامت لا يراه إلا من يقرأ
     * بالإنجليزية، أي ليس نحن.
     */
    missingEn: item.questionEn.trim() === '' || item.answerEn.trim() === '',
  }));
}

export async function faqStats(): Promise<FaqStats> {
  const [total, onListing, items, byCategory] = await Promise.all([
    db.faqItem.count(),
    db.faqPlacement.count({ where: { surface: 'listing_page', active: true } }),
    db.faqItem.findMany({ select: { questionEn: true, answerEn: true } }),
    db.faqItem.groupBy({ by: ['category'], _count: true }),
  ]);

  return {
    total,
    onListingPage: onListing,
    missingEn: items.filter((i) => i.questionEn.trim() === '' || i.answerEn.trim() === '').length,
    byCategory: byCategory.map((row) => ({ category: row.category, count: row._count })),
  };
}

export type LegalRow = {
  key: string;
  titleAr: string;
  version: string;
  effectiveAt: string;
  active: boolean;
  sectionCount: number;
  hasSummary: boolean;
  updatedAt: string;
};

export type LegalSummary = {
  total: number;
  unpublished: number;
  sections: number;
  /** آخر مستندٍ مُسّ — والتاريخ وحده لا يقول أيّه. */
  latest: { titleAr: string; updatedAt: string } | null;
};

/**
 * عدّادات الشاشة — **من الصفوف لا من طول القائمة المعروضة**.
 *
 * الشاشة تعرض المستندات كلَّها اليوم، فالعدّ من القائمة يتفق معها
 * صدفةً. وأوّلُ ترشيحٍ يُضاف (حالة أو بحث) يجعل «٨ مستندات» تعني
 * «٨ معروضة» — وهو عدّادٌ يكذب بلا أن يتغيّر سطرُه.
 */
export async function legalSummary(): Promise<LegalSummary> {
  const docs = await db.legalDocument.findMany({
    select: { titleAr: true, active: true, sections: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const newest = docs[0];

  return {
    total: docs.length,
    unpublished: docs.filter((doc) => !doc.active).length,
    sections: docs.reduce(
      (sum, doc) => sum + (Array.isArray(doc.sections) ? doc.sections.length : 0),
      0,
    ),
    latest:
      newest === undefined
        ? null
        : { titleAr: newest.titleAr, updatedAt: newest.updatedAt.toISOString() },
  };
}

export async function legalDocuments(): Promise<LegalRow[]> {
  const docs = await db.legalDocument.findMany({ orderBy: { sort: 'asc' } });

  return docs.map((doc) => ({
    key: doc.key,
    titleAr: doc.titleAr,
    version: doc.version,
    effectiveAt: doc.effectiveAt.toISOString(),
    active: doc.active,
    sectionCount: Array.isArray(doc.sections) ? doc.sections.length : 0,
    hasSummary: doc.summaryAr !== null && doc.summaryAr.trim() !== '',
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

export type ToggleFailure = 'NOT_FOUND';
export type ToggleResult = { ok: true; active: boolean } | { ok: false; reason: ToggleFailure };

/**
 * ═══ إنشاءُ سؤالٍ وتحريرُ نصّه ═══
 *
 * `FaqItem` كان **لا يكتبه إلا الزرع**: الشاشة تُخفي وتُظهر وتضبط
 * المواضع، ولا تملك إضافة سؤالٍ ولا تصحيح حرفٍ فيه. **وهي تعدّ
 * «ترجمة ناقصة» وتضع وسمًا على كل صفٍّ ينقصه الإنجليزيّ** — مشكلةٌ
 * تُحصى ولا بابَ لحلّها، وهو الصنف الذي يتكرّر في هذا المستودع.
 *
 * والتحقّق يعيد مفاتيح لا جُملًا (البوابة ١٧)، والصياغة في الشاشة.
 */
export type FaqDraft = {
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
  category: string;
  sort?: number | string | null;
};

export type FaqSaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> };

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function validateFaq(draft: FaqDraft): Record<string, string> {
  const fields: Record<string, string> = {};

  if (trimmed(draft.questionAr) === '') fields.questionAr = 'REQUIRED';
  if (trimmed(draft.answerAr) === '') fields.answerAr = 'REQUIRED';
  if (trimmed(draft.category) === '') fields.category = 'REQUIRED';

  /**
   * **والإنجليزيّ يُحذَّر منه ولا يُمنع.** سؤالٌ عربيٌّ عاجل خيرٌ من لا
   * سؤال، والشاشة تعدّ ناقصي الترجمة وتسمّيهم — فمنعُ الحفظ هنا يدفع
   * المحرّر إلى كتابة إنجليزيّةٍ رديئة ليمرّ.
   */

  const sort = draft.sort ?? null;
  if (sort !== null && sort !== '') {
    const order = Number(sort);
    if (!Number.isInteger(order) || order < 0 || order > 9_999) fields.sort = 'RANGE';
  }

  return fields;
}

/** إنشاءُ سؤالٍ أو تحريرُه — ومعرّفٌ غائب يعني إنشاءً. */
export async function saveFaq(
  input: { id: string | null; draft: FaqDraft; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<FaqSaveResult> {
  const fields = validateFaq(input.draft);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const sortText = input.draft.sort ?? null;
  const data = {
    questionAr: trimmed(input.draft.questionAr),
    questionEn: trimmed(input.draft.questionEn),
    answerAr: trimmed(input.draft.answerAr),
    answerEn: trimmed(input.draft.answerEn),
    category: trimmed(input.draft.category),
    ...(sortText === null || sortText === '' ? {} : { sort: Number(sortText) }),
  };

  if (input.id === null) {
    /**
     * **والترتيبُ يُشتقّ من الأعلى لا من العدد.** `count() + 1` يصطدم
     * بأوّل صفٍّ محذوف — وهو العطل نفسه الذي وقع في `Order` و`Listing`.
     */
    const last = await db.faqItem.findFirst({
      where: { category: data.category },
      orderBy: { sort: 'desc' },
      select: { sort: true },
    });
    const created = await db.faqItem.create({
      data: { ...data, sort: data.sort ?? (last?.sort ?? 0) + 1 },
      select: { id: true },
    });
    await writeFaqAudit(created.id, 'faq.created', null, data, input, now);
    return { ok: true, id: created.id, created: true };
  }

  const before = await db.faqItem.findUnique({
    where: { id: input.id },
    select: {
      questionAr: true, questionEn: true, answerAr: true,
      answerEn: true, category: true, sort: true,
    },
  });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };

  await db.faqItem.update({ where: { id: input.id }, data });
  await writeFaqAudit(input.id, 'faq.updated', before, data, input, now);
  return { ok: true, id: input.id, created: false };
}

async function writeFaqAudit(
  id: string,
  action: string,
  before: unknown,
  after: unknown,
  input: { adminId: string; ip: string | null },
  now: Date,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'FaqItem',
      entityId: id,
      action,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
      ip: input.ip,
      createdAt: now,
    },
  });
}

/**
 * تفعيل سؤالٍ أو تعطيله — **وهو سحبُه من الظهور فورًا**.
 *
 * ويبقى منفصلًا عن الحفظ: استمارةٌ لا ترسل `active` كانت ستُقرأ
 * «أخفِه»، فتصحيحُ حرفٍ يسحب سؤالًا من الموقع بالسهو.
 */
export async function toggleFaq(
  input: { id: string; active: boolean; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ToggleResult> {
  const item = await db.faqItem.findUnique({ where: { id: input.id }, select: { active: true } });
  if (item === null) return { ok: false, reason: 'NOT_FOUND' };

  await db.faqItem.update({ where: { id: input.id }, data: { active: input.active } });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'FaqItem',
      entityId: input.id,
      action: input.active ? 'faq.enabled' : 'faq.disabled',
      before: { active: item.active },
      after: { active: input.active },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, active: input.active };
}

/**
 * ═══ مواضع السؤال — البابُ الذي كان مؤجَّلًا ═══
 *
 * `FaqPlacement` **بلا كاتبٍ في المنتج**: يقرؤه ثلاثة مواضع (صفحة
 * السيارة والرئيسية وعدّادُ اللوحة)، ويزرعه الزرع، ولا شيء يُنشئه.
 * فشاشةُ الأسئلة تعرض «المواضع» للقراءة وتعدّ «في صفحة السيارة»،
 * **وما زُرع هو كلُّ ما سيكون**.
 *
 * وكان التأجيل مكتوبًا («التحرير الكامل شاشةٌ أكبر») — والتأجيل صحيحٌ
 * يوم كُتب، لكنّ أثرَه أن مديرَ المحتوى يكتب سؤالًا ولا يستطيع وضعه.
 *
 * ═══ والوضع استبدالٌ لا إضافة ═══
 *
 * لو أضفنا لتكرّرت المواضع بلا حدّ، ولظهر السؤال مرّتين في صفحةٍ
 * واحدة. فالمُرسَل هو الحال النهائية: ما ليس فيه يُحذف.
 */
export type PlacementInput = {
  surface: string;
  /** `null` يعني كلَّ طرق البيع — والمحدَّد يسبق العامّ في العرض. */
  listingType: ListingType | null;
};

const SURFACES = ['listing_page', 'help_center', 'checkout'] as const;

export async function setFaqPlacements(
  input: {
    id: string;
    placements: readonly PlacementInput[];
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<{ ok: true; count: number } | { ok: false; reason: 'NOT_FOUND' | 'BAD_SURFACE' }> {
  const item = await db.faqItem.findUnique({ where: { id: input.id }, select: { id: true } });
  if (item === null) return { ok: false, reason: 'NOT_FOUND' };

  /** **والسطح من قائمةٍ مغلقة** — سطحٌ مخترَع لا يقرؤه أحد فيختفي السؤال صامتًا. */
  for (const placement of input.placements) {
    if (!(SURFACES as readonly string[]).includes(placement.surface)) {
      return { ok: false, reason: 'BAD_SURFACE' };
    }
  }

  const before = await db.faqPlacement.findMany({
    where: { faqId: input.id },
    select: { surface: true, listingType: true },
  });

  await db.$transaction(async (tx) => {
    await tx.faqPlacement.deleteMany({ where: { faqId: input.id } });
    if (input.placements.length > 0) {
      await tx.faqPlacement.createMany({
        data: input.placements.map((placement, index) => ({
          faqId: input.id,
          surface: placement.surface,
          listingType: placement.listingType,
          sort: index,
          active: true,
        })),
      });
    }
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'FaqItem',
      entityId: input.id,
      action: 'faq.placements_set',
      before: { placements: before },
      after: { placements: input.placements },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, count: input.placements.length };
}
