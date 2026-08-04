import type { IdentityStatus } from '@/generated/prisma/enums';
import type { db } from '@/lib/db';

/**
 * ═══ حالة التوثيق — تُكتب من هنا وحدها ═══
 *
 * الحقيقة في `identityStatus`، و`idVerified` مشتقٌّ منها ويقرؤه كثيرون
 * (`seller.ts` · `public-api.ts` · `account.ts` · حارس الشراء). **وحقلان
 * لحقيقةٍ واحدة يتباعدان أوّل كتابةٍ تنسى أحدهما** — فيصير المستخدم
 * موثَّقًا في شاشةٍ ومنتظرًا في أخرى.
 *
 * فالكتابة هنا تضبط الاثنين معًا، ولا يُكتب `idVerified` في غيرها.
 */

type Writer = Pick<typeof db, 'user'>;

/** قُدّمت الهوية وتنتظر — والنفاذ الوطنيّ يمرّ آليًّا إلى `VERIFIED`. */
export async function submitIdentity(
  writer: Writer,
  userId: string,
  method: 'manual' | 'nafath' | 'commercial_register',
  now: Date = new Date(),
): Promise<void> {
  const auto = method === 'nafath';
  await writer.user.update({
    where: { id: userId },
    data: {
      identityStatus: auto ? 'VERIFIED' : 'PENDING',
      identitySubmittedAt: now,
      identityMethod: method,
      identityNote: null,
      idVerified: auto,
      ...(auto ? { idVerifiedAt: now } : {}),
    },
  });
}

/** وُثّق — و`idVerified` يتبعها في الكتابة نفسها. */
export async function verifyIdentity(
  writer: Writer,
  userId: string,
  adminId: string,
  now: Date = new Date(),
): Promise<void> {
  await writer.user.update({
    where: { id: userId },
    data: {
      identityStatus: 'VERIFIED',
      identityReviewedBy: adminId,
      identityNote: null,
      idVerified: true,
      idVerifiedAt: now,
    },
  });
}

/**
 * طُلب توضيح أو رُفض — **بسببٍ يقرؤه صاحبه**.
 *
 * ورفضٌ بلا سبب يجعله يعيد رفع الصورة نفسها فيُرفض ثانيةً، ودورةٌ لا
 * تنتهي — وهي الدورة نفسها التي عولجت في إرجاع الإعلان.
 */
export async function holdIdentity(
  writer: Writer,
  userId: string,
  outcome: 'CLARIFICATION' | 'REJECTED',
  stamp: { note: string; adminId: string },
): Promise<void> {
  await writer.user.update({
    where: { id: userId },
    data: {
      identityStatus: outcome,
      identityNote: stamp.note,
      identityReviewedBy: stamp.adminId,
      // التوثيق يُسحب — وحسابٌ مرفوض لا يبقى موثَّقًا
      idVerified: false,
      idVerifiedAt: null,
    },
  });
}

/** ترتيب العرض — والمنتظر أوّلًا لأنه ما يحتاج قرارًا. */
export const IDENTITY_QUEUE: readonly IdentityStatus[] = ['PENDING', 'CLARIFICATION'];
