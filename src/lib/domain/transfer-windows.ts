import { db } from '@/lib/db';
import { DEADLINE_DEFAULTS, deadline } from './deadlines';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * ═══ سقف النقل — القاعدة الزمنيّة الوحيدة على الطلب ═══
 *
 * الدفع + ٧ أيام. لم يكتمل النقل ⇒ استرجاع تلقائيّ للمشتري. وهي تحمي
 * المشتري من طلبٍ **لا يتقدّم**.
 *
 * ومرحلة النقل نفسها **بلا موعد مجدول**: تتقدّم بتأكيد الإجراء، والسقف
 * أعلاه حدّها الوحيد.
 *
 * ═══ ونافذة الاسترجاع أُلغيت — قرار المصمّم ═══
 *
 * كانت تأكيد النقل + ٧ أيام، ثم يُفرَج للبائع. **والإفراج الآن يتبع
 * تأكيد النقل مباشرةً**: حين تصير المركبة باسم المشتري في المرور، لم
 * يبقَ ما يُحتجَز المال لأجله — واحتجازُه أسبوعًا بعدها تأخيرٌ للبائع
 * بلا ما يقابله.
 *
 * ويترتّب عليها أن **النزاع يُغلق عند تأكيد النقل** (`DISPUTABLE_STAGES`
 * في `disputes.ts`): بعد الإفراج لا مال يُجمَّد، ونزاعٌ يُفتح حينها
 * وعدٌ لا مصدر له. فالفحص قبل التأكيد لا بعده.
 */

/** الافتراضيّ — والسارية من إعداد الأدمن. */
export const TRANSFER_DEADLINE_DAYS = DEADLINE_DEFAULTS.transferDeadlineDays;
/** تمديدٌ **واحد** لا أكثر، بسبب مكتوب ومسجَّل. */
export const TRANSFER_EXTENSION_DAYS = DEADLINE_DEFAULTS.transferExtensionDays;

const DAY_MS = 86_400_000;

/**
 * **تُقرأ من الإعداد** — والمتزامنة أدناه تبقى للحساب على الافتراضيّ
 * (العرض والاختبار)، فما يُخزَّن في صفٍّ يمرّ بهذه.
 */
export async function transferDeadlineFor(paidAt: Date): Promise<Date> {
  return new Date(paidAt.getTime() + (await deadline('transferDeadlineDays')) * DAY_MS);
}

export function transferDeadlineFrom(paidAt: Date): Date {
  return new Date(paidAt.getTime() + TRANSFER_DEADLINE_DAYS * DAY_MS);
}

export type SettleGuard =
  | { allowed: true }
  | { allowed: false; reason: 'NOT_TRANSFERRED' | 'DISPUTED' };

/**
 * ═══ الإفراج يتبع تأكيد نقل الملكية ═══
 *
 * **وشرطان لا ثلاثة**: أن تُنقل الملكية، وألّا يكون ثمّة نزاع مفتوح.
 * ولا انتظار بعدهما — قرار المصمّم: حين تصير المركبة باسم المشتري في
 * المرور فقد وقع البيع، ولا شيء يُحتجَز المال لأجله.
 *
 * **وبلوغُ `DONE` هو تأكيد النقل نفسه** — لا حقلٌ زمنيّ يُشتقّ منه.
 * وكان الشرط `returnWindowEndsAt !== null`، فيُستدلّ على واقعةٍ بأثرٍ
 * جانبيّ لها؛ فحقلٌ لم يُكتب لسببٍ آخر يجعل طلبًا مؤكَّدًا يُقرأ غير
 * مؤكَّد.
 *
 * والفحص هنا لا في الشاشة: زرٌّ معطَّل يُلتفّ عليه بطلب واحد، ومبلغٌ
 * أُفرج عنه قبل أوانه لا يعود.
 */
export function canSettle(order: { stage: string; status: string }): SettleGuard {
  if (order.status === 'DISPUTED') return { allowed: false, reason: 'DISPUTED' };
  if (order.stage !== 'DONE') return { allowed: false, reason: 'NOT_TRANSFERRED' };
  return { allowed: true };
}

export type ExtendResult =
  | { ok: true; deadlineAt: string }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'NO_DEADLINE' | 'ALREADY_EXTENDED' | 'REASON_REQUIRED' };

/**
 * تمديد سقف النقل — **مرّة واحدة بسبب مكتوب**.
 *
 * وتمديدٌ بلا سقفٍ لعدده يجعل القاعدة زينة: كل طلبٍ عالق يُمدَّد حتى
 * يُنسى. والسبب مكتوبٌ لأن التمديد يؤخّر مال المشتري، فمن يؤخّره يُسمّي
 * لماذا.
 */
export async function extendTransferDeadline(
  admin: AdminUser,
  orderRef: string,
  reason: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<ExtendResult> {
  if (reason.trim().length < 10) return { ok: false, reason: 'REASON_REQUIRED' };

  const order = await db.order.findUnique({ where: { ref: orderRef } });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.transferDeadlineAt === null) return { ok: false, reason: 'NO_DEADLINE' };
  if (order.transferDeadlineExtendedAt !== null) return { ok: false, reason: 'ALREADY_EXTENDED' };

  const deadlineAt = new Date(
    order.transferDeadlineAt.getTime() + TRANSFER_EXTENSION_DAYS * DAY_MS,
  );

  await db.order.update({
    where: { id: order.id },
    data: {
      transferDeadlineAt: deadlineAt,
      transferDeadlineExtendedAt: now,
      transferExtensionReason: reason.trim(),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      actorType: 'admin',
      entity: 'Order',
      entityId: order.ref,
      action: 'order.transfer_deadline_extended',
      before: { transferDeadlineAt: order.transferDeadlineAt.toISOString() },
      after: { transferDeadlineAt: deadlineAt.toISOString(), reason: reason.trim() },
      ip,
      createdAt: now,
    },
  });

  return { ok: true, deadlineAt: deadlineAt.toISOString() };
}

export type OverdueTransfer = {
  ref: string;
  deadlineAt: string;
  hoursLate: number;
  extended: boolean;
};

/**
 * طلبات تجاوزت سقف النقل ولم يكتمل — **مرشَّحة للاسترجاع التلقائي**.
 *
 * ولا تُلغى هنا: الإلغاء استدعاءُ `cancel` على البوابة، والدالّة تُعدّ
 * القائمة ولا تلمس مالًا. فالفصل مقصود — من يقرأ لا يكتب.
 */
export async function overdueTransfers(now: Date = new Date()): Promise<OverdueTransfer[]> {
  const orders = await db.order.findMany({
    where: {
      stage: 'TRANSFER',
      status: 'ACTIVE',
      transferDeadlineAt: { lt: now },
    },
    select: { ref: true, transferDeadlineAt: true, transferDeadlineExtendedAt: true },
  });

  return orders
    .filter((order) => order.transferDeadlineAt !== null)
    .map((order) => ({
      ref: order.ref,
      deadlineAt: (order.transferDeadlineAt as Date).toISOString(),
      hoursLate: Math.floor(
        (now.getTime() - (order.transferDeadlineAt as Date).getTime()) / 3_600_000,
      ),
      extended: order.transferDeadlineExtendedAt !== null,
    }))
    .sort((a, b) => b.hoursLate - a.hoursLate);
}

/**
 * طلبات نُقلت ملكيتها ومالُها ما زال محجوزًا — **مرشَّحة للإفراج**.
 *
 * وكان الشرط انقضاء نافذة الاسترجاع؛ صار **بلوغ `DONE`** بعد إلغائها.
 *
 * ═══ ولماذا تبقى هذه الدالّة بعد أن صار الإفراج فوريًّا ═══
 *
 * لأن الفوريّ قد يتعثّر: بوابةٌ لا تردّ، أو حاويةٌ سقطت بين تأكيد
 * النقل ونداء المزوّد. فالوظيفة الدورية **شبكة أمان لا مسارًا ثانيًا**
 * — تلتقط ما لم يُفرَج، ولولاها بقي مال البائع محجوزًا بلا ما يقول
 * إن النداء لم يقع.
 *
 * **وهي تُرجع القائمة ولا تُفرج**: دالّةٌ تمرّ على مجموعةٍ تلمس مالًا
 * لا تكتب، والكتابة استدعاءٌ مفرد صريح لكل عنصر.
 */
export async function settleableOrders(): Promise<string[]> {
  const orders = await db.order.findMany({
    where: {
      stage: 'DONE',
      // النزاع يجمّد — ولو نُقلت الملكية
      status: { not: 'DISPUTED' },
      payments: { some: { status: 'HELD' } },
    },
    select: { ref: true },
  });
  return orders.map((order) => order.ref);
}
