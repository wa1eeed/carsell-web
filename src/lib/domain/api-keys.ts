import { db } from '@/lib/db';
import { mintKey } from '@/lib/api/public-key';
import { isApiScope } from '@/lib/api/scopes';
import { RATE_LIMIT_RANGE, type ApiKeyView } from '@/lib/api/keys';

/**
 * ═══ مفاتيحُ الـAPI العام — قفلٌ بلا مفتاح ═══
 *
 * ثلاثةُ مسارات تحت `/api/public/v1` تطلب مفتاحًا، والمصادقةُ مبنيّة
 * (تجزئةٌ ومقارنةٌ بزمنٍ ثابت وفصلُ «مسحوب» عن «مجهول»)، و`mintKey`
 * مبنيّة، والحدُّ لكلّ مفتاح مبنيّ، والوثيقةُ تقول «تُدخَل المفاتيح
 * يدويًّا الآن».
 *
 * **ولا مفتاحَ يُدخَل في مكان**: لا البذرة تزرع واحدًا، ولا شاشة
 * تُصدره، ولا مسار — و`mintKey` بلا منادٍ خارج اختبارها. فالواجهةُ
 * العامّة **لا يمكن أن تُنادى في أيّ بيئةٍ وُجدت**: قفلٌ بُني وحُرس
 * ووُثِّق، ولا مفتاحَ قُطع له. وهو شكلُ «الشرط يُفرَض ولا بابَ
 * لاستيفائه» الذي أُغلق مرّتين قبلها.
 *
 * **والسرُّ لا يعود من هنا أبدًا.** `keyHash` لا يدخل أيّ كائنٍ تعيده
 * هذه الوحدة، والخامُّ يُعاد **مرّةً واحدة** من `issueApiKey` ثم لا
 * سبيل إليه — ومن يبني «أرني مفتاحي» يبني بابًا خلفيًّا على كلّ
 * تكاملٍ يستعمله.
 */

/** **ولا `keyHash` في القائمة** — ما لا يدخل الكائن لا يتسرّب منه. */
const COLUMNS = {
  id: true, name: true, prefix: true, scopes: true, rateLimit: true,
  active: true, lastUsedAt: true, createdAt: true, createdBy: true, revokedAt: true,
} as const;

const MAX_NAME = 60;

export async function adminApiKeys(): Promise<ApiKeyView[]> {
  return db.apiKey.findMany({ orderBy: { createdAt: 'desc' }, select: COLUMNS });
}

export type IssueInput = { name: string; scopes: string[]; rateLimit: number };

export type IssueResult =
  | {
      ok: true;
      key: ApiKeyView;
      /** **يُعرض مرّةً ثمّ لا يُسترجع** — ولا يُسجَّل في `AuditLog` ولا في سجلّ. */
      raw: string;
    }
  | { ok: false; reason: 'INVALID_NAME' | 'INVALID_SCOPE' | 'INVALID_LIMIT'; detail?: string };

export async function issueApiKey(
  admin: { id: string },
  input: IssueInput,
  ip: string | null,
): Promise<IssueResult> {
  const name = input.name.trim();
  if (name === '' || name.length > MAX_NAME) return { ok: false, reason: 'INVALID_NAME' };

  const unknown = input.scopes.filter((scope) => !isApiScope(scope));
  if (unknown.length > 0) {
    return { ok: false, reason: 'INVALID_SCOPE', detail: unknown.join(', ') };
  }

  if (
    !Number.isInteger(input.rateLimit) ||
    input.rateLimit < RATE_LIMIT_RANGE.min ||
    input.rateLimit > RATE_LIMIT_RANGE.max
  ) {
    return { ok: false, reason: 'INVALID_LIMIT' };
  }

  const minted = mintKey();
  const key = await db.apiKey.create({
    data: {
      name,
      prefix: minted.prefix,
      keyHash: minted.keyHash,
      scopes: [...new Set(input.scopes)],
      rateLimit: input.rateLimit,
      createdBy: admin.id,
    },
    select: COLUMNS,
  });

  /**
   * **والمفتاحُ هويّة**: من قطعه ومتى هو السجلُّ الوحيد على أنّه
   * مأذونٌ به. والبادئةُ وحدها تُكتب — وكتابةُ السرّ في سجلٍّ يُقرأ
   * تُبطل تجزئتَه في القاعدة.
   */
  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ApiKey',
      entityId: key.id,
      action: 'apikey.issue',
      after: { name: key.name, prefix: key.prefix, scopes: key.scopes, rateLimit: key.rateLimit },
      ip,
    },
  });

  return { ok: true, key, raw: minted.raw };
}

export type UpdateInput = { name?: string; scopes?: string[]; rateLimit?: number };

export type UpdateResult =
  | { ok: true; key: ApiKeyView }
  | { ok: false; reason: 'NOT_FOUND' | 'REVOKED' | 'INVALID_NAME' | 'INVALID_SCOPE' | 'INVALID_LIMIT'; detail?: string };

/** **والمسحوبُ لا يُعدَّل**: تغييرُ حدٍّ أو نطاقٍ على مفتاحٍ ميّت وهمٌ. */
export async function updateApiKey(
  admin: { id: string },
  id: string,
  input: UpdateInput,
  ip: string | null,
): Promise<UpdateResult> {
  const before = await db.apiKey.findUnique({ where: { id }, select: COLUMNS });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };
  if (before.revokedAt !== null) return { ok: false, reason: 'REVOKED' };

  const data: { name?: string; scopes?: string[]; rateLimit?: number } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name === '' || name.length > MAX_NAME) return { ok: false, reason: 'INVALID_NAME' };
    data.name = name;
  }

  if (input.scopes !== undefined) {
    const unknown = input.scopes.filter((scope) => !isApiScope(scope));
    if (unknown.length > 0) {
      return { ok: false, reason: 'INVALID_SCOPE', detail: unknown.join(', ') };
    }
    data.scopes = [...new Set(input.scopes)];
  }

  if (input.rateLimit !== undefined) {
    if (
      !Number.isInteger(input.rateLimit) ||
      input.rateLimit < RATE_LIMIT_RANGE.min ||
      input.rateLimit > RATE_LIMIT_RANGE.max
    ) {
      return { ok: false, reason: 'INVALID_LIMIT' };
    }
    data.rateLimit = input.rateLimit;
  }

  const key = await db.apiKey.update({ where: { id }, data, select: COLUMNS });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ApiKey',
      entityId: id,
      action: 'apikey.update',
      before: { name: before.name, scopes: before.scopes, rateLimit: before.rateLimit },
      after: { name: key.name, scopes: key.scopes, rateLimit: key.rateLimit },
      ip,
    },
  });

  return { ok: true, key };
}

export type RevokeResult =
  | { ok: true; key: ApiKeyView }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_REVOKED' };

/**
 * ═══ والسحبُ لا رجعةَ فيه ═══
 *
 * لا «إعادة تفعيل»: مفتاحٌ سُحب سُحب لأنّه تسرّب أو انتهى عقدُ صاحبه،
 * وإعادتُه تُعيد سرًّا يعرفه من لا يجوز أن يعرفه. والبديل مفتاحٌ جديد.
 */
export async function revokeApiKey(
  admin: { id: string },
  id: string,
  ip: string | null,
): Promise<RevokeResult> {
  const before = await db.apiKey.findUnique({ where: { id }, select: COLUMNS });
  if (before === null) return { ok: false, reason: 'NOT_FOUND' };
  if (before.revokedAt !== null) return { ok: false, reason: 'ALREADY_REVOKED' };

  const key = await db.apiKey.update({
    where: { id },
    data: { active: false, revokedAt: new Date() },
    select: COLUMNS,
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'ApiKey',
      entityId: id,
      action: 'apikey.revoke',
      before: { active: true, revokedAt: null },
      after: { active: false, revokedAt: key.revokedAt?.toISOString() ?? null },
      ip,
    },
  });

  return { ok: true, key };
}
