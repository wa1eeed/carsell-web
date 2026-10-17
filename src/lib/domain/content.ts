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
 *
 * ═══ والعدّاد يُحسب بمرشّح القائمة التي يفتحها ═══
 *
 * كان يعدّ كل سؤالٍ فعّال، و`helpFaqs` تعرض ما وُضع على سطح
 * `help_center` وحده — فقِيس: **أربعةٌ من تسعة تكذب**، و«المزادات ٥
 * مقالات» تفتح ثلاثًا. والزائر لا يظنّ العدّاد خاطئًا، بل يظنّ أنه
 * أخطأ القراءة أو أن شيئًا ضاع.
 *
 * فالشرط واحد في الموضعين، ويحرسه `tests/help-centre.test.ts`.
 */
export const HELP_SURFACE = 'help_center';

export async function helpCategories(): Promise<HelpCategory[]> {
  const rows = await db.faqItem.groupBy({
    by: ['category'],
    where: {
      active: true,
      placements: { some: { surface: HELP_SURFACE, active: true } },
    },
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

/**
 * مقالات المساعدة — **وبحثٌ في السؤال والجواب معًا**.
 *
 * من يبحث لا يعرف كيف صاغ المحرّر السؤال: يكتب «عربون» فيجد الجواب
 * الذي يشرحه ولو لم يحمله عنوانُه. والبحث في العنوان وحده يردّ
 * «لا نتائج» على سؤالٍ مُجاب.
 */
export async function helpFaqs(
  category?: string,
  take = 8,
  q?: string,
): Promise<HelpFaq[]> {
  const term = (q ?? '').trim();
  const { hiddenFaqKeys } = await import('./selling-promise');
  const hidden = await hiddenFaqKeys();
  const rows = await db.faqItem.findMany({
    where: {
      active: true,
      /**
       * **ولا يُعرض وعدٌ أُزيل** (قرار المالك ٢٠٢٦-١٠-١٧): سؤالُ
       * «هل أدفع عمولة على البيع؟» يجيب «صفر» نصًّا، فتفعيلُ العمولة
       * يجعله كذبًا. والشرطُ في الاستعلام لا في الشاشة — فما لا
       * يُجلَب لا يُعرض في أيّ سطح.
       */
      ...(hidden.length === 0 ? {} : { key: { notIn: hidden } }),
      ...(category === undefined ? {} : { category }),
      ...(term === ''
        ? {}
        : {
            OR: [
              { questionAr: { contains: term, mode: 'insensitive' } },
              { answerAr: { contains: term, mode: 'insensitive' } },
              { questionEn: { contains: term, mode: 'insensitive' } },
              { answerEn: { contains: term, mode: 'insensitive' } },
            ],
          }),
      placements: { some: { surface: HELP_SURFACE, active: true } },
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
  /**
   * آخر تحديث — **والتصميم يعرضه مع النسخة لا بدلًا منها**.
   *
   * النسخة تقول «بأيّ نصٍّ أنت محكوم»، وتاريخ السريان «منذ متى»،
   * وآخر تحديث «هل مُسّت بعد ذلك» — وتصحيحٌ مطبعيّ يُحرّك الثالث
   * وحده. وإخفاؤه يجعل المستند يبدو ساكنًا وهو يُمَسّ.
   */
  updatedAt: string;
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
    updatedAt: row.updatedAt.toISOString(),
    sections: parseLegalSections(row.sections),
  };
}

/**
 * خدمةٌ واحدة بتفصيلها — **والفهرس كان يعرض ولا يفتح**.
 *
 * تسع بطاقاتٍ تُعرض ولا تُنقر واحدة، ولا صفحة تشرح ما يشمله الفحص ولا
 * كم ضريبتُه ولا من يؤدّيه. فمن أراد أن يطلب خدمةً لم يجد أين.
 *
 * و`null` حين لا توجد أو عُطّلت — والصفحة حينها ٤٠٤ لا صفحةٌ فارغة.
 */
export async function serviceByKey(key: string): Promise<PublicServiceDetail | null> {
  const row = await db.service.findFirst({
    where: { key, active: true, placements: { has: 'guide' } },
    select: {
      key: true, nameAr: true, nameEn: true, descAr: true, descEn: true,
      price: true, category: true, isAutomated: true, slaHours: true,
      adminFeeEnabled: true, adminFee: true, adminFeeMode: true,
      includesAr: true, includesEn: true,
      provider: { select: { nameAr: true, slaHours: true, cities: true } },
    },
  });
  if (row === null) return null;

  return {
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
    providerSlaHours: row.provider?.slaHours ?? null,
    /** مدن التغطية — وخدمةٌ لا تغطّي مدينتك تُقال قبل أن تُطلب. */
    providerCities: row.provider?.cities ?? [],
    includesAr: row.includesAr,
    includesEn: row.includesEn,
    /**
     * رسمُ المنصّة — **يُعرض لأنه يُحصَّل**. والشاشة تقرأ القاعدة نفسها
     * التي يقرؤها الحجز (`serviceTotal`)، فلا يدفع المشتري غير ما رأى.
     */
    adminFeeEnabled: row.adminFeeEnabled,
    adminFee: row.adminFee.toString(),
    adminFeeMode: row.adminFeeMode,
  };
}

export type PublicServiceDetail = PublicService & {
  providerSlaHours: number | null;
  providerCities: string[];
  /**
   * بنودُ ما تشمله الخدمة — **تُعرض قبل الدفع**.
   *
   * والوصف سطرٌ لا يكفي: من يدفع خمسمئة ريال مقابل «فحص شامل» لا
   * يعرف ما اشترى. والثمن يُقارَن بما يقابله لا بوصفٍ عامّ.
   */
  includesAr: string[];
  includesEn: string[];
  adminFeeEnabled: boolean;
  adminFee: string;
  adminFeeMode: 'FIXED' | 'PERCENT';
};
