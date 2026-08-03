import { db } from '@/lib/db';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * القاعدتان الزمنيّتان على الطلب — ولا تتقاطعان.
 *
 * ١· **سقف النقل** — الدفع + ٧ أيام. لم يكتمل ⇒ استرجاع تلقائيّ للمشتري.
 * ٢· **نافذة الاسترجاع** — تأكيد النقل + ٧ أيام. انقضت بلا طلب ⇒ إفراج للبائع.
 *
 * الأولى تحمي المشتري من طلبٍ **لا يتقدّم**، والثانية ممّا **اكتشفه بعد
 * الاستلام**. ولا تتقاطعان لأن الثانية لا تبدأ إلا بحدثٍ يُنهي الأولى.
 *
 * ومرحلة النقل نفسها **بلا موعد مجدول**: تتقدّم بتأكيد الإجراء، والسقف
 * أعلاه حدّها الوحيد. ولو كان ثمّة موعد لكان السقف تابعًا له — وما دام
 * لا موعد، فالسقف قاعدةٌ مستقلّة تُحسب من الدفع.
 */

export const TRANSFER_DEADLINE_DAYS = 7;
export const RETURN_WINDOW_DAYS = 7;
/** تمديدٌ **واحد** لا أكثر، بسبب مكتوب ومسجَّل. */
export const TRANSFER_EXTENSION_DAYS = 7;

const DAY_MS = 86_400_000;

export function transferDeadlineFrom(paidAt: Date): Date {
  return new Date(paidAt.getTime() + TRANSFER_DEADLINE_DAYS * DAY_MS);
}

export function returnWindowFrom(transferConfirmedAt: Date): Date {
  return new Date(transferConfirmedAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
}

export type SettleGuard =
  | { allowed: true }
  | { allowed: false; reason: 'NOT_TRANSFERRED' | 'RETURN_WINDOW_OPEN' | 'DISPUTED'; until?: string };

/**
 * ═══ لا إفراج للبائع قبل انقضاء النافذة ═══
 *
 * وهي **جزء من عمر الحجز لا ملحق به**: المشتري استلم المركبة ولم يستقرّ
 * حقّه بعد، فالمال لا يزال ملكه في المعنى.
 *
 * والفحص هنا لا في الشاشة: زرٌّ معطَّل يُلتفّ عليه بطلب واحد، ومبلغٌ
 * أُفرج عنه قبل أوانه لا يعود.
 */
export function canSettle(
  order: {
    stage: string;
    status: string;
    returnWindowEndsAt: Date | null;
  },
  now: Date = new Date(),
): SettleGuard {
  if (order.status === 'DISPUTED') return { allowed: false, reason: 'DISPUTED' };
  // النافذة لا تبدأ إلا بتأكيد النقل — وغيابها يعني أنه لم يُؤكَّد
  if (order.returnWindowEndsAt === null) return { allowed: false, reason: 'NOT_TRANSFERRED' };
  if (order.returnWindowEndsAt.getTime() > now.getTime()) {
    return {
      allowed: false,
      reason: 'RETURN_WINDOW_OPEN',
      until: order.returnWindowEndsAt.toISOString(),
    };
  }
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

/** طلبات انقضت نافذتها بلا نزاع — **مرشَّحة للإفراج التلقائي للبائع**. */
export async function settleableOrders(now: Date = new Date()): Promise<string[]> {
  const orders = await db.order.findMany({
    where: {
      returnWindowEndsAt: { lt: now },
      // النزاع يجمّد — ولو انقضت النافذة
      status: { not: 'DISPUTED' },
      escrow: { status: 'HELD' },
    },
    select: { ref: true },
  });
  return orders.map((order) => order.ref);
}
