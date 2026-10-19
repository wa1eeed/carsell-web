import type { NextRequest } from 'next/server';
import { ERRORS, fail } from './response';
import { checkApiKey } from './public-key';
import { rateLimit } from './rate-limit';
import { type ApiScope, allows } from './scopes';

/**
 * حارس الـAPI العام — مفتاحٌ ثم حدّ.
 *
 * **والحدّ لكل مفتاح لا لكل IP**: عميلٌ خلف NAT يشترك مع غيره في
 * العنوان، فحدٌّ بالعنوان يعاقب من لم يتجاوز. والمفتاح هو ما نُصدره
 * ونعرف حصّته.
 *
 * ⚠️ العدّاد في الذاكرة — **لكل نسخة على حدة، ويسقط بإعادة التشغيل**.
 * وهو كافٍ لمنع الإساءة العابرة، ولا يكفي لضمان حصّةٍ متعاقَد عليها.
 * انظر `docs/api/public.md`.
 */
export type PublicGuard =
  | { ok: true; keyId: string; scopes: string[] }
  | { ok: false; response: Response };

const WINDOW_SECONDS = 60;

/**
 * ═══ والنطاقُ يُفحص — أو لا يُعرض ═══
 *
 * `scopes` كان يُخزَّن ويُعاد ولا يُفحص في موضع، و`docs/api/public.md`
 * يسمّيها: «حقلٌ يبدو صلاحيةً ولا يُفحص أسوأ من غياب الحقل». فصار
 * **كلُّ مسارٍ يُعلن نطاقَه**، والحارسُ يفحصه — وبُني الفحصُ مع
 * الشاشة التي تُصدر المفاتيح لا بعدها، فلا نافذةَ يعمل فيها الحقلُ
 * بلا حارس.
 */
export async function requirePublicKey(
  request: NextRequest,
  needed?: ApiScope,
): Promise<PublicGuard> {
  const check = await checkApiKey(request.headers.get('authorization'));

  if (!check.ok) {
    const error =
      check.reason === 'MISSING'
        ? ERRORS.API_KEY_MISSING
        : check.reason === 'REVOKED'
          ? ERRORS.API_KEY_REVOKED
          : ERRORS.API_KEY_INVALID;
    return { ok: false, response: fail(error, 401) };
  }

  /** **والمنعُ بالنطاق ٤٠٣ لا ٤٠١**: المفتاحُ صحيحٌ ولا يملك هذا السطح. */
  if (needed !== undefined && !allows(check.scopes, needed)) {
    return { ok: false, response: fail(ERRORS.API_KEY_SCOPE(needed), 403) };
  }

  const verdict = rateLimit(`public:${check.id}`, check.rateLimit, WINDOW_SECONDS);
  if (!verdict.allowed) {
    const response = fail(ERRORS.RATE_LIMITED, 429);
    // `Retry-After` يقول متى — والعميل الذي لا يعرف يعيد المحاولة فورًا
    response.headers.set('retry-after', String(verdict.retryAfterSeconds));
    return { ok: false, response };
  }

  return { ok: true, keyId: check.id, scopes: check.scopes };
}
