'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { displayDigits, toLatinDigits } from '@/lib/arabic';
import {
  ACCOUNT_DOCUMENT_LABEL,
  ACCOUNT_KIND_LABEL,
  ACCOUNT_OPEN_FAILURE,
  ACCOUNT_SIGNATORY_LABEL,
} from '@/lib/labels/provider';
import type { AccountFile } from '@/lib/domain/provider-account';

/**
 * ═══ فتحُ حساب الدفع — والزرُّ الذي لم يكن ═══
 *
 * `openAccount` كان مبنيًّا مختبَرًا ومُثبَتًا بنداءٍ حقيقيّ، **ولا شيء
 * في المنتج ينادِيه**: فمزوّدٌ يُضاف من اللوحة يبقى `NONE` إلى الأبد،
 * و`cityPool` تشترط `ACTIVE` أو `SEMI_ACTIVE` — فلا يصله طلبٌ أبدًا.
 *
 * **والفتحُ لا رجعةَ فيه**: حسابٌ لدى جهةٍ منظِّمة بشروطٍ تجاريّة،
 * ودعوةٌ تُرسَل إلى بريد. فالملفُّ يُحفظ ويُراجَع أوّلًا، والفتحُ فعلٌ
 * ثانٍ صريح.
 */
type Documents = { type: string; requiresUpload: boolean; count: number }[];

/** مسوّدةُ الملفّ — **مختومةٌ بمعرّف صاحبها**. */
type Draft = {
  id: string;
  kind: string;
  slug: string;
  website: string;
  adminEmail: string;
  owners: string;
  signatory: string;
  signatoryCount: string;
  licence: boolean;
};

function seed(providerId: string, file: AccountFile): Draft {
  return {
    id: providerId,
    kind: file.kind ?? 'ESTABLISHMENT',
    slug: file.slug,
    website: file.website,
    adminEmail: file.adminEmail,
    owners: file.owners === null ? '1' : String(file.owners),
    signatory: file.signatory ?? 'OWNER',
    signatoryCount: file.signatoryCount === null ? '' : String(file.signatoryCount),
    licence: file.licence,
  };
}

export function AccountActions({
  providerId,
  open,
  file,
  docsComplete,
  feesConfigured,
  platformConfigured,
  canManage,
}: {
  providerId: string;
  /** أله حسابٌ مفتوح؟ — فالملفُّ يُقرأ بعده ولا يُعدَّل */
  open: boolean;
  file: AccountFile;
  docsComplete: boolean;
  feesConfigured: boolean;
  platformConfigured: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  /**
   * ═══ والحالةُ مختومةٌ بصاحبها (البوابة ٣٠) ═══
   *
   * صفحتا مزوّدين من المسار نفسه، فالتنقّل بينهما **لا يُعيد تركيب
   * المكوّن**: استمارةٌ نُسخت من خاصّيةٍ تبقى على ملفّ المزوّد السابق،
   * فيُحفظ اسمُه الآليّ على غيره — بلا خطأ ولا تحذير.
   *
   * فتُحفظ الهويةُ مع القيمة، وتُشتقّ عند اختلافها: تصدُق على صاحبها
   * وتكذب على غيره بلا `useEffect`.
   */
  const [typed, setTyped] = useState<Draft | null>(null);
  const draft = typed !== null && typed.id === providerId ? typed : seed(providerId, file);
  const put = (patch: Partial<Draft>): void => setTyped({ ...draft, ...patch });

  const [editingFor, setEditingFor] = useState<string | null>(null);
  const editing = editingFor === providerId;
  const setEditing = (on: boolean): void => setEditingFor(on ? providerId : null);

  const [docs, setDocs] = useState<{ id: string; list: Documents } | null>(null);
  const documents = docs !== null && docs.id === providerId ? docs.list : null;

  const complete =
    file.kind !== null &&
    file.slug !== '' &&
    file.owners !== null &&
    file.signatory !== null &&
    file.adminEmail !== '';

  const say = (reason: string, detail: string | null): void => {
    const known = ACCOUNT_OPEN_FAILURE[reason];
    setToast(known === undefined ? (detail ?? 'تعذّر الإجراء.') : known);
  };

  const post = (path: string, body?: unknown, method: 'POST' | 'PUT' = 'POST'): void => {
    start(async () => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).catch(() => null);

      if (response === null) {
        setToast('تعذّر الاتصال — أعد المحاولة.');
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        data?: { requiredDocuments?: Documents; status?: string };
        error?: { fields?: Record<string, string> };
      } | null;

      if (!response.ok) {
        const fields = payload?.error?.fields ?? {};
        const reason = fields.account ?? fields.file ?? fields.slug ?? '';
        say(reason, null);
        return;
      }

      if (payload?.data?.requiredDocuments !== undefined) {
        setDocs({ id: providerId, list: payload.data.requiredDocuments });
      }
      setEditing(false);
      setToast('تمّ.');
      router.refresh();
    });
  };

  if (!canManage) return null;

  /** ═══ لا حسابَ بعد: الملفُّ ثم الفتح ═══ */
  if (!open) {
    return (
      <>
        <div className="mt-4 border-t border-line pt-4">
          {!editing ? (
            <>
              <dl className="mb-3.5 flex flex-col gap-1.5 text-3xs">
                <Row label="الصفة" value={file.kind === null ? '—' : ACCOUNT_KIND_LABEL[file.kind] ?? file.kind} />
                <Row label="الاسم الآليّ" value={file.slug === '' ? '—' : file.slug} ltr />
                <Row label="بريد المدير" value={file.adminEmail === '' ? '—' : file.adminEmail} ltr />
                <Row
                  label="المُلّاك"
                  value={file.owners === null ? '—' : displayDigits(String(file.owners))}
                />
                <Row
                  label="التوقيع"
                  value={
                    file.signatory === null
                      ? '—'
                      : ACCOUNT_SIGNATORY_LABEL[file.signatory] ?? file.signatory
                  }
                />
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  {complete ? 'تعديل الملف' : 'أكمل ملفّ التسجيل'}
                </Button>
                {/*
                  **والشرطُ يُعرض قبل لحظة الحاجة.** اكتشافُ «اضبط
                  المصفوفة» عند الضغط على «افتح» أسوأ توقيت — والخادم
                  يفرضه أيضًا، فالعرض تذكيرٌ لا حراسة.
                */}
                <Button
                  size="sm"
                  disabled={pending || !complete || !feesConfigured || !platformConfigured}
                  onClick={() => post(`/api/v1/admin/providers/${providerId}/account`)}
                >
                  افتح حساب الدفع
                </Button>
              </div>
              {complete && feesConfigured && platformConfigured ? (
                <p className="mt-2.5 text-3xs leading-loose opacity-70">
                  الفتح يُرسل دعوةً إلى بريد المدير، ولا رجعةَ فيه.
                </p>
              ) : (
                <ul className="mt-2.5 flex flex-col gap-1 text-3xs leading-loose text-warn-900">
                  {complete ? null : <li>{ACCOUNT_OPEN_FAILURE.FILE_INCOMPLETE}</li>}
                  {feesConfigured ? null : <li>{ACCOUNT_OPEN_FAILURE.NO_FEES}</li>}
                  {platformConfigured ? null : <li>{ACCOUNT_OPEN_FAILURE.NOT_CONFIGURED}</li>}
                </ul>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <Select
                label="صفة المنشأة"
                value={draft.kind}
                options={ACCOUNT_KIND_LABEL}
                onChange={(value) => put({ kind: value })}
              />
              <Text
                label="الاسم الآليّ لدى البوّابة"
                value={draft.slug}
                ltr
                onChange={(value) => put({ slug: value })}
              />
              <Text
                label="بريد مدير الحساب"
                value={draft.adminEmail}
                ltr
                onChange={(value) => put({ adminEmail: value })}
              />
              <Text
                label="الموقع الإلكتروني"
                value={draft.website}
                ltr
                onChange={(value) => put({ website: value })}
              />
              <Text
                label="عدد المُلّاك"
                value={draft.owners}
                ltr
                onChange={(value) => put({ owners: value })}
              />
              <Select
                label="من يملك التوقيع"
                value={draft.signatory}
                options={ACCOUNT_SIGNATORY_LABEL}
                onChange={(value) => put({ signatory: value })}
              />
              {draft.signatory === 'OWNER' ? null : (
                <Text
                  label="عدد الموقّعين"
                  value={draft.signatoryCount}
                  ltr
                  onChange={(value) => put({ signatoryCount: value })}
                />
              )}
              <label className="flex cursor-pointer items-center gap-2.5 text-3xs font-bold">
                <input
                  type="checkbox"
                  checked={draft.licence}
                  onChange={(event) => put({ licence: event.target.checked })}
                />
                نشاطُه يحتاج ترخيصًا خاصًّا
              </label>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    post(
                      `/api/v1/admin/providers/${providerId}/account`,
                      {
                        kind: draft.kind,
                        slug: draft.slug.trim(),
                        website: draft.website.trim(),
                        adminEmail: draft.adminEmail.trim(),
                        owners: Number(toLatinDigits(draft.owners).replace(/\D/g, '') || '0'),
                        signatory: draft.signatory,
                        signatoryCount:
                          draft.signatory === 'OWNER' || draft.signatoryCount.trim() === ''
                            ? null
                            : Number(toLatinDigits(draft.signatoryCount).replace(/\D/g, '') || '0'),
                        licence: draft.licence,
                      },
                      'PUT',
                    )
                  }
                >
                  حفظ الملف
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </div>
        {toast === null ? null : <Toast title={toast} />}
      </>
    );
  }

  /** ═══ وله حساب: المزامنة والتقديم ═══ */
  return (
    <>
      <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => post(`/api/v1/admin/providers/${providerId}/account/sync`)}
          >
            حدِّث الحال من البوّابة
          </Button>
          {/* **والتقديم بشرطه**: البوّابة هي من تقول إن المستندات اكتملت. */}
          {!docsComplete ? null : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => post(`/api/v1/admin/providers/${providerId}/account/submit`)}
            >
              قدِّم للمراجعة
            </Button>
          )}
        </div>
        {docsComplete ? null : (
          <p className="text-3xs leading-loose opacity-70">
            المستندات ترفعها المنشأة في لوحة البوّابة بالدعوة التي وصلت بريدَ مديرها — ثم يُحدَّث
            الحال من هنا.
          </p>
        )}
        {documents === null || documents.length === 0 ? null : (
          <div>
            <p className="mb-1.5 text-3xs font-bold opacity-70">ما يطلبه المزوّد</p>
            <ul className="flex flex-col gap-1 text-3xs leading-loose opacity-75">
              {documents.map((document) => (
                <li key={document.type}>
                  {ACCOUNT_DOCUMENT_LABEL[document.type] ?? document.type}
                  {document.count > 1 ? ` (${displayDigits(String(document.count))})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="opacity-70">{label}</dt>
      <dd {...(ltr === true ? { dir: 'ltr' as const } : {})} className="font-bold">
        {value}
      </dd>
    </div>
  );
}

function Text({
  label,
  value,
  ltr,
  onChange,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-70">{label}</span>
      {/* `dir="ltr"` لكل حقلٍ يُنسخ من مصدرٍ لاتينيّ ويُقارن خانةً بخانة */}
      <input
        {...(ltr === true ? { dir: 'ltr' as const } : {})}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs font-bold"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<string, string>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-3xs font-bold opacity-70">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs font-bold"
      >
        {Object.entries(options).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
