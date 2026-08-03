import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * القسم ٦ — **كل `POST` يقبل `Idempotency-Key`، وهو إلزامي للدفع**.
 *
 * الشبكة تُعيد الطلب بلا أن يعرف المستخدم، والمتصفّح يُعيده بضغطة
 * تحديث. وبلا هذا الجدول تُخصم البطاقة مرّتين — وهو أسوأ خطأ ممكن في
 * منتَج يبيع سيارات.
 *
 * وهو مستقلّ عن الدفع عمدًا: العروض والمزايدات والطلبات تحتاجه أيضًا.
 */

/** بصمة الجسم — نفس المفتاح بجسم مختلف خطأٌ لا إعادة. */
export function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export type IdempotencyHit =
  | { kind: 'fresh' }
  | { kind: 'replay'; response: unknown; status: number }
  | { kind: 'conflict' };

export async function checkIdempotency(
  key: string,
  scope: string,
  body: unknown,
): Promise<IdempotencyHit> {
  const existing = await db.idempotencyKey.findUnique({ where: { key } });
  if (existing === null) return { kind: 'fresh' };

  // نفس المفتاح بجسم مختلف: خطأ في العميل لا إعادة — والإعادة الصامتة تُخفيه
  if (existing.bodyHash !== hashBody(body) || existing.scope !== scope) {
    return { kind: 'conflict' };
  }
  return { kind: 'replay', response: existing.response, status: existing.status };
}

export async function rememberIdempotency(
  key: string,
  scope: string,
  body: unknown,
  response: Prisma.InputJsonValue,
  status: number,
  now: Date = new Date(),
): Promise<void> {
  await db.idempotencyKey
    .create({ data: { key, scope, bodyHash: hashBody(body), response, status, createdAt: now } })
    // سباقٌ بين طلبين متزامنين: الأوّل كتب، والثاني يقرأ ما كتبه
    .catch(() => undefined);
}
