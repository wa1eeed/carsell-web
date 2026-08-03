'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import type { MissingField } from '@/lib/domain/profile';

/**
 * ═══ إكمال الملف — القفل الذي لم يكن له مفتاح ═══
 *
 * الحساب يقول «لن تستطيع الشراء قبل إكمال البريد وتوثيق الهوية»،
 * والحارس يمنع، والروابط الثلاثة كانت تؤدّي إلى ٤٠٤. فكل مستخدمٍ
 * مسجَّل ممنوعٌ من كل معاملة، ولا سبيل أمامه.
 *
 * **والحقول الثلاثة تُحفظ كلٌّ على حدة** — لا استمارة واحدة تُرفض كلها
 * لخطأ في حقل. ومن أكمل البريد لا يُطالَب بإعادته لأن الآيبان أخطأ.
 */

type Field = MissingField;

export function ProfileForm({
  initial,
  missing,
}: {
  initial: { email: string | null; name: string | null; idVerified: boolean; hasIban: boolean };
  missing: readonly Field[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const [email, setEmail] = useState(initial.email ?? '');
  const [fullName, setFullName] = useState(initial.name ?? '');
  const [nationalId, setNationalId] = useState('');
  const [iban, setIban] = useState('');

  const save = (field: Field, body: Record<string, string>): void => {
    start(async () => {
      const response = await fetch('/api/v1/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setErrors((prev) => ({
          ...prev,
          [field]: payload?.error?.messageAr ?? 'تعذّر الحفظ.',
        }));
        return;
      }

      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setToast('حُفظ.');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <Row
        id="email"
        title="البريد الإلكتروني"
        note="تصلك عليه الفواتير وإشعارات الطلب."
        done={!missing.includes('email')}
        error={errors.email}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* البريد يُقارن خانةً بخانة — لاتينيّ معزول */}
          <input
            dir="ltr"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
          />
          <Button
            size="sm"
            disabled={pending || email.trim() === ''}
            onClick={() => save('email', { field: 'email', email })}
          >
            حفظ
          </Button>
        </div>
      </Row>

      <Row
        id="idVerification"
        title="توثيق الهوية"
        note="الاسم كما في الهوية — يُقارن به عند نقل الملكية."
        done={!missing.includes('idVerification')}
        error={errors.idVerification}
      >
        {initial.idVerified ? (
          <p className="text-2xs opacity-60">موثّقة — لا تُعدَّل من هنا.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="الاسم الرباعي"
              className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                dir="ltr"
                inputMode="numeric"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
                placeholder="1XXXXXXXXX"
                className="font-num min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
              <Button
                size="sm"
                disabled={pending || nationalId.trim() === '' || fullName.trim() === ''}
                onClick={() => save('idVerification', { field: 'identity', nationalId, fullName })}
              >
                وثّق
              </Button>
            </div>
          </div>
        )}
      </Row>

      <Row
        id="iban"
        title="الآيبان"
        note="إليه يصل مبلغ البيع بعد نقل الملكية. للبيع وحده — الشراء لا يحتاجه."
        done={!missing.includes('iban')}
        error={errors.iban}
      >
        {initial.hasIban ? (
          <p className="text-2xs opacity-60">محفوظ ومشفّر — أدخِل آيبانًا جديدًا ليحلّ محلّه.</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* يُلصق من تطبيق المصرف بمسافاته — والتطبيع عند الحفظ */}
          <input
            dir="ltr"
            value={iban}
            onChange={(event) => setIban(event.target.value)}
            placeholder="SA00 0000 0000 0000 0000 0000"
            className="font-num min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
          />
          <Button
            size="sm"
            disabled={pending || iban.trim() === ''}
            onClick={() => save('iban', { field: 'iban', iban })}
          >
            حفظ
          </Button>
        </div>
      </Row>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}

function Row({
  id,
  title,
  note,
  done,
  error,
  children,
}: {
  id: string;
  title: string;
  note: string;
  done: boolean;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    /* المعرّف هدفُ الرابط القادم من الحساب — `#email` وأخواته */
    <section id={id} className="rounded-lg border border-line bg-surface p-4 scroll-mt-24">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">{title}</h2>
        <Badge tone={done ? 'accent' : 'warn'}>{done ? 'مكتمل' : 'ناقص'}</Badge>
      </div>
      <p className="mb-3 text-2xs leading-loose opacity-55">{note}</p>
      {children}
      {error === undefined ? null : (
        <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-2xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
