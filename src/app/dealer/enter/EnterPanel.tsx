'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button, LinkButton } from '@/components/ui/Button';
import type { DealerMembership } from '@/lib/domain/dealer-membership';

import { Toast } from '@/components/ui/Toast';

/**
 * **والحالُ الثلاثُ تُقال صراحةً**: عضوٌ في معرضٍ معتمد يدخل، وعضوٌ
 * في معرضٍ ينتظر المراجعة يُخبَر بذلك، ومن ليس عضوًا يُدَلّ على
 * التسجيل. وزرٌّ واحدٌ يردّ خطأً في الحالات الثلاث يجعل كلَّ واحدٍ
 * منهم يظنّ العطلَ في النظام.
 */
export function EnterPanel({
  name,
  membership,
}: {
  name: string | null;
  membership: DealerMembership;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /**
   * ═══ ويدخل بلا ضغطة — قرار المالك ٢٠٢٦-١١-٢٦ ═══
   *
   * «المفترض المعرض يسجل و يدخل للوحة تحكمه مباشره». وعضوٌ في معرضٍ
   * معتمد لا يُسأل «أتريد الدخول؟»: جوابُه معلومٌ قبل السؤال.
   *
   * **والزرُّ يبقى** لمن فشل عنده الطلب — فشاشةٌ تقول «يفتح…» أبدًا
   * بلا ما يُضغط أسوأ من ضغطة.
   *
   * **والكوكي لا يُكتب من مكوّن خادم**، فالفتحُ نداءٌ من العميل:
   * و`useRef` يمنع تكرارَه في التركيب المزدوج لوضع التطوير.
   */
  const tried = useRef(false);

  const enter = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/auth/session', { method: 'POST' }).catch(() => null);
      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;
      if (response === null || !response.ok) {
        setToast(payload?.error?.messageAr ?? 'تعذر فتح اللوحة.');
        return;
      }
      router.replace('/dealer');
    });
  };

  useEffect(() => {
    if (membership.state !== 'MEMBER' || tried.current) return;
    tried.current = true;
    enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership.state]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7">
        <p className="text-3xs font-bold tracking-widest opacity-65">DEALER DASHBOARD</p>
        <h1 className="mt-2.5 text-2xl font-bold">لوحة المعرض</h1>

        {membership.state === 'NOT_A_MEMBER' ? (
          <>
            <p className="mt-3.5 text-2xs leading-loose opacity-75">
              حسابك {name === null ? '' : `(${name}) `}ليس عضوا في أي معرض. سجل معرضك
              بسجله التجاري، وبعد اعتماده تفتح لك اللوحة.
            </p>
            <LinkButton href="/ar/auth/dealer" className="mt-5 w-full">
              سجل معرضك
            </LinkButton>
          </>
        ) : membership.state === 'DEALER_NOT_ACTIVE' ? (
          <>
            <p className="mt-3.5 text-2xs leading-loose opacity-75">
              معرضك <b>{membership.dealerName}</b> ينتظر اعتماد سجله التجاري. تصلك رسالة فور
              اعتماده، وتفتح اللوحة عندها.
            </p>
            <LinkButton href="/ar/account" variant="outline" className="mt-5 w-full">
              إلى حسابي
            </LinkButton>
          </>
        ) : (
          <>
            <p className="mt-3.5 text-2xs leading-loose opacity-75">
              تدخل لوحة <b>{membership.dealerName}</b> باسم {name ?? 'حسابك'}.
            </p>
            {/*
              **وجلسةُ اللوحة غيرُ جلسة المتجر.** يُقال ذلك هنا لا بعد
              أن يخرج فيجد نفسه ما زال داخلا في المتجر فيظنّ الخروج لم
              يقع.
            */}
            <p className="mt-2 text-3xs leading-loose opacity-65">
              جلسة اللوحة مستقلة عن جلسة المتجر ومدتها ١٢ ساعة — فخروجك منها لا
              يخرجك من حسابك الشخصي.
            </p>
            <Button className="mt-5 w-full" disabled={pending} onClick={enter}>
              {pending ? 'يفتح…' : 'افتح اللوحة'}
            </Button>
          </>
        )}
      </div>
      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
