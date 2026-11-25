import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { ERRORS, fail, ok } from '@/lib/api/response';
import { currentUser } from '@/lib/auth/session';
import { DEALER_COOKIE, dealerCookieOptions } from '@/lib/auth/dealer-session';
import { openDealerSession, revokeDealerSession, DEALER_SESSION_HOURS } from '@/lib/domain/dealer-auth';

export const runtime = 'nodejs';

const MESSAGES: Record<string, string> = {
  NOT_A_MEMBER: 'هذا الحساب ليس عضوا في أي معرض. سجل معرضك أولا.',
  DEALER_NOT_ACTIVE: 'معرضك ينتظر اعتماد سجله التجاري — وتصلك رسالة فور اعتماده.',
  USER_NOT_ACTIVE: 'الحساب موقوف.',
};

/**
 * `POST /api/v1/dealer/auth/session` — يفتح جلسةَ اللوحة.
 *
 * **ولا يُثبت هويّة**: الشخصُ أثبتها بجواله ورمزِه في مسار الدخول
 * العامّ، وهذا يسأل «أهو عضوٌ في معرضٍ معتمد؟». وبابٌ ثانٍ للاعتماد
 * بابٌ ثانٍ يُخترق — وكلمةُ مرورٍ للمعرض تُتداوَل بين موظّفيه تمحو
 * أثرَ من فعل.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (user === null) return fail(ERRORS.UNAUTHORIZED, 401);

  const result = await openDealerSession(user.id);
  if (!result.ok) {
    return fail(
      { code: result.reason, messageAr: MESSAGES[result.reason] ?? 'تعذر فتح اللوحة.', messageEn: 'Could not open the dealer panel.' },
      result.reason === 'NOT_A_MEMBER' ? 404 : 403,
    );
  }

  const store = await cookies();
  store.set(DEALER_COOKIE, result.token, dealerCookieOptions(DEALER_SESSION_HOURS * 3_600));
  return ok({ dealerName: result.actor.dealerName, role: result.actor.role });
}

/** خروجٌ من اللوحة وحدها — ولا يمسّ جلسةَ المتجر. */
export async function DELETE() {
  const store = await cookies();
  const token = store.get(DEALER_COOKIE)?.value ?? '';
  await revokeDealerSession(token);
  store.set(DEALER_COOKIE, '', dealerCookieOptions(0));
  return ok({ signedOut: true });
}
