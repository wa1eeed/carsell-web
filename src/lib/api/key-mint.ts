import { createHash, randomBytes } from 'node:crypto';

/**
 * ═══ سكُّ المفتاح وتجزئتُه — بلا `db` ═══
 *
 * كانتا في `public-key.ts` مع `checkApiKey`، وهي تستورد `db`. فالبذرة
 * التي تريد `mintKey` وحدها تسحب معها عميلَ Prisma ثانيًا وتسقط عند
 * `@/lib/db` — **والمشتركُ الخالص في ملفّه**، كما `lib/campaigns/`
 * و`lib/seo/` و`lib/api/scopes.ts`.
 *
 * **والمفتاح يُخزَّن مجزّأً لا خامًّا**: قاعدةٌ مسروقة تُعطي سارقَها
 * مفاتيح عملاء تعمل فورًا، ولا يُكتشف ذلك إلّا من حركةٍ غريبة بعد
 * أسابيع.
 */
export const PREFIX_LENGTH = 8;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** يعيد المفتاح الخام **مرّة واحدة** — ولا يُخزَّن ولا يُعاد بعدها. */
export function mintKey(): { raw: string; prefix: string; keyHash: string } {
  const raw = `csk_${randomBytes(24).toString('base64url')}`;
  return { raw, prefix: raw.slice(0, PREFIX_LENGTH), keyHash: hashKey(raw) };
}
