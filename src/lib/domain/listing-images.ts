import { db } from '@/lib/db';
import { blurPlates, blurRegion, type PlateRegion } from '@/lib/images/plate';
import { DUPLICATE_MAX_DISTANCE, hammingDistance, perceptualHash } from '@/lib/images/phash';
import { MAX_UPLOAD_BYTES, storeObject } from '@/lib/r2';
import sharp from 'sharp';

/**
 * استقبال صورة إعلان — **معالجة قبل التخزين**.
 *
 * الترتيب ملزِم: تطبيع ⇒ طمس اللوحة ⇒ بصمة ⇒ تخزين. البصمة تُحسب
 * **بعد** الطمس لأنها بصمة ما سيُخزَّن؛ حسابها قبله يجعل صورتين
 * مختلفتي اللوحة تبدوان مختلفتين وهما نسختان من إعلان واحد.
 *
 * ولا يُخزَّن الأصل قطّ. حفظُه «للمراجعة» يعني أن اللوحة موجودة في
 * التخزين، وأن التسريب صار مسألة صلاحية لا مسألة بيانات.
 */

/** الحدّ الأقصى لصور الإعلان (قرار ٣٣). */
export const MAX_LISTING_IMAGES = 10;

/** أبعاد العرض — أكبر من هذا لا يضيف للقارئ ويضيف للتحميل. */
const MAX_DIMENSION = 1600;

export type ProcessedImage = {
  key: string;
  phash: string;
  plateBlurred: boolean;
  regions: PlateRegion[];
  qualityFlags: string[];
  width: number;
  height: number;
  bytes: number;
};

export type ProcessResult =
  | { ok: true; image: ProcessedImage }
  | { ok: false; reason: 'TOO_LARGE' | 'NOT_AN_IMAGE' | 'STORAGE' };

/**
 * الصورة الضبابية ليست خطأً بل تنبيه: «الإعلانات بصور واضحة تُشاهَد
 * أكثر» (ترميز Wh). فتُقبل ويُعلَّم عليها، ولا تُرفض.
 */
const BLURRY_STDEV = 18;
const LOW_RES_PIXELS = 640 * 480;

async function qualityFlags(buffer: Buffer, width: number, height: number): Promise<string[]> {
  const flags: string[] = [];
  if (width * height < LOW_RES_PIXELS) flags.push('LOW_RES');

  const stats = await sharp(buffer).greyscale().stats();
  const stdev = stats.channels[0]?.stdev ?? 0;
  if (stdev < BLURRY_STDEV) flags.push('BLURRY');

  return flags;
}

export async function processListingImage(
  input: Buffer,
  options: { manualRegions?: PlateRegion[] } = {},
): Promise<ProcessResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: 'TOO_LARGE' };

  let normalised: Buffer;
  let width: number;
  let height: number;

  try {
    // `rotate()` بلا وسيط يطبّق دوران EXIF ثم يُسقطه — صورة الجوال
    // تصل مقلوبة بلا هذا، ثم يُقاس مكان اللوحة في المكان الخطأ
    const pipeline = sharp(input, { failOn: 'none' })
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    normalised = data;
    width = info.width;
    height = info.height;
  } catch {
    return { ok: false, reason: 'NOT_AN_IMAGE' };
  }

  const detected = await blurPlates(normalised);
  let buffer = detected.buffer;

  // مناطق يدوية من البائع فوق الآلي — من يرى صورته يرى ما فات الكاشف
  for (const region of options.manualRegions ?? []) {
    buffer = await blurRegion(buffer, region);
  }

  const manual = (options.manualRegions ?? []).length > 0;
  const [phash, flags] = await Promise.all([
    perceptualHash(buffer),
    qualityFlags(buffer, width, height),
  ]);

  const stored = await storeObject('listing-image', buffer, 'image/jpeg');
  if (stored === null) return { ok: false, reason: 'STORAGE' };

  return {
    ok: true,
    image: {
      key: stored,
      phash,
      plateBlurred: detected.blurred || manual,
      regions: [...detected.regions, ...(options.manualRegions ?? [])],
      qualityFlags: flags,
      width,
      height,
      bytes: buffer.byteLength,
    },
  };
}

/**
 * صورة مكرّرة من إعلان آخر.
 *
 * القرار ٣٣ يُدخل الإعلان المراجعةَ عند التكرار — **ولا يرفضه**: صاحب
 * إعلانين لسيارة واحدة قد يعيد نفس الصورة بحسن نيّة، والرفض يعاقبه
 * بينما المراجعة تكشف الناسخ.
 */
export async function findDuplicate(
  phash: string,
  except?: { listingId?: string; sellerId?: string },
): Promise<{ listingRef: string; distance: number } | null> {
  /**
   * **التكرار يُقاس مع إعلان مستخدمٍ آخر.**
   *
   * وبائعٌ يعيد صورة سيارته في إعلانٍ ثانٍ له ليس ناسخًا — وإدخالُه
   * المراجعة يعاقب سلوكًا مشروعًا ويُغرق طابور A15 بما لا يستحقّه.
   * وهذا نصّ القرار ٣٣ على `ReviewReason.DUPLICATE_IMAGE`.
   */
  const candidates = await db.listingImage.findMany({
    where: {
      phash: { not: null },
      ...(except?.listingId === undefined ? {} : { listingId: { not: except.listingId } }),
      ...(except?.sellerId === undefined
        ? {}
        : { listing: { sellerId: { not: except.sellerId } } }),
    },
    select: { phash: true, listing: { select: { ref: true } } },
  });

  for (const candidate of candidates) {
    if (candidate.phash === null) continue;
    const distance = hammingDistance(phash, candidate.phash);
    if (distance <= DUPLICATE_MAX_DISTANCE) {
      return { listingRef: candidate.listing.ref, distance };
    }
  }
  return null;
}
