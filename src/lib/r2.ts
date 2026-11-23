import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Key } from './env';
import { devPut, devStoreAllowed } from './storage/dev-store';

/**
 * وسائطُ المنتج — على أيّ مخزنٍ متوافقٍ مع S3.
 *
 * الافتراضيّ Cloudflare R2، و`MEDIA_ENDPOINT` ينقلها إلى غيره بلا نشر.
 *
 * **لا ملف يُكتب على قرص الحاوية** (القسم ١٢): الحاوية تُستبدل في كل نشر،
 * فما عليها يضيع، والالتزام بهذا من اليوم الأول يجعل الانتقال إلى Google
 * Cloud تغييرَ نشرٍ لا إعادة كتابة.
 *
 * الرفع **موقَّع من المتصفح مباشرةً** لشعارات الماركات والمعارض: الملف لا
 * يمرّ بخادم Next، فلا نحمّل الطلب عبء صور كبيرة ولا نستهلك ذاكرة الحاوية.
 *
 * **واستثناء صور الإعلانات**: تمرّ بالخادم عبر `storeObject` لأنها تُطمَس
 * وتُبصَم قبل التخزين. صورةٌ تذهب من المتصفّح إلى التخزين مباشرةً لا يراها
 * الخادم فلا يطمس لوحتها — والرفع الموقَّع يجعل «تُحفظ مطموسة» وعدًا لا
 * يملك أحد الوفاء به.
 *
 * والمفتاح يُبنى بـ`r2Key()` وحده — يضع بادئة البيئة (`staging/` أو
 * `production/`) فلا تختلط وسائط بيئتين.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
] as const;

export type UploadKind = 'brand-logo' | 'dealer-logo' | 'listing-image' | 'inspection-photo';

const KIND_PATH: Record<UploadKind, string> = {
  'brand-logo': 'catalog/brands',
  'dealer-logo': 'dealers',
  'listing-image': 'listings',
  /** صورُ بنود الفحص — ترفعها لوحةُ المزوّد لا المستخدم. */
  'inspection-photo': 'inspections',
};

/**
 * ═══ المخزن متغيّرُ بيئة لا مزوّدٌ مكتوب ═══
 *
 * كانت نقطةُ الاتّصال مبنيّةً من `accountId` على نطاق Cloudflare —
 * **فالمزوّدُ مكتوبٌ في الشيفرة**، والانتقال إلى مخزنٍ متوافقٍ مع S3
 * (OSS أو MinIO أو غيرهما) تعديلُ سطرٍ ونشرٌ لا ضبطُ لوحة. والتعليق
 * فوق هذا الملفّ كان يَعِد بالعكس: «الالتزام بهذا يجعل الانتقال
 * تغييرَ نشرٍ لا إعادة كتابة» — وعدٌ لم يكن له مقبض.
 *
 * فالنقطةُ والإقليم يُقرآن من البيئة، **ويُشتقّان من `R2_ACCOUNT_ID`
 * حين لا يُذكران** — فنشرٌ قائم على R2 لا يتغيّر فيه شيء.
 *
 * **والأسماءُ تقبل الصيغتين**: `MEDIA_*` لمن يبدأ على غير R2 — فاسمٌ
 * يقول `R2_ACCESS_KEY_ID` وهو يحمل مفتاح مزوّدٍ آخر اسمٌ يكذب.
 */
type MediaConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

/** أوّلُ قيمةٍ غير فارغة — والفراغُ كالغياب في متغيّرات البيئة. */
function pick(...names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return null;
}

function readConfig(): MediaConfig | null {
  const accessKeyId = pick('MEDIA_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID');
  const secretAccessKey = pick('MEDIA_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY');
  const bucket = pick('MEDIA_BUCKET', 'R2_BUCKET');
  const publicUrl = pick('MEDIA_PUBLIC_URL', 'R2_PUBLIC_URL');

  /**
   * النقطةُ صريحةً، أو مشتقّةً من حساب R2 — وبلا الاثنين لا مخزن.
   * و`auto` إقليمُ R2، وغيرُه يطلب إقليمًا حقيقيًّا (`me-central-1`).
   */
  const accountId = pick('R2_ACCOUNT_ID');
  const endpoint =
    pick('MEDIA_ENDPOINT') ??
    (accountId === null ? null : `https://${accountId}.r2.cloudflarestorage.com`);
  const region = pick('MEDIA_REGION') ?? 'auto';

  if (
    endpoint === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    bucket === null ||
    publicUrl === null
  ) {
    return null;
  }
  return { endpoint, region, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

function client(config: MediaConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export type SignedUpload = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
  maxBytes: number;
};

export type SignResult =
  | { ok: true; upload: SignedUpload }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' };

/**
 * رابط رفع موقَّع صالح خمس دقائق.
 *
 * النوع والحجم يُفحصان **هنا** لا في المتصفح: فحص العميل تجربةُ مستخدم،
 * وفحص الخادم هو الحماية.
 */
export async function signUpload({
  kind,
  contentType,
  contentLength,
  fileName,
}: {
  kind: UploadKind;
  contentType: string;
  contentLength: number;
  fileName: string;
}): Promise<SignResult> {
  const config = readConfig();
  if (config === null) return { ok: false, reason: 'NOT_CONFIGURED' };

  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, reason: 'TYPE_NOT_ALLOWED' };
  }
  if (contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'TOO_LARGE' };
  }

  // اسم الملف من المستخدم لا يدخل المفتاح — امتداده وحده
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const safeExtension = /^[a-z0-9]{2,5}$/.test(extension) ? extension : 'bin';
  const unique = crypto.randomUUID();
  const key = r2Key(KIND_PATH[kind], `${unique}.${safeExtension}`);

  const uploadUrl = await getSignedUrl(
    client(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: 300 },
  );

  return {
    ok: true,
    upload: {
      uploadUrl,
      key,
      publicUrl: publicUrlFor(key, config.publicUrl),
      expiresIn: 300,
      maxBytes: MAX_UPLOAD_BYTES,
    },
  };
}

/**
 * تخزين محتوى **بعد معالجته على الخادم** — صور الإعلانات وحدها.
 * يعيد المفتاح، أو `null` إن لم يُضبط R2 أو فشل الرفع.
 */
export async function storeObject(
  kind: UploadKind,
  body: Buffer,
  contentType: string,
): Promise<string | null> {
  const config = readConfig();

  /**
   * **بلا R2 يتولّاها القرص — في التطوير وحده.**
   *
   * وبغيره لا يُنشر إعلانٌ بصورة، فلا يُمشى ما بعد الخطوة الرابعة من
   * معالج البيع أصلًا. والإنتاج يظلّ يعيد `null` فيُرفض الرفع صراحةً.
   */
  if (config === null) {
    if (!devStoreAllowed()) return null;
    const devKey = r2Key(KIND_PATH[kind], `${crypto.randomUUID()}.jpg`);
    return devPut(devKey, body)
      .then(() => devKey)
      .catch(() => null);
  }

  const key = r2Key(KIND_PATH[kind], `${crypto.randomUUID()}.jpg`);
  try {
    await client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  } catch {
    return null;
  }
}

function publicUrlFor(key: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`;
}

/** الرابط العام لمفتاح مخزَّن. يعيد `null` إن لم يُضبط R2 ولا القرص. */
export function publicUrl(key: string | null): string | null {
  if (key === null || key === '') return null;
  const config = readConfig();
  if (config !== null) return publicUrlFor(key, config.publicUrl);
  // مسار التطوير يخدم من القرص — ولا وجود له في الإنتاج
  return devStoreAllowed() ? `/api/dev/media/${key}` : null;
}
