import { db } from '@/lib/db';
import type { TimelineEvent } from './admin-listing-timeline';

/**
 * ═══ تاريخُ الطلب — حدثًا حدثًا ═══
 *
 * صفحةُ الطلب كانت **لفيفةً واحدة** فيها كلُّ شيء: المراحل والمبالغ
 * والضمان والمدفوعات والنزاع والمستندات في عمودٍ واحد طوله ٤٦١ سطرًا.
 * ومن يحقّق في «لماذا تأخّر هذا الطلب؟» يقرأ اللفيفة كلَّها ليُركّب
 * التسلسل في رأسه — **والتسلسل هو الجواب**.
 *
 * و`OrderEvent` وحده لا يكفي: الدفعة تتغيّر حالتُها في `PaymentEvent`،
 * والضمان يُحجز ويُفرَج في `Escrow` بحقلين، والفاتورة تُصدَر في
 * `TaxInvoice`، والنزاع في `Dispute`. وكلُّها تقع **بين** أحداث الطلب
 * لا بعدها.
 *
 * **وما لا مصدر له لا يُخترَع**: لا «اتّصل المشتري» ما دام لا سجلَّ
 * للاتّصالات.
 */
export async function orderTimeline(ref: string): Promise<TimelineEvent[]> {
  const order = await db.order.findUnique({
    where: { ref },
    select: {
      id: true,
      ref: true,
      createdAt: true,
      source: true,
      paymentDueAt: true,
      transferAppointmentAt: true,
      transferDeadlineAt: true,
      buyer: { select: { name: true, phone: true } },
      seller: { select: { name: true, phone: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true, toStage: true, actorType: true },
      },
      escrow: { select: { status: true, amount: true, heldAt: true, releasedAt: true } },
      payments: {
        orderBy: { createdAt: 'asc' },
        select: {
          amount: true,
          purpose: true,
          createdAt: true,
          events: {
            orderBy: { createdAt: 'asc' },
            select: { type: true, toStatus: true, createdAt: true, source: true },
          },
        },
      },
      taxInvoices: {
        orderBy: { issuedAt: 'asc' },
        select: { number: true, issuedAt: true, ruleSupplyType: true },
      },
      disputes: {
        orderBy: { openedAt: 'asc' },
        select: { id: true, openedAt: true, resolvedAt: true, reason: true, resolution: true },
      },
    },
  });

  if (order === null) return [];

  const events: TimelineEvent[] = [];
  const add = (event: TimelineEvent): void => {
    events.push(event);
  };

  const buyer = order.buyer.name ?? order.buyer.phone;

  /* ① إنشاء الطلب — ومصدرُه يقول كيف وصل */
  add({
    at: order.createdAt.toISOString(),
    kind: 'order.created',
    detail: order.source,
    actor: buyer,
    tone: 'accent',
    href: null,
  });

  /* ② أحداث الطلب نفسه */
  for (const event of order.events) {
    // الإنشاء مذكورٌ أعلاه — ولا يُكرَّر سطرُه
    if (event.type === 'order.created') continue;
    add({
      at: event.createdAt.toISOString(),
      kind: event.type,
      detail: event.toStage,
      actor: event.actorType === 'system' ? null : event.actorType,
      tone:
        event.type.startsWith('dispute') || event.type === 'invoice.blocked'
          ? 'warn'
          : event.toStage === 'DONE'
            ? 'accent'
            : 'neutral',
      href: null,
    });
  }

  /* ③ الدفعات وأحداثها — والحالةُ تتغيّر بين أحداث الطلب لا بعدها */
  for (const payment of order.payments) {
    for (const event of payment.events) {
      add({
        at: event.createdAt.toISOString(),
        kind: `payment.${event.toStatus}`,
        detail: payment.amount.toString(),
        actor: event.source === 'system' ? null : event.source,
        tone:
          event.toStatus === 'FAILED'
            ? 'danger'
            : event.toStatus === 'SETTLED' || event.toStatus === 'HELD'
              ? 'accent'
              : 'neutral',
        href: null,
      });
    }
  }

  /**
   * ④ الضمان — **حقلان لا جدول أحداث**.
   *
   * `Escrow` يحمل `heldAt` و`releasedAt`، فالحدثان يُشتقّان منهما.
   * وغيابُ `releasedAt` يعني أن المال ما زال محجوزًا — **ولا يُخترَع
   * له سطرُ إفراج**.
   */
  if (order.escrow !== null) {
    if (order.escrow.heldAt !== null) {
      add({
        at: order.escrow.heldAt.toISOString(),
        kind: 'escrow.held',
        detail: order.escrow.amount.toString(),
        actor: null,
        tone: 'accent',
        href: null,
      });
    }
    if (order.escrow.releasedAt !== null) {
      add({
        at: order.escrow.releasedAt.toISOString(),
        kind: 'escrow.released',
        detail: order.escrow.amount.toString(),
        actor: null,
        tone: 'accent',
        href: null,
      });
    }
  }

  /* ⑤ الفواتير الضريبية */
  for (const invoice of order.taxInvoices) {
    add({
      at: invoice.issuedAt.toISOString(),
      kind: 'invoice.issued',
      detail: invoice.number,
      actor: null,
      tone: 'neutral',
      href: null,
    });
  }

  /* ⑥ النزاعات */
  for (const dispute of order.disputes) {
    add({
      at: dispute.openedAt.toISOString(),
      kind: 'dispute.opened',
      detail: dispute.reason,
      actor: null,
      tone: 'danger',
      href: `/admin/disputes/${encodeURIComponent(dispute.id)}`,
    });
    if (dispute.resolvedAt !== null) {
      add({
        at: dispute.resolvedAt.toISOString(),
        kind: 'dispute.resolved',
        detail: dispute.resolution,
        actor: null,
        tone: 'accent',
        href: `/admin/disputes/${encodeURIComponent(dispute.id)}`,
      });
    }
  }

  /* ⑦ أثر الأدمن على هذا الطلب */
  const audit = await db.auditLog.findMany({
    where: { entity: 'Order', entityId: { in: [order.id, ref] } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true, actorType: true },
  });

  for (const row of audit) {
    add({
      at: row.createdAt.toISOString(),
      kind: row.action,
      detail: null,
      actor: row.actorType === 'system' ? null : 'admin',
      tone: 'neutral',
      href: null,
    });
  }

  /** الأقدم أوّلًا — «كيف وصل إلى هنا» سؤالٌ تسلسليّ. */
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
