import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import type { ProviderUser } from '@/generated/prisma/client';

/**
 * ═══ مصادقة المزوّد — هوّيةٌ ثالثة لا ثانية ═══
 *
 * للمنتج هوّيتان: مستخدمُ السوق (جوّال ورمز) وموظّفُ الأدمن (بريد
 * وكلمة). والمزوّد **ليس أيًّا منهما**: منشأةٌ لها موظّفون يتبدّلون،
 * تعمل على طلباتٍ أُسنِدت إليها ولا ترى غيرها.
 *
 * **ومنفصلةٌ تمامًا عن الاثنتين**: جدولٌ آخر وكوكي آخر — وخلطُ هوية
 * مزوّدٍ بهوية أدمن يجعل ثغرةً في أحدهما ثغرةً في الآخر، ومزوّدًا
 * يقرأ مالَ المنصّة.
 *
 * ولا قفلَ بعد محاولاتٍ خاطئة هنا كما في الأدمن: حسابُ المزوّد لا يفتح
 * مالًا ولا يحسم نزاعًا، والقفلُ على بابٍ يُشارَك بين موظّفين يُعطّل
 * مركزًا كاملًا بخطأ واحد. والمراجعة في `AuditLog` لمن يسأل.
 */

/** ثمانُ ساعات — وردِيّةُ عملٍ لا أكثر، كجلسة الأدمن. */
export const PROVIDER_SESSION_HOURS = 8;

export type ProviderLogin =
  | { ok: true; token: string; user: ProviderUser; mustChangePassword: boolean }
  | { ok: false; reason: 'INVALID_CREDENTIALS' | 'INACTIVE' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function loginProvider(
  input: { email: string; password: string; ip: string | null; userAgent: string | null },
  now: Date = new Date(),
): Promise<ProviderLogin> {
  const email = input.email.trim().toLowerCase();

  const user = await db.providerUser.findUnique({
    where: { email },
    include: { provider: { select: { active: true } } },
  });

  /**
   * **والمقارنة تجري ولو لم يوجد حساب.** ردٌّ أسرع لبريدٍ غير مسجَّل
   * يقول «هذا البريد غير موجود» بلا أن يكتبها أحد — فالتوقيت يُفشي ما
   * تكتمه الرسالة.
   */
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$ZmFrZXNhbHRmYWtlc2E$0000000000000000000000000000000000000000000';
  /** **والترتيب `(plain, hashed)`** — وعكسُه يُفشل كل دخولٍ صامتًا. */
  const matches = await verifyPassword(input.password, hash).catch(() => false);

  if (user === null || !matches) return { ok: false, reason: 'INVALID_CREDENTIALS' };
  /** ومزوّدٌ أُوقف يُغلق على موظّفيه كلّهم — الحسابُ تابعٌ للمنشأة. */
  if (!user.active || !user.provider.active) return { ok: false, reason: 'INACTIVE' };

  const token = randomBytes(32).toString('base64url');
  await db.providerSession.create({
    data: {
      providerUserId: user.id,
      tokenHash: hashToken(token),
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt: new Date(now.getTime() + PROVIDER_SESSION_HOURS * 3_600_000),
      createdAt: now,
    },
  });

  await db.providerUser.update({ where: { id: user.id }, data: { lastSeenAt: now } });

  return { ok: true, token, user, mustChangePassword: user.mustChangePassword };
}

/** الجلسةُ صفٌّ يُقرأ، فانتهاؤها وإبطالُها يقعان فعلًا لا شكلًا. */
export async function resolveProviderSession(
  token: string,
  now: Date = new Date(),
): Promise<ProviderUser | null> {
  const session = await db.providerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { provider: { select: { active: true } } } } },
  });

  if (session === null) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (!session.user.active || !session.user.provider.active) return null;

  return session.user;
}

export async function revokeProviderSession(
  token: string,
  now: Date = new Date(),
): Promise<void> {
  await db.providerSession
    .update({ where: { tokenHash: hashToken(token) }, data: { revokedAt: now } })
    .catch(() => undefined);
}
