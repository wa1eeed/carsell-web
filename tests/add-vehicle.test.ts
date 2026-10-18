import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { addVehicle } from '@/lib/domain/garage';

const ROOT = process.cwd();
const SCREEN = join(ROOT, 'src/app/[locale]/(site)/account/vehicles/new');
const LIST = join(ROOT, 'src/app/[locale]/(site)/account/vehicles/page.tsx');
const FIELDS = join(ROOT, 'src/components/site/VehicleFields.tsx');

/**
 * ═══ أضف سيارة — البابُ الذي كان الزرّ يَعِد به ═══
 *
 * `POST /api/v1/vehicles` قائمٌ منذ بُني المرآب ولا شاشة تناديه، وزرُّ
 * «أضف سيارة» كان يقود إلى معالج البيع — ترويسةٌ تقول «بِع سيارتك».
 */
describe('شاشة إضافة مركبة', () => {
  it('الشاشة موجودة، والزرّ يقود إليها لا إلى معالج البيع', () => {
    expect(existsSync(join(SCREEN, 'page.tsx'))).toBe(true);
    expect(existsSync(join(SCREEN, 'AddVehicleForm.tsx'))).toBe(true);

    const list = readFileSync(LIST, 'utf8');
    expect(list).toContain('account/vehicles/new');
    /** والزرّ لا يبقى على `/sell` — وجهتان لفعلٍ واحد تُربك. */
    expect(/href=\{`\/\$\{locale\}\/sell`\}\s*size="sm"/.test(list)).toBe(false);
  });

  /**
   * **والمعامل المُرسَل يُقرأ.** الشاشة تُحوّل بـ`?saved=1` — ومعاملٌ
   * لا يقرؤه أحد صمتٌ بعد نجاح: يملأ صاحبُها الاستمارة ويصل القائمة
   * بلا كلمة. (وقع في `?listed=` من قبل.)
   */
  it('و«حُفظت» تُقال — المعامل يُرسَل ويُقرأ', () => {
    const form = readFileSync(join(SCREEN, 'AddVehicleForm.tsx'), 'utf8');
    const sent = /account\/vehicles\?tab=garage&saved=1/.test(form);
    expect(sent).toBe(true);
    expect(readFileSync(LIST, 'utf8')).toContain("query.saved === '1'");
  });

  /**
   * **واستمارةٌ واحدة لبابين.** نسخُ الحقول يُنتج استمارتين تتباعدان
   * أوّل تغيير — وقد سقطت اللوحةُ من حمولة النشر وحدها حين كانت
   * تُبنى ثلاثَ مرّاتٍ بيد.
   */
  it('والبابان يقرآن حقولًا واحدة', () => {
    const wizard = readFileSync(
      join(ROOT, 'src/app/[locale]/(site)/sell/SellWizard.tsx'),
      'utf8',
    );
    const form = readFileSync(join(SCREEN, 'AddVehicleForm.tsx'), 'utf8');
    for (const source of [wizard, form]) {
      expect(source).toContain('<VehicleFields');
      expect(source).toContain('vehiclePayload(');
    }
    /** ولا يبني أحدُهما حمولته بيده. */
    expect(wizard).not.toContain('colorExterior: vehicle.colorExterior');
    expect(form).not.toContain('colorExterior: vehicle.colorExterior');
  });

  /**
   * **والنشرُ كان يُسقط اللوحة.** المسودّةُ تحملها والمرآبُ يحملها
   * والنشرُ — وهو الطريق الغالب — بناها بيده فنُسيت: يملأ البائع
   * لوحته ويؤشّر «أظهِرها»، فيُنشر إعلانٌ بلا لوحة ولا كلمة.
   */
  it('والنشر يحمل اللوحة وخانتَها', () => {
    const wizard = readFileSync(
      join(ROOT, 'src/app/[locale]/(site)/sell/SellWizard.tsx'),
      'utf8',
    );
    /** ثلاثةُ نداءاتٍ تبني حمولة المركبة: النشر والمسودّة والمرآب. */
    expect(wizard.match(/vehiclePayload\(vehicle\)/g)?.length).toBe(3);
    /** وخانةُ الإظهار تصل مع النشر والمسودّة — إنها خاصّيةُ الإعلان. */
    expect(wizard.match(/^\s+showPlate,$/gm)?.length).toBe(2);
  });

  /** وكلُّ حقلٍ في الاستمارة يُرسَل — وهو ما تفرضه البوابة ٦٠. */
  it('وكل حقلٍ في VehicleDraft يصل الخادم', () => {
    const source = readFileSync(FIELDS, 'utf8');
    const draft = /export type VehicleDraft = \{([\s\S]*?)\n\};/.exec(source);
    const payload = /export function vehiclePayload\([\s\S]*?\{\s*return \{([\s\S]*?)\n  \};/.exec(
      source,
    );
    expect(draft).not.toBeNull();
    expect(payload).not.toBeNull();

    const sent = new Set([...(payload?.[1] ?? '').matchAll(/^ {4}(\w+):/gm)].map((r) => r[1]));
    const declared = [...(draft?.[1] ?? '').matchAll(/^ {2}(\w+)\s*:/gm)].map((r) => r[1]);
    expect(declared.length).toBeGreaterThan(8);
    expect(declared.filter((field) => !sent.has(field))).toEqual([]);
  });
});

/**
 * ═══ والنطاقُ يحفظ ما تُرسله الشاشة ═══
 *
 * **والتطبيع في النطاق لا في الحقل**: يُلصق «أ ب ج» أو «ABJ» أو أرقامٌ
 * عربية، فتُخزَّن الحروفُ معتمدةً والأرقامُ لاتينية.
 */
describe('المركبة تُحفظ بلوحتها', () => {
  it('addVehicle يخزّن اللوحة مطبَّعةً، وبلا إعلان', async () => {
    const [owner, trim] = await Promise.all([
      db.user.findFirstOrThrow({ select: { id: true } }),
      db.trim.findFirstOrThrow({ select: { id: true, modelId: true, model: { select: { brandId: true } } } }),
    ]);

    const result = await addVehicle({
      sellerId: owner.id,
      vehicle: {
        brandId: trim.model.brandId,
        modelId: trim.modelId,
        trimId: trim.id,
        year: 2021,
        mileageKm: 48_000,
        transmission: 'AUTOMATIC',
        fuel: 'PETROL',
        spec: 'SAUDI',
        condition: 'USED',
        city: 'الرياض',
        colorExterior: 'أبيض',
        vin: null,
        /** يُلصق لاتينيًّا وبأرقامٍ عربية — ويُخزَّن معتمدًا. */
        plateLetters: 'ABJ',
        plateNumbers: '١٢٣٤',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    try {
      const row = await db.vehicle.findUniqueOrThrow({
        where: { id: result.vehicleId },
        select: { plateLetters: true, plateNumbers: true, _count: { select: { listings: true } } },
      });
      expect(row.plateLetters).toBe('ابح');
      expect(row.plateNumbers).toBe('1234');
      /** **ولا إعلان معها** — وهي علّةُ وجود هذا الباب. */
      expect(row._count.listings).toBe(0);
    } finally {
      /** **والاختبار يعيد ما غيّره** — وإلّا تراكمت المركبات في القاعدة. */
      await db.vehicle.delete({ where: { id: result.vehicleId } });
    }
  });
});
