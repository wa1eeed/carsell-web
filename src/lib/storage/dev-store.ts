import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

/**
 * ═══ تخزين تجريبيّ على القرص — للتطوير وحده ═══
 *
 * **بلا R2 لا تكتمل رحلة بيع واحدة.** الصورة شرطُ نشرٍ (`NO_IMAGES`)،
 * والرفع يردّ `STORAGE_UNAVAILABLE`، فالمعالج يقف عند خطوته الرابعة —
 * ولا يُختبَر ما بعده أبدًا. فمنصّةٌ تُعرض للتجربة بلا تخزين ليست
 * «ناقصة تكاملًا»: هي منصّةٌ لا يمكن أن يُنشر فيها إعلان.
 *
 * **وهذا البديل مقيَّد في الكود لا بالانضباط** — كما بيئة الدفع تمامًا.
 * الإنتاج يرفض تحميله أصلًا: الحاوية تُستبدل في كل نشر فما عليها يضيع،
 * ووعدُ «صورك محفوظة» لا يُبنى على قرصٍ زائل. ومن ينسى ضبط R2 في
 * الإنتاج يجب أن يقع في خطأ صريح لا في نجاحٍ كاذب يضيع بعد أوّل نشر.
 */

/** جذر الملفات — خارج `src` فلا يلتقطه البناء ولا يُلتزَم به. */
const ROOT = join(process.cwd(), '.dev-uploads');

export class ProductionStorageError extends Error {
  constructor() {
    super('dev-store is unavailable in production — configure R2.');
    this.name = 'ProductionStorageError';
  }
}

/**
 * هل يجوز التخزين المحلّي هنا؟
 *
 * `NODE_ENV === 'production'` وحده هو الحدّ: بناء الإنتاج يُشغَّل به،
 * وأيّ نشرٍ حقيقيّ كذلك. والتطوير والاختبار دونه.
 */
export function devStoreAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** يمنع `..` من الخروج من الجذر — المفتاح يأتي من مسار عام. */
function resolveKey(key: string): string | null {
  const clean = normalize(key).replace(/^(\.\.[/\\])+/, '');
  if (clean.startsWith('..') || clean.includes('\0')) return null;
  const full = join(ROOT, clean);
  return full.startsWith(ROOT) ? full : null;
}

export async function devPut(key: string, body: Buffer): Promise<void> {
  if (!devStoreAllowed()) throw new ProductionStorageError();
  const full = resolveKey(key);
  if (full === null) throw new Error('invalid key');
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function devGet(key: string): Promise<Buffer | null> {
  if (!devStoreAllowed()) return null;
  const full = resolveKey(key);
  if (full === null) return null;
  return readFile(full).catch(() => null);
}

/**
 * بصمة المحتوى — تُستعمل مفتاحًا مستقرًّا حين يُرفع الملف نفسه مرّتين.
 * وهي ليست بصمة الصورة الإدراكية (`phash`) التي يكشف بها التكرار.
 */
export function contentDigest(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
