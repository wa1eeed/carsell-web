'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { DEALER_ROLE_AR } from '@/lib/labels/dealer';
import type { TeamView } from '@/lib/domain/dealer-team';
import type { BranchRow } from '@/lib/domain/dealer-branches';

const ROLES = [
  ['MANAGER', 'مدير — كل الفروع، ويعدل الفريق'],
  ['SALES', 'مبيعات — فرعه وحده'],
  ['ACCOUNTANT', 'محاسب — الفواتير كلها، والمخزون قراءة'],
] as const;

export function TeamPanel({ team, branches }: { team: TeamView; branches: readonly BranchRow[] }) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<string>('SALES');
  const [branchId, setBranchId] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const call = (body: unknown, method: 'POST' | 'DELETE'): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/team', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;
      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر التنفيذ.');
        return;
      }
      setInviting(false);
      setPhone('');
      setToast(method === 'POST' ? 'أرسلت الدعوة — ويصير عضوا بأول دخول برقمه.' : 'سحبت الدعوة.');
      router.refresh();
    });
  };

  const full = team.seatsTotal !== null && team.seatsUsed >= team.seatsTotal;

  return (
    <>
      {toast === null ? null : <Toast title={toast} />}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/*
          **والمقعدُ يشغله المدعوُّ كما يشغله العضو.** دعوةٌ معلّقة لا
          تُحسب تجعل المعرضَ يدعو أكثر من مقاعده، فيُردّ من قبل الدعوة
          — وبابٌ فُتح ثمّ أُغلق في وجه من دخل أسوأ من بابٍ لم يُفتح.
        */}
        <p className="text-2xs opacity-75">
          المقاعد من الباقة —{' '}
          <b className="font-bold">
            <ArabicNumber value={team.seatsUsed} />
          </b>
          {team.seatsTotal === null ? null : (
            <>
              {' '}
              من{' '}
              <b className="font-bold">
                <ArabicNumber value={team.seatsTotal} />
              </b>
            </>
          )}
        </p>
        <Button disabled={full} onClick={() => setInviting(true)}>
          {full ? 'لا مقاعد شاغرة' : 'ادع عضوا'}
        </Button>
      </div>

      <div className="no-scrollbar mb-9 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-xl border-collapse text-2xs">
          <thead>
            <tr className="border-b border-line bg-surface text-3xs opacity-70">
              <th className="p-3 text-start font-bold">العضو</th>
              <th className="p-3 text-start font-bold">الدور</th>
              <th className="p-3 text-start font-bold">الفرع</th>
              <th className="p-3 text-start font-bold">الحالة</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {team.members.map((member) => (
              <tr key={member.userId ?? member.inviteId} className="border-b border-line-2 last:border-b-0">
                <td className="p-3">
                  <span className="block font-bold">{member.name ?? 'لم يدخل بعد'}</span>
                  <span dir="ltr" className="font-num block text-3xs opacity-65">
                    {member.phone}
                  </span>
                </td>
                <td className="p-3">{DEALER_ROLE_AR[member.role]}</td>
                <td className="p-3">
                  {member.branchName ?? <span className="opacity-65">كل الفروع</span>}
                </td>
                <td className="p-3">
                  <Badge tone={member.pending ? 'warn' : 'accent'} size="sm">
                    {member.pending ? 'دعوة معلقة' : 'نشط'}
                  </Badge>
                </td>
                <td className="p-3 text-end">
                  {member.inviteId === null ? null : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => call({ inviteId: member.inviteId }, 'DELETE')}
                      className="rounded-btn border border-line px-2.5 py-1 text-3xs font-bold hover:border-ink disabled:opacity-50"
                    >
                      اسحب
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={inviting} onClose={() => setInviting(false)} title="ادع عضوا">
        <p className="mb-3.5 text-2xs leading-loose opacity-75">
          الدعوة بجواله، ويصير عضوا بأول دخول برمزه هو — <b>ولا كلمة مرور تتداول</b>،
          فما يفعله كل عضو يبقى منسوبا إليه.
        </p>
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">رقم الجوال</span>
            <input
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05XXXXXXXX"
              className="font-num rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">الدور</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
            >
              {ROLES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {/* **والفرعُ يُطلب لمن يُحصر به وحده** — ومديرٌ ومحاسبٌ لا فرعَ لهما. */}
          {role !== 'SALES' || branches.length === 0 ? null : (
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-70">الفرع</span>
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-2xs"
              >
                <option value="">اختر الفرع…</option>
                {branches
                  .filter((branch) => branch.active)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} — {branch.city}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Button
            className="mt-1.5 w-full"
            disabled={
              pending ||
              phone.trim().length < 9 ||
              /* **والفرعُ شرطٌ للمبيعات متى كان للمعرض فروع** — وبلا فرعٍ يرى الكلّ. */
              (role === 'SALES' && branchId === '' && branches.some((branch) => branch.active))
            }
            onClick={() =>
              call(
                {
                  phone: phone.trim(),
                  role,
                  branchId: role === 'SALES' && branchId !== '' ? branchId : null,
                },
                'POST',
              )
            }
          >
            {pending ? 'يرسل…' : 'أرسل الدعوة'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
