import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Duration } from '@/components/ui/Duration';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { orderStateLabel } from '@/lib/labels/orders';
import { ESCROW_STATUS_AR } from '@/lib/labels/dealer';
import { DESK_ORDER_CAP, type DeskOrder } from '@/lib/domain/dealer-desk';

/**
 * ═══ صفوفُ `D6` ═══
 *
 * **والمرحلةُ لا تُعرض وحدها** (البوابة ٣٩): طلبٌ أُلغي عند الدفع
 * تبقى مرحلتُه `PAYMENT` إلى الأبد، فوسمٌ يقول «الدفع» عن ميّتٍ يجعل
 * المعرضَ ينتظر مشتريًا انصرف. و`orderStateLabel` تقرأ الاثنين —
 * وهي التسميةُ التي تقرؤها لوحةُ المنصّة، لا نسخةٌ منها.
 */
export function OrdersTable({ rows }: { rows: readonly DeskOrder[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا طلبات في هذه الشريحة"
        description="الطلب ينشأ حين يقبل مشتري سعرك أو تقبل أنت عرضه."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-200 border-collapse text-start">
        <thead>
          <tr className="border-b border-line bg-surface text-3xs opacity-65">
            <th scope="col" className="px-5 py-3 text-start font-bold">الطلب</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">المركبة</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">المشتري</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">الحال</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">في المرحلة</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">المبلغ</th>
            <th scope="col" className="px-5 py-3 text-start font-bold">الضمان</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = orderStateLabel(row.status, row.stage);
            return (
              <tr key={row.ref} className="border-b border-line-2 last:border-b-0">
                <td className="px-5 py-3.5">
                  {/*
                    **والمرجعُ اللاتينيّ يُعزل بـ`dir="ltr"`** — يُقارن
                    خانةً بخانة مع ما يقرؤه المشتري في بريده.
                  */}
                  <Link
                    href={`/dealer/orders/${row.ref}`}
                    dir="ltr"
                    className="font-num text-2xs font-semibold hover:underline"
                  >
                    {row.ref}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-2xs font-semibold">{row.vehicle}</td>
                <td className="px-5 py-3.5 text-2xs opacity-75">{row.buyerName ?? '—'}</td>
                <td className="px-5 py-3.5">
                  <Badge tone={state.tone}>{state.text}</Badge>
                </td>
                <td className="px-5 py-3.5 text-2xs">
                  {row.live ? (
                    <span className={row.overdue === null ? 'opacity-70' : 'font-bold text-warn-900'}>
                      <Duration hours={row.inStageHours} />
                      {row.overdue === null ? null : (
                        <span className="ms-1.5">
                          {row.overdue === 'PAYMENT' ? '· تجاوز مهلة الدفع' : '· تجاوز سقف النقل'}
                        </span>
                      )}
                    </span>
                  ) : (
                    /** وما توقّف لا يُقاس بقاؤه — الرقم يكبر وهو ساكن. */
                    <span className="opacity-50">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <Money amount={row.amount} size="sm" />
                </td>
                <td className="px-5 py-3.5 text-2xs font-bold">
                  {row.escrow === null ? (
                    /** لا ضمانَ لهذا الطلب — ولا يُقال عنه شيء. */
                    <span className="opacity-50">—</span>
                  ) : (
                    <span
                      className={
                        ESCROW_STATUS_AR[row.escrow].tone === 'warn'
                          ? 'text-warn-900'
                          : ESCROW_STATUS_AR[row.escrow].tone === 'accent'
                            ? 'text-accent-700'
                            : 'opacity-70'
                      }
                    >
                      {ESCROW_STATUS_AR[row.escrow].text}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length >= DESK_ORDER_CAP ? (
        /**
         * **والاقتطاعُ يُقال لا يُسكت عنه**: جدولٌ يعرض مئتين من ثلاث
         * مئة يبدو كاملًا، فيحسب صاحبُه أنّ الباقي ليس له. والبابُ
         * بجواره: التصدير يحمل الطابور كلَّه.
         */
        <p className="border-t border-line bg-surface px-5 py-3 text-3xs opacity-70">
          الجدول يعرض أحدث <Quantity unit="orderRows" count={DESK_ORDER_CAP} /> — والتصدير يحمل القائمة كلها.
        </p>
      ) : null}
    </div>
  );
}
