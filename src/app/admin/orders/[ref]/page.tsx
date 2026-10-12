import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
  TimelineRow,
} from '@/components/admin/DetailShell';
import { MonitorTabs } from '@/components/admin/MonitorShell';
import { PartyLink } from '@/components/admin/PartyLink';
import { Dwell } from '@/components/admin/Dwell';
import { Timeline } from '@/components/admin/Timeline';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can, canWrite } from '@/lib/domain/permissions';
import { TRANSFER_EXTENSION_DAYS } from '@/lib/domain/transfer-windows';
import { ExtendTransfer } from './ExtendTransfer';
import { adminOrderDetail } from '@/lib/domain/admin-order-detail';
import { orderTimeline } from '@/lib/domain/admin-order-timeline';
import { LEDGER_ACCOUNT_LABEL } from '@/lib/labels/admin';
import { STAGE_LABEL } from '@/lib/labels/charts';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/** حالاتُ النزاع بالعربية — **ومن التعداد لا من الذاكرة**: لا `RESOLVED` فيه. */
const DISPUTE_STATUS: Record<string, string> = {
  OPEN: 'مفتوح',
  INVESTIGATING: 'قيد التحقيق',
  RESOLVED_BUYER: 'حُسم للمشتري',
  RESOLVED_SELLER: 'حُسم للبائع',
  CLOSED: 'مُغلق',
};

/** قراراتُ الحسم — وهي نصٌّ في العمود لا تعداد. */
const RESOLUTION_LABEL: Record<string, string> = {
  FULL_REFUND: 'ردٌّ كامل للمشتري',
  PARTIAL_SETTLEMENT: 'تسويةٌ جزئية',
  RELEASE_TO_SELLER: 'إفراجٌ للبائع',
};

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

/**
 * ═══ تسميات أحداث الطلب — مقيسة على ما يُكتب فعلًا ═══
 *
 * كانت خمسةٌ من ثمانية مفاتيح لا يكتبها أحد (`order.stage_advanced` ·
 * `order.cancelled` · `escrow.held` · `escrow.released` ·
 * `payment.captured`)، ونوعان حقيقيّان بلا تسمية — **فأكثر الأحداث
 * تكرارًا (`stage.advanced`) يُعرض خامًا بالإنجليزية** لمشغّلٍ عربيّ،
 * ثمانيةً وأربعين مرّة في قاعدةٍ واحدة.
 *
 * والمفتاح الميّت لا يُكتشف: `?? event.type` يبتلعه فيبدو الأمر
 * مقصودًا. فالخريطة تُقاس على `groupBy` لا تُكتب من الذاكرة.
 */
const EVENT_LABEL: Record<string, string> = {
  'order.created': 'أُنشئ الطلب',
  'stage.advanced': 'تقدّمت المرحلة',
  'payment.timeout': 'انقضت مهلة الدفع',
  'invoice.blocked': 'حُجبت فاتورة',
  'dispute.opened': 'فُتح نزاع',
  'dispute.resolved': 'حُسم النزاع',
};

/** سبب الحجب — ويُقرأ بعد شهورٍ في مطابقة، فيُكتب بلغةٍ تُفهم. */
const BLOCKED_REASON: Record<string, string> = {
  NO_MATCHING_RULE: 'لا قاعدة ضريبية تطابق البائع والمشتري — تُكتب قاعدة',
  RULE_AWAITING_APPROVAL: 'القاعدة المطابِقة معطّلة — تُقَرّ من شاشة الضريبة',
  INVOICED_WITH_ITS_OWN_PAYMENT: 'تُفوتَر مع دفعتها المستقلّة',
  MARGIN_NOT_APPROVED: 'نظام الهامش غير معتمَد لهذا التاجر',
  OUT_OF_SCOPE_NO_INVOICE: 'خارج نطاق الضريبة — لا فاتورة لها',
  ALREADY_ISSUED: 'صدرت من قبل',
};

/**
 * صياغة سبب الحجب — **والجملة هنا لا في النطاق** (البوابة ١٧).
 * وتُسمّى التوريدات بأسمائها: «مركبة» و«عمولة» لا `VEHICLE`.
 */
function blockedNote(
  payload: { blocked?: { supplyType: string; reason: string }[] } | null,
): string {
  const rows = payload?.blocked ?? [];
  if (rows.length === 0) return 'بلا تفصيل مسجَّل';
  return rows
    .map((row) => {
      const supply = SUPPLY_LABEL[row.supplyType] ?? row.supplyType;
      return `${supply}: ${BLOCKED_REASON[row.reason] ?? row.reason}`;
    })
    .join(' · ');
}

const SUPPLY_LABEL: Record<string, string> = {
  VEHICLE: 'المركبة',
  COMMISSION: 'العمولة',
  SERVICE: 'الخدمات',
  ADMIN_FEE: 'رسوم إدارية',
  DISBURSEMENT: 'مبالغ ممرَّرة',
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
/**
 * ═══ والتابز — وكانت لفيفةً واحدة ═══
 *
 * الصفحة كانت تسع بطاقاتٍ في عمودين وطولُها أربعُمئةٍ وستّون سطرًا:
 * المال والدفتر والسجلّ والأطراف والمركبة والتوقيت والضمان والدفعات
 * والمستندات والنزاع، كلُّها معًا. **ومن يبحث عن قيدٍ يمرّ على
 * الأطراف، ومن يبحث عن مهلةٍ يمرّ على الدفتر.**
 *
 * فصارت خمس تبويبات بعدّاداتها، ويسبقها شريطُ أرقامٍ يُجيب ما يُسأل
 * قبل اختيار تبويبة: كم المبلغ، وكم في هذه المرحلة، ومتى المهلة.
 */
const TABS = [
  { key: null, label: 'نظرة عامة' },
  { key: 'money', label: 'المال والدفتر' },
  { key: 'timeline', label: 'خطّ الزمن' },
  { key: 'payments', label: 'المدفوعات والضمان' },
  { key: 'documents', label: 'المستندات والنزاع' },
] as const;

type OrderTab = (typeof TABS)[number]['key'];

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'orders.view')) redirect('/admin');

  // المرجع يصل مُرمَّزًا من Next — والمقارنة بنصٍّ مفكوك تفشل صامتةً
  const { ref } = await params;
  const order = await adminOrderDetail(decodeURIComponent(ref));
  if (order === null) notFound();

  const search = await searchParams;
  const raw = typeof search.tab === 'string' ? search.tab : undefined;
  const tab: OrderTab = TABS.map((row) => row.key).find((key) => key === raw) ?? null;

  /**
   * **وخطُّ الزمن يُجلَب لتبويبته وحدها.** استعلامُه يمرّ على الدفعات
   * وأحداثها والفواتير والنزاعات وسجلّ التدقيق — وتحميلُه مع كل فتحةٍ
   * يُبطئ تسعًا من عشر زياراتٍ لا تطلبه.
   */
  const events = tab === 'timeline' ? await orderTimeline(order.ref) : [];

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
            {/*
              **والشارةُ بابٌ لا وسم.** من يراها يريد النزاع، وكانت
              تقف عنده وتتركه يبحث.
            */}
            {order.dispute === null ? null : (
              <Link href={`/admin/disputes/${encodeURIComponent(order.dispute.id)}`}>
                <Badge tone="danger">
                  {order.dispute.slaBreached ? 'نزاع — فاتت المهلة' : 'نزاع مفتوح'}
                </Badge>
              </Link>
            )}
          </>
        }
      />

      <DetailStats
        items={[
          { label: 'الإجماليّ', value: <Money amount={Number(order.money.totalAmount)} /> },
          { label: 'المرحلة', value: STAGE_LABEL[order.stage] ?? order.stage },
          {
            /*
              **والرقم الذي لا يُقرأ له بيتٌ هنا.** الكرت كان يعرض
              «120 / 2,037» ولا شرح له في هذه الصفحة أصلًا.
            */
            label: 'مدة المرحلة',
            value: <Dwell hours={order.dwellHours} targetHours={order.targetHours} />,
            ...(order.overdue ? { tone: 'warn' as const } : {}),
          },
          {
            label: 'المهلة',
            value: order.dueAt === null ? 'لا مهلة' : riyadh.format(new Date(order.dueAt)),
            ...(order.overdue ? { tone: 'danger' as const } : {}),
          },
          {
            label: 'الضمان',
            value:
              order.escrow === null ? 'لا ضمان' : <Money amount={Number(order.escrow.amount)} />,
          },
        ]}
      />

      <MonitorTabs
        basePath={`/admin/orders/${encodeURIComponent(order.ref)}`}
        param="tab"
        active={tab}
        tabs={TABS.map((row) => ({
          key: row.key,
          label: row.label,
          /** **ولا عددَ على «نظرة عامة»** — صفرٌ عليها يُقرأ «فارغة». */
          ...(row.key === 'money'
            ? { count: order.ledger.length }
            : row.key === 'payments'
              ? { count: order.payments.length + (order.escrow === null ? 0 : 1) }
              : row.key === 'documents'
                ? {
                    count: order.documents.length + (order.dispute === null ? 0 : 1),
                    ...(order.dispute === null ? {} : { tone: 'danger' as const }),
                  }
                : {}),
        }))}
      />

      {tab !== 'money' ? null : (
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
                    : `قيود (${displayDigits(String(order.ledger.length))})`
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
              title="أحداث الطلب"
              note={`آخر حدث (${displayDigits(String(order.timeline.length))})`}
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
                        event.type === 'invoice.blocked'
                          ? blockedNote(event.payload)
                          : event.toStage === null
                          ? `بفعل ${event.actorType}`
                          : `${event.fromStage === null ? '' : `${STAGE_LABEL[event.fromStage] ?? event.fromStage} ← `}${STAGE_LABEL[event.toStage] ?? event.toStage} · بفعل ${event.actorType}`
                      }
                      at={riyadh.format(new Date(event.at))}
                      tone={
                        event.type.startsWith('dispute') || event.type === 'invoice.blocked'
                          ? 'danger'
                          : 'accent'
                      }
                    />
                  ))}
                </div>
              )}
            </DetailCard>
            </>
          }
          side={
            <DetailCard title="الملخّص">
              <Field label="المشتري" value={order.buyer.name} />
              <Field label="البائع" value={order.seller.name} />
              <Field label="الإعلان" value={order.listing.ref} ltr />
              <Field label="المصدر" value={SOURCE_LABEL[order.source] ?? order.source} />
            </DetailCard>
          }
        />
      )}

      {tab !== 'timeline' ? null : (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-1.5 text-sm font-bold">خطّ الزمن</h2>
          <p className="mb-5 max-w-xl text-3xs leading-loose opacity-55">
            أحداثُ الطلب والدفعات والضمان والفواتير والنزاعات وأثر الفريق في تسلسلٍ
            واحد — والأقدم أوّلًا، فالقصّة تُقرأ من بدايتها.
          </p>
          <Timeline events={events} />
        </section>
      )}

      {tab !== null ? null : (
        <DetailColumns
          main={
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

            </>
          }
          side={
            <DetailCard title="المصدر">
              <Field label="كيف نشأ" value={SOURCE_LABEL[order.source] ?? order.source} />
              <Field label="الإجماليّ" value={<Money amount={Number(order.money.totalAmount)} />} strong />
              <Link
                href={`/admin/orders/${encodeURIComponent(order.ref)}?tab=money`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                تفصيل المال والدفتر
              </Link>
            </DetailCard>
          }
        />
      )}

      {tab !== 'payments' ? null : (
        <DetailColumns
          main={
            <>
            {order.escrow === null ? (
              <DetailCard title="الضمان">
                {/* **وغيابُه يُقال** — بطاقةٌ تُحذف تجعل القارئ يظنّ أنه لم يبحث جيّدًا */}
                <p className="text-2xs opacity-55">لا ضمان على هذا الطلب.</p>
              </DetailCard>
            ) : (
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

            {order.payments.length === 0 ? (
              <DetailCard title="الدفعات">
                <p className="text-2xs opacity-55">لا دفعة مسجّلة بعد.</p>
              </DetailCard>
            ) : (
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

            </>
          }
          side={
            <DetailCard title="التوقيت">
              <Field label="أُنشئ" value={riyadh.format(new Date(order.createdAt))} />
              {order.dueAt === null ? null : (
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
            </DetailCard>
          }
        />
      )}

      {tab !== 'documents' ? null : (
        <DetailColumns
          main={
            <>
            {order.documents.length === 0 ? (
              <DetailCard title="المستندات">
                <p className="text-2xs opacity-55">لا مستند صادر بعد.</p>
              </DetailCard>
            ) : (
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

            {order.dispute === null ? (
              <DetailCard title="النزاع">
                <p className="text-2xs opacity-55">لا نزاع على هذا الطلب.</p>
              </DetailCard>
            ) : (
              <DetailCard
                title="النزاع"
                note={order.dispute.slaBreached ? 'فاتت مهلة الردّ' : undefined}
              >
                <Field
                  label="الحالة"
                  value={DISPUTE_STATUS[order.dispute.status] ?? order.dispute.status}
                  strong
                />
                <Field label="السبب" value={order.dispute.reason} />
                <Field label="فُتح" value={riyadh.format(new Date(order.dispute.openedAt))} />
                {/*
                  **ومهلةُ الردّ أوّلُ ما يُستعجَل**: فواتُها يحسم
                  النزاع بلا ردّ البائع — فهي قرارٌ يقع بالصمت.
                */}
                <Field
                  label="مهلة الردّ"
                  value={
                    order.dispute.slaDueAt === null ? (
                      'لا مهلة'
                    ) : (
                      <span className={order.dispute.slaBreached ? 'text-danger' : undefined}>
                        {riyadh.format(new Date(order.dispute.slaDueAt))}
                      </span>
                    )
                  }
                  strong
                />
                <Field
                  label="الرسائل"
                  value={<ArabicNumber value={order.dispute.messageCount} />}
                />
                {order.dispute.resolvedAt === null ? null : (
                  <>
                    <Field
                      label="القرار"
                      value={
                        order.dispute.resolution === null
                          ? 'بلا قرار مسجَّل'
                          : (RESOLUTION_LABEL[order.dispute.resolution] ?? order.dispute.resolution)
                      }
                    />
                    <Field
                      label="حُسم"
                      value={riyadh.format(new Date(order.dispute.resolvedAt))}
                    />
                  </>
                )}
                {/*
                  **والرابط إلى نزاعه هو لا إلى القائمة.** كان يفتح
                  قائمة النزاعات، فمن رأى الشارة يبحث عن نزاعه فيها.
                */}
                <Link
                  href={`/admin/disputes/${encodeURIComponent(order.dispute.id)}`}
                  className="mt-3 inline-block text-2xs font-semibold text-accent-700 underline underline-offset-4"
                >
                  افتح النزاع ←
                </Link>
              </DetailCard>
            )}
            </>
          }
          side={
            <DetailCard title="الأطراف">
              <Field
                label="المشتري"
                value={<PartyLink party={order.buyer} role="المشتري" />}
              />
              <Field
                label="البائع"
                value={<PartyLink party={order.seller} role="البائع" />}
              />
            </DetailCard>
          }
        />
      )}
    </AdminShell>
  );
}

function PartyBlock({
  label,
  party,
}: {
  label: string;
  party: {
    id: string;
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
      {/* **والاسم يفتح ملفّه** — وكان نصًّا ميّتًا في أكثر شاشةٍ يُحقَّق فيها */}
      <Field label="الاسم" value={<PartyLink party={party} role={label} />} />
      {/* الهاتف يُقارن خانةً بخانة — لاتينيّ معزول */}
      <Field label="الهاتف" value={party.phone} ltr />
      {party.email === null ? null : <Field label="البريد" value={party.email} ltr />}
      {/* سياقٌ لمن يقرّر في نزاع: أوّل صفقةٍ له أم العاشرة */}
      <Field
        label="طلبات سابقة"
        value={displayDigits(String(party.previousOrders))}
        ltr
      />
    </div>
  );
}
