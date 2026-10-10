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

/**
 * ═══ التوثيق التجريبيّ — حتى يُربط نفاذ ═══
 *
 * المستخدم يُدخل رقم هويته فيُقبل ببنيته ويُوثَّق حسابه مباشرةً
 * (قرارٌ موثَّق: البديل حسابٌ لا يشتري ولا يبيع أبدًا).
 *
 * **وكان يُكتب في `profile-edit` بالراية وحدها** — فيصير ٥٣ مستخدمًا
 * موثَّقين يشترون، وشاشةُ توثيق الهوية تقول «موثّق ٠» وطابورُها فارغ،
 * ولا يمرّ على أحدهم إنسان. وهو بعينه ما حذّر منه رأس هذا الملفّ.
 *
 * فالكتابة هنا: الحالةُ والراية والطريقة والرقم المشفَّر في تحديثٍ
 * واحد. ويوم يُربط نفاذ تصير `submitIdentity('nafath')` وتُحذف هذه.
 */
export async function recordTrialVerification(
  writer: Writer,
  userId: string,
  input: { name: string; nationalIdEncrypted: string },
  now: Date = new Date(),
): Promise<void> {
  await writer.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      nationalIdEncrypted: input.nationalIdEncrypted,
      identityStatus: 'VERIFIED',
      identityMethod: 'manual',
      identitySubmittedAt: now,
      identityNote: null,
      idVerified: true,
      idVerifiedAt: now,
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
