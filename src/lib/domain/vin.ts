import { db } from '@/lib/db';

/**
 * جلب بيانات المركبة من رقم الهيكل — Wh.
 *
 * **الجلب يفشل ⇒ إدخال يدوي** (معيار القبول). وهذا ليس معالجة خطأ بل
 * تصميم: تكامل «أبشر» أو مزوّد بيانات ليس قائمًا في المرحلة الأولى،
 * وأي بائع قد يحمل مركبة لا يعرفها المزوّد. فالمسار اليدوي ليس بديلًا
 * احتياطيًا بل مسارٌ أول من الدرجة نفسها.
 *
 * ما يُستخرج هنا **من الرقم نفسه** لا من خدمة: سنة الصنع من الخانة
 * العاشرة، والمُصنِّع من الخانات الثلاث الأولى. وما لا يُستخرج يُترك
 * فارغًا ليملأه البائع — لا يُخمَّن.
 */

/** رقم الهيكل ١٧ خانة، بلا I ولا O ولا Q (تُلبس بـ1 و0). */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function isValidVinFormat(vin: string): boolean {
  return VIN_PATTERN.test(vin.toUpperCase());
}

/**
 * رمز السنة في الخانة العاشرة — دورة ثلاثين سنة.
 * الدورة تعيد نفسها، فالتمييز بخانة السنة السابعة: حرف = ٢٠١٠+.
 */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function decodeYear(vin: string, now = new Date()): number | null {
  const code = vin.toUpperCase()[9];
  if (code === undefined) return null;

  const index = YEAR_CODES.indexOf(code);
  if (index < 0) return null;

  // الدورة بدأت ١٩٨٠؛ تُختار أحدث سنة لا تتجاوز العام القادم
  const limit = now.getFullYear() + 1;
  let year = 1980 + index;
  while (year + 30 <= limit) year += 30;
  return year <= limit ? year : null;
}

/**
 * مُعرّف المُصنِّع العالمي (WMI) — الخانات الثلاث الأولى.
 *
 * الجدول مختصر على ما يُباع في السوق السعودي فعلًا: توسيعه إلى آلاف
 * الرموز يورث صيانةً لا يقابلها استعمال، والمجهول يذهب إلى الإدخال
 * اليدوي وهو مسار سليم لا فشل.
 */
const WMI: Record<string, string> = {
  JT: 'toyota', JF: 'subaru', JH: 'honda', JN: 'nissan', JM: 'mazda',
  JA: 'mitsubishi', JS: 'suzuki', KM: 'hyundai', KN: 'kia', KL: 'chevrolet',
  '1G': 'chevrolet', '1F': 'ford', '2F': 'ford', '3F': 'ford',
  '1C': 'chrysler', '1N': 'nissan', '5N': 'hyundai', '5X': 'hyundai',
  WBA: 'bmw', WBS: 'bmw', WDD: 'mercedes', WDB: 'mercedes', W1K: 'mercedes',
  WAU: 'audi', WVW: 'volkswagen', LSV: 'volkswagen',
  LFV: 'changan', LS5: 'changan', LJ1: 'jetour', LSJ: 'mg', SAL: 'landrover',
};

export function decodeBrandSlug(vin: string): string | null {
  const upper = vin.toUpperCase();
  return WMI[upper.slice(0, 3)] ?? WMI[upper.slice(0, 2)] ?? null;
}

export type VinLookup =
  | {
      ok: true;
      /** ما استُخرج فعلًا — و`null` لما لم يُستخرج، لا قيمة مخمَّنة. */
      vin: string;
      year: number | null;
      brandId: string | null;
      brandNameAr: string | null;
      /** الطراز لا يُستخرج من الرقم — يختاره البائع دائمًا. */
      needsModel: true;
    }
  | { ok: false; reason: 'INVALID_FORMAT' | 'NOT_RECOGNISED' | 'ALREADY_LISTED' };

/**
 * مركبة بنفس رقم الهيكل معروضة بالفعل: لا يُنشأ إعلان ثانٍ.
 * سيارةٌ واحدة بإعلانين تُفسد كل عدّاد وكل إحصاء سعر.
 */
async function alreadyListed(vin: string): Promise<boolean> {
  const existing = await db.vehicle.findFirst({
    where: { vin, listings: { some: { status: { in: ['PUBLISHED', 'PENDING_REVIEW'] } } } },
    select: { id: true },
  });
  return existing !== null;
}

export async function lookupVin(raw: string, now = new Date()): Promise<VinLookup> {
  const vin = raw.trim().toUpperCase().replace(/\s/g, '');
  if (!isValidVinFormat(vin)) return { ok: false, reason: 'INVALID_FORMAT' };
  if (await alreadyListed(vin)) return { ok: false, reason: 'ALREADY_LISTED' };

  const year = decodeYear(vin, now);
  const slug = decodeBrandSlug(vin);

  const brand =
    slug === null
      ? null
      : await db.brand.findFirst({
          where: { slug, visible: true },
          select: { id: true, nameAr: true },
        });

  /**
   * لا سنة ولا ماركة ⇒ الرقم صحيح الشكل ولا نعرف عنه شيئًا. يُعاد
   * `NOT_RECOGNISED` **لا خطأ**: الشاشة تفتح الإدخال اليدوي وتقول
   * السبب، ولا تطلب من البائع رقمًا آخر لا يملكه.
   */
  if (year === null && brand === null) return { ok: false, reason: 'NOT_RECOGNISED' };

  return {
    ok: true,
    vin,
    year,
    brandId: brand?.id ?? null,
    brandNameAr: brand?.nameAr ?? null,
    needsModel: true,
  };
}
