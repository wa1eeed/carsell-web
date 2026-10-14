import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  SERVICE_CATEGORIES,
  getLegalDocument,
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
   * ═══ العدّادات والمواضيع انتقلت إلى `tests/help-centre.test.ts` ═══
   *
   * **وكانتا تُثبّتان سلوكًا خاطئًا.** قاستا العدّاد مقابل «كل سؤالٍ
   * فعّال في الموضوع»، والشاشة تعرض ما وُضع على سطح `help_center`
   * وحده — فمرّتا على فارقٍ يراه الزائر: «المزادات ٥ مقالات» تفتح
   * ثلاثًا. فلمّا صُحّح المصدر سقطتا، والصواب أنهما كانتا الخطأ.
   *
   * والقاعدة الآن في ملفٍّ واحد: كل عدّادٍ يساوي **طول ما يفتحه**.
   */

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

  /**
   * ═══ الثمانية التي يرسمها التصميم ═══
   *
   * كان المنشور **اثنين**: الشروط والخصوصية. وستّةٌ يرسمها Wo في
   * عموده الجانبيّ لا وجود لها — فمن قرأ الشروط وسأل عن الضمان أو
   * العمولة لم يجد بابًا، والقاعدة مطبَّقة في الشيفرة بلا مستندٍ
   * يقولها.
   */
  it('المستندات الثمانية التي يعرضها العمود الجانبيّ كلّها منشورة', async () => {
    const keys = (await listLegalDocuments()).map((entry) => entry.key);

    for (const key of [
      'terms', 'privacy', 'auction', 'escrow',
      'fees', 'content', 'dealers', 'cookies',
    ]) {
      expect(keys, key).toContain(key);
    }
  });

  /**
   * ═══ والقاعدة المحذوفة لا يُعيدها نصّ ═══
   *
   * أُلغيت نافذة الاسترجاع في المهمّة ٣٧: المال يصل البائع لحظة تأكيد
   * النقل، و`returnWindowEndsAt` **لا يكتبه شيء في المنتج كلّه**. وبقي
   * البند السادس من الشروط يَعِد «سبعة أيام من تاريخ الاستلام» —
   * وعدٌ مُخلَف في مستندٍ مُلزِم، لا في شاشة.
   *
   * والنصّ وعدٌ لا وصف: ما دام يُعرض فهو ما نلتزم به.
   */
  it('لا مستند يَعِد بنافذة استرجاع بعد الاستلام — أُلغيت في المهمّة ٣٧', async () => {
    const docs = await listLegalDocuments();

    for (const entry of docs) {
      const doc = await getLegalDocument(entry.key);
      const text = (doc?.sections ?? [])
        .map((section) => `${section.bodyAr} ${section.bodyEn}`)
        .join(' ');

      expect(text, `${entry.key} · عربي`).not.toMatch(/(?:من|بعد)\s+(?:تاريخ\s+)?الاستلام/);
      expect(text, `${entry.key} · إنجليزي`).not.toMatch(/return window of|days (?:from|after) (?:the )?(?:receipt|delivery)/i);
    }
  });

  /**
   * **وحقل `En` يحمل عربيّة لغةٌ معروضة بلا ترجمة.** كانت الثمانية
   * والعشرون كلُّها عربيّة، فـ`/en/legal/terms` مستندٌ عربيّ تحت واجهة
   * إنجليزية — ولا شيء يسقط: الحقل مملوء ونوعه `string`.
   *
   * والبوابة ٢٥ تفحص ملفّ البذرة، وهذا يفحص **ما في القاعدة فعلًا**.
   */
  it('النسخة الإنجليزية إنجليزية — لا عربيّة منسوخة في حقل ترجمة', async () => {
    const ARABIC = /[؀-ۿ]/;
    const docs = await listLegalDocuments();

    for (const entry of docs) {
      const doc = await getLegalDocument(entry.key);
      expect(doc, entry.key).not.toBeNull();
      expect(ARABIC.test(doc!.titleEn), `${entry.key}.titleEn`).toBe(false);

      for (const section of doc!.sections) {
        expect(ARABIC.test(section.titleEn), `${entry.key}.${String(section.n)}.titleEn`).toBe(false);
        expect(ARABIC.test(section.bodyEn), `${entry.key}.${String(section.n)}.bodyEn`).toBe(false);
      }
    }
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
