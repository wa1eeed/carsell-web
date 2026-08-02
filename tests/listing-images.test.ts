import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

/**
 * التخزين مُستبدَل بجاسوس: المعيار «تُحفظ مطموسة» يقاس **عند حدّ
 * التخزين** لا قبله. اختبارٌ يقيس مخرَج دالة الطمس وحدها يثبت أن
 * الطمس يعمل، ولا يثبت أن **ما يُسلَّم للتخزين** هو المطموس — وبينهما
 * سطرٌ واحد يكفي لتضييع الفرق.
 */
const stored: { body: Buffer; contentType: string }[] = [];

vi.mock('@/lib/r2', () => ({
  MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
  storeObject: vi.fn(async (_kind: string, body: Buffer, contentType: string) => {
    stored.push({ body, contentType });
    return `listings/test-${stored.length}.jpg`;
  }),
}));

const { processListingImage } = await import('@/lib/domain/listing-images');

const PLATE_BOX = { left: 360, top: 430, width: 240, height: 100 };

async function photo(plate = true): Promise<Buffer> {
  const parts = plate
    ? [
        {
          input: Buffer.from(
            `<svg width='240' height='100'><rect width='240' height='100' fill='#fff'/>${Array.from(
              { length: 7 },
              (_, i) => `<rect x='${12 + i * 32}' y='22' width='18' height='56' fill='#111'/>`,
            ).join('')}</svg>`,
          ),
          left: PLATE_BOX.left,
          top: PLATE_BOX.top,
        },
      ]
    : [];

  return sharp({
    create: { width: 960, height: 640, channels: 3 as const, background: { r: 120, g: 130, b: 125 } },
  })
    .composite(parts)
    .jpeg()
    .toBuffer();
}

/** حدّة منطقة اللوحة بعد التطبيع — الأبعاد تتغيّر، فالنسب تُعاد قياسها. */
async function plateSharpness(buffer: Buffer): Promise<number> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const box = {
    left: Math.round((PLATE_BOX.left / 960) * width),
    top: Math.round((PLATE_BOX.top / 640) * height),
    width: Math.round((PLATE_BOX.width / 960) * width),
    height: Math.round((PLATE_BOX.height / 640) * height),
  };

  const stats = await sharp(buffer).extract(box).greyscale().stats();
  return stats.channels[0]?.stdev ?? 0;
}

beforeEach(() => {
  stored.length = 0;
});

describe('معيار القبول عند حدّ التخزين', () => {
  it('البايتات المسلَّمة للتخزين مطموسة — لا الأصل', async () => {
    const original = await photo();
    const before = await plateSharpness(original);

    const result = await processListingImage(original);
    expect(result.ok).toBe(true);
    expect(stored).toHaveLength(1);

    const handed = stored[0]!.body;
    expect(await plateSharpness(handed)).toBeLessThan(before / 2);

    // والأصل نفسه لم يُسلَّم قطّ
    expect(handed.equals(original)).toBe(false);
  });

  it('الراية تصف ما جرى فعلًا لا ما نُوي', async () => {
    const withPlate = await processListingImage(await photo(true));
    const without = await processListingImage(await photo(false));

    expect(withPlate.ok && withPlate.image.plateBlurred).toBe(true);
    expect(without.ok && without.image.plateBlurred).toBe(false);
  });

  it('البصمة تُحسب بعد الطمس — بصمةُ ما سيُخزَّن', async () => {
    const result = await processListingImage(await photo());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { perceptualHash } = await import('@/lib/images/phash');
    expect(result.image.phash).toBe(await perceptualHash(stored[0]!.body));
  });

  it('المنطقة اليدوية تُطبَّق فوق الآلية', async () => {
    const result = await processListingImage(await photo(false), {
      manualRegions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.15, confidence: 1 }],
    });
    expect(result.ok && result.image.plateBlurred).toBe(true);
  });

  it('مدخل ليس صورة يُرفض بنظافة ولا يصل التخزين', async () => {
    const result = await processListingImage(Buffer.from('ليست صورة'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_AN_IMAGE');
    expect(stored).toHaveLength(0);
  });

  it('ما يُخزَّن JPEG مطبَّع لا الصيغة الأصلية', async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3 as const, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    const result = await processListingImage(png);
    expect(result.ok).toBe(true);
    expect(stored[0]!.contentType).toBe('image/jpeg');
    expect((await sharp(stored[0]!.body).metadata()).format).toBe('jpeg');
  });
});
