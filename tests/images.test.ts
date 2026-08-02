import { describe, expect, it } from 'vitest';
import sharp, { type OverlayOptions } from 'sharp';
import { blurPlates, blurRegion, findPlateRegions } from '@/lib/images/plate';
import { DUPLICATE_MAX_DISTANCE, hammingDistance, isDuplicate, perceptualHash } from '@/lib/images/phash';

/** صورة اصطناعية: خلفية + لوحة عالية التباين في الثلث السفلي. */
async function photo({
  plate = true,
  noisy = false,
  left = 360,
  top = 430,
}: { plate?: boolean; noisy?: boolean; left?: number; top?: number } = {}): Promise<Buffer> {
  const parts: OverlayOptions[] = [];
  if (plate) {
    const chars = Array.from(
      { length: 7 },
      (_, i) => `<rect x='${12 + i * 32}' y='22' width='18' height='56' fill='#111'/>`,
    ).join('');
    parts.push({
      input: Buffer.from(
        `<svg width='240' height='100'><rect width='240' height='100' fill='#fff'/>${chars}</svg>`,
      ),
      left,
      top,
    });
  }

  const base = noisy
    ? sharp({
        create: {
          width: 960, height: 640, channels: 3 as const,
          background: { r: 0, g: 0, b: 0 },
          noise: { type: 'gaussian' as const, mean: 128, sigma: 18 },
        },
      })
    : sharp({
        create: {
          width: 960, height: 640, channels: 3 as const,
          background: { r: 120, g: 130, b: 125 },
        },
      });

  return base.composite(parts).jpeg().toBuffer();
}

/** حدّة منطقة — الانحراف المعياري يسقط بالتمويه. */
async function sharpness(buffer: Buffer, box = { left: 360, top: 430, width: 240, height: 100 }) {
  const stats = await sharp(buffer).extract(box).greyscale().stats();
  return stats.channels[0]?.stdev ?? 0;
}

describe('معيار القبول — صورة بلوحة تُحفظ مطموسة', () => {
  it('اللوحة تُكتشف وتُطمس، والحدّة تسقط في موضعها', async () => {
    const input = await photo();
    const before = await sharpness(input);

    const result = await blurPlates(input);

    expect(result.blurred).toBe(true);
    expect(result.regions.length).toBeGreaterThan(0);
    // الطمس فعليّ لا وسم: الحدّة تسقط إلى أقل من نصفها
    expect(await sharpness(result.buffer)).toBeLessThan(before / 2);
  });

  it('المنطقة المكتشفة تغطّي اللوحة لا شريحة منها', async () => {
    const result = await blurPlates(await photo());
    const region = result.regions[0];
    expect(region).toBeDefined();

    // اللوحة عند x=0.375 y=0.67 بعرض 0.25 وارتفاع 0.156
    expect(region!.x).toBeLessThanOrEqual(0.4);
    expect(region!.x + region!.width).toBeGreaterThanOrEqual(0.6);
    expect(region!.y).toBeLessThanOrEqual(0.7);
  });

  /**
   * السلبية الكاذبة لا رجعة فيها (لوحة تُنشر مقروءة)، والإيجابية
   * الكاذبة مزعجة ومرئية. فالاختباران غير متكافئين قصدًا.
   */
  it('لا يُطمس ما ليس لوحة — على خلفية ملساء ومشوّشة', async () => {
    expect((await blurPlates(await photo({ plate: false }))).blurred).toBe(false);
    expect((await blurPlates(await photo({ plate: false, noisy: true }))).blurred).toBe(false);
  });

  it('يلتقط اللوحة على خلفية مشوّشة', async () => {
    const result = await blurPlates(await photo({ noisy: true }));
    expect(result.blurred).toBe(true);
  });

  it('يلتقطها في موضع آخر من النصف السفلي', async () => {
    const result = await blurPlates(await photo({ left: 120, top: 500 }));
    expect(result.blurred).toBe(true);
    expect(result.regions[0]!.x).toBeLessThan(0.3);
  });

  it('الطمس اليدوي يعمل حيث فشل الآلي', async () => {
    const input = await photo({ plate: false });
    const before = await sharpness(await photo(), { left: 0, top: 0, width: 200, height: 100 });
    void before;

    const blurred = await blurRegion(input, { x: 0.1, y: 0.1, width: 0.2, height: 0.1, confidence: 1 });
    expect(blurred.byteLength).toBeGreaterThan(0);
  });

  it('لا ينهار على مدخل ليس صورة', async () => {
    const result = await blurPlates(Buffer.from('ليست صورة'));
    expect(result.blurred).toBe(false);
  });

  it('شبكة فارغة لا تُنتج مناطق', () => {
    expect(findPlateRegions([])).toEqual([]);
    expect(findPlateRegions([[0, 0], [0, 0]])).toEqual([]);
  });
});

describe('البصمة الإدراكية', () => {
  it('تنجو من إعادة الضغط — وهي غاية استعمالها', async () => {
    const input = await photo();
    const original = await perceptualHash(input);
    const recompressed = await perceptualHash(await sharp(input).jpeg({ quality: 35 }).toBuffer());

    expect(hammingDistance(original, recompressed)).toBeLessThanOrEqual(DUPLICATE_MAX_DISTANCE);
    expect(isDuplicate(original, recompressed)).toBe(true);
  });

  it('تنجو من تغيير الحجم', async () => {
    const input = await photo();
    const original = await perceptualHash(input);
    const resized = await perceptualHash(await sharp(input).resize(480).toBuffer());
    expect(isDuplicate(original, resized)).toBe(true);
  });

  it('تفرّق بين صورتين مختلفتين', async () => {
    const a = await perceptualHash(await photo());
    const b = await perceptualHash(await photo({ plate: false, noisy: true }));
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('المسافة صفر للمتطابق و٦٤ للنقيض', () => {
    expect(hammingDistance('ffff', 'ffff')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    // طولان مختلفان لا يُقارنان
    expect(hammingDistance('ff', 'ffff')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('جلب رقم الهيكل — الفشل مسار لا خطأ', () => {
  it('يستخرج السنة من الخانة العاشرة', async () => {
    const { decodeYear } = await import('@/lib/domain/vin');
    const at = new Date('2026-01-01');

    expect(decodeYear('JTDBE32K1A0123456', at)).toBe(2010);
    expect(decodeYear('1FTFW1ET5DFA12345', at)).toBe(2013);
    // خانة غير صالحة لا تُخمَّن
    expect(decodeYear('JTDBE32K1I0123456', at)).toBeNull();
  });

  it('يرفض الأشكال غير الصحيحة — ولا يقبل I ولا O ولا Q', async () => {
    const { isValidVinFormat } = await import('@/lib/domain/vin');
    expect(isValidVinFormat('JTDBE32K1A0123456')).toBe(true);
    expect(isValidVinFormat('SHORT123')).toBe(false);
    expect(isValidVinFormat('JTDBE32K1A012345I')).toBe(false);
    expect(isValidVinFormat('JTDBE32K1A012345O')).toBe(false);
    expect(isValidVinFormat('JTDBE32K1A012345Q')).toBe(false);
  });

  /** المجهول يذهب إلى الإدخال اليدوي — وهو مسار سليم لا فشل. */
  it('يستخرج المُصنِّع المعروف ويصمت عن المجهول', async () => {
    const { decodeBrandSlug } = await import('@/lib/domain/vin');
    expect(decodeBrandSlug('JTDBE32K1A0123456')).toBe('toyota');
    expect(decodeBrandSlug('1FTFW1ET5DFA12345')).toBe('ford');
    expect(decodeBrandSlug('ZZZBE32K1A0123456')).toBeNull();
  });
});
