import { db } from '@/lib/db';
import type { ServiceCategory } from '@/generated/prisma/enums';
import { SERVICE_CATEGORIES } from './service-categories';

export { SERVICE_CATEGORIES };

/**
 * المحتوى العام — الخدمات (Wi) والمساعدة (Wn) والقانونية (Wo).
 *
 * ثلاث شاشات يجمعها أن **محتواها يحرّره الأدمن ولا يُكتب في الكود**.
 * وأثر ذلك أن كل عدّاد فيها محسوب: «٨ مقالة» تحت فئة مساعدة يجب أن
 * يتغيّر حين يضيف المحرّر التاسعة، وإلا صار العدّ كذبًا مطبوعًا.
 */

export type PublicService = {
  key: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** `"0"` يعني مجانًا — والفرق بين المجاني والمجهول يُعرض لا يُخفى. */
  price: string;
  category: ServiceCategory;
  isAutomated: boolean;
  slaHours: number | null;
  providerName: string | null;
};

export async function listServices(): Promise<PublicService[]> {
  const rows = await db.service.findMany({
    where: { active: true, placements: { has: 'guide' } },
    orderBy: [{ category: 'asc' }, { sort: 'asc' }],
    select: {
      key: true, nameAr: true, nameEn: true, descAr: true, descEn: true,
      price: true, category: true, isAutomated: true, slaHours: true,
      provider: { select: { nameAr: true } },
    },
  });

  return rows.map((row) => ({
    key: row.key,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descAr: row.descAr,
    descEn: row.descEn,
    price: row.price.toString(),
    category: row.category,
    isAutomated: row.isAutomated,
    slaHours: row.slaHours,
    providerName: row.provider?.nameAr ?? null,
  }));
}

export type HelpCategory = { key: string; count: number };

/**
 * فئات المساعدة وعددها الفعلي.
 *
 * **الفئات تُشتقّ من الأسئلة الموجودة** لا من قائمة ثابتة: فئة أُفرغت
 * تختفي، وفئة جديدة تظهر بمجرّد أن يُصنَّف فيها سؤال. قائمةٌ مكتوبة
 * في الكود تعني فئة فارغة تنتظر محرّرًا لا يعلم بوجودها.
 */
export async function helpCategories(): Promise<HelpCategory[]> {
  const rows = await db.faqItem.groupBy({
    by: ['category'],
    where: { active: true },
    _count: { _all: true },
    orderBy: { _count: { category: 'desc' } },
  });
  return rows.map((row) => ({ key: row.category, count: row._count._all }));
}

export type HelpFaq = {
  id: string;
  category: string;
  questionAr: string;
  questionEn: string;
  answerAr: string;
  answerEn: string;
};

export async function helpFaqs(category?: string, take = 8): Promise<HelpFaq[]> {
  const rows = await db.faqItem.findMany({
    where: {
      active: true,
      ...(category === undefined ? {} : { category }),
      placements: { some: { surface: 'help_center', active: true } },
    },
    orderBy: [{ sort: 'asc' }],
    take,
    select: {
      id: true, category: true,
      questionAr: true, questionEn: true, answerAr: true, answerEn: true,
    },
  });
  return rows;
}

export type LegalSection = { n: number; titleAr: string; titleEn: string; bodyAr: string; bodyEn: string };

export type PublicLegalDocument = {
  key: string;
  titleAr: string;
  titleEn: string;
  version: string;
  effectiveAt: string;
  summaryAr: string | null;
  summaryEn: string | null;
  sections: LegalSection[];
};

/** يُسقط ما لا يفهمه — بند تالف لا يُسقط المستند كلّه. */
export function parseLegalSections(raw: unknown): LegalSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, i) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const section = entry as Record<string, unknown>;
    const titleAr = typeof section.titleAr === 'string' ? section.titleAr : null;
    const bodyAr = typeof section.bodyAr === 'string' ? section.bodyAr : null;
    if (titleAr === null || bodyAr === null) return [];
    return [
      {
        n: typeof section.n === 'number' ? section.n : i + 1,
        titleAr,
        titleEn: typeof section.titleEn === 'string' ? section.titleEn : titleAr,
        bodyAr,
        bodyEn: typeof section.bodyEn === 'string' ? section.bodyEn : bodyAr,
      },
    ];
  });
}

export async function listLegalDocuments(): Promise<{ key: string; titleAr: string; titleEn: string }[]> {
  return db.legalDocument.findMany({
    where: { active: true },
    orderBy: { sort: 'asc' },
    select: { key: true, titleAr: true, titleEn: true },
  });
}

export async function getLegalDocument(key: string): Promise<PublicLegalDocument | null> {
  const row = await db.legalDocument.findFirst({ where: { key, active: true } });
  if (row === null) return null;

  return {
    key: row.key,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    version: row.version,
    effectiveAt: row.effectiveAt.toISOString(),
    summaryAr: row.summaryAr,
    summaryEn: row.summaryEn,
    sections: parseLegalSections(row.sections),
  };
}
