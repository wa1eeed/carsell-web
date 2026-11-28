import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DetailCard,
  DetailColumns,
  DetailHeader,
  DetailStats,
  Field,
} from '@/components/admin/DetailShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { providerPayoutDetail } from '@/lib/domain/provider-payouts';
import { LEDGER_EVENT_LABEL, PAYOUT_STATUS_LABEL } from '@/lib/labels/admin';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تحويل مزود' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ تحويلُ مزوّدٍ واحد — وكان صفًّا في قائمة ═══
 *
 * اسمٌ ومبلغٌ ومرجعُ حوالة، ولا موضعَ يُسأل فيه «من أيّ خدماتٍ تكوّن
 * هذا المبلغ؟» ولا «من طلب الحوالة ومن أدخل مرجعها؟». والرصيد هنا
 * **مفسَّرٌ بقيوده**: كلُّ سطرٍ باسم طلب الخدمة الذي أنشأه، فيُقرأ
 * المبلغ كما تكوَّن ويُطابَق بكشف البنك.
 */
export default async function AdminProviderPayoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const { id } = await params;
  const payout = await providerPayoutDetail(decodeURIComponent(id));
  if (payout === null) notFound();

  const state = PAYOUT_STATUS_LABEL[payout.status];
  /**
   * **والمهلةُ تُقاس لا تُفترض.** طلبٌ مضى على مهلته يبقى `PENDING` في
   * القاعدة، فعرضُه «ينتظر» وحده يُقرأ انتظارًا وهو موات.
   */
  const expired =
    payout.status === 'PENDING' &&
    payout.expiresAt !== null &&
    new Date(payout.expiresAt).getTime() < Date.now();

  return (
    <AdminShell title="تحويل مزود" activeHref="/admin/provider-payouts" admin={admin}>
      <DetailHeader
        backHref="/admin/provider-payouts"
        backLabel="صرف مستحقات المزودين"
        reference={payout.id.slice(-10).toUpperCase()}
        title={<>مستحق {payout.provider.nameAr} — تحويل بنكي إلى آيبانه</>}
        badges={
          <>
            <Badge tone={state.tone}>{state.label}</Badge>
            {expired ? <Badge tone="danger">انقضت مهلة الطلب</Badge> : null}
          </>
        }
      />

      <DetailStats
        items={[
          /**
           * **وكلُّ رقمٍ يُطابَق بجهةٍ خارجية يُعرض بهللاته**: هذا المبلغ
           * يُقابَل بكشف البنك، و«٤٥٠» فوق حوالةٍ قيمتُها ٤٤٩٫٥٠ رقمان
           * لمالٍ واحد في شاشةٍ واحدة.
           */
          { label: 'مبلغ التحويل', value: <Money amount={Number(payout.amount)} decimals={2} /> },
          {
            label: payout.status === 'SENT' ? 'ما بقي له بعده' : 'حقه القائم الآن',
            value: <Money amount={Number(payout.payableNow)} decimals={2} />,
            ...(Number(payout.payableNow) < 0 ? { tone: 'danger' as const } : {}),
          },
          { label: 'قيود على حسابه', value: <ArabicNumber value={payout.lineCount} /> },
        ]}
      />

      <DetailColumns
        main={
          <>
            {/*
              ═══ الرصيدُ يُفسَّر بقيوده لا برقمه ═══

              سؤالُ المشغّل الأوّل «لماذا له هذا المبلغ؟» — وجوابُه
              السطورُ التي كوّنته، كلٌّ باسم طلب الخدمة. وكان يُفتح
              الدفتر ويُرشَّح باليد للوصول إليها.
            */}
            <DetailCard
              title="من أين جاء هذا الرصيد"
              note={
                /*
                  **والمعروضُ يقول إنه مقتطع.** «الأحدث أوّلًا» على ستّين
                  من مئةٍ تُقرأ «هذا كلُّ الحساب»، فيُجمع المعروض فلا
                  يبلغ الرصيد — ويُقرأ الفرق عطلًا في الدفتر.
                */
                payout.lineCount > payout.lines.length ? (
                  <>
                    حساب حقوق مزودي الخدمات — آخر{' '}
                    <Quantity unit="ledgerLines" count={payout.lines.length} /> من أصل{' '}
                    <ArabicNumber value={payout.lineCount} />
                  </>
                ) : (
                  'حساب حقوق مزودي الخدمات — الأحدث أولا'
                )
              }
            >
              {payout.lines.length === 0 ? (
                <p className="text-2xs opacity-70">لا قيود على هذا الحساب بعد.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {payout.lines.map((line) => (
                    <li
                      key={line.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                    >
                      <span className="min-w-0 flex-1 text-2xs">
                        {LEDGER_EVENT_LABEL[line.event] ?? line.event}
                      </span>
                      {/*
                        **والمرجعُ يُفتح إن كان طلبًا قائمًا** — و`note`
                        في قيد التحويل نصٌّ لا مرجع، فيُعرض كما هو.
                      */}
                      {line.requestRef !== null ? (
                        <Link
                          href={`/admin/service-requests/${encodeURIComponent(line.requestRef)}`}
                          className="bidi-ltr font-num -my-1 py-1 text-3xs "
                        >
                          {line.requestRef}
                        </Link>
                      ) : line.payoutId === payout.id ? (
                        <span dir="ltr" className="font-num text-3xs opacity-65">
                          {line.payoutRef ?? 'هذه الحوالة'}
                        </span>
                      ) : line.payoutId !== null ? (
                        /* **وقيدُ تحويلٍ آخر يفتحه** — فالرصيد يُقرأ إلى آخره. */
                        <Link
                          href={`/admin/provider-payouts/${encodeURIComponent(line.payoutId)}`}
                          className="bidi-ltr font-num -my-1 py-1 text-3xs "
                        >
                          {line.payoutRef ?? 'حوالة سابقة'}
                        </Link>
                      ) : (
                        <span className="text-3xs opacity-65">—</span>
                      )}
                      <span className="bidi-isolate text-3xs opacity-65">
                        {riyadh.format(new Date(line.createdAt))}
                      </span>
                      {/* **والاتّجاه يُقال بأثره على المزوّد** لا بمصطلح الدفتر */}
                      <span className="font-num text-2xs font-bold">
                        {line.direction === 'CREDIT' ? '+' : '−'}
                        <ArabicNumber value={Number(line.amount)} decimals={2} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>

            <DetailCard title="الحوالة">
              <Field
                label="آخر أربع من الآيبان"
                value={payout.ibanLast4 ?? 'لم تسجل'}
                ltr={payout.ibanLast4 !== null}
              />
              <Field
                label="مرجع الحوالة"
                value={payout.bankRef ?? 'لم يدخل بعد'}
                ltr={payout.bankRef !== null}
                strong
              />
              <Field label="ملاحظة" value={payout.note ?? '—'} />
            </DetailCard>
          </>
        }
        side={
          <>
            <DetailCard title="المزود">
              <Field label="الاسم" value={payout.provider.nameAr} />
              <Field label="النوع" value={PROVIDER_TYPE_LABEL[payout.provider.type]} />
              <Field label="في الخدمة" value={payout.provider.active ? 'نعم' : 'موقوف'} />
              <Field
                label="آيبان مسجل"
                value={payout.provider.hasIban ? 'نعم' : 'لا — ولا تحويل بدونه'}
              />
              <Link
                href={`/admin/providers/${encodeURIComponent(payout.provider.id)}`}
                className="mt-3 inline-block py-1 text-2xs opacity-75 hover:opacity-100"
              >
                صفحة المزود وكشف حسابه
              </Link>
            </DetailCard>

            <DetailCard title="من ومتى">
              <Field label="طلبه" value={payout.requestedByName ?? payout.requestedBy} />
              <Field label="وقت الطلب" value={riyadh.format(new Date(payout.createdAt))} />
              <Field
                label="أدخل مرجعه"
                value={payout.sentByName ?? payout.sentBy ?? 'لم يدخل بعد'}
              />
              <Field
                label="وقت التحويل"
                value={payout.sentAt === null ? '—' : riyadh.format(new Date(payout.sentAt))}
              />
              {payout.failedAt === null ? null : (
                <Field label="وقت الفشل" value={riyadh.format(new Date(payout.failedAt))} />
              )}
              {payout.expiresAt === null ? null : (
                <Field
                  label={expired ? 'انقضت المهلة' : 'مهلة الطلب'}
                  value={riyadh.format(new Date(payout.expiresAt))}
                />
              )}
            </DetailCard>

            {payout.status !== 'PENDING' ? null : (
              <DetailCard title="ما بقي عليه">
                <p className="text-2xs leading-loose opacity-75">
                  {expired
                    ? 'مضت مهلة هذا الطلب ولم يدخل مرجع حوالة، فلن يقبل الإقفال. ألغه من شاشة التحويلات واطلبه من جديد.'
                    : 'الطلب مفتوح ولم يصل المزود شيء. نفذ الحوالة من البنك إلى آيبانه، ثم أدخل مرجعها من شاشة التحويلات ليقفل الطلب ويخصم الدين من الدفتر.'}
                </p>
                <Link
                  href="/admin/provider-payouts"
                  className="mt-3 inline-block py-1 text-2xs font-bold "
                >
                  شاشة تحويلات المزودين
                </Link>
              </DetailCard>
            )}
          </>
        }
      />
    </AdminShell>
  );
}
