import { SignJWT, jwtVerify } from 'jose';

/**
 * جلسة المستخدم — JWT موقّع بـHS256.
 *
 * نفس الرمز يخدم الويب والتطبيق: الويب يقرأه من كوكي `HttpOnly`
 * والتطبيق من ترويسة `Authorization`. لا NextAuth (القسم ١).
 */

const ALG = 'HS256';
export const SESSION_COOKIE = 'carsell_session';
export const SESSION_DAYS = 30;

export type SessionClaims = {
  userId: string;
};

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (value === undefined || value.length < 32) {
    throw new Error('JWT_SECRET غائب أو أقصر من ٣٢ بايت — راجع .env.example');
  }
  return new TextEncoder().encode(value);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setIssuer('carsell.one')
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** يعيد `null` على أي رمز فاسد أو منتهٍ — لا يرمي. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: [ALG],
      issuer: 'carsell.one',
    });
    return typeof payload.sub === 'string' ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
