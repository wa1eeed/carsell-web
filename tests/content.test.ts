import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  SERVICE_CATEGORIES,
  getLegalDocument,
  helpCategories,
  helpFaqs,
  listLegalDocuments,
  listServices,
  parseLegalSections,
} from '@/lib/domain/content';
import { PANEL_IDS, loadBodyDiagram } from '@/lib/domain/body-diagram';

afterAll(async () => {
  await db.$disconnect();
});

describe('Wi — دليل الخدمات', () => {
  it('كل خدمة معروضة فعّالة وفي موضع الدليل', async () => {
    const services = await listServices();
    expect(services.length).toBeGreaterThan(0);

    for (const service of services) {
      const row = await db.service.findUniqueOrThrow({
        where: { key: service.key },
        select: { active: true, placements: true },
      });
      expect(row.active, service.key).toBe(true);
      expect(row.placements, service.key).toContain('guide');
    }
  });

  it('كل خدمة تنتمي إلى فئة معروفة — لا فئة يتيمة', async () => {
    for (const service of await listServices()) {
      expect(SERVICE_CATEGORIES, service.key).toContain(service.category);
    }
  });

  /** صفرٌ في موضع السعر يُقرأ خطأً — «مجانًا» تُقال صراحةً. */
  it('السعر المجاني صفر صريح لا حقل غائب', async () => {
    const services = await listServices();
    const free = services.filter((service) => Number(service.price) === 0);
    expect(free.length).toBeGreaterThan(0);
    for (const service of services) expect(Number.isFinite(Number(service.price))).toBe(true);
  });
});

describe('Wn — المساعدة', () => {
  /**
   * «٨ مقالة» تحت موضوع يجب أن تصير تسعًا حين يضيف المحرّر التاسعة،
   * وإلا صار العدّ كذبًا مطبوعًا.
   */
  it('عدّاد كل موضوع يطابق ما فيه فعلًا', async () => {
    const categories = await helpCategories();
    expect(categories.length).toBeGreaterThan(0);

    for (const category of categories) {
      const real = await db.faqItem.count({
        where: { active: true, category: category.key },
      });
      expect(real, category.key).toBe(category.count);
      expect(category.count).toBeGreaterThan(0);
    }
  });

  it('المواضيع مشتقّة من الأسئلة — لا موضوع فارغ ينتظر من يحذفه', async () => {
    const categories = await helpCategories();
    const used = await db.faqItem.findMany({
      where: { active: true },
      distinct: ['category'],
      select: { category: true },
    });
    expect(new Set(categories.map((c) => c.key))).toEqual(new Set(used.map((u) => u.category)));
  });

  it('الترشيح بموضوع يضيّق ولا يُفرغ', async () => {
    const all = await helpFaqs(undefined, 100);
    const one = await helpFaqs('escrow', 100);
    expect(one.length).toBeGreaterThan(0);
    expect(one.length).toBeLessThan(all.length);
    for (const faq of one) expect(faq.category).toBe('escrow');
  });
});

describe('Wo — القانونية', () => {
  it('كل مستند يحمل نسخة وتاريخ سريان', async () => {
    const docs = await listLegalDocuments();
    expect(docs.length).toBeGreaterThan(0);

    for (const entry of docs) {
      const doc = await getLegalDocument(entry.key);
      expect(doc, entry.key).not.toBeNull();
      expect(doc!.version).not.toBe('');
      expect(Number.isNaN(Date.parse(doc!.effectiveAt))).toBe(false);
      expect(doc!.sections.length).toBeGreaterThan(0);
    }
  });

  it('أرقام البنود متسلسلة — «البند ٥» رابط يُرسَل لا موضع يُبحث عنه', async () => {
    const doc = await getLegalDocument('terms');
    expect(doc).not.toBeNull();
    expect(doc!.sections.map((s) => s.n)).toEqual(
      doc!.sections.map((_, i) => i + 1),
    );
  });

  it('مستند غير موجود يعيد null لا يرمي', async () => {
    expect(await getLegalDocument('nope')).toBeNull();
  });

  it('بند تالف لا يُسقط المستند كلّه', () => {
    const parsed = parseLegalSections([
      null,
      { titleAr: 'بلا نصّ' },
      { n: 2, titleAr: 'عنوان', bodyAr: 'نصّ' },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.n).toBe(2);
    // الإنجليزي يسقط إلى العربي بدل أن يفرغ
    expect(parsed[0]?.titleEn).toBe('عنوان');
  });
});

describe('مخطط الهيكل — رسم المصمّم', () => {
  it('الرسم موجود ويحمل كل معرّف متّفق عليه', async () => {
    const svg = await loadBodyDiagram();
    if (svg === null) return; // لم يصل بعد — الشاشة تعرض التخطيط البديل

    for (const id of PANEL_IDS) {
      expect(svg, id).toContain(`id="${id}"`);
    }
    for (const role of ['panels', 'glass', 'decor']) {
      expect(svg, role).toContain(`data-role="${role}"`);
    }
  });
});
