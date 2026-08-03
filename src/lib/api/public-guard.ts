import type { NextRequest } from 'next/server';
import { ERRORS, fail } from './response';
import { checkApiKey } from './public-key';
import { rateLimit } from './rate-limit';

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

export async function requirePublicKey(request: NextRequest): Promise<PublicGuard> {
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

  const verdict = rateLimit(`public:${check.id}`, check.rateLimit, WINDOW_SECONDS);
  if (!verdict.allowed) {
    const response = fail(ERRORS.RATE_LIMITED, 429);
    // `Retry-After` يقول متى — والعميل الذي لا يعرف يعيد المحاولة فورًا
    response.headers.set('retry-after', String(verdict.retryAfterSeconds));
    return { ok: false, response };
  }

  return { ok: true, keyId: check.id, scopes: check.scopes };
}
