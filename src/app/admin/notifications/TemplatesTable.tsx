'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DataTable } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { Toast } from '@/components/ui/Toast';
import {
  groupLabel,
  smsMetrics,
  undeclaredVariables,
  usedVariables,
} from '@/lib/domain/notification-text';
import type { TemplateRow } from '@/lib/domain/admin-notifications';

const PRIORITY_LABEL: Record<string, string> = {
  critical: 'حرِج',
  high: 'عالٍ',
  normal: 'عادي',
};

type Draft = {
  key: string;
  locale: 'ar' | 'en';
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  smsAr: string;
  smsEn: string;
  variables: string[];
};

function draftOf(template: TemplateRow): Draft {
  return {
    key: template.key,
    locale: 'ar',
    subjectAr: template.subjectAr ?? '',
    subjectEn: template.subjectEn ?? '',
    bodyAr: template.bodyAr ?? '',
    bodyEn: template.bodyEn ?? '',
    smsAr: template.smsAr ?? '',
    smsEn: template.smsEn ?? '',
    variables: [...template.variables],
  };
}

export function TemplatesTable({
  templates,
  canEdit,
}: {
  templates: readonly TemplateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [group, setGroup] = useState<string>('all');
  const [draft, setDraft] = useState<Draft | null>(null);

  const groups = useMemo(() => {
    const seen = new Map<string, number>();
    for (const template of templates) {
      seen.set(template.group, (seen.get(template.group) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [templates]);

  const shown = useMemo(
    () => (group === 'all' ? templates : templates.filter((row) => row.group === group)),
    [templates, group],
  );

  /**
   * الفحص **أثناء الكتابة لا عند الحفظ**: المحرّر يرى المتغيّر
   * المجهول لحظة كتابته، لا بعد أن يكتب النصّ كلّه ويضغط حفظ.
   * والخادم يفحص ثانيةً لأن هذا الفحص عرضٌ لا حراسة.
   */
  const undeclared = draft === null ? [] : undeclaredVariables(draft, draft.variables);
  const unused =
    draft === null
      ? []
      : draft.variables.filter(
          (name) =>
            !usedVariables(
              draft.subjectAr, draft.subjectEn,
              draft.bodyAr, draft.bodyEn,
              draft.smsAr, draft.smsEn,
            ).includes(name),
        );

  const save = (): void => {
    if (draft === null || undeclared.length > 0) return;

    start(async () => {
      const response = await fetch(`/api/v1/admin/notifications/${draft.key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectAr: draft.subjectAr, subjectEn: draft.subjectEn,
          bodyAr: draft.bodyAr, bodyEn: draft.bodyEn,
          smsAr: draft.smsAr, smsEn: draft.smsEn,
          variables: draft.variables,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { fields?: Record<string, string> } };
        const blocked = Object.keys(body.error?.fields ?? {});
        setToast(
          blocked.length > 0
            ? `لم يُحفظ — متغيّرات غير مصرَّح بها: ${blocked.join('، ')}`
            : 'تعذّر الحفظ.',
        );
        return;
      }

      setToast('حُفظ.');
      setDraft(null);
      router.refresh();
    });
  };

  const isArabic = draft?.locale === 'ar';
  const sms = draft === null ? null : smsMetrics(isArabic ? draft.smsAr : draft.smsEn);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={group === 'all'} onClick={() => setGroup('all')} count={templates.length}>
          الكل
        </Chip>
        {groups.map(([id, count]) => (
          <Chip key={id} active={group === id} onClick={() => setGroup(id)} count={count}>
            {groupLabel(id)}
          </Chip>
        ))}
      </div>

      <DataTable
        rows={shown}
        rowKey={(template) => template.key}
        columns={[
          {
            id: 'event',
            header: 'الحدث',
            cell: (template) => (
              <span className="flex flex-col gap-0.5">
                <span className="bidi-isolate font-bold">{template.subjectAr ?? '—'}</span>
                <span className="font-num text-3xs opacity-45" dir="ltr">
                  {template.key}
                </span>
              </span>
            ),
          },
          {
            id: 'channels',
            header: 'القنوات',
            cell: (template) => (
              <span className="flex flex-wrap gap-1">
                {template.channels.email ? <Badge tone="neutral">بريد</Badge> : null}
                {template.channels.sms ? <Badge tone="neutral">رسالة</Badge> : null}
                {template.channels.push ? <Badge tone="neutral">دفع</Badge> : null}
                {template.channels.inApp ? <Badge tone="neutral">داخل التطبيق</Badge> : null}
              </span>
            ),
          },
          {
            id: 'priority',
            header: 'الأولوية',
            cell: (template) => (
              <Badge tone={template.critical ? 'warn' : 'neutral'}>
                {PRIORITY_LABEL[template.priority] ?? template.priority}
              </Badge>
            ),
          },
          {
            id: 'sent',
            header: 'أُرسل',
            numeric: true,
            sortable: true,
            cell: (template) => <ArabicNumber value={template.sent} />,
          },
          {
            id: 'actions',
            header: '',
            cell: (template) =>
              !canEdit ? null : (
                <Button size="sm" variant="outline" onClick={() => setDraft(draftOf(template))}>
                  تحرير
                </Button>
              ),
          },
        ]}
        empty={{ title: 'لا قوالب في هذه المجموعة' }}
      />

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="محرّر النصّ"
        className="w-[560px]"
        footer={
          <div className="flex items-center gap-2.5">
            <Button onClick={save} disabled={pending || undeclared.length > 0}>
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
            {undeclared.length === 0 ? null : (
              <span className="text-3xs text-danger">الحفظ موقوف حتى يُصرَّح بالمتغيّرات.</span>
            )}
          </div>
        }
      >
        {draft === null || sms === null ? null : (
          <div className="flex flex-col gap-4">
            <p className="font-num text-2xs opacity-50" dir="ltr">
              {draft.key}
            </p>

            <Tabs
              items={[
                { id: 'ar', label: 'عربي' },
                { id: 'en', label: 'English' },
              ]}
              active={draft.locale}
              onChange={(locale) => setDraft({ ...draft, locale: locale === 'en' ? 'en' : 'ar' })}
            />

            <Field
              label="عنوان البريد أو الدفع"
              ltr={!isArabic}
              value={isArabic ? draft.subjectAr : draft.subjectEn}
              onChange={(value) =>
                setDraft(isArabic ? { ...draft, subjectAr: value } : { ...draft, subjectEn: value })
              }
            />
            <Field
              label="النصّ"
              multiline
              ltr={!isArabic}
              value={isArabic ? draft.bodyAr : draft.bodyEn}
              onChange={(value) =>
                setDraft(isArabic ? { ...draft, bodyAr: value } : { ...draft, bodyEn: value })
              }
            />

            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold opacity-55">المتغيّرات المصرَّح بها</span>
              <div className="flex flex-wrap gap-1.5">
                {draft.variables.map((name) => (
                  <Chip
                    key={name}
                    active
                    onRemove={() =>
                      setDraft({
                        ...draft,
                        variables: draft.variables.filter((entry) => entry !== name),
                      })
                    }
                  >
                    <span className="font-num" dir="ltr">{`{${name}}`}</span>
                  </Chip>
                ))}
                {/* المكتوب في النصّ وغير المصرَّح به — بضغطة واحدة يُصرَّح به */}
                {undeclared.map((name) => (
                  <Chip
                    key={name}
                    onClick={() => setDraft({ ...draft, variables: [...draft.variables, name] })}
                  >
                    <span className="font-num text-danger" dir="ltr">{`+ {${name}}`}</span>
                  </Chip>
                ))}
              </div>
              {undeclared.length > 0 ? (
                <p className="text-3xs text-danger">
                  متغيّر في النصّ بلا تصريح يصل المستخدم كما كُتب. أضِفه أو صحّحه.
                </p>
              ) : null}
              {unused.length > 0 ? (
                <p className="text-3xs opacity-45">
                  مصرَّح به ولا يُستعمل: {unused.join('، ')} — ليس خطأً، لكنّه غالبًا بقيّة نصّ قديم.
                </p>
              ) : null}
            </div>

            <Field
              label="نصّ الرسالة القصيرة"
              multiline
              ltr={!isArabic}
              value={isArabic ? draft.smsAr : draft.smsEn}
              onChange={(value) =>
                setDraft(isArabic ? { ...draft, smsAr: value } : { ...draft, smsEn: value })
              }
            />

            {/* الطول والتكلفة **أثناء الكتابة** — لا بعد الإرسال (ترميز A8) */}
            <p className="flex flex-wrap items-center gap-2.5 text-3xs opacity-55">
              <span>
                <Quantity unit="characters" count={sms.characters} />
              </span>
              <span aria-hidden className="opacity-40">·</span>
              <span>
                <Quantity unit="smsSegments" count={sms.segments} />
              </span>
              <span aria-hidden className="opacity-40">·</span>
              {/*
                `Money` لا `{cost} ريال`: الأخيرة رقم لاتيني قبل كلمة عربية.
                وخانتان عشريتان لازمتان: تكلفة المقطع قروش، وتقريبُها إلى
                الريال يجعل كل رسالة «٠ ريال» — وهي ليست مجّانية.
              */}
              <Money amount={sms.cost} decimals={2} />
              {sms.segments > 1 ? (
                <Badge tone="warn">أكثر من مقطع — التكلفة مضاعفة</Badge>
              ) : null}
            </p>
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  ltr = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ltr?: boolean;
  multiline?: boolean;
}) {
  const className =
    'w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-ink/40';

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-bold opacity-55">{label}</span>
      {multiline ? (
        <textarea
          dir={ltr ? 'ltr' : undefined}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      ) : (
        <input
          dir={ltr ? 'ltr' : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}
