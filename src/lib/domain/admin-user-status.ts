import { db } from '@/lib/db';
import type { UserStatus } from '@/generated/prisma/enums';

/**
 * ═══ إيقافُ حساب — والقفلُ كان بلا مفتاح ═══
 *
 * الحارس مبنيٌّ منذ اليوم الأول: `auth.ts` يرفض دخول `SUSPENDED`
 * و`BANNED`، ومسارُ الكلمة يردّ ٤٠٣ على كل ما ليس `ACTIVE`. ولوحةُ
 * الأدمن تعرض شريحتَي «موقوفون» و«محظورون» بعدّاديهما.
 *
 * **ولا سطر في المنتج كلّه يكتب `User.status`.** فالعدّادان صفرٌ
 * أبدًا، والشريحتان فارغتان أبدًا، و**بائعٌ محتالٌ لا يُوقفه أحد** —
 * يُبلَّغ عنه فيُفتح بلاغٌ ويُقرأ ثمّ لا شيء. وثالثةَ عشرةَ مرّةً
 * لنمط «قيمةٌ في المخطّط بلا كاتب».
 *
 * ═══ والسياسة للمالك والقدرةُ لنا ═══
 *
 * **متى** يُوقَف حسابٌ قرارُ تشغيلٍ لا يُبتّ هنا. وأنّ المنصّة
 * **تستطيع** إيقافه مكتوبٌ في المخطّط وفي الحارس وفي الشاشة — فهذا
 * إكمالُ ما أُعلن لا ابتداعُ قاعدة.
 *
 * ═══ ودرجتان لا واحدة ═══
 *
 * | الحال | ما تعنيه |
 * |---|---|
 * | `SUSPENDED` | إيقافٌ مؤقّت — يُرفع، وسببُه يُقرأ |
 * | `BANNED` | حظرٌ دائم — لا يُرفع إلّا بقرارٍ ثانٍ صريح |
 *
 * **والسبب إلزاميّ في الحالين**: سجلٌّ يقول «أُوقف» بلا سببٍ يُقرأ
 * بعد شهورٍ ولا يُعرف أكان احتيالًا أم خطأً، وهو أوّل ما يُسأل عنه
 * حين يعترض صاحبُه.
 */

export type UserStatusFailure =
  | 'USER_NOT_FOUND'
  | 'REASON_REQUIRED'
  | 'ALREADY_IN_STATUS'
  | 'LIVE_OBLIGATIONS';

export type UserStatusResult =
  | { ok: true; status: UserStatus }
  | { ok: false; reason: UserStatusFailure; blocking?: { orders: number; escrow: number } };

/** السبب يُقرأ بعد شهور — فجملةٌ لا كلمة. */
export const MIN_STATUS_REASON = 10;

const BLOCKABLE: readonly UserStatus[] = ['SUSPENDED', 'BANNED'];

export async function setUserStatus(
  input: {
    userId: string;
    status: UserStatus;
    reason: string;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<UserStatusResult> {
  const reason = input.reason.trim();
  if (reason.length < MIN_STATUS_REASON) return { ok: false, reason: 'REASON_REQUIRED' };

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true, name: true },
  });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };
  if (user.status === input.status) return { ok: false, reason: 'ALREADY_IN_STATUS' };

  /**
   * ═══ ولا يُحظَر من عليه مالٌ جارٍ ═══
   *
   * الحظرُ يقطع الجلسة، فمن له طلبٌ حيٌّ أو ضمانٌ محجوز يُترك بلا
   * بابٍ يُكمل منه ولا يُلغي: مالُه عند البوّابة ومركبتُه محجوزة،
   * ولا يستطيع الدخول ليفعل شيئًا. **فالصفقة تُحسم أوّلًا ثم يُحظَر.**
   *
   * والإيقاف المؤقّت يُجيزه: هو ما يُستعمل أثناء التحقيق، ويُرفع.
   */
  if (input.status === 'BANNED') {
    const [orders, escrow] = await Promise.all([
      db.order.count({
        where: { status: 'ACTIVE', OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      }),
      db.escrow.count({
        where: {
          status: 'HELD',
          order: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
        },
      }),
    ]);
    if (orders > 0 || escrow > 0) {
      return { ok: false, reason: 'LIVE_OBLIGATIONS', blocking: { orders, escrow } };
    }
  }

  await db.user.update({ where: { id: user.id }, data: { status: input.status } });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'User',
      entityId: user.id,
      action: `user.${input.status.toLowerCase()}`,
      before: { status: user.status },
      after: { status: input.status, reason },
      ip: input.ip,
      createdAt: now,
    },
  });

  /**
   * ═══ ومن أُوقف يُخبَر ولا يُترك يكتشف ═══
   *
   * الحارس يردّه عند الدخول برسالةٍ عامّة، فيظنّه عطلًا ويعيد
   * المحاولة. والإشعار يصل جرسَه فيقرؤه إن فتح حسابه، ويبقى في
   * سجلّه حين يعترض.
   *
   * **وبعد الكتابة لا معها**: الإخطار أثرٌ لا شرط، وفشلُ البثّ لا
   * يُبقي حسابًا محتالًا مفتوحًا.
   */
  const { notify } = await import('./notifications');
  await notify({
    userId: user.id,
    templateKey: input.status === 'ACTIVE' ? 'account.restored' : 'account.blocked',
    priority: 'critical',
    payload: { reason },
    entityType: 'User',
    entityId: user.id,
  }).catch(() => undefined);

  return { ok: true, status: input.status };
}

/** الحالات التي يملك المشغّل الانتقال إليها — والشاشة مرآتُها. */
export const USER_STATUS_CHOICES: readonly UserStatus[] = ['ACTIVE', ...BLOCKABLE];
