'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import { toArabicDigits, toLatinDigits } from '@/lib/arabic';
import {
  ANY_TYPE,
  BUYER_TYPE_LABEL,
  INVOICE_ISSUER_LABEL,
  SELLER_TYPE_LABEL,
  SUPPLY_TYPE_LABEL,
  TAXABLE_BASE_LABEL,
} from '@/lib/labels/admin';
import type { PendingRuleChange, TaxRuleRow } from '@/lib/domain/admin-tax';

const BASES = ['FULL_VALUE', 'MARGIN', 'FEE_ONLY', 'OUT_OF_SCOPE'] as const;
const ISSUERS = ['PLATFORM', 'SELLER', 'PLATFORM_ON_BEHALF', 'NONE'] as const;

type Draft = {
  id: string;
  taxableBase: string;
  ratePct: string;
  invoiceIssuer: string;
  active: boolean;
  note: string;
};

/**
 * A21 — جدول القواعد.
 *
 * **المعطَّلة تُعرض ولا تُخفى.** ثلاثٌ منها تنتظر مذكرةً ضريبية، وهي
 * أكبر انكشافٍ ماليّ في المنتج — وإخفاؤها يجعله غير مرئيّ لمن يديره.
 *
 * **والتحرير بنصاب عضوين.** تفعيلُ صفٍّ ينتظر مذكرة قد ينقل الضريبة من
 * ١٥٠ إلى ١٥٬٠٠٠ في صفقة واحدة، فلا تُعدَّل بيدٍ واحدة.
 */
export function RulesTable({
  rules,
  awaiting,
  adminId,
  canManage,
}: {
  rules: readonly TaxRuleRow[];
  /** تعديلات تنتظر العضو الثاني — فوق الجدول لا في سجلّ بعيد */
  awaiting: readonly PendingRuleChange[];
  /** الطالب لا يوافق على طلبه — والشاشة تقوله قبل الضغط لا بعده */
  adminId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  /**
   * الموافقة الثانية — **كان لها مسار ولا زرّ.**
   *
   * `POST` موجود منذ بنائها، ولم يكن في الشاشة ما يبلغه: فيبقى كل
   * تعديلٍ معلَّقًا حتى ينقضي، ويُعاد طلبه فيعود إلى حاله.
   */
  const approve = (item: PendingRuleChange): void => {
    start(async () => {
      const response = await fetch(`/api/v1/admin/tax/rules/${item.ruleId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast(
          response?.status === 403
            ? 'طالب التعديل لا يوافق على طلبه — يلزم عضو ثانٍ.'
            : 'تعذّر اعتماد التعديل.',
        );
        return;
      }
      setToast('طُبِّق التعديل — والفواتير الصادرة لم تتغيّر.');
      router.refresh();
    });
  };

  const submit = (): void => {
    if (draft === null) return;
    const rate = toLatinDigits(draft.ratePct).replace(/[^\d.]/g, '');

    start(async () => {
      const response = await fetch(`/api/v1/admin/tax/rules/${draft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taxableBase: draft.taxableBase,
          ratePct: rate === '' ? null : Number(rate),
          invoiceIssuer: draft.invoiceIssuer,
          active: draft.active,
          note: draft.note === '' ? null : draft.note,
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر تسجيل الطلب.');
        return;
      }

      const payload = (await response.json()) as {
        data: { state: string; approvals?: number; required?: number };
      };
      setToast(
        payload.data.state === 'APPLIED'
          ? 'طُبِّق التعديل.'
          : `سُجِّل الطلب — الموافقات (${toArabicDigits(String(payload.data.approvals ?? 1))} من ${toArabicDigits(String(payload.data.required ?? 2))}). ينتظر عضوًا ثانيًا.`,
      );
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <>
      {awaiting.length === 0 ? null : (
        <div className="mb-4 flex flex-col gap-2.5">
          {awaiting.map((item) => {
            const isRequester = item.requestedBy === adminId;
            return (
              <div
                key={item.id}
                className="rounded-md border border-warn-200 bg-warn-100 p-3.5 text-2xs text-warn-900"
              >
                <p className="font-bold">تعديل قاعدة ينتظر الاعتماد</p>
                <p className="mt-1.5 leading-loose opacity-80">
                  {TAXABLE_BASE_LABEL[item.edit.taxableBase] ?? item.edit.taxableBase}
                  {item.edit.ratePct === null ? null : (
                    <>
                      {' · '}
                      <span className="font-num">
                        <ArabicNumber value={item.edit.ratePct} decimals={2} grouped={false} />٪
                      </span>
                    </>
                  )}
                  {' · '}
                  {item.edit.active ? 'تُفعَّل' : 'تبقى معطَّلة'}
                  {' · الموافقات '}
                  <span className="font-num">
                    <ArabicNumber value={item.approvals} grouped={false} />
                  </span>
                  {' من '}
                  <span className="font-num">
                    <ArabicNumber value={item.required} grouped={false} />
                  </span>
                </p>
                {item.edit.note === null || item.edit.note === '' ? null : (
                  <p className="mt-1.5 leading-loose opacity-70">الملاحظة: {item.edit.note}</p>
                )}
                {!canManage ? null : (
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={pending || isRequester}
                    onClick={() => approve(item)}
                  >
                    {isRequester ? 'طلبتَه — ينتظر عضوًا آخر' : 'اعتمد التعديل'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DataTable
        rows={rules}
        rowKey={(rule) => rule.id}
        columns={[
          {
            id: 'seller',
            header: 'البائع',
            cell: (rule) => (
              <span className={rule.sellerType === null ? 'opacity-50' : undefined}>
                {rule.sellerType === null
                  ? ANY_TYPE
                  : (SELLER_TYPE_LABEL[rule.sellerType] ?? rule.sellerType)}
              </span>
            ),
          },
          {
            id: 'buyer',
            header: 'المشتري',
            cell: (rule) => (
              <span className={rule.buyerType === null ? 'opacity-50' : undefined}>
                {rule.buyerType === null
                  ? ANY_TYPE
                  : (BUYER_TYPE_LABEL[rule.buyerType] ?? rule.buyerType)}
              </span>
            ),
          },
          {
            id: 'supply',
            header: 'التوريد',
            cell: (rule) => SUPPLY_TYPE_LABEL[rule.supplyType] ?? rule.supplyType,
          },
          {
            id: 'base',
            header: 'وعاء الضريبة',
            cell: (rule) => (
              <span className={rule.taxableBase === 'OUT_OF_SCOPE' ? 'opacity-70' : undefined}>
                {TAXABLE_BASE_LABEL[rule.taxableBase] ?? rule.taxableBase}
              </span>
            ),
          },
          {
            id: 'rate',
            header: 'النسبة',
            numeric: true,
            /* الشرطة لا الصفر: خارج النطاق ليس «صفر بالمئة» */
            cell: (rule) =>
              rule.ratePct === null ? (
                <span className="opacity-35">—</span>
              ) : (
                <span className="font-num">
                  <ArabicNumber value={Number(rule.ratePct)} decimals={2} grouped={false} />٪
                </span>
              ),
          },
          {
            id: 'issuer',
            header: 'مُصدِر الفاتورة',
            cell: (rule) => INVOICE_ISSUER_LABEL[rule.invoiceIssuer] ?? rule.invoiceIssuer,
          },
          {
            id: 'status',
            header: 'الحالة',
            cell: (rule) => (
              <Badge tone={rule.active ? 'accent' : 'warn'}>
                {rule.active ? 'مفعَّلة' : 'ينتظر المذكرة'}
              </Badge>
            ),
          },
          {
            id: 'issued',
            header: 'فواتير صدرت',
            numeric: true,
            /* عددٌ يقول أثر التعديل — واللقطة فيها لا تتحرّك بعده */
            cell: (rule) =>
              rule.issuedCount === 0 ? (
                <span className="opacity-35">—</span>
              ) : (
                <ArabicNumber value={rule.issuedCount} />
              ),
          },
          {
            id: 'edit',
            header: '',
            cell: (rule) =>
              !canManage ? null : (
                <button
                  type="button"
                  className="text-2xs font-bold text-accent-700 hover:underline"
                  onClick={() =>
                    setDraft({
                      id: rule.id,
                      taxableBase: rule.taxableBase,
                      ratePct: rule.ratePct ?? '',
                      invoiceIssuer: rule.invoiceIssuer,
                      active: rule.active,
                      note: rule.note ?? '',
                    })
                  }
                >
                  تحرير
                </button>
              ),
          },
        ]}
      />

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="تحرير قاعدة ضريبية"
        footer={
          <div className="flex gap-2.5">
            <Button size="sm" onClick={submit} disabled={pending}>
              اطلب التعديل
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
          </div>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-4">
            {/*
              التحذير قبل الحقول لا بعدها: من يقرأه بعد أن يملأ يكون قد
              قرّر. وأثر هذا الصفّ وثائقُ قانونية لا إعدادُ عرض.
            */}
            <p className="rounded-md border border-warn-200 bg-warn-100 p-3 text-2xs leading-loose text-warn-900">
              التعديل يحتاج موافقة عضو ثانٍ قبل أن يسري. والفواتير الصادرة بهذه
              القاعدة لا تتغيّر — لقطتها منسوخة فيها كاملةً.
            </p>

            <Select
              label="وعاء الضريبة"
              value={draft.taxableBase}
              options={BASES.map((key) => [key, TAXABLE_BASE_LABEL[key] ?? key])}
              onChange={(taxableBase) => setDraft({ ...draft, taxableBase })}
            />

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">النسبة ٪ — اتركها فارغة لخارج النطاق</span>
              <input
                dir="ltr"
                inputMode="decimal"
                value={draft.ratePct}
                onChange={(event) => setDraft({ ...draft, ratePct: event.target.value })}
                className="font-num rounded-md border border-line bg-bg px-3.5 py-2 text-sm font-bold"
              />
            </label>

            <Select
              label="مُصدِر الفاتورة"
              value={draft.invoiceIssuer}
              options={ISSUERS.map((key) => [key, INVOICE_ISSUER_LABEL[key] ?? key])}
              onChange={(invoiceIssuer) => setDraft({ ...draft, invoiceIssuer })}
            />

            <label className="flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.active}
                onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
              />
              <span>
                مفعَّلة
                <span className="block text-2xs opacity-55">
                  المعطَّلة تُعرض ولا تُطبَّق — وهي حال «ننتظر التصنيف» لا «قرّرنا الامتناع».
                </span>
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold opacity-60">ملاحظة</span>
              <textarea
                rows={3}
                value={draft.note}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm leading-loose"
              />
            </label>
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-60">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-bg px-3.5 py-2 text-sm"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
