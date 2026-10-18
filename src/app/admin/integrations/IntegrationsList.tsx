'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';
import type { ConnectionState, IntegrationRow } from '@/lib/domain/admin-integrations';
import { ENV_LABEL } from '@/lib/labels/admin';
import { secretFieldsFor } from '@/lib/domain/integration-fields';
import { cn } from '@/lib/cn';
import { displayDigits, AR_DATE_LOCALE } from '@/lib/arabic';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Riyadh',
});

/**
 * **الشارة من الحال المحسوبة لا من `status`.** الحقل المخزَّن لا
 * يكتبه شيء بعد البذرة، فكان السطر يعرض «بلا مفاتيح» لبيئته الفعّالة
 * وبجانبه شارةٌ تقول «تعمل». والحساب في `connectionState` — دالّةً
 * واحدة تخدم الشارة والبطاقات معًا.
 */
const CONNECTION_LABEL: Record<ConnectionState, string> = {
  READY: 'تعمل',
  NO_KEYS: 'بلا مفاتيح',
  OFF: 'غير مفعلة',
};

const CONNECTION_TONE: Record<ConnectionState, 'accent' | 'warn' | 'neutral'> = {
  READY: 'accent',
  NO_KEYS: 'warn',
  OFF: 'neutral',
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
            ? 'طالب التدوير لا يوافق على طلبه — يلزم عضو ثاني.'
            : 'تعذر التنفيذ.',
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
      () => 'سجل الطلب — ينتظر موافقة عضو ثاني ولم يتغير شيء بعد.',
    );
    setDraft(null);
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
              {group.label}
            </h2>

            <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {group.rows.map((row) => (
                <article key={row.key} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-48 flex-1">
                    <p className="text-xs font-bold">{row.nameAr}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-3xs opacity-70">
                      <span className="bidi-isolate">{row.provider}</span>
                      <span aria-hidden className="opacity-40">·</span>
                      <span className="font-num" dir="ltr">{row.key}</span>
                    </p>
                    <p className="mt-1.5 text-3xs leading-relaxed opacity-70">
                      عند التعطل: {row.failureBehavior}
                    </p>
                    {/*
                      ═══ وجهة المزوّد — تُعرض لتُنسخ ═══

                      **ولم تكن في مكان.** من يضبط بوابة الدفع يحتاجها
                      حرفًا بحرف في لوحة المزوّد، فكان يفتح شجرة
                      المسارات ليجدها.

                      و`dir="ltr"` و`select-all`: عنوانٌ لاتينيّ يُنسخ
                      ويُقارَن خانةً بخانة، وحرفٌ ناقص فيه يعني أن لا
                      تأكيد دفعةٍ يصل — ولا رسالة خطأ في أي سجلّ عندنا.
                    */}
                    {row.webhookUrl === null ? null : (
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-3xs">
                        <span className="opacity-70">ينادينا على</span>
                        <code
                          className="font-num select-all rounded bg-ink/8 px-1.5 py-0.5 opacity-80"
                          dir="ltr"
                        >
                          {row.webhookUrl}
                        </code>
                      </p>
                    )}
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
                          <span className="opacity-65">بلا مفاتيح</span>
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            {Object.entries(credential.hints).map(([name, hint]) => (
                              <span key={name} className="flex items-baseline gap-2">
                                <span className="opacity-70">{name}</span>
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
                        مخزنة على الإنتاج، وتعمل على الاختبار — القيد في الكود.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={CONNECTION_TONE[row.connection]}>
                      {CONNECTION_LABEL[row.connection]}
                    </Badge>
                    {/*
                      **ووقتُ آخر فحص يُعرض.** كان يُكتب في القاعدة
                      ويُقرأ في النطاق ولا تعرضه شاشة — فمن ضغط «افحص»
                      لا يرى أثرًا، ومن فتح الصفحة لا يعرف أفُحص اليوم
                      أم لم يُفحص قطّ.

                      و`lastCheckOk` تبقى `null` عمدًا: الفحص لا ينادي
                      المزوّد — نداءٌ حقيقيّ معاملةٌ بمالٍ حيّ — فادّعاءُ
                      «نجح» بعده كذب.
                    */}
                    {row.lastCheckAt === null ? (
                      <span className="text-3xs opacity-65">لم يفحص بعد</span>
                    ) : (
                      <span className="text-3xs opacity-65">
                        فحص {riyadh.format(new Date(row.lastCheckAt))}
                      </span>
                    )}
                  </div>

                  {/*
                    ═══ بيئة التكامل — والخطوة الأخيرة قبل المال الحقيقيّ ═══

                    `requestEnvSwitch` مبنيّة ومختبَرة ولا ينادِيها شيء،
                    و`pendingEnvSwitch` يُحسب في النطاق ولا تعرضه شاشة —
                    فالانتقال من الاختبار إلى الإنتاج كان يحتاج تعديل صفٍّ
                    في القاعدة بيد. وهو أخطر ما يُفعل بيد.

                    **والبيئة المقيَّدة في الكود لا يُعرض لها زرّ**: خارج
                    الإنتاج القراءة مثبَّتة على `TEST`، فزرٌّ هنا يردّ ٤٠٣
                    بعد الضغط — وقولُها قبله أصدق.
                  */}
                  {!canManage || row.envForced ? null : row.pendingEnvSwitch === null ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        post(
                          `/api/v1/admin/integrations/${row.key}/environment`,
                          { to: row.storedEnv === 'LIVE' ? 'TEST' : 'LIVE' },
                          () => 'سجل الطلب — ينتظر عضوا ثانيا.',
                        )
                      }
                    >
                      {row.storedEnv === 'LIVE' ? 'أعدها إلى الاختبار' : 'انقلها إلى الإنتاج'}
                    </Button>
                  ) : row.pendingEnvSwitch.requestedBy === adminId ? (
                    <span className="text-3xs opacity-70">
                      طلبت نقلها إلى {row.pendingEnvSwitch.to === 'LIVE' ? 'الإنتاج' : 'الاختبار'} —
                      ينتظر عضوا آخر
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        post(
                          `/api/v1/admin/integrations/${row.key}/approve`,
                          { requestId: row.pendingEnvSwitch?.id },
                          (data) =>
                            (data as { state?: string } | undefined)?.state === 'EXECUTED'
                              ? 'اكتمل النصاب — بدلت البيئة.'
                              : 'سجلت موافقتك.',
                        )
                      }
                    >
                      اعتمد نقلها إلى {row.pendingEnvSwitch.to === 'LIVE' ? 'الإنتاج' : 'الاختبار'}
                    </Button>
                  )}

                  {/*
                    **فحص الاتصال — ولمن يقرأ الشاشة لا لمن يملك السرّ.**

                    كان `checkConnection` مبنيًّا ولا ينادِيه شيء، فمن
                    ضبط سرًّا لا يملك طريقةً ليعرف أوصل أم لا إلّا أن
                    يُجري معاملةً حقيقية بمال حقيقيّ.
                  */}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      post(`/api/v1/admin/integrations/${row.key}/check`, {}, (data) => {
                        /**
                          **وثلاثُ نتائج لا اثنتان.** «مضبوطة ولم
                          يُنادَ المزوّد» أمانةٌ لمن لا وصلةَ له،
                          أمّا من له مُهايئ فيُنادى — ويُقال نجاحُه
                          أو فشلُه.
                        */
                        const result = (data as { result?: string } | undefined)?.result;
                        if (result === 'LIVE_OK') return 'نودي المزود ورد — المفاتيح تعمل.';
                        if (result === 'LIVE_FAILED') {
                          return 'نودي المزود ورفض — راجع المفاتيح أو البيئة.';
                        }
                        if (result === 'UNTESTED') {
                          return 'المفاتيح مضبوطة — ولا وصلة لهذا التكامل بعد لتجرب.';
                        }
                        return 'لا مفاتيح مضبوطة لهذا التكامل بعد.';
                      })
                    }
                  >
                    افحص الاتصال
                  </Button>

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
                          /**
                            **والحقول مُعلَنةٌ لا مكتوبةٌ بيد.** اسمٌ
                            بحرفٍ زائد يحفظ سرًّا لا يقرؤه أحد:
                            يُضبط التكامل في عين المشغّل ويبقى
                            معطَّلًا في عين الكود، ولا شيء يسقط.
                          */
                          fields: secretFieldsFor(row.key).map((name) => ({ name, value: '' })),
                        })
                      }
                    >
                      تدوير
                    </Button>
                  ) : row.pendingRotation.requestedBy === adminId ? (
                    /* الطالب يرى أنه ينتظر غيره — ولا يُعرض له زرّ يضغطه فيُرفض */
                    <span className="text-3xs opacity-70">طلبته — ينتظر عضوا آخر</span>
                  ) : (
                    /*
                      ═══ والمعتمِد يرى ما يعتمده ═══

                      كان الزرّ «اعتمد التدوير» وحده — **فيعتمد العضو
                      الثاني أعمى**: لا يعرف أبيئةَ اختبارٍ هي أم
                      إنتاج، ولا كم بلغ النصاب. ونصابُ عضوين يُراد به
                      أن يَفحص الثاني لا أن يضغط.
                    */
                    <div className="flex flex-col items-start gap-1.5 sm:items-end">
                      <span className="flex flex-wrap items-center gap-2 text-3xs opacity-70">
                        <Badge tone={row.pendingRotation.env === 'LIVE' ? 'warn' : 'neutral'}>
                          {ENV_LABEL[row.pendingRotation.env]}
                        </Badge>
                        <span>
                          النصاب{' '}
                          <span dir="ltr" className="font-num">
                            {displayDigits(String(row.pendingRotation.approvals))}/
                            {displayDigits(String(row.pendingRotation.required))}
                          </span>
                        </span>
                      </span>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          post(
                            `/api/v1/admin/integrations/${row.key}/approve`,
                            { requestId: row.pendingRotation?.id },
                            (data) =>
                              (data as { state?: string } | undefined)?.state === 'EXECUTED'
                                ? 'اكتمل النصاب — دور المفتاح.'
                                : 'سجلت موافقتك.',
                          )
                        }
                      >
                        اعتمد التدوير
                      </Button>
                    </div>
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
            <p className="text-2xs leading-relaxed opacity-70">
              المفتاح الجديد يشفر ويبقى في الطلب حتى يعتمده عضو ثاني. ولن يستبدل القديم
              قبل ذلك — <strong>فالطلب وحده ليس تدويرا</strong>.
            </p>

            {/*
              ═══ وبيئةُ المفتاح تُختار ═══

              كانت مثبَّتةً على `TEST` في موضع واحد ولا خيار في اللوح
              — **فمفتاح إنتاجٍ لا يمكن إدخاله من الشاشة أصلًا**. ويوم
              تصل مفاتيح المزوّد يقف الإطلاق على حقلٍ لا وجود له.

              **والاختبار هو الافتراض**: الإنتاج يُقصَد لا يُقع فيه.
              وتبديل البيئة يُحذِّر قبل الضغط لا بعده.
            */}
            <div className="flex flex-col gap-2">
              <span className="text-3xs font-bold opacity-70">بيئة المفتاح</span>
              <div className="flex gap-2">
                {(['TEST', 'LIVE'] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    aria-pressed={draft.env === env}
                    onClick={() => setDraft({ ...draft, env })}
                    className={cn(
                      'rounded-btn border px-4 py-2 text-2xs font-bold',
                      draft.env === env ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink',
                    )}
                  >
                    {ENV_LABEL[env]}
                  </button>
                ))}
              </div>
              {draft.env !== 'LIVE' ? null : (
                <p className="rounded-md border border-warn-200 bg-warn-100 p-2.5 text-3xs leading-loose text-warn-900">
                  مفتاح إنتاج — يمس مالا حقيقيا فور اعتماده. تأكد أنه من لوحة المزود
                  لا من بيئة الاختبار.
                </p>
              )}
            </div>

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
