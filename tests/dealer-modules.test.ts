import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { DEALER_MODULE, dealerHasModule, hasModule } from '@/lib/domain/dealer-modules';
import { visibleNav, type Group } from '@/lib/dealer-nav';
import { ENTITLEMENTS } from '../prisma/reference';

/**
 * ═══ موديولزُ اللوحة — مفتاحٌ يُسأل عنه لا باقةٌ تُسمّى ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦. والقاعدةُ الذهبية: الشاشةُ تسأل `dealer_pos`
 * ولا تسأل «ما باقتُه؟».
 */

const made: string[] = [];

afterAll(async () => {
  if (made.length > 0) await db.plan.deleteMany({ where: { id: { in: made } } });
});

describe('مفاتيح الموديولز', () => {
  /**
   * **وما يصل بيئةً جديدة يجب أن يصل بيئةً تعمل.** البذرةُ تُطبَّق مرّةً
   * على قاعدةٍ فارغة، فصفٌّ يُضاف إلى `reference.ts` وحده يصل الجديدة
   * ولا يصل الإنتاج — والمفتاحُ الغائب يُحلّ «مسموحًا»، فالثغرةُ صامتة.
   */
  it('كل مفتاح موديول في المرجع وله ترحيل يصل قاعدة تعمل', () => {
    const sql = readFileSync(
      'prisma/migrations/20261126180000_dealer_modules/migration.sql',
      'utf8',
    );
    const reference = ENTITLEMENTS.map((row) => row[0] as string);

    for (const key of Object.values(DEALER_MODULE)) {
      expect(reference).toContain(key);
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toContain('ON CONFLICT');
  });

  /** وكلُّ مفتاحٍ له تسميةٌ عربية — وإلّا مُنح المشغّلُ «dealer_pos» خامًا. */
  it('ولكل مفتاح تسمية في شاشة الباقات', () => {
    const labels = readFileSync('src/app/admin/plans/labels.ts', 'utf8');
    for (const key of Object.values(DEALER_MODULE)) {
      expect(labels).toContain(`${key}:`);
    }
  });

  /** **والافتراضيّ يقرّر حالَ اليوم**: المبنيُّ مسموح، وما لم يُبنَ ممنوع. */
  it('وافتراضيات المفاتيح تصف ما هو مبني اليوم', () => {
    const defaults = new Map(ENTITLEMENTS.map((row) => [row[0] as string, row[2] as string]));
    expect(defaults.get(DEALER_MODULE.branches)).toBe('true');
    expect(defaults.get(DEALER_MODULE.customers)).toBe('true');
    expect(defaults.get(DEALER_MODULE.expenses)).toBe('true');
    /** ولم تُبنَ بعد — فمفتاحٌ يَعِد بشاشةٍ لا وجود لها أسوأ من غيابه. */
    expect(defaults.get(DEALER_MODULE.pos)).toBe('false');
    expect(defaults.get(DEALER_MODULE.installments)).toBe('false');
    expect(defaults.get(DEALER_MODULE.landing)).toBe('false');
  });
});

describe('الشريط يقرأ المنح', () => {
  it('يخفي بند الموديول الممنوع ويبقي الباقي', () => {
    const open = visibleNav('OWNER', {});
    const closed = visibleNav('OWNER', { [DEALER_MODULE.expenses]: false });

    const hrefs = (groups: readonly Group[]): string[] =>
      groups.flatMap((group) => group.items.map((item) => item.href));

    expect(hrefs(open)).toContain('/dealer/expenses');
    expect(hrefs(closed)).not.toContain('/dealer/expenses');
    /** **ولا يُسقط البندُ جيرانَه** — فمنعُ موديولٍ ليس إغلاقَ المال. */
    expect(hrefs(closed)).toContain('/dealer/settlements');
  });

  /** **والمفتاحُ الغائبُ مسموح** — فبيئةٌ لم يصلها الترحيلُ تعمل كما كانت. */
  it('والغائب مسموح', () => {
    expect(hasModule({}, DEALER_MODULE.pos)).toBe(true);
    expect(hasModule({ [DEALER_MODULE.pos]: false }, DEALER_MODULE.pos)).toBe(false);
    expect(hasModule({}, undefined)).toBe(true);
  });
});

describe('والشاشة تسأل الخادم أيضا', () => {
  /** **حارسٌ في الشريط ليس حارسًا** — ومن كتب العنوان بيده يصل الشاشة. */
  it('كل شاشة موديول تفحص مفتاحها', () => {
    for (const [path, key] of [
      ['src/app/dealer/expenses/page.tsx', 'expenses'],
      ['src/app/dealer/customers/page.tsx', 'customers'],
      ['src/app/dealer/team/page.tsx', 'branches'],
    ] as const) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain(`DEALER_MODULE.${key}`);
      expect(source).toContain('dealerHasModule');
    }
  });

  it('والمنح يقرأ من باقة المعرض لا من الدور', async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
      select: { id: true, dealerId: true },
    });
    const actor = { userId: owner.id, dealerId: owner.dealerId as string };

    /** المبنيُّ مسموحٌ بالافتراضيّ، وما لم يُبنَ ممنوع. */
    expect(await dealerHasModule(actor, DEALER_MODULE.expenses)).toBe(true);
    expect(await dealerHasModule(actor, DEALER_MODULE.pos)).toBe(false);
  });
});

/**
 * ═══ ترتيبُ الأقسام — قرار المالك ٢٠٢٦-١١-٢٦ ═══
 *
 * «ترتيب و تنسيق الاقسام في القائمه الجانبيه … الاضافه الجماعيه تخص
 * المخزون». **وإعادةُ ترتيبٍ تكسر روابطَ المستخدم ليست إعادةَ ترتيب**
 * — فيُفحص أنّ كلَّ وجهةٍ باقية، لا أنّ الشكل تغيّر.
 */
describe('بنية شريط اللوحة', () => {
  const owner = visibleNav('OWNER', {});
  const hrefs = owner.flatMap((group) => group.items.map((item) => item.href));

  it('كل وجهة في الشريط لها شاشة', () => {
    for (const href of hrefs) {
      const path = href.replace(/^\/dealer\/?/, '');
      const file =
        path === '' ? 'src/app/dealer/page.tsx' : `src/app/dealer/${path}/page.tsx`;
      expect(existsSync(file), `${href} بلا شاشة`).toBe(true);
    }
  });

  /** **ولا وجهةَ ضاعت في الترتيب** — والقائمةُ مكتوبةٌ هنا فتُقارَن. */
  it('ولا بند فقد مكانه', () => {
    expect([...hrefs].sort()).toEqual(
      [
        '/dealer',
        '/dealer/inventory',
        '/dealer/offers',
        '/dealer/orders',
        '/dealer/auctions',
        '/dealer/customers',
        '/dealer/replies',
        '/dealer/invoices',
        '/dealer/settlements',
        '/dealer/expenses',
        '/dealer/reports',
        '/dealer/team',
        '/dealer/profile',
        '/dealer/owner',
        '/dealer/subscription',
      ].sort(),
    );
  });

  /**
   * **والإضافةُ الجماعية لسانٌ لا بند** — ومسارُها باقٍ، فمن حفظ
   * الرابطَ يصل. وبابٌ يُستعمل مرّةً في الشهر لا يزاحم ما يُفتح يوميًّا.
   */
  it('والإضافة الجماعية خرجت من الشريط وبقي مسارها', () => {
    expect(hrefs).not.toContain('/dealer/import');
    expect(existsSync('src/app/dealer/import/page.tsx')).toBe(true);

    const tabs = readFileSync('src/app/dealer/inventory/InventoryTabs.tsx', 'utf8');
    expect(tabs).toContain('/dealer/import');
    /** واللسانُ يُضيء في الشاشتين — والبندُ المضيءُ في الشريط «المركبات». */
    const importPage = readFileSync('src/app/dealer/import/page.tsx', 'utf8');
    expect(importPage).toContain('activeHref="/dealer/inventory"');
    expect(importPage).toContain('<InventoryTabs active="import" />');
  });

  /** **ولوحةُ القيادة أوّلًا وحدها** — لوحةٌ ليست مخزونًا. */
  it('واللوحة أول مجموعة', () => {
    expect(owner[0]?.items.map((item) => item.href)).toEqual(['/dealer']);
  });

  /** والإعداداتُ آخرًا — تُضبط مرّةً وتُنسى. */
  it('والإعدادات آخر مجموعة', () => {
    expect(owner.at(-1)?.title).toBe('الإعدادات');
  });
});
