import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { db } from '@/lib/db';
import { trustMarks } from '@/lib/domain/trust-marks';

const ROOT = process.cwd();

/**
 * ═══ وسائلُ الدفع في التذييل ═══
 *
 * طلبُ المالك في الخارطة §١٣ بقي معلَّقًا بسببٍ واحد: «الشعارات لم تصل
 * المستودع». ووصلت ٢٠٢٦-١٠-١٩ شريطًا واحدًا، فقُطّع خمسةَ ملفّات.
 */
describe('وسائل الدفع علامات في التذييل', () => {
  it('الخمس صفوف، ولكل واحدة ملفها', async () => {
    const marks = await trustMarks('PAYMENT');
    expect(marks.map((row) => row.key).sort()).toEqual(
      ['apple_pay', 'mada', 'mastercard', 'stc_pay', 'visa'],
    );

    /** **ووسمٌ بلا ملفّه صورةٌ مكسورة** — والمسارُ يُفحص لا يُفترض. */
    for (const mark of marks) {
      expect(existsSync(join(ROOT, 'public', mark.logoPath))).toBe(true);
    }
  });

  /** **ومدى أوّلًا** — الشبكةُ الوطنية وأكثرُ ما يُدفع به في السعودية. */
  it('ومدى أول الشريط', async () => {
    const marks = await trustMarks('PAYMENT');
    expect(marks[0]?.key).toBe('mada');
  });

  /**
   * ═══ **ولا بطاقةَ بيضاء تحت الشعار** ═══
   *
   * المصدرُ شريطٌ من بطاقاتٍ بيضاء مستديرة، ومكوّنُ العلامات يقول منذ
   * بُني إنّ الشعار يقف على الورق بلا بطاقة. (وطلبه المالك صراحةً
   * ٢٠٢٦-١٠-١٩: «شيل خلفية ايقونات الدفع البيضاء».)
   *
   * فيُفحص **الركن**: شفّافٌ في كل ملفّ، وإلّا فالبطاقةُ باقية.
   */
  it('وخلفية كل أيقونة شفافة لا بيضاء', async () => {
    const marks = await trustMarks('PAYMENT');
    for (const mark of marks) {
      const file = join(ROOT, 'public', mark.logoPath);
      const image = sharp(file);
      const meta = await image.metadata();
      expect(meta.hasAlpha).toBe(true);

      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const corners = [
        0,
        (info.width - 1) * info.channels,
        (info.height - 1) * info.width * info.channels,
        ((info.height - 1) * info.width + info.width - 1) * info.channels,
      ];
      for (const at of corners) {
        expect(data[at + 3]).toBe(0);
      }
    }
  });

  /**
   * **والبياضُ المحبوس ليس خلفيّة.** حروفُ «MasterCard» بيضاءُ داخل
   * الدائرتين — ومِفتاحٌ يمسح كلَّ أبيضَ يثقبها فيُرى الورقُ خلالها.
   * فالمسحُ فيضٌ من الحافّة، وهذا يسأل أن يكون في الشعار بياضٌ باقٍ.
   */
  it('وحروف ماستركارد البيضاء باقية', async () => {
    const file = join(ROOT, 'public/trust/payment/mastercard.webp');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaqueWhite = 0;
    for (let p = 0; p < data.length; p += info.channels) {
      const [r, g, b, a] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
      if ((a ?? 0) > 200 && (r ?? 0) > 235 && (g ?? 0) > 235 && (b ?? 0) > 235) opaqueWhite += 1;
    }
    expect(opaqueWhite).toBeGreaterThan(200);
  });

  /**
   * ═══ والشريطُ يُقرأ صفًّا واحدًا ═══
   *
   * «يقبل مدى وفيزا وماستركارد وأبل باي وإس تي سي باي» جملةٌ واحدة،
   * والالتفافُ على الهاتف يقسمها سطرين فتبدو قائمتين. (طلب المالك.)
   */
  it('ويعرض كثيفا بلا التفاف', () => {
    const header = readFileSync(join(ROOT, 'src/components/site/SiteHeader.tsx'), 'utf8');
    expect(/marks=\{payment\}[^>]*dense/.test(header)).toBe(true);

    const marksUi = readFileSync(join(ROOT, 'src/components/site/TrustMarks.tsx'), 'utf8');
    expect(marksUi).toContain('flex-nowrap');
    /** والجهاتُ النظامية تبقى على مسافاتها الواسعة من `sm`. */
    expect(marksUi).toContain('sm:flex-wrap sm:gap-x-10 sm:gap-y-7');
    /** وعلى الهاتف عمودان — أربعةٌ في سطرين لا ثلاثة. */
    expect(marksUi).toContain('grid grid-cols-2');
  });

  /** **والمطفأةُ لا تخرج** — فمن لا يقبل وسيلةً يُطفئها من اللوحة. */
  it('والإطفاء يسحبها من التذييل', async () => {
    const before = await db.trustMark.findUniqueOrThrow({ where: { key: 'apple_pay' } });
    try {
      await db.trustMark.update({ where: { key: 'apple_pay' }, data: { active: false } });
      const shown = await trustMarks('PAYMENT');
      expect(shown.some((row) => row.key === 'apple_pay')).toBe(false);
    } finally {
      await db.trustMark.update({ where: { key: 'apple_pay' }, data: { active: before.active } });
    }
  });
});
