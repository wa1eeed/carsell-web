'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { displayDigits } from '@/lib/arabic';
import type { ProviderRow } from '@/lib/domain/admin-providers';
import { PROVIDER_TYPE_LABEL } from '@/lib/labels/providers';
import { Quantity } from '@/components/ui/Quantity';

const field =
  'rounded-md border border-line bg-bg px-3 py-2.25 text-2xs outline-none focus:border-ink';

/**
 * ═══ المزوّد يُضاف من هنا ═══
 *
 * كان `ServiceProvider` **لا يكتبه إلا الزرع**: الشاشة تعرض وتُعطّل
 * وتُفعّل، ولا باب لإضافة شركة فحصٍ جديدة ولا لتصحيح رقم هاتفٍ تغيّر.
 * وطابورُ طلبات الخدمة يُسنِد إلى مزوّد — فنموُّ الخدمات كان موقوفًا
 * على كتابةٍ يدويّة في القاعدة.
 */
type Draft = {
  id: string | null;
  nameAr: string;
  nameEn: string;
  type: string;
  contactPhone: string;
  contactEmail: string;
  commissionPct: string;
  slaHours: string;
  cities: string;
};

const EMPTY: Draft = {
  id: null, nameAr: '', nameEn: '', type: 'INSPECTION',
  contactPhone: '', contactEmail: '', commissionPct: '', slaHours: '', cities: '',
};

const TYPES = [
  'INSPECTION', 'SHIPPING', 'INSURANCE', 'DETAILING', 'PHOTOGRAPHY', 'FINANCE', 'OTHER',
] as const;

/** صياغةُ مفاتيح النطاق — النطاق يعيد مفاتيح، والجُمل هنا (البوابة ١٧). */
const FIELD_ERROR: Record<string, string> = {
  REQUIRED: 'هذا الحقل مطلوب',
  INVALID: 'الصيغة غير صحيحة',
  RANGE: 'القيمة خارج المدى',
};

function toDraft(row: ProviderRow): Draft {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    type: row.type,
    contactPhone: row.contactPhone ?? '',
    contactEmail: row.contactEmail ?? '',
    commissionPct: row.commissionPct ?? '',
    slaHours: row.slaHours === null ? '' : String(row.slaHours),
    cities: row.cities.join('، '),
  };
}

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
  if (hours < 72) return `ساعات (${displayDigits(String(hours))})`;
  return `أيّام (${displayDigits(String(Math.round(hours / 24)))})`;
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    if (draft === null) return;
    setBusy(true);
    setErrors({});
    try {
      const response = await fetch(
        draft.id === null ? '/api/v1/admin/providers' : `/api/v1/admin/providers/${draft.id}`,
        {
          method: draft.id === null ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nameAr: draft.nameAr,
            nameEn: draft.nameEn,
            type: draft.type,
            contactPhone: draft.contactPhone,
            contactEmail: draft.contactEmail,
            commissionPct: draft.commissionPct,
            slaHours: draft.slaHours,
            // **والمدن تُفصل بفاصلةٍ عربية أو لاتينية** — من يلصق لا يُسأل أيّهما
            cities: draft.cities.split(/[،,\n]/).map((city) => city.trim()).filter((city) => city !== ''),
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as
        | { error?: { messageAr?: string; fields?: Record<string, string> } }
        | null;

      if (!response.ok || json?.error !== undefined) {
        setErrors(json?.error?.fields ?? {});
        setToast(json?.error?.messageAr ?? 'تعذّر الحفظ.');
        return;
      }
      setToast(draft.id === null ? 'أُضيف المزوّد.' : 'حُفظت البيانات.');
      setDraft(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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
            : `عُطّل — ولن يستلم إسنادًا جديدًا. والطلبات القائمة (${displayDigits(String(open))}) يُكملها.`
          : 'فُعّل — ودخل الإسناد الآليّ.',
      );
      router.refresh();
    });
  };

  return (
    <>
      {canEdit ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setDraft(EMPTY)}>
            أضِف مزوّدًا
          </Button>
        </div>
      ) : null}

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
                    {/*
                      ═══ والاسمُ بابٌ لا نصّ ═══

                      الجدول يعرض «ثلاثة متأخّرة» ولا يفتح واحدًا منها،
                      فمن يقرأ العدد يبحث يدويًّا عن ثلاثة صفوفٍ في مئة.
                      **والعدّاد يربط إلى شاشة أو لا يُعرض.**
                    */}
                    <Link
                      href={`/admin/providers/${row.id}`}
                      className="bidi-isolate font-bold underline underline-offset-4 hover:opacity-75"
                    >
                      {row.nameAr}
                    </Link>
                    {row.servicesLinked === 0 ? (
                      // مزوّدٌ بلا خدمةٍ مرتبطة لا يصله إسنادٌ أبدًا
                      <span className="text-3xs opacity-65">بلا خدمة مرتبطة</span>
                    ) : (
                      <span className="text-3xs opacity-65">
                        <Quantity unit="linkedServices" count={row.servicesLinked} />
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3 opacity-75">{PROVIDER_TYPE_LABEL[row.type] ?? row.type}</td>
                <td className="font-num p-3 opacity-75">
                  {row.commissionPct === null
                    ? '—'
                    : `${displayDigits(String(Number(row.commissionPct)))}٪`}
                </td>
                <td className="p-3 opacity-75">{sla(row.slaHours)}</td>
                <td className="p-3 opacity-75">
                  {row.cities.length === 0 ? 'كل المدن' : row.cities.join(' · ')}
                </td>
                <td className="p-3">
                  <span className="flex items-center gap-2.5">
                    <span className="font-num">{displayDigits(String(row.openRequests))}</span>
                    {row.breached === 0 ? null : (
                      <Badge tone="danger">
                        <Quantity unit="breaches" count={row.breached} />
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
                    <span className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(row))}>
                        عدّله
                      </Button>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => toggle(row)}>
                        {row.active ? 'عطّله' : 'فعّله'}
                      </Button>
                    </span>
                  ) : (
                    <span className="text-3xs opacity-65">قراءة</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === null ? 'مزوّد جديد' : 'تعديل المزوّد'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              احفظ
            </Button>
          </>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-3.5">
            <Field label="الاسم العربي — إلزامي" error={errors.nameAr}>
              <input
                value={draft.nameAr}
                onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                className={cn(field, errors.nameAr !== undefined && 'border-danger')}
              />
            </Field>

            <Field label="الاسم الإنجليزي — إلزامي" error={errors.nameEn}>
              <input
                dir="ltr"
                value={draft.nameEn}
                onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.nameEn !== undefined && 'border-danger')}
              />
            </Field>

            <Field label="النوع" error={errors.type}>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className={field}
              >
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROVIDER_TYPE_LABEL[type] ?? type}
                  </option>
                ))}
              </select>
            </Field>

            {/*
              **ورقمُ الهاتف يُلصَق كما هو.** «+966 50 123 4567» و«05012
              34567» صيغتان لرقمٍ واحد، والحقل يطبّعهما. و`dir="ltr"`
              لأنه يُنسخ من مصدرٍ لاتينيّ ويُقارن خانةً بخانة.
            */}
            <Field label="هاتف التواصل" error={errors.contactPhone}>
              <input
                dir="ltr"
                inputMode="tel"
                placeholder="+966 5X XXX XXXX"
                value={draft.contactPhone}
                onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.contactPhone !== undefined && 'border-danger')}
              />
            </Field>

            <Field label="بريد التواصل" error={errors.contactEmail}>
              <input
                dir="ltr"
                inputMode="email"
                value={draft.contactEmail}
                onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.contactEmail !== undefined && 'border-danger')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3.5">
              <Field label="العمولة ٪ — اتركه فارغًا إن لم تُتّفق" error={errors.commissionPct}>
                <input
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="7.5"
                  value={draft.commissionPct}
                  onChange={(e) => setDraft({ ...draft, commissionPct: e.target.value })}
                  className={cn(field, 'bidi-ltr', errors.commissionPct !== undefined && 'border-danger')}
                />
              </Field>

              <Field label="الالتزام بالساعات — فارغٌ يعني بلا التزام" error={errors.slaHours}>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="48"
                  value={draft.slaHours}
                  onChange={(e) => setDraft({ ...draft, slaHours: e.target.value })}
                  className={cn(field, 'bidi-ltr', errors.slaHours !== undefined && 'border-danger')}
                />
              </Field>
            </div>

            <Field label="المدن — افصلها بفاصلة. والفراغُ يعني كلَّ المدن" error={errors.cities}>
              <input
                value={draft.cities}
                onChange={(e) => setDraft({ ...draft, cities: e.target.value })}
                placeholder="الرياض، جدة، الدمام"
                className={field}
              />
            </Field>

            {/*
              **ولا يُفعَّل ولا يُعطَّل من هنا.** التفعيل قرارُ إسنادٍ له
              أثرُه على الطلبات الجارية، وزرُّه في الصفّ يقول كم طلبًا
              سيُكمله المزوّد — ودمجُهما يجعل حفظَ هاتفٍ يُعطّل شركةً سهوًا.
            */}
            <p className="text-3xs opacity-65">
              التفعيل والتعطيل من زرّ الصفّ — فله أثرٌ على الإسناد الجاري.
            </p>
          </div>
        )}
      </Modal>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-semibold opacity-70">{label}</span>
      {children}
      {error === undefined ? null : (
        <span className="text-3xs text-danger">{FIELD_ERROR[error] ?? error}</span>
      )}
    </label>
  );
}
