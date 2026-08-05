'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { SettlementBlock, SettlementRow } from '@/lib/domain/settlement-queue';

/**
 * ═══ الإفراج عن الضمان — الشاشة التي لم تكن ═══
 *
 * النطاق والمسار والنصاب والاختبار كلّها قائمة، **ولا زرّ يبلغها**.
 * فالمال يدخل الضمان ولا يخرج.
 *
 * ═══ والزرّ يقول ما يفعله ═══
 *
 * «اطلب الإفراج» لا «إفراج»: الضغطة الأولى **لا تُحرّك ريالًا** — تفتح
 * طلبًا ينتظر عضوًا ثانيًا. ومن قرأ «إفراج» وضغط ثم لم يجد المال قد
 * خرج يظنّ العطل في النظام، وهو في النصّ.
 */

const BLOCK_LABEL: Record<SettlementBlock, string> = {
  NOT_TRANSFERRED: 'لم تُؤكَّد ملكية المركبة بعد',
  DISPUTED: 'نزاعٌ قائم — المبلغ مجمَّد حتى يُحسم',
};

export function SettlementsTable({
  ready,
  awaitingApproval,
  blocked,
  adminId,
  canRelease,
}: {
  ready: readonly SettlementRow[];
  awaitingApproval: readonly SettlementRow[];
  blocked: readonly SettlementRow[];
  adminId: string;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SettlementRow | null>(null);

  const call = (row: SettlementRow, requestId?: string): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/orders/${row.orderRef}/settle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestId === undefined ? {} : { requestId }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string }; data?: { state?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر تنفيذ الطلب.');
        return;
      }

      setConfirming(null);
      setToast(
        requestId === undefined
          ? 'فُتح طلب الإفراج. ينتظر اعتماد عضوٍ ثانٍ.'
          : 'اكتمل النصاب — أُفرج عن المبلغ إلى البائع.',
      );
      router.refresh();
    });
  };

  const empty =
    ready.length === 0 && awaitingApproval.length === 0 && blocked.length === 0;

  if (empty) {
    return (
      <EmptyState
        title="لا مبالغ محجوزة"
        description="حين يدفع مشترٍ يظهر طلبه هنا حتى يُفرَج عنه للبائع."
      />
    );
  }

  return (
    <>
      {/* ═══ ينتظر الموافقة الثانية — أوّلًا لأنه ما يحتاج فعلًا الآن ═══ */}
      {awaitingApproval.length === 0 ? null : (
        <Section title="ينتظر اعتماد عضوٍ ثانٍ" count={awaitingApproval.length} tone="warn">
          {awaitingApproval.map((row) => {
            const approval = row.approval;
            if (approval === null) return null;
            const isRequester = approval.requestedById === adminId;
            const alreadyApproved = approval.approvedBy.includes(adminId);

            return (
              <Row key={row.orderRef} row={row}>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span className="text-3xs opacity-55">
                    طلبه {approval.requestedByName} · النصاب{' '}
                    <span dir="ltr" className="font-num">
                      {toArabicDigits(String(approval.approvals))}/
                      {toArabicDigits(String(approval.required))}
                    </span>
                  </span>
                  {/*
                    السبب يُقال ولا يُترك للتخمين: زرٌّ معطَّل بلا سببٍ
                    يُقرأ عطلًا، ومن طلب الإفراج يظنّ أنه نُسي.
                  */}
                  {isRequester ? (
                    <span className="text-3xs opacity-45">أنت الطالب — يعتمده غيرك</span>
                  ) : alreadyApproved ? (
                    <span className="text-3xs opacity-45">اعتمدتَه — ينتظر عضوًا آخر</span>
                  ) : !canRelease ? (
                    <span className="text-3xs opacity-45">لا تملك صلاحية الإفراج</span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => call(row, approval.id)}
                    >
                      اعتمد الإفراج
                    </Button>
                  )}
                </div>
              </Row>
            );
          })}
        </Section>
      )}

      {ready.length === 0 ? null : (
        <Section title="جاهز للإفراج" count={ready.length} tone="ok">
          {ready.map((row) => (
            <Row key={row.orderRef} row={row}>
              {canRelease ? (
                <Button size="sm" disabled={pending} onClick={() => setConfirming(row)}>
                  اطلب الإفراج
                </Button>
              ) : (
                <span className="text-3xs opacity-45">لا تملك صلاحية الإفراج</span>
              )}
            </Row>
          ))}
        </Section>
      )}

      {blocked.length === 0 ? null : (
        <Section title="محجوب" count={blocked.length} tone="neutral">
          {blocked.map((row) => (
            <Row key={row.orderRef} row={row}>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Badge tone={row.blockedBy === 'DISPUTED' ? 'warn' : 'neutral'}>
                  {row.blockedBy === null ? '—' : BLOCK_LABEL[row.blockedBy]}
                </Badge>

              </div>
            </Row>
          ))}
        </Section>
      )}

      {/*
        النافذة تقول **ما يخرج ومن يستلمه** قبل الضغط، ولا تكتفي
        بـ«هل أنت متأكّد؟» — الرقم هو ما يُراجَع لا العزم.
      */}
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="طلب تحويل المبلغ للبائع"
      >
        {confirming === null ? null : (
          <>
            <dl className="mb-4 flex flex-col gap-2.5 border-b border-line pb-4 text-2xs">
              <Line label="الطلب" value={confirming.orderRef} mono />
              <Line label="البائع" value={confirming.seller} />
            </dl>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-2xs opacity-60">يصل البائع</span>
              <Money amount={Number(confirming.netToSeller)} size="lg" decimals={2} />
            </div>
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-2xs leading-loose opacity-70">
              هذه الضغطة <b>لا تُحرّك المبلغ</b> — تفتح طلبًا يعتمده عضوٌ ثانٍ، وعنده
              يُنادى المزوّد. ولا يعتمده الطالب.
            </p>
            <Button className="w-full" disabled={pending} onClick={() => call(confirming)}>
              {pending ? 'جارٍ…' : 'افتح الطلب'}
            </Button>
          </>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'ok' | 'warn' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-bold">
        {title}
        {/* العدد داخل الشارة لا في الجملة — فلا يحكم المعدودُ صيغةَ الجمع */}
        <Badge tone={tone === 'ok' ? 'accent' : tone === 'warn' ? 'warn' : 'neutral'}>
          {toArabicDigits(String(count))}
        </Badge>
      </h2>
      <div className="flex flex-col divide-y divide-line border-y border-line">{children}</div>
    </section>
  );
}

function Row({ row, children }: { row: SettlementRow; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {/*
          **ولا صفحةَ تسويةٍ منفصلة**: تفاصيل الطلب فيها الضمان والدفعات
          والقيود والمستندات — وصفحةٌ ثانية تقول ما تقوله الأولى تتباعد
          عنها أوّل تعديل.
        */}
        <Link
          href={`/admin/orders/${encodeURIComponent(row.orderRef)}`}
          dir="ltr"
          className="font-num text-start text-2xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          {row.orderRef}
        </Link>
        <span className="bidi-isolate truncate text-sm">{row.seller}</span>
        <span className="bidi-isolate truncate text-3xs opacity-45">
          المشتري {row.buyer}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-start gap-0.5 sm:items-end">
          <Money amount={Number(row.netToSeller)} decimals={2} />
          <span className="text-3xs opacity-45">
            محجوز <Money amount={Number(row.heldAmount)} decimals={2} showCurrency={false} />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="opacity-55">{label}</dt>
      <dd className={mono === true ? 'font-num' : 'bidi-isolate truncate'}>{value}</dd>
    </div>
  );
}
