import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * ═══ مفاتيح الـAPI العام ═══
 *
 * **تُخزَّن مجزّأة لا خامًا.** قاعدةٌ مسروقة تُعطي السارق مفاتيح عملاء
 * يعملون بها فورًا، ولا يُكتشف ذلك إلا من حركةٍ غريبة بعد أسابيع.
 *
 * والمفتاح **يُعرض مرّة واحدة عند الإنشاء** ثم لا يُسترجع أبدًا. ومن
 * يبني «استرجاع المفتاح» يبني بابًا خلفيًّا على كل حسابٍ يستعمله.
 */

const PREFIX_LENGTH = 8;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** يعيد المفتاح الخام **مرّة واحدة** — ولا يُخزَّن ولا يُعاد بعدها. */
export function mintKey(): { raw: string; prefix: string; keyHash: string } {
  const raw = `csk_${randomBytes(24).toString('base64url')}`;
  return { raw, prefix: raw.slice(0, PREFIX_LENGTH), keyHash: hashKey(raw) };
}

export type KeyCheck =
  | { ok: true; id: string; name: string; scopes: string[]; rateLimit: number }
  | { ok: false; reason: 'MISSING' | 'INVALID' | 'REVOKED' };

/**
 * التحقّق من مفتاحٍ وارد.
 *
 * **والمقارنة بزمنٍ ثابت** بعد التجزئة: مقارنةٌ تخرج عند أوّل اختلاف
 * تُسرّب طول البادئة المطابقة، ومن يقيس آلاف المحاولات يبني المفتاح
 * حرفًا حرفًا.
 *
 * ويُفصل «غير موجود» عن «مسحوب»: الأوّل خطأ في الإعداد، والثاني قرارٌ
 * اتُّخذ — ورسالةٌ واحدة لهما تجعل العميل يعيد المحاولة بلا فائدة.
 */
export async function checkApiKey(header: string | null): Promise<KeyCheck> {
  if (header === null || header === '') return { ok: false, reason: 'MISSING' };

  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  if (raw === '') return { ok: false, reason: 'MISSING' };

  const row = await db.apiKey.findUnique({ where: { prefix: raw.slice(0, PREFIX_LENGTH) } });
  if (row === null) return { ok: false, reason: 'INVALID' };

  const given = Buffer.from(hashKey(raw), 'hex');
  const stored = Buffer.from(row.keyHash, 'hex');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    return { ok: false, reason: 'INVALID' };
  }

  if (!row.active || row.revokedAt !== null) return { ok: false, reason: 'REVOKED' };

  /**
   * **آخر استعمال يُكتب ولا يُنتظَر.** انتظارُ كتابةٍ إحصائية يضيف
   * رحلةً إلى كل طلب قراءة، وفشلُها لا يجوز أن يمنع استجابةً صحيحة.
   */
  void db.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    ok: true,
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    rateLimit: row.rateLimit,
  };
}
