import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * تشفير الأسرار المخزَّنة — AES-256-GCM.
 *
 * **GCM لا CBC**: الأوّل يكشف العبث بالنصّ المشفَّر، والثاني يفكّه إلى
 * قمامة بلا أن يشتكي. ومفتاح مزوّد دفعٍ عُبث به يجب أن يفشل صراحةً لا
 * أن يصير سلسلة عشوائية تُرسَل إلى البنك.
 *
 * والملح ثابت مشتقّ من المفتاح لا عشوائي لكل قيمة: الاشتقاق يجري مرّة
 * عند الإقلاع، و`scrypt` لكل عملية تشفير يجعل صفحةً فيها أربعة عشر
 * تكاملًا تنتظر ثوانيَ بلا فائدة أمنية — المفتاح نفسه هو السرّ.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey !== null) return cachedKey;

  const secret = process.env.SECRETS_KEY;
  if (secret === undefined || secret.length < 32) {
    throw new Error('SECRETS_KEY غائب أو أقصر من ٣٢ محرفًا — راجع .env.example');
  }

  cachedKey = scryptSync(secret, 'carsell.secrets.v1', 32);
  return cachedKey;
}

/** يعيد `v1.<iv>.<tag>.<ciphertext>` بترميز base64url — النسخة أوّلًا ليمكن تدوير الخوارزمية. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

/**
 * يفكّ التشفير أو **يرمي**.
 *
 * لا `null` عند الفشل: قيمةٌ فارغة تُمرَّر إلى مزوّد فيردّ «مفتاح غير
 * صحيح»، فيُطارَد الخطأ عنده وهو عندنا.
 */
export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');
  if (version !== 'v1' || ivPart === undefined || tagPart === undefined || dataPart === undefined) {
    throw new Error('صيغة سرّ غير معروفة');
  }

  const tag = Buffer.from(tagPart, 'base64url');
  if (tag.length !== TAG_BYTES) throw new Error('وسم مصادقة بطول خاطئ');

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * تلميح يُعرض — **يُشتقّ وقت الكتابة ويُخزَّن نصًّا عاديًا**.
 *
 * فالعرض لا يفكّ تشفيرًا أبدًا: شاشةٌ تفكّ أربعة عشر سرًّا لتعرض أربعة
 * أحرف من كلٍّ منها قد جعلت الأسرار كلّها في ذاكرة الخادم لأجل تجميل.
 * ولو سُرِّبت الحمولة لخرجت معها.
 */
export function secretHint(plaintext: string): string {
  // البادئة تقول «حيّ» أو «اختبار» وهي ليست سرًّا — والباقي يُحجب
  const head = plaintext.slice(0, 8);
  return `${head}${'·'.repeat(Math.max(4, Math.min(24, plaintext.length - head.length)))}`;
}
