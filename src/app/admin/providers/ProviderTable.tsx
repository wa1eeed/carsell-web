'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits } from '@/lib/arabic';
import type { ProviderRow } from '@/lib/domain/admin-providers';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';

/**
 * الالتزام نصًّا — **كما يكتبه التصميم**: «فوريّ» ثم بالساعات حتى
 * يومين، ثم بالأيّام. و«أيّام (٢)» لالتزامٍ ٤٨ ساعة أبعد عن القارئ من
 * «ساعات (٤٨)»، وهي المدّة التي يقولها العقد.
 *
 * والجملة لا يحكمها المعدود (البوابة ١٨).
 */
function sla(hours: number | null): string {
  if (hours === null) return 'بلا التزام';
  if (hours === 0) return 'فوريّ';
  if (hours < 72) return `ساعات (${toArabicDigits(String(hours))})`;
  return `أيّام (${toArabicDigits(String(Math.round(hours / 24)))})`;
}

/**
 * ═══ A28 — مزوّدو الخدمات والتمويل ═══
 *
 * **التعطيل يمنع الإسناد الجديد ولا يمسّ الجاري** — والشاشة تقول لمن
 * عطّل كم طلبًا سيُكمله المزوّد. وإسقاطُ الجاري يترك عميلًا دفع بلا من
 * ينفّذ، والعقوبة على المزوّد لا على العميل.
 */
export function ProviderTable({ rows, canEdit }: { rows: readonly ProviderRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (row: ProviderRow): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/providers/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { data?: { openRequests?: number }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }

      const open = payload?.data?.openRequests ?? 0;
      setToast(
        row.active
          ? open === 0
            ? 'عُطّل — ولن يستلم إسنادًا جديدًا.'
            : `عُطّل — ولن يستلم إسنادًا جديدًا. والطلبات القائمة (${toArabicDigits(String(open))}) يُكملها.`
          : 'فُعّل — ودخل الإسناد الآليّ.',
      );
      router.refresh();
    });
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-3xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="p-3 text-start font-bold">المزوّد</th>
              <th className="p-3 text-start font-bold">النوع</th>
              <th className="p-3 text-start font-bold">العمولة</th>
              <th className="p-3 text-start font-bold">الالتزام</th>
              <th className="p-3 text-start font-bold">المدن</th>
              <th className="p-3 text-start font-bold">الحِمل القائم</th>
              <th className="p-3 text-start font-bold">مفعّل</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="bidi-isolate font-bold">{row.nameAr}</span>
                    {row.servicesLinked === 0 ? (
                      // مزوّدٌ بلا خدمةٍ مرتبطة لا يصله إسنادٌ أبدًا
                      <span className="text-3xs opacity-45">بلا خدمة مرتبطة</span>
                    ) : (
                      <span className="text-3xs opacity-45">
                        خدمات مرتبطة ({toArabicDigits(String(row.servicesLinked))})
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3 opacity-75">{PROVIDER_TYPE_LABEL[row.type] ?? row.type}</td>
                <td className="font-num p-3 opacity-75">
                  {row.commissionPct === null
                    ? '—'
                    : `${toArabicDigits(String(Number(row.commissionPct)))}٪`}
                </td>
                <td className="p-3 opacity-75">{sla(row.slaHours)}</td>
                <td className="p-3 opacity-75">
                  {row.cities.length === 0 ? 'كل المدن' : row.cities.join(' · ')}
                </td>
                <td className="p-3">
                  <span className="flex items-center gap-2.5">
                    <span className="font-num">{toArabicDigits(String(row.openRequests))}</span>
                    {row.breached === 0 ? null : (
                      <Badge tone="danger">
                        تجاوز ({toArabicDigits(String(row.breached))})
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="p-3">
                  <Badge tone={row.active ? 'accent' : 'neutral'}>
                    {row.active ? 'مفعّل' : 'معطّل'}
                  </Badge>
                </td>
                <td className="p-3 text-end">
                  {canEdit ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                      {row.active ? 'عطّله' : 'فعّله'}
                    </Button>
                  ) : (
                    <span className="text-3xs opacity-40">قراءة</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
