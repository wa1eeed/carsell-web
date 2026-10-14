import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { revokeProviderSession } from '@/lib/domain/provider-auth';
import { PROVIDER_COOKIE, providerCookieOptions } from '@/lib/auth/provider-session';

export const runtime = 'nodejs';

/** والجلسةُ صفٌّ يُبطَل لا كعكةٌ تُمحى — فنسخةٌ مسرَّبة تموت معها. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(PROVIDER_COOKIE)?.value;
  if (token !== undefined && token !== '') await revokeProviderSession(token);

  const response = ok({ signedOut: true });
  response.cookies.set(PROVIDER_COOKIE, '', providerCookieOptions(0));
  return response;
}
