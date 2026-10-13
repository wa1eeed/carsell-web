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

  /**
   * ═══ فردٌ أم منشأة — ويُسأل هنا لا عند التسجيل ═══
   *
   * الدخول برقمٍ ورمز، وزيادةُ خطوةٍ عليه تُثقل الأكثرية بلا داعٍ.
   * والسؤال يقع حيث يجب أن يُعرَف الجواب أصلًا: عند أوّل توثيق،
   * وهو شرطُ أوّل شراءٍ أو بيع.
   *
   * **ولا يُسأل بعد التوثيق**: من وُثّق فردًا يصير معرضًا بمراجعةٍ
   * لا بتبديل خانة.
   */
  const [isBusiness, setIsBusiness] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [crExpiresAt, setCrExpiresAt] = useState('');
  const [vatNumber, setVatNumber] = useState('');
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
          <div className="flex flex-col gap-3">
            {/*
              **والسؤال أوّلًا لأنه يغيّر ما بعده.** من يختار «منشأة»
              يُسأل عن سجلّها، ومن يختار «فرد» لا يرى الحقول أصلًا —
              واستمارةٌ تعرض الكلّ ثمّ تتجاهل نصفه تُعلّم الناس أن
              الحقول اختيارية.
            */}
            <div className="flex flex-wrap gap-2">
              <TypeChip on={!isBusiness} onClick={() => setIsBusiness(false)}>
                فرد
              </TypeChip>
              <TypeChip on={isBusiness} onClick={() => setIsBusiness(true)}>
                منشأة — معرض أو وكالة
              </TypeChip>
            </div>

            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder={isBusiness ? 'اسم المفوَّض كما في هويته' : 'الاسم الرباعي'}
              className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
            />

            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-55">
                {isBusiness ? 'رقم هوية المفوَّض' : 'رقم الهوية'}
              </span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
                placeholder="1XXXXXXXXX"
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
              />
            </label>

            {!isBusiness ? null : (
              <>
                {/*
                  **والشخصُ والمنشأة في طلبٍ واحد.** تقسيمُهما طلبين
                  يجعل المحرّر يقرّر مرّتين على نصف صورة، ويترك حسابًا
                  موثَّقَ الشخص غيرَ موثَّق المنشأة يشتري باسم نفسه
                  ويبيع باسمها.
                */}
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="اسم المنشأة كما في السجلّ التجاري"
                  className="rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
                />

                {/*
                  **والوصف خارج الحقل لا داخله.** الحقل `dir="ltr"` لأنه
                  يُنسخ من وثيقة ويُقارن خانةً بخانة — ونصٌّ عربيّ في
                  نائبه ينكسر ترتيبُه فيُقرأ «(السجل التجاري — 1010X».
                */}
                <div className="flex flex-wrap gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-3xs opacity-55">رقم السجل التجاري</span>
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      value={crNumber}
                      onChange={(event) => setCrNumber(event.target.value)}
                      placeholder="1010XXXXXX"
                      className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-3xs opacity-55">انتهاء السجل</span>
                    <input
                      dir="ltr"
                      type="date"
                      value={crExpiresAt}
                      onChange={(event) => setCrExpiresAt(event.target.value)}
                      className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
                    />
                  </label>
                </div>
                <p className="-mt-1 text-3xs opacity-45">والسجل المنتهي لا يُوثَّق به.</p>

                <label className="flex flex-col gap-1">
                  <span className="text-3xs opacity-55">
                    الرقم الضريبي — اتركه فارغًا إن لم تكن مسجَّلًا
                  </span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={vatNumber}
                    onChange={(event) => setVatNumber(event.target.value)}
                    placeholder="3XXXXXXXXXXXXX3"
                    className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
                  />
                </label>
              </>
            )}

            <div>
              <Button
                size="sm"
                disabled={
                  pending ||
                  nationalId.trim() === '' ||
                  fullName.trim() === '' ||
                  (isBusiness && (businessName.trim() === '' || crNumber.trim() === ''))
                }
                onClick={() =>
                  save(
                    'idVerification',
                    isBusiness
                      ? {
                          field: 'business',
                          signatoryName: fullName,
                          signatoryNationalId: nationalId,
                          businessName,
                          crNumber,
                          crExpiresAt,
                          vatNumber,
                        }
                      : { field: 'identity', nationalId, fullName },
                  )
                }
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

/** اختيارُ نوع الحساب — زرٌّ بحالةٍ محلّية، فلا عنوانَ يحملها قبل الحفظ. */
function TypeChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        on
          ? 'rounded-full bg-ink px-4 py-2 text-2xs font-bold text-bg'
          : 'rounded-full border border-line px-4 py-2 text-2xs font-semibold hover:border-ink'
      }
    >
      {children}
    </button>
  );
}
