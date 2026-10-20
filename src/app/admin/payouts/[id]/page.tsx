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
import { currentAdmin } from '@/lib/auth/admin-session';
import { can } from '@/lib/domain/permissions';
import { payoutDetail } from '@/lib/domain/payouts';
import { LEDGER_EVENT_LABEL } from '@/lib/labels/admin';
import { AR_DATE_LOCALE } from '@/lib/arabic';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تحويل مستحق' };

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

const STATUS: Record<string, { label: string; tone: 'accent' | 'warn' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'ينتظر مرجع الحوالة', tone: 'warn' },
  SENT: { label: 'حول', tone: 'accent' },
  FAILED: { label: 'فشل', tone: 'danger' },
  CANCELLED: { label: 'ألغي', tone: 'neutral' },
};

/**
 * ═══ تحويلُ مستحقٍّ واحد — وكان صفًّا في قائمة ═══
 *
 * مبلغٌ وحالٌ وأربعُ خاناتٍ من آيبان، ولا موضعَ يُسأل فيه «لماذا لهذا
 * البائع هذا المبلغ؟» ولا «من طلب الحوالة ومن أرسلها؟». فالرصيدُ هنا
 * **مفسَّرٌ بقيوده**: كلُّ سطرٍ باسم طلبه، فيُقرأ المبلغ كما تكوَّن.
 */
export default async function AdminPayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (admin === null) redirect('/admin/login');
  if (!can(admin.role, 'finance.view')) redirect('/admin');

  const { id } = await params;
  const payout = await payoutDetail(decodeURIComponent(id));
  if (payout === null) notFound();

  const state = STATUS[payout.status] ?? { label: payout.status, tone: 'neutral' as const };

  return (
    <AdminShell title="تحويل مستحق" activeHref="/admin/payouts" admin={admin}>
      <DetailHeader
        backHref="/admin/payouts"
        backLabel="تحويل مستحقات البائعين"
        reference={payout.id.slice(-10).toUpperCase()}
        title={
          <>
            مستحق {payout.seller.name ?? 'بائع'} — تحويل بنكي إلى آيبانه
          </>
        }
        badges={<Badge tone={state.tone}>{state.label}</Badge>}
      />

      <DetailStats
        items={[
          /**
           * **وكلُّ رقمٍ يُطابَق بجهةٍ خارجية يُعرض بهللاته**: هذا
           * المبلغ يُقابَل بكشف البنك، و«٤٧٬٢٨٨» فوق حوالةٍ قيمتُها
           * ٤٧٬٢٨٧٫٥٠ رقمان لمالٍ واحد في شاشةٍ واحدة.
           */
          { label: 'مبلغ التحويل', value: <Money amount={Number(payout.amount)} decimals={2} /> },
          {
            label: 'ما بقي للبائع بعده',
            value: <Money amount={Number(payout.payableNow)} decimals={2} />,
            ...(Number(payout.payableNow) < 0 ? { tone: 'danger' as const } : {}),
          },
          {
            label: 'قيود كونت الرصيد',
            value: <ArabicNumber value={payout.lines.length} />,
          },
        ]}
      />

      <DetailColumns
        main={
          <>
            {/*
              ═══ الرصيدُ يُفسَّر بقيوده لا برقمه ═══

              سؤالُ المشغّل الأوّل «لماذا له هذا المبلغ؟» — وجوابُه
              السطورُ التي كوّنته، كلٌّ باسم طلبه. وكان يُفتح الدفتر
              ويُرشَّح باليد للوصول إليها.
            */}
            <DetailCard
              title="من أين جاء هذا الرصيد"
              note="حساب مستحقات البائعين — الأحدث أولا"
            >
              {payout.lines.length === 0 ? (
                <p className="text-2xs opacity-70">لا قيود على هذا الحساب بعد.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {payout.lines.map((line) => (
                    <li key={line.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1 text-2xs">
                        {LEDGER_EVENT_LABEL[line.event] ?? line.event}
                      </span>
                      {line.orderRef === null ? (
                        <span className="text-3xs opacity-65">—</span>
                      ) : (
                        <Link
                          href={`/admin/orders/${encodeURIComponent(line.orderRef)}`}
                          className="bidi-ltr font-num text-3xs underline underline-offset-2"
                        >
                          {line.orderRef}
                        </Link>
                      )}
                      <span className="bidi-isolate text-3xs opacity-65">
                        {riyadh.format(new Date(line.createdAt))}
                      </span>
                      {/* **والاتّجاه يُقال بأثره على البائع** لا بمصطلح الدفتر */}
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
            <DetailCard title="البائع">
              <Field label="الاسم" value={payout.seller.name ?? '—'} />
              <Field label="رقم العميل" value={payout.seller.ref ?? '—'} ltr={payout.seller.ref !== null} />
              <Field
                label="آيبان مسجل"
                value={payout.seller.hasIban ? 'نعم' : 'لا — ولا تحويل بدونه'}
              />
              <Link
                href={`/admin/users/${encodeURIComponent(payout.seller.id)}`}
                className="mt-3 inline-block text-2xs underline underline-offset-4 opacity-75 hover:opacity-100"
              >
                صفحة العميل
              </Link>
            </DetailCard>

            {/*
              **ومن فعل مكتوبٌ باسمه لا بمعرّفه**: سطرٌ يقول
              `cmg3f…` لا يُجيب «من أرسل هذا المال؟».
            */}
            <DetailCard title="من ومتى">
              <Field label="طلبه" value={payout.requestedByName ?? payout.requestedBy} />
              <Field label="وقت الطلب" value={riyadh.format(new Date(payout.createdAt))} />
              <Field label="أرسله" value={payout.sentByName ?? payout.sentBy ?? 'لم يرسل بعد'} />
              <Field
                label="وقت الإرسال"
                value={payout.sentAt === null ? '—' : riyadh.format(new Date(payout.sentAt))}
              />
              {payout.failedAt === null ? null : (
                <Field label="وقت الفشل" value={riyadh.format(new Date(payout.failedAt))} />
              )}
            </DetailCard>

            {payout.status !== 'PENDING' ? null : (
              <DetailCard title="ما بقي عليه">
                <p className="text-2xs leading-loose opacity-75">
                  الطلب مفتوح ولم يصل البائع شيء. نفذ الحوالة من البنك، ثم أدخل مرجعها
                  من{' '}
                  <Link
                    href="/admin/payouts"
                    className="font-bold underline underline-offset-2"
                  >
                    شاشة التحويلات
                  </Link>{' '}
                  ليقفل الطلب ويقيد في الدفتر.
                </p>
              </DetailCard>
            )}
          </>
        }
      />
    </AdminShell>
  );
}
