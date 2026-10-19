import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { MonitorRow } from '@/components/admin/MonitorShell';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { SERVICE_PAYMENT_STATUS } from '@/lib/labels/services';
import {
  WEBHOOK_OUTCOME,
  WEBHOOK_OUTCOME_HINT,
  WEBHOOK_OUTCOME_TONE,
} from '@/lib/labels/webhooks';
import type { WebhookRow } from '@/lib/domain/webhooks';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ صفُّ ردٍّ واحد — ومكوّنٌ واحد لموضعين ═══
 *
 * يُعرض في شاشة الردود وفي تبويب «المدفوعات» داخل الطلب، **وهو موضع
 * الحاجة**: المشغّل يقف على طلبٍ متعثّر، فالسؤال يقع هناك لا في شاشةٍ
 * أخرى. ونسختان في الموضعين تتباعدان أوّلَ تغيير.
 *
 * **والحمولةُ تُفتح ولا تُعرض**: سطرٌ من JSON يملأ الشاشة ويُخفي
 * الصفوف التي بعده، والمشغّل يريدها عند صفٍّ واحد لا عند كلّها.
 */
export function WebhookRowView({
  row,
  orderRef,
  purpose,
  compact = false,
}: {
  row: WebhookRow;
  orderRef: string | null;
  purpose: string | null;
  /** داخل الطلب: لا يُكرَّر رقمُ الطلب على كل صفّ. */
  compact?: boolean;
}) {
  return (
    <MonitorRow
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          {/* نوعُ الحدث كما ترسله البوّابة — لاتينيّ يُقارن خانةً بخانة */}
          <span dir="ltr" className="bidi-ltr font-num text-sm font-bold">
            {row.type}
          </span>
          {row.repeats === 0 ? null : (
            <Badge tone="neutral" size="sm">
              <span className="flex items-center gap-1">
                أعيد إرساله
                <ArabicNumber value={row.repeats} />
              </span>
            </Badge>
          )}
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="opacity-70">{WEBHOOK_OUTCOME_HINT[row.outcome]}</span>
          {row.note === null ? null : (
            <span dir="ltr" className="bidi-ltr font-num text-3xs opacity-65">
              {row.note}
            </span>
          )}
        </span>
      }
      meta={riyadh.format(new Date(row.receivedAt))}
    >
      {compact || orderRef === null ? null : (
        <Link
          href={`/admin/orders/${orderRef}?tab=payments`}
          className="bidi-ltr font-num text-2xs underline underline-offset-2"
        >
          {orderRef}
        </Link>
      )}
      {purpose === null || compact ? (
        <span className="text-3xs opacity-65">{row.provider}</span>
      ) : (
        <span className="text-3xs opacity-65">
          {purpose} · {row.provider}
        </span>
      )}

      {/* **والحالُ المكتوب يُقال باسمه** — لا رمزًا خامًّا من التعداد */}
      {row.appliedStatus === null ? null : (
        <Badge tone="ink" size="sm">
          {SERVICE_PAYMENT_STATUS[row.appliedStatus] ?? row.appliedStatus}
        </Badge>
      )}
      <Badge tone={WEBHOOK_OUTCOME_TONE[row.outcome]}>{WEBHOOK_OUTCOME[row.outcome]}</Badge>

      <details className="w-full lg:w-auto">
        <summary className="cursor-pointer py-1.5 text-2xs opacity-65">الحمولة كما وصلت</summary>
        <pre
          dir="ltr"
          className="bidi-ltr mt-2 max-h-64 overflow-auto rounded-md border border-line bg-bg p-3 text-3xs leading-relaxed"
        >
          {JSON.stringify(row.payload, null, 2)}
        </pre>
      </details>
    </MonitorRow>
  );
}
