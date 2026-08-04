'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { toArabicDigits } from '@/lib/arabic';
import type { TeamMember } from '@/lib/domain/admin-team';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ A35 — الفريق ═══
 *
 * **الشاشة تعرض ولا تمنح.** إنشاء عضوٍ أو تغيير دوره ليس فيها: رفعُ
 * الصلاحية أخطر ما في اللوحة، ويمرّ بـ`ADMIN_EMAIL` في مزامنة الإقلاع
 * — أي بمن يملك لوحة النشر لا بمن يملك جلسةً هنا. وزرٌّ في الشاشة
 * يجعل من سرق جلسةَ `SUPER_ADMIN` يصنع لنفسه حسابًا ثانيًا.
 *
 * والفعل الوحيد **إنهاء الجلسات**: جهازٌ ضاع أو عضوٌ غادر — ويُحتاج
 * في اللحظة، ولا ينتظر نشرة.
 */

const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

export function TeamTable({ rows, meId }: { rows: readonly TeamMember[]; meId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const revoke = (row: TeamMember): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/team/${row.id}/sessions`, { method: 'DELETE' })
        .catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string }; data?: { revoked?: number } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذّر إنهاء الجلسات.');
        return;
      }

      setToast('أُنهيت جلساته — يلزمه دخولٌ جديد.');
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2.5">
                <span className="bidi-isolate truncate text-sm font-bold">{row.name}</span>
                {row.id === meId ? <Badge tone="neutral">أنت</Badge> : null}
              </span>
              {/* البريد يُقارن خانةً بخانة — لاتينيّ معزول */}
              <span dir="ltr" className="truncate text-2xs opacity-60">
                {row.email}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <span className="font-num text-2xs font-bold">{row.role}</span>

              <div className="flex flex-col items-start gap-0.5">
                <span className="text-2xs opacity-70">
                  {row.lastSeenAt === null
                    ? 'لم يدخل بعد'
                    : riyadh.format(new Date(row.lastSeenAt))}
                </span>
                {/*
                  عدد الجلسات يكشف حسابًا مشتركًا: أربع جلسات حيّة
                  لعضوٍ واحد ليست أربعة أجهزة غالبًا.
                */}
                <span className="text-3xs opacity-45">
                  جلسات حيّة ({toArabicDigits(String(row.activeSessions))})
                </span>
              </div>

              {row.locked ? <Badge tone="warn">مقفل</Badge> : null}
              {row.status === 'active' ? null : <Badge tone="neutral">{row.status}</Badge>}

              <Button
                size="sm"
                variant="outline"
                disabled={pending || row.id === meId || row.activeSessions === 0}
                onClick={() => revoke(row)}
              >
                {row.id === meId ? 'استعمل الخروج' : 'أنهِ جلساته'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
