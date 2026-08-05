import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  Field,
  TimelineRow,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { TRANSFER_EXTENSION_DAYS } from '@/lib/domain/transfer-windows';
import { ExtendTransfer } from './ExtendTransfer';
import { adminOrderDetail } from '@/lib/domain/admin-order-detail';
import { LEDGER_ACCOUNT_LABEL } from '@/lib/labels/admin';
import { STAGE_LABEL } from '@/lib/labels/charts';
import { toArabicDigits } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

const SOURCE_LABEL: Record<string, string> = {
  DIRECT: 'بيع مباشر',
  OFFER: 'قبول عرض',
  AUCTION: 'رسوّ مزاد',
  BUY_NOW: 'اشترِ الآن',
};

const STATUS_TONE: Record<string, 'accent' | 'warn' | 'danger' | 'neutral'> = {
  ACTIVE: 'accent',
  COMPLETED: 'accent',
  CANCELLED: 'danger',
};

const EVENT_LABEL: Record<string, string> = {
  'order.created': 'أُنشئ الطلب',
  'order.stage_advanced': 'تقدّمت المرحلة',
  'order.cancelled': 'أُلغي',
  'escrow.held': 'حُجز المبلغ',
  'escrow.released': 'أُفرج عن المبلغ',
  'payment.captured': 'حُصّل الدفع',
  'dispute.opened': 'فُتح نزاع',
  'dispute.resolved': 'حُسم النزاع',
};

const DOCUMENT_LABEL: Record<string, string> = {
  tax_invoice: 'فاتورة ضريبية',
  settlement: 'كشف تسوية',
  agreement: 'عقد بيع',
};

/**
 * تفاصيل الطلب — الوجهة التي كانت قائمة الطلبات تعرض صفوفها ولا تفتحها.
 *
 * **من رأى طلبًا متعثّرًا لم يكن يستطيع أن يعرف لماذا**: لا مبالغه ولا
 * قيوده ولا سجلّ مراحله. والعدد وحده لا يُتصرَّف فيه.
 *
 * ═══ والقيود تُعرض بجانب المبالغ ═══
 *
 * رقمٌ في بطاقةٍ يُتأمَّل، وقيدٌ بطرفيه يُراجَع. فمن يشكّ في مبلغٍ يرى
 * من أين جاء في الشاشة نفسها لا في دفترٍ آخر.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  // المرجع يصل مُرمَّزًا من Next — والمقارنة بنصٍّ مفكوك تفشل صامتةً
  const { ref } = await params;
  const order = await adminOrderDetail(decodeURIComponent(ref));
  if (order === null) notFound();

  const canFinance = can(admin.role, 'finance.view');
  // التمديد تصرّفٌ في مسار الطلب لا قراءةٌ له — والفحص هنا وفي المسار
  const canStage = canWrite(admin.role, 'orders.changeStage');

  return (
    <AdminShell title="تفاصيل الطلب" activeHref="/admin/orders" admin={admin}>
      <DetailHeader
        backHref="/admin/orders"
        backLabel="الطلبات"
        reference={order.ref}
        title={`${order.listing.title} — ${order.listing.city}`}
        badges={
          <>
            <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status}</Badge>
            <Badge tone="neutral">{STAGE_LABEL[order.stage] ?? order.stage}</Badge>
            <Badge tone="neutral">{SOURCE_LABEL[order.source] ?? order.source}</Badge>
            {/*
              **المهلة والزمن معًا** — لا الحالة وحدها. ومرحلةٌ انقضت
              مهلتُها والوظيفة الدورية لم تمرّ تُعرض سليمةً وهي متأخّرة.
            */}
            {order.overdue ? <Badge tone="danger">تجاوز المهلة</Badge> : null}
            {order.dispute === null ? null : <Badge tone="danger">نزاع مفتوح</Badge>}
          </>
        }
      />

      <DetailColumns
        main={
          <>
            <DetailCard title="المال" note="المتّفق عليه والنهائيّ والرسوم">
              <Field
                label="السعر المتّفق"
                value={<Money amount={Number(order.money.agreedPrice)} />}
                strong
              />
              {order.money.settlementAmount === null ? null : (
                // تسويةٌ جزئية بعد نزاع — والمتّفق يبقى للتدقيق
                <Field
                  label="المبلغ النهائيّ بعد التسوية"
                  value={<Money amount={Number(order.money.settlementAmount)} />}
                  strong
                />
              )}
              <Field
                label="عمولة المشتري"
                value={<Money amount={Number(order.money.buyerCommission)} />}
              />
              <Field
                label="عمولة البائع"
                value={<Money amount={Number(order.money.sellerCommission)} />}
              />
              <Field
                label="رسم النقل الحكوميّ"
                value={<Money amount={Number(order.money.transferFee)} />}
              />
              <Field
                label="رسمنا الإداريّ"
                value={<Money amount={Number(order.money.transferAdminFee)} />}
              />
              <Field
                label={`رسوم المعالجة — على ${order.money.processingFeeBearer === 'BUYER' ? 'المشتري' : 'البائع'}`}
                value={<Money amount={Number(order.money.processingFee)} />}
              />
              <Field
                label="الضريبة على عمولتنا ورسومنا"
                value={<Money amount={Number(order.money.vatAmount)} />}
              />
              <Field
                label="إجمالي ما يدفعه المشتري"
                value={<Money amount={Number(order.money.totalAmount)} />}
                strong
              />
              <Field
                label="صافي ما يصل البائع"
                value={<Money amount={Number(order.money.netToSeller)} />}
                strong
              />
              <p className="mt-3 text-3xs leading-loose opacity-50">
                صافي البائع من القاعدة نفسها التي يقرؤها كشف التسوية وصفحة أرباحه — ولا
                يُحسب هنا مرّةً ثانية.
              </p>
            </DetailCard>

            {canFinance ? (
              <DetailCard
                title="حركة الحسابات"
                note={
                  order.ledger.length === 0
                    ? 'لا قيد بعد'
                    : `قيود (${toArabicDigits(String(order.ledger.length))})`
                }
              >
                {order.ledger.length === 0 ? (
                  <p className="text-2xs opacity-50">
                    لا قيد على هذا الطلب — والقيد يُكتب عند حجز المبلغ لا عند إنشاء الطلب.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-2xs">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="p-2 text-start font-bold">الحدث</th>
                          <th className="p-2 text-start font-bold">الحساب</th>
                          <th className="p-2 text-start font-bold">الاتّجاه</th>
                          <th className="p-2 text-start font-bold">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.ledger.map((entry) => (
                          <tr key={entry.id} className="border-b border-line last:border-0">
                            <td dir="ltr" className="font-num p-2 text-start opacity-70">
                              {entry.event}
                            </td>
                            <td className="p-2 opacity-70">
                              {LEDGER_ACCOUNT_LABEL[entry.account] ?? entry.account}
                            </td>
                            <td className="p-2">
                              <Badge tone={entry.direction === 'DEBIT' ? 'neutral' : 'accent'}>
                                {entry.direction === 'DEBIT' ? 'مدين (له)' : 'دائن (عليه)'}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <ArabicNumber value={Number(entry.amount)} decimals={2} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DetailCard>
            ) : null}

            <DetailCard
              title="السجلّ"
              note={`آخر حدث (${toArabicDigits(String(order.timeline.length))})`}
            >
              {order.timeline.length === 0 ? (
                <p className="text-2xs opacity-50">لا أحداث مسجّلة.</p>
              ) : (
                <div className="flex flex-col">
                  {order.timeline.map((event) => (
                    <TimelineRow
                      key={event.id}
                      title={EVENT_LABEL[event.type] ?? event.type}
                      note={
                        event.toStage === null
                          ? `بفعل ${event.actorType}`
                          : `${event.fromStage === null ? '' : `${STAGE_LABEL[event.fromStage] ?? event.fromStage} ← `}${STAGE_LABEL[event.toStage] ?? event.toStage} · بفعل ${event.actorType}`
                      }
                      at={riyadh.format(new Date(event.at))}
                      tone={event.type.startsWith('dispute') ? 'danger' : 'accent'}
                    />
                  ))}
                </div>
              )}
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="الأطراف">
              <PartyBlock label="المشتري" party={order.buyer} />
              <div className="h-4" />
              <PartyBlock label="البائع" party={order.seller} />
            </DetailCard>

            <DetailCard title="المركبة والإعلان">
              <Field label="الإعلان" value={order.listing.ref} ltr />
              <Field label="المركبة" value={order.listing.title} />
              <Field label="المدينة" value={order.listing.city} />
              <Field
                label="السعر المعروض"
                value={<Money amount={Number(order.listing.askPrice)} />}
              />
              <Field label="حالة الإعلان" value={order.listing.status} ltr />
              <Link
                href={`/admin/all-listings?q=${encodeURIComponent(order.listing.ref)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                افتح الإعلان
              </Link>
            </DetailCard>

            <DetailCard title="التوقيت">
              <Field label="أُنشئ" value={riyadh.format(new Date(order.createdAt))} />
              <Field
                label="دخل المرحلة"
                value={riyadh.format(new Date(order.stageEnteredAt))}
              />
              {order.dueAt === null ? (
                <Field label="المهلة" value="لا مهلة لهذه المرحلة" />
              ) : (
                <Field
                  label="المهلة"
                  value={
                    <span className={order.overdue ? 'text-danger' : undefined}>
                      {riyadh.format(new Date(order.dueAt))}
                    </span>
                  }
                  strong
                />
              )}
              {order.cancelReason === null ? null : (
                <Field label="سبب الإلغاء" value={order.cancelReason} />
              )}

              {/*
                **التمديد — وكان بلا زرّ.** طلبٌ عالق في المرور لسببٍ خارج
                يدَي الطرفين يمضي إلى الإلغاء التلقائيّ، ولا يملك التشغيلُ
                ما يوقفه به. ولا يُعرض إلّا حيث له معنى: مرحلةُ نقلٍ لها
                سقف.
              */}
              {order.stage !== 'TRANSFER' || order.transferDeadlineAt === null || !canStage ? null : (
                <ExtendTransfer
                  orderRef={order.ref}
                  days={TRANSFER_EXTENSION_DAYS}
                  extendedAt={order.transferExtendedAt}
                  reason={order.transferExtensionReason}
                />
              )}
            </DetailCard>

            {order.escrow === null ? null : (
              <DetailCard title="الضمان">
                <Field label="الحالة" value={order.escrow.status} ltr />
                <Field label="المبلغ" value={<Money amount={Number(order.escrow.amount)} />} strong />
                <Field
                  label="حُجز"
                  value={
                    order.escrow.heldAt === null
                      ? 'لم يُحجز بعد'
                      : riyadh.format(new Date(order.escrow.heldAt))
                  }
                />
                <Field
                  label="أُفرج"
                  value={
                    order.escrow.releasedAt === null
                      ? 'لم يُفرج بعد'
                      : riyadh.format(new Date(order.escrow.releasedAt))
                  }
                />
              </DetailCard>
            )}

            {order.payments.length === 0 ? null : (
              <DetailCard title="الدفعات">
                {order.payments.map((payment) => (
                  <Field
                    key={payment.id}
                    label={`${payment.purpose} · ${payment.status}`}
                    value={<Money amount={Number(payment.amount)} />}
                  />
                ))}
              </DetailCard>
            )}

            {order.documents.length === 0 ? null : (
              <DetailCard title="المستندات">
                {order.documents.map((document) => (
                  <Field
                    key={`${document.kind}-${document.ref}`}
                    label={DOCUMENT_LABEL[document.kind] ?? document.kind}
                    value={document.ref}
                    ltr
                  />
                ))}
              </DetailCard>
            )}

            {order.dispute === null ? null : (
              <DetailCard title="النزاع">
                <Field label="الحالة" value={order.dispute.status} ltr />
                <Field label="السبب" value={order.dispute.reason} />
                <Field label="فُتح" value={riyadh.format(new Date(order.dispute.openedAt))} />
                <Link
                  href="/admin/disputes"
                  className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
                >
                  افتح النزاعات
                </Link>
              </DetailCard>
            )}
          </>
        }
      />
    </AdminShell>
  );
}

function PartyBlock({
  label,
  party,
}: {
  label: string;
  party: {
    name: string;
    phone: string;
    email: string | null;
    idVerified: boolean;
    previousOrders: number;
  };
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2.5 text-3xs font-bold tracking-[0.12em] opacity-45">
        {label}
        {party.idVerified ? <Badge tone="accent">موثَّق</Badge> : <Badge tone="warn">بلا توثيق</Badge>}
      </p>
      <Field label="الاسم" value={party.name} />
      {/* الهاتف يُقارن خانةً بخانة — لاتينيّ معزول */}
      <Field label="الهاتف" value={party.phone} ltr />
      {party.email === null ? null : <Field label="البريد" value={party.email} ltr />}
      {/* سياقٌ لمن يقرّر في نزاع: أوّل صفقةٍ له أم العاشرة */}
      <Field
        label="طلبات سابقة"
        value={toArabicDigits(String(party.previousOrders))}
        ltr
      />
    </div>
  );
}
