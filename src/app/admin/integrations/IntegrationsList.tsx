'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import type { IntegrationRow } from '@/lib/domain/admin-integrations';
import { ENV_LABEL } from '@/lib/labels/admin';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'تعمل',
  DEGRADED: 'تحذير',
  INACTIVE: 'غير مفعّلة',
};

const STATUS_TONE: Record<string, 'accent' | 'warn' | 'neutral'> = {
  ACTIVE: 'accent',
  DEGRADED: 'warn',
  INACTIVE: 'neutral',
};

type Draft = {
  key: string;
  nameAr: string;
  env: 'TEST' | 'LIVE';
  fields: { name: string; value: string }[];
};

/**
 * A11 — قائمة التكاملات ولوح التدوير.
 *
 * **لا سرّ يعبر إلى هنا**: `IntegrationRow` تحمل تلميحًا نصّيًا لا
 * أكثر، وحقول التدوير تُملأ صعودًا لا تُقرأ نزولًا — المحرّر يكتب
 * المفتاح الجديد ولا يرى القديم.
 */
export function IntegrationsList({
  groups,
  adminId,
  canManage,
}: {
  groups: readonly { label: string; rows: readonly IntegrationRow[] }[];
  adminId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const post = (path: string, body: unknown, done: (data: unknown) => string): void => {
    start(async () => {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { data?: unknown; error?: { code?: string } };
      if (!response.ok) {
        setToast(
          payload.error?.code === 'SELF_APPROVAL'
            ? 'طالب التدوير لا يوافق على طلبه — يلزم عضو ثانٍ.'
            : 'تعذّر التنفيذ.',
        );
        return;
      }
      setToast(done(payload.data));
      router.refresh();
    });
  };

  const submitRotation = (): void => {
    if (draft === null) return;
    const secrets: Record<string, string> = {};
    for (const field of draft.fields) {
      if (field.name !== '' && field.value !== '') secrets[field.name] = field.value;
    }
    if (Object.keys(secrets).length === 0) {
      setToast('اكتب اسم المفتاح وقيمته.');
      return;
    }

    post(
      `/api/v1/admin/integrations/${draft.key}/rotate`,
      { env: draft.env, secrets },
      () => 'سُجّل الطلب — ينتظر موافقة عضو ثانٍ ولم يتغيّر شيء بعد.',
    );
    setDraft(null);
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-45">
              {group.label}
            </h2>

            <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {group.rows.map((row) => (
                <article key={row.key} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-48 flex-1">
                    <p className="text-xs font-bold">{row.nameAr}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-3xs opacity-50">
                      <span className="bidi-isolate">{row.provider}</span>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="font-num" dir="ltr">{row.key}</span>
                    </p>
                    <p className="mt-1.5 text-3xs leading-relaxed opacity-55">
                      عند التعطّل: {row.failureBehavior}
                    </p>
                  </div>

                  {/*
                    البيئتان جنبًا إلى جنب: مفتاحٌ واحد معروض يجعل المحرّر
                    يظنّ أنه يرى المستعمَل، وهو قد يرى الآخر.
                  */}
                  <div className="flex min-w-56 flex-col gap-1.5">
                    {row.credentials.map((credential) => (
                      <div key={credential.env} className="flex items-baseline gap-2 text-3xs">
                        <span
                          className={
                            credential.env === row.activeEnv
                              ? 'w-10 shrink-0 font-bold'
                              : 'w-10 shrink-0 opacity-40'
                          }
                        >
                          {ENV_LABEL[credential.env]}
                        </span>
                        {!credential.configured ? (
                          <span className="opacity-40">بلا مفاتيح</span>
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            {Object.entries(credential.hints).map(([name, hint]) => (
                              <span key={name} className="flex items-baseline gap-2">
                                <span className="opacity-50">{name}</span>
                                {/* التلميح مخزَّن نصًّا — ولا فكّ تشفير في مسار العرض */}
                                <span className="font-num truncate opacity-75" dir="ltr">
                                  {String(hint)}
                                </span>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    ))}
                    {!row.envForced ? null : (
                      /* المخزَّن «إنتاج» والمستعمَل «اختبار» — تُقال لا تُخفى */
                      <span className="text-3xs text-warn">
                        مخزَّنة على الإنتاج، وتعمل على الاختبار — القيد في الكود.
                      </span>
                    )}
                  </div>

                  <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>

                  {!canManage ? null : row.pendingRotation === null ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          key: row.key,
                          nameAr: row.nameAr,
                          // الاختبار افتراضًا: الإنتاج يُقصَد لا يُقع فيه
                          env: 'TEST',
                          fields: [{ name: 'apiKey', value: '' }],
                        })
                      }
                    >
                      تدوير
                    </Button>
                  ) : row.pendingRotation.requestedBy === adminId ? (
                    /* الطالب يرى أنه ينتظر غيره — ولا يُعرض له زرّ يضغطه فيُرفض */
                    <span className="text-3xs opacity-55">طلبتَه — ينتظر عضوًا آخر</span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        post(
                          `/api/v1/admin/integrations/${row.key}/approve`,
                          { requestId: row.pendingRotation?.id },
                          (data) =>
                            (data as { state?: string } | undefined)?.state === 'EXECUTED'
                              ? 'اكتمل النصاب — دُوِّر المفتاح.'
                              : 'سُجّلت موافقتك.',
                        )
                      }
                    >
                      اعتمد التدوير
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft === null ? '' : `تدوير مفاتيح ${draft.nameAr}`}
        footer={
          <div className="flex gap-2.5">
            <Button onClick={submitRotation} disabled={pending}>
              اطلب التدوير
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
          </div>
        }
      >
        {draft === null ? null : (
          <div className="flex flex-col gap-4">
            <p className="text-2xs leading-relaxed opacity-60">
              المفتاح الجديد يُشفَّر ويبقى في الطلب حتى يعتمده عضو ثانٍ. ولن يُستبدل القديم
              قبل ذلك — <strong>فالطلب وحده ليس تدويرًا</strong>.
            </p>

            {draft.fields.map((field, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <input
                  dir="ltr"
                  value={field.name}
                  placeholder="اسم المفتاح"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.map((entry, at) =>
                        at === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    })
                  }
                  className="font-num w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none"
                />
                <input
                  // السرّ يُلصق من لوحة المزوّد ويُقارَن خانةً بخانة
                  dir="ltr"
                  value={field.value}
                  placeholder="القيمة الجديدة"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.map((entry, at) =>
                        at === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    })
                  }
                  className="font-num w-full rounded-sm border border-line bg-bg px-3 py-2 text-sm outline-none"
                />
              </div>
            ))}

            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft({ ...draft, fields: [...draft.fields, { name: '', value: '' }] })
              }
            >
              + مفتاح آخر
            </Button>
          </div>
        )}
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
