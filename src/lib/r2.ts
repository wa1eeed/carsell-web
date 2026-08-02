import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Key } from './env';

/**
 * Cloudflare R2 — كل وسائط المنتج.
 *
 * **لا ملف يُكتب على قرص الحاوية** (القسم ١٢): الحاوية تُستبدل في كل نشر،
 * فما عليها يضيع، والالتزام بهذا من اليوم الأول يجعل الانتقال إلى Google
 * Cloud تغييرَ نشرٍ لا إعادة كتابة.
 *
 * الرفع **موقَّع من المتصفح مباشرةً**: الملف لا يمرّ بخادم Next، فلا نحمّل
 * الطلب الأول عبء صور عشرة ميجابايت ولا نستهلك ذاكرة الحاوية.
 *
 * والمفتاح يُبنى بـ`r2Key()` وحده — يضع بادئة البيئة (`staging/` أو
 * `production/`) فلا تختلط وسائط بيئتين.
 */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
] as const;

export type UploadKind = 'brand-logo' | 'dealer-logo' | 'listing-image';

const KIND_PATH: Record<UploadKind, string> = {
  'brand-logo': 'catalog/brands',
  'dealer-logo': 'dealers',
  'listing-image': 'listings',
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (
    accountId === undefined || accountId === '' ||
    accessKeyId === undefined || accessKeyId === '' ||
    secretAccessKey === undefined || secretAccessKey === '' ||
    bucket === undefined || bucket === '' ||
    publicUrl === undefined || publicUrl === ''
  ) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

function client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
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

function publicUrlFor(key: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`;
}

/** الرابط العام لمفتاح مخزَّن. يعيد `null` إن لم يُضبط R2 بعد. */
export function publicUrl(key: string | null): string | null {
  if (key === null || key === '') return null;
  const config = readConfig();
  return config === null ? null : publicUrlFor(key, config.publicUrl);
}
