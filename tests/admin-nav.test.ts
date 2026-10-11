import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { adminNavCounts } from '@/lib/domain/admin-nav-counts';
import { ADMIN_NAV, SETTINGS_HOME, SETTINGS_PREFIX, visibleGroups } from '@/components/admin/nav';

afterAll(async () => {
  await db.$disconnect();
});

/**
 * ═══ الشارة كانت مبنيّةً لا تظهر ═══
 *
 * `AdminNavItem.badge` معرَّفٌ في النوع و**مُصيَّرٌ في الشريط**، و
 * `ADMIN_NAV` ثابتٌ لا يُسند إليه عدد — فسبعُ شاراتٍ في ترميز A1 لم
 * تظهر قطّ. وهو الصنف نفسه الذي تكرّر في `Integration.status` و
 * `Listing.viewCount`: حقلٌ يُقرأ ولا يكتبه أحد.
 */
describe('شريط الأدمن — ما ينتظر عملًا', () => {
  it('لا يُعيد صفرًا — والصفر ضوضاء', async () => {
    /**
     * شارةٌ على صفرٍ تجعل الشريط كلَّه أرقامًا، فتختفي السبعةُ التي
     * تعني شيئًا بين العشرين التي لا تعني.
     */
    const counts = await adminNavCounts();
    for (const [href, value] of Object.entries(counts)) {
      expect(value, href).toBeGreaterThan(0);
    }
  });

  it('وكلُّ مفتاحٍ يقابل بندًا في الشريط', async () => {
    /**
     * **ومفتاحٌ لا يقابل بندًا لا يظهر أبدًا.** الشارة تُسند بمطابقة
     * `href`، فخطأُ حرفٍ في المسار يجعل العدّ يُحسب ولا يُرى — وهو
     * الصمت نفسه الذي بُنيت هذه الشارات لإنهائه.
     */
    const hrefs = new Set(
      ADMIN_NAV.flatMap((group) => group.items.map((item) => item.href)),
    );
    for (const href of Object.keys(await adminNavCounts())) {
      expect(hrefs.has(href), href).toBe(true);
    }
  });

  it('ولا بندَ مكرَّر المسار في الشريط', async () => {
    /**
     * «مساحات الإعلانات» و«الإعلانات المموّلة» كانا مسارًا واحدًا
     * باسمين — ومن ضغط الثاني ظنّ أنه أخطأ. **وشارةٌ على مسارٍ
     * مكرَّر تظهر مرّتين أيضًا.**
     */
    const hrefs = ADMIN_NAV.flatMap((group) =>
      group.items.map((item) => item.href).filter((href): href is string => href !== null),
    );
    expect(hrefs.length).toBe(new Set(hrefs).size);
  });

  it('ولا سجلًّا تحت «الإعدادات»', async () => {
    /**
     * «دفتر الحسابات» و«سجل العمليات» كانا تحتها — ولا يُضبط فيهما
     * شيء. **ومجموعةٌ اسمُها «الإعدادات» تضمّ سجلًّا تَعِد بما لا
     * تفي به**: من دخلها ليغيّر وجد جدولًا، ومن أراد الجدول لم
     * يفتّش عنه هنا.
     */
    const settings = ADMIN_NAV.filter((group) => group.title.startsWith('الإعدادات'));
    const logs = settings.flatMap((group) =>
      group.items.filter(
        (item) => item.href === '/admin/ledger' || item.href === '/admin/audit',
      ),
    );
    expect(logs).toHaveLength(0);
  });

  it('ويُعدّ ما يقف لا ما هو قائم', async () => {
    // ألفُ إعلانٍ منشور ليست عملًا ينتظر — والمعدود ما يقف حتى يتحرّك أحد
    const counts = await adminNavCounts();
    const pending = await db.listing.count({ where: { status: 'PENDING_REVIEW' } });
    expect(counts['/admin/listings'] ?? 0).toBe(pending);
    expect(Object.keys(counts)).not.toContain('/admin/all-listings');
  });

  /**
   * ═══ وما يُضبط ليس كما يُعالَج ═══
   *
   * سعرُ خدمةٍ يُضبط مرّةً في الشهر، وطابورُها يُعالَج كل يوم.
   * وكانا في مجموعةٍ واحدة — فيمرّ المشغّل على شاشتَي إعدادٍ ليبلغ
   * عملَه.
   *
   * **والفحص على الموضع لا على الوجود**: بندٌ يعود إلى مجموعةٍ خاطئة
   * يسقط هنا، فيُقرأ التعليل قبل أن يُعاد.
   */
  it('التعريفُ في الإعدادات والطابورُ في العمل', () => {
    const groupOf = (href: string): string =>
      ADMIN_NAV.find((group) => group.items.some((item) => item.href === href))?.title ?? '';

    for (const href of ['/admin/services', '/admin/providers']) {
      expect(groupOf(href), href).toMatch(/^الإعدادات/);
    }

    for (const href of ['/admin/service-requests', '/admin/disputes', '/admin/reports']) {
      expect(groupOf(href), href).not.toMatch(/^الإعدادات/);
    }

    // والسجلّان مع ما يُقرأ
    for (const href of ['/admin/ledger', '/admin/audit']) {
      expect(groupOf(href), href).toBe('المتابعة');
    }
  });

  /**
   * ═══ والإعدادات بندٌ واحد ما لم تكن فيها ═══
   *
   * ستّةَ عشرَ بندًا من ثلاثين كانت إعدادات تزاحم العمل اليوميّ في
   * كل يوم — ومن يبحث عن «أين أغيّر مهلة الدفع» يقرأ ثلاثين سطرًا.
   */
  it('الشريط يطوي الإعدادات خارجها', () => {
    const groups = visibleGroups('/admin/orders');
    const settings = groups.filter((group) => group.title.startsWith(SETTINGS_PREFIX));

    expect(settings).toHaveLength(1);
    expect(settings[0]?.items).toHaveLength(1);
    expect(settings[0]?.items[0]?.href).toBe(SETTINGS_HOME);
  });

  it('ويفتحها داخلها — فلا يُفقَد التنقّل بينها', () => {
    for (const href of [SETTINGS_HOME, '/admin/tax', '/admin/team', '/admin/services']) {
      const groups = visibleGroups(href);
      const settings = groups.filter((group) => group.title.startsWith(SETTINGS_PREFIX));
      expect(settings.length, href).toBeGreaterThan(1);
    }
  });

  it('ولا يسقط بندٌ بالطيّ', () => {
    /**
     * **وما يُطوى يُفتح كاملًا.** بندُ إعداداتٍ يختفي في الحالين
     * يصير شاشةً لا يصلها أحد — وهو الصنف الذي أُصلح في حساب
     * المستخدم أربع مرّات.
     */
    const open = visibleGroups('/admin/tax').flatMap((group) => group.items.map((i) => i.href));
    for (const group of ADMIN_NAV) {
      for (const item of group.items) {
        expect(open, item.label).toContain(item.href);
      }
    }
  });

  it('ولكل بند إعداداتٍ وصفٌ يقول ما يُضبط فيه', () => {
    /**
     * قائمةُ روابطٍ بلا وصف تجعل من يبحث عن «أين أغيّر مهلة الدفع»
     * يفتح أربع شاشاتٍ ليجدها. **والعنوان يقول الاسم، والسطر تحته
     * يقول الفعل.**
     */
    for (const group of ADMIN_NAV.filter((g) => g.title.startsWith(SETTINGS_PREFIX))) {
      for (const item of group.items) {
        expect(item.description, item.label).toBeTypeOf('string');
      }
    }
  });
});
