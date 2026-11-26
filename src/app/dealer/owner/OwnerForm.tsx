'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ ما يفتح النشرَ والتحويل — داخل اللوحة ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «المعارض فصفحته هي لوحة تحكمه». وكانت هذه
 * الحقولُ الثلاثة في `/ar/account/profile` وحدها، فلمّا أُغلقت صفحةُ
 * الحساب على عضو المعرض **بقي الشرطُ مفروضًا بلا بابٍ يُستوفى منه**:
 * يسجّل، ويدخل لوحتَه، ويجهّز مخزونَه — ثمّ لا ينشر ولو اعتُمد سجلُّه،
 * ولا يُحوَّل إليه ريال.
 *
 * والمسارُ هو `PATCH /api/v1/me/profile` نفسُه: القاعدةُ تُكتب مرّة،
 * ونسخةٌ ثانيةٌ للتحقّق تتباعد أوّلَ تغيير.
 */
export function OwnerForm({
  email: savedEmail,
  businessName: savedBusinessName,
  crNumber: savedCr,
  vatNumber: savedVat,
  bankName: savedBank,
  identityStatus,
  hasIban,
}: {
  email: string | null;
  businessName: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  bankName: string | null;
  identityStatus: string;
  hasIban: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const [email, setEmail] = useState(savedEmail ?? '');
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [businessName, setBusinessName] = useState(savedBusinessName ?? '');
  const [crNumber, setCrNumber] = useState(savedCr ?? '');
  const [crExpiresAt, setCrExpiresAt] = useState('');
  const [vatNumber, setVatNumber] = useState(savedVat ?? '');
  const [bankName, setBankName] = useState(savedBank ?? '');
  const [iban, setIban] = useState('');

  function save(body: Record<string, unknown>, done: string): void {
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
        setToast(payload?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }
      setToast(done);
      router.refresh();
    });
  }

  const awaiting = identityStatus === 'PENDING' || identityStatus === 'CLARIFICATION';
  const verified = identityStatus === 'VERIFIED';

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">البريد الإلكتروني</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          تصلك عليه الفواتير وإشعارات الطلبات.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            dir="ltr"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`${field} bidi-ltr min-w-0 flex-1`}
          />
          <Button
            size="sm"
            disabled={pending || email.trim() === ''}
            onClick={() => save({ field: 'email', email }, 'حفظ البريد.')}
          >
            حفظ
          </Button>
        </div>
      </section>

      {/*
        ═══ توثيق المنشأة لا الفرد ═══

        المعرضُ منشأةٌ لها سجلٌّ ورقمٌ ضريبيّ، وفرعُ الفرد يترك الحسابَ
        بلا اسمِ منشأةٍ ولا سجلّ — فلا يُعرف باسم مَن تُصدَر فاتورتُه.
        والشخصُ والمنشأةُ في طلبٍ واحد: قرارٌ واحد على صورةٍ كاملة لا
        قراران على نصفين.
      */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">توثيق المنشأة</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          {verified
            ? 'منشأتك موثقة — وبها تصدر فواتيرك باسمها ورقمها.'
            : awaiting
              ? 'طلبك قيد المراجعة — تصلك رسالة فور البت فيه.'
              : 'بلا توثيق لا ينشر إعلان ولا تصدر فاتورة باسم منشأتك.'}
        </p>

        {verified || awaiting ? null : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-70">اسم المفوض بالتوقيع — كما في الهوية</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-70">رقم هويته</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
                className={`${field} font-num bidi-ltr`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-70">اسم المنشأة — كما في السجل</span>
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                className={field}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-3xs opacity-70">رقم السجل التجاري</span>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  value={crNumber}
                  onChange={(event) => setCrNumber(event.target.value)}
                  placeholder="1010XXXXXX"
                  className={`${field} font-num bidi-ltr`}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-3xs opacity-70">انتهاء السجل</span>
                <input
                  dir="ltr"
                  type="date"
                  value={crExpiresAt}
                  onChange={(event) => setCrExpiresAt(event.target.value)}
                  className={`${field} font-num`}
                />
              </label>
            </div>
            <p className="-mt-1 text-3xs opacity-65">والسجل المنتهي لا يوثق به.</p>
            <label className="flex flex-col gap-1">
              <span className="text-3xs opacity-70">
                الرقم الضريبي — اتركه فارغا إن لم تكن مسجلا
              </span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={vatNumber}
                onChange={(event) => setVatNumber(event.target.value)}
                placeholder="3XXXXXXXXXXXXX3"
                className={`${field} font-num bidi-ltr`}
              />
            </label>
            <div>
              <Button
                size="sm"
                disabled={
                  pending ||
                  fullName.trim() === '' ||
                  nationalId.trim() === '' ||
                  businessName.trim() === '' ||
                  crNumber.trim() === ''
                }
                onClick={() =>
                  save(
                    {
                      field: 'business',
                      signatoryName: fullName,
                      signatoryNationalId: nationalId,
                      businessName,
                      crNumber,
                      crExpiresAt,
                      vatNumber,
                    },
                    'أرسل طلب التوثيق.',
                  )
                }
              >
                وثق المنشأة
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">حساب التحويل</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          {hasIban
            ? 'مسجل — وإليه تحول مستحقاتك.'
            : 'بلا آيبان لا يحول إليك شيء مهما بعت.'}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">اسم المصرف</span>
            <input
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              className={field}
            />
            </label>
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">
              {hasIban ? 'آيبان جديد يحل محل المحفوظ' : 'الآيبان'}
            </span>
            {/* يُلصق من تطبيق المصرف بمسافاته — والتطبيع عند الحفظ */}
            <input
              dir="ltr"
              value={iban}
              onChange={(event) => setIban(event.target.value)}
              placeholder="SA00 0000 0000 0000 0000 0000"
              className={`${field} font-num bidi-ltr`}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || bankName.trim() === ''}
              onClick={() => save({ field: 'bankName', bankName }, 'حفظ اسم المصرف.')}
            >
              حفظ المصرف
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || iban.trim().length < 10}
              onClick={() => save({ field: 'iban', iban }, 'حفظ الآيبان.')}
            >
              حفظ الآيبان
            </Button>
          </div>
        </div>
      </section>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
