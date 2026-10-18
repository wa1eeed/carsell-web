'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ حالُ الحساب — والقفلُ كان بلا مفتاح ═══
 *
 * الدخول يرفض `SUSPENDED` و`BANNED` منذ اليوم الأول، والصلاحية
 * `users.suspend` معرَّفةٌ وممنوحة، واللوحة تعرض شريحتَي «موقوفون»
 * و«محظورون» — **ولا سطر في المنتج كلّه يكتب `User.status`**.
 * فالعدّادان صفرٌ أبدًا، وبائعٌ محتالٌ لا يُوقفه أحد.
 *
 * ═══ ودرجتان لا واحدة ═══
 *
 * **الإيقاف** مؤقّتٌ يُرفع — وهو ما يُستعمل أثناء التحقيق.
 * **الحظر** دائمٌ ولا يقع على من له طلبٌ حيٌّ أو ضمانٌ محجوز: قطعُ
 * جلسته يتركه بلا بابٍ يُكمل منه ولا يُلغي، ومالُه عند البوّابة.
 */

const REASON_MIN = 10;

const LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  BANNED: 'محظور',
};

const TONE: Record<string, 'accent' | 'warn' | 'danger'> = {
  ACTIVE: 'accent',
  SUSPENDED: 'warn',
  BANNED: 'danger',
};

/** ما يُقال قبل الضغط — لا بعده. */
const EXPLAIN: Record<string, string> = {
  SUSPENDED: 'يمنع من الدخول ومن كل إجراء، وجلسته القائمة تنقطع فورا. ويرفع متى شئت.',
  BANNED: 'حظر دائم — لا يرفع إلا بقرار ثاني منك. ولا يقع على من له طلب حي أو ضمان محجوز.',
  ACTIVE: 'يعود الحساب كما كان، ويصل صاحبه إشعار بذلك.',
};

export function StatusPanel({
  userId,
  status,
  canSuspend,
}: {
  userId: string;
  status: string;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const send = (): void => {
    if (target === null || reason.trim().length < REASON_MIN) return;
    start(async () => {
      const response = await fetch(`/api/v1/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target, reason: reason.trim() }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر تغيير حال الحساب.');
        return;
      }

      setTarget(null);
      setReason('');
      setToast(`صار الحساب ${LABEL[target] ?? target}.`);
      router.refresh();
    });
  };

  /** الانتقالات المعروضة — وما هو فيه الآن لا يُعرض. */
  const choices = ['ACTIVE', 'SUSPENDED', 'BANNED'].filter((key) => key !== status);

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-sm font-bold">حال الحساب</h2>
        <Badge tone={TONE[status] ?? 'neutral'}>{LABEL[status] ?? status}</Badge>
      </div>

      {!canSuspend ? (
        <p className="text-2xs leading-loose opacity-70">
          لا تملك صلاحية إيقاف الحسابات — تمنح لمن يتولى التشغيل.
        </p>
      ) : (
        <>
          <p className="mb-3.5 max-w-lg text-2xs leading-loose opacity-70">
            {/*
              **ويُقال ما يقع قبل أن يقع.** الإيقاف يقطع الجلسة القائمة
              لا الدخول وحده — ومن لا يعرف ذلك يظنّه إجراءً ألطف ممّا هو.
            */}
            الإيقاف يقطع جلسته القائمة فورا ويمنع كل إجراء، والسبب يسجل ويصل صاحبه.
          </p>

          <div className="flex flex-wrap gap-2">
            {choices.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={key === 'ACTIVE' ? 'primary' : key === 'BANNED' ? 'danger' : 'outline'}
                disabled={busy}
                onClick={() => {
                  setTarget(key);
                  setReason('');
                }}
              >
                {key === 'ACTIVE' ? 'أعد تفعيله' : key === 'SUSPENDED' ? 'أوقفه' : 'احظره'}
              </Button>
            ))}
          </div>
        </>
      )}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={
          target === 'ACTIVE' ? 'إعادة تفعيل الحساب' : target === 'BANNED' ? 'حظر الحساب' : 'إيقاف الحساب'
        }
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTarget(null)} disabled={busy}>
              تراجع
            </Button>
            <Button
              variant={target === 'ACTIVE' ? 'primary' : 'danger'}
              size="sm"
              onClick={send}
              disabled={busy || reason.trim().length < REASON_MIN}
            >
              {busy ? 'يحفظ…' : 'نفذ'}
            </Button>
          </>
        }
      >
        <p className="mb-3.5 text-2xs leading-loose opacity-75">
          {target === null ? '' : EXPLAIN[target]}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold">
            {/*
              **والسبب يُقرأ بعد شهور.** «احتيال» وحدها لا تقول ما وقع،
              وهي أوّل ما يُسأل عنه حين يعترض صاحب الحساب.
            */}
            السبب — يسجل ويصل صاحب الحساب
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-line bg-bg p-3 text-2xs leading-loose outline-none focus:border-ink"
            placeholder="ما الذي وقع، ومتى، وما الذي يطلب منه ليعود"
          />
          {reason.trim().length >= REASON_MIN ? null : (
            <span className="text-3xs opacity-65">اكتب جملة تقرأ لاحقا — لا كلمة واحدة.</span>
          )}
        </label>
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </section>
  );
}
