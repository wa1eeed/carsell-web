import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { adminNavCounts } from '@/lib/domain/admin-nav-counts';
import {
  ADMIN_NAV,
  isSettingsHref,
  settingsSections,
  SETTINGS_HOME,
  SETTINGS_PREFIX,
  visibleGroups,
} from '@/components/admin/nav';

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

    // والسجلّان مع ما يُقرأ — لا تحت الإعدادات
    expect(groupOf('/admin/ledger')).toBe('المال');
    expect(groupOf('/admin/audit')).toBe('التقارير والسجلات');
  });

  /**
   * ═══ والترتيبُ قرارٌ يُفحص ═══
   *
   * طلبُ المالك ٢٠٢٦-١١-٢٨ بنصّه: «أول شي تظهر لوحة القيادة ثم
   * الإعلانات ثم العملاء ويقصد بهم مستخدمي المنصة (الأفراد) ثم التجار
   * والمعارض». **والترتيبُ يُكسر بإضافةٍ في غير موضعها**، فيُحرس.
   */
  it('والترتيب كما طلبه المالك', () => {
    const titles = visibleGroups().map((group) => group.title);
    expect(titles.slice(0, 4)).toEqual([
      'نظرة عامة',
      'الإعلانات',
      'العملاء',
      'المعارض والوكالات',
    ]);
    /** **ولوحةُ القيادة أوّلُ بندٍ يُرى** — لا بندٌ في وسط مجموعة. */
    expect(visibleGroups()[0]?.items[0]?.href).toBe('/admin');
    /** **والإعداداتُ آخرًا** — تُضبط مرّةً ولا تزاحم العمل اليوميّ. */
    expect(titles[titles.length - 1]).toBe(SETTINGS_PREFIX);
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

  /**
   * ═══ ولا يفتحها داخلها — قرار المالك ٢٠٢٦-١١-٢٨ ═══
   *
   * كان الشريطُ يطويها خارجها ويفتح ستّةً وعشرين بندًا داخلها، فقال
   * المالك إنّ ذلك «يشتّت المستخدم وتكثر الصفحات في القائمة».
   * **وطيٌّ ينقض نفسَه عند أوّل استعمال ليس طيًّا.**
   */
  it('ولا يفتحها داخلها — والبند يضيء', () => {
    for (const href of [SETTINGS_HOME, '/admin/tax', '/admin/team', '/admin/services']) {
      const settings = visibleGroups(href).filter((group) =>
        group.title.startsWith(SETTINGS_PREFIX),
      );
      expect(settings, href).toHaveLength(1);
      expect(settings[0]?.items, href).toHaveLength(1);
      /** **ويضيء البندُ داخل أيّ إعداد** — وإلّا قُرئ الشريطُ كأنّ لا شيء مفتوح. */
      expect(settings[0]?.items[0]?.active, href).toBe(true);
    }
    /** وخارجَها لا يضيء. */
    const outside = visibleGroups('/admin/orders').find((group) =>
      group.title.startsWith(SETTINGS_PREFIX),
    );
    expect(outside?.items[0]?.active).toBeUndefined();
    expect(isSettingsHref('/admin/orders')).toBe(false);
    expect(isSettingsHref('/admin/tax')).toBe(true);
  });

  it('ولا يسقط بندٌ بالطيّ', () => {
    /**
     * **وما يُطوى يُبلَغ من موضعٍ آخر.** بندُ إعداداتٍ لا يظهر في
     * الشريط ولا في مركز الإعدادات يصير شاشةً لا يصلها أحد — وهو
     * الصنف الذي أُصلح في حساب المستخدم أربع مرّات.
     *
     * فبعد أن كفّ الشريطُ عن فتحها، صار **مركزُ الإعدادات** هو
     * الباب: `settingsSections` تقرؤها الصفحةُ وشريطُها الداخليّ،
     * فيُفحص أنّ كلَّ بندٍ فيها.
     */
    const inBar = new Set(
      visibleGroups().flatMap((group) => group.items.map((item) => item.href)),
    );
    const inSettings = new Set(
      settingsSections().flatMap((group) => group.items.map((item) => item.href)),
    );

    for (const group of ADMIN_NAV) {
      const settings = group.title.startsWith(SETTINGS_PREFIX);
      for (const item of group.items) {
        expect(settings ? inSettings.has(item.href) : inBar.has(item.href), item.label).toBe(true);
      }
    }

    /** **ولا بندَ في المركز إلّا وله شاشة** — ومركزٌ يعرض بطاقةً معطّلة يُخلف وعده. */
    for (const group of settingsSections()) {
      for (const item of group.items) {
        expect(item.href, item.label).not.toBeNull();
        expect(item.description, item.label).toBeDefined();
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
