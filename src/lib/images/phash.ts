import sharp from 'sharp';

/**
 * بصمة إدراكية (dHash) للكشف عن الصور المكرّرة.
 *
 * **لماذا الإدراكية لا التجزئة العادية**: `sha256` لصورتين متطابقتين
 * بصريًا يختلف إن غيّر أحدهما جودة الضغط أو أضاف بكسلًا. والغشّ الذي
 * نطارده هو إعادة نشر صور إعلان آخر — والناسخ يعيد الحفظ عادةً.
 *
 * dHash لا SHA: يقارن كل بكسل بجاره أفقيًا، فينجو من تغيّر السطوع
 * والحجم والضغط، ويسقط عند اقتصاص كبير — وهو ما يجب أن يسقط عنده،
 * لأن اقتصاصًا كبيرًا صورةٌ أخرى فعلًا.
 */

const WIDTH = 9;
const HEIGHT = 8;

/** ٦٤ بت في ١٦ حرفًا ستّ عشرية. */
export async function perceptualHash(input: Buffer): Promise<string> {
  const pixels = await sharp(input)
    .greyscale()
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = '';
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH - 1; x += 1) {
      const left = pixels[y * WIDTH + x] ?? 0;
      const right = pixels[y * WIDTH + x + 1] ?? 0;
      bits += left > right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** عدد البتّات المختلفة — ٠ تطابق تامّ، ٦٤ نقيض. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;

  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    distance += (diff & 1) + ((diff >> 1) & 1) + ((diff >> 2) & 1) + ((diff >> 3) & 1);
  }
  return distance;
}

/**
 * عتبة التكرار.
 *
 * قرار ٣٣: «صورة مكرّرة > ٩٠٪» تدخل الإعلانَ المراجعةَ. و٩٠٪ من ٦٤ بتًّا
 * تعني اختلافًا لا يتجاوز ٦ — وهذا ما يُقاس، لا نسبة تُحسب على العين.
 */
export const DUPLICATE_MAX_DISTANCE = 6;

export function isDuplicate(a: string, b: string): boolean {
  return hammingDistance(a, b) <= DUPLICATE_MAX_DISTANCE;
}
