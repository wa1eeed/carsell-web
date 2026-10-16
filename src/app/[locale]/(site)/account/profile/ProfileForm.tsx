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
  cities,
}: {
  initial: {
    email: string | null;
    name: string | null;
    idVerified: boolean;
    hasIban: boolean;
    city: string | null;
    address: string | null;
    bankName: string | null;
    isBusiness: boolean;
    /** `null` تعني: لم يُسأل بعد — وهي غيرُ «لا تنطبق عليّ». */
    vatRegistered: boolean | null;
    vatNumber: string | null;
  };
  missing: readonly Field[];
  /** مدنُ المنصّة — من جدول المقاطع نفسه الذي يبني الروابط. */
  cities: readonly string[];
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
  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [bankName, setBankName] = useState(initial.bankName ?? '');
  /**
   * **والرقم الضريبيّ حالةٌ واحدة لحقلٍ واحد.** يكتبه صفُّ الضريبة
   * ويقرؤه فرعُ المنشأة — وحالتان له تجعلان المحرّر يكتبه في موضعٍ
   * ويحفظه من الآخر فارغًا.
   */
  const [vatRegistered, setVatRegistered] = useState(initial.vatRegistered);
  const [iban, setIban] = useState('');

  /**
   * **ومسارُ الضريبة غيرُ مسار الملف.** `PUT /account/tax-status` يكتب
   * الحالة والرقم معًا ويفحص بنيته — ونسخُ فحصِه هنا يُنتج قاعدتين.
   */
  const saveTax = (registered: boolean): void => {
    start(async () => {
      const response = await fetch('/api/v1/account/tax-status', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: registered ? 'VAT_REGISTERED' : 'INDIVIDUAL',
          ...(registered ? { vatNumber } : {}),
        }),
      }).catch(() => null);

      const payload = (await response?.json().catch(() => null)) as
        | { error?: { messageAr?: string; fields?: Record<string, string> } }
        | null;

      if (response === null || !response.ok || payload?.error !== undefined) {
        setErrors((prev) => ({
          ...prev,
          taxStatus: payload?.error?.fields?.vatNumber ?? payload?.error?.messageAr ?? 'تعذّر الحفظ.',
        }));
        return;
      }
      setErrors((prev) => ({ ...prev, taxStatus: undefined }));
      setToast('حُفظ الوضع الضريبي.');
      router.refresh();
    });
  };

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
          <p className="text-2xs opacity-70">موثّقة — لا تُعدَّل من هنا.</p>
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
              <span className="text-3xs opacity-70">
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
                    <span className="text-3xs opacity-70">رقم السجل التجاري</span>
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
                    <span className="text-3xs opacity-70">انتهاء السجل</span>
                    <input
                      dir="ltr"
                      type="date"
                      value={crExpiresAt}
                      onChange={(event) => setCrExpiresAt(event.target.value)}
                      className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
                    />
                  </label>
                </div>
                <p className="-mt-1 text-3xs opacity-65">والسجل المنتهي لا يُوثَّق به.</p>

                <label className="flex flex-col gap-1">
                  <span className="text-3xs opacity-70">
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

      {/*
        ═══ والمدينة للفرد والعنوان للمنشأة ═══

        عنوانُ منشأةٍ يحمل مدينتَها، فسؤالُها عنهما معًا تكرار. ومن
        يفتح ملفَّه لا يرى إلا ما يلزمه — واستمارةٌ تعرض الكلّ ثمّ
        تتجاهل نصفه تُعلّم الناس أن الحقول اختيارية.
      */}
      {initial.isBusiness ? (
        <Row
          id="address"
          title="عنوان المنشأة"
          note="كما في السجل التجاري — يظهر في فاتورتك."
          done={!missing.includes('address')}
          error={errors.address}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="الحي، الشارع، المدينة"
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
            />
            <Button
              size="sm"
              disabled={pending || address.trim() === ''}
              onClick={() => save('address', { field: 'address', address })}
            >
              حفظ
            </Button>
          </div>
        </Row>
      ) : (
        <Row
          id="city"
          title="المدينة"
          note="تُرشَّح بها العروض القريبة منك، وتُعرف منها نقطة الاستلام."
          done={!missing.includes('city')}
          error={errors.city}
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
            >
              <option value="">اختر المدينة</option>
              {cities.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending || city.trim() === ''}
              onClick={() => save('city', { field: 'city', city })}
            >
              حفظ
            </Button>
          </div>
        </Row>
      )}

      {/*
        ═══ والوضع الضريبيّ يُجاب لا يُملأ ═══

        «لا تنطبق عليّ» جوابٌ كامل — فالحقل يكتمل بأن يُسأل ويُجاب، لا
        بوجود رقم. وإلّا بقي ملفُّ كلِّ فردٍ غير مسجَّل ناقصًا إلى الأبد
        مهما فعل.
      */}
      <Row
        id="taxStatus"
        title="الوضع الضريبي"
        note="هل تنطبق عليك ضريبة القيمة المضافة؟ — يحدّد شكل فاتورتك."
        done={!missing.includes('taxStatus')}
        error={errors.taxStatus}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <TypeChip on={vatRegistered === false} onClick={() => setVatRegistered(false)}>
              لا تنطبق عليّ
            </TypeChip>
            <TypeChip on={vatRegistered === true} onClick={() => setVatRegistered(true)}>
              مسجَّل في الضريبة
            </TypeChip>
          </div>

          {vatRegistered !== true ? null : (
            <input
              dir="ltr"
              inputMode="numeric"
              value={vatNumber}
              onChange={(event) => setVatNumber(event.target.value)}
              placeholder="3XXXXXXXXXXXXX3"
              className="font-num rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
            />
          )}

          <div>
            <Button
              size="sm"
              disabled={
                pending ||
                vatRegistered === null ||
                (vatRegistered && vatNumber.trim() === '')
              }
              onClick={() => saveTax(vatRegistered === true)}
            >
              حفظ
            </Button>
          </div>
        </div>
      </Row>

      {/*
        **واسمُ المصرف مع الآيبان لا بعده.** من يطابق كشف تحويلٍ بيد
        يقرأ اسمًا لا أربعًا وعشرين خانة — والصفّان متجاوران لأنهما
        جوابٌ واحد.
      */}
      <Row
        id="bankName"
        title="اسم المصرف"
        note="يُقرأ في كشف التحويل — والآيبان وحده لا يُطابَق بالعين."
        done={!missing.includes('bankName')}
        error={errors.bankName}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder="مصرف الراجحي"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm"
          />
          <Button
            size="sm"
            disabled={pending || bankName.trim() === ''}
            onClick={() => save('bankName', { field: 'bankName', bankName })}
          >
            حفظ
          </Button>
        </div>
      </Row>

      <Row
        id="iban"
        title="الآيبان"
        note="إليه يصل مبلغ البيع بعد نقل الملكية. للبيع وحده — الشراء لا يحتاجه."
        done={!missing.includes('iban')}
        error={errors.iban}
      >
        {initial.hasIban ? (
          <p className="text-2xs opacity-70">محفوظ ومشفّر — أدخِل آيبانًا جديدًا ليحلّ محلّه.</p>
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
      <p className="mb-3 text-2xs leading-loose opacity-70">{note}</p>
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
