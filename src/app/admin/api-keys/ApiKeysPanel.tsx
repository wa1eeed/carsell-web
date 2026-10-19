'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { cn } from '@/lib/cn';
import { AR_DATE_LOCALE } from '@/lib/arabic';
import { API_SCOPES, type ApiScope } from '@/lib/api/scopes';
import { API_SCOPE_HINT, API_SCOPE_LABEL } from '@/lib/labels/api-keys';
import { RATE_LIMIT_RANGE, type ApiKeyView } from '@/lib/api/keys';

const riyadh = new Intl.DateTimeFormat(AR_DATE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});

/**
 * ═══ إصدارٌ وسحب — والسرُّ يُعرض مرّةً ═══
 *
 * **والمفتاحُ الخامّ لا يُعاد إلى الشاشة بعد إغلاق بطاقته.** يبقى في
 * حالة المكوّن وحدها، ولا يُحفظ في تخزينٍ محليّ ولا يُطلب ثانيةً —
 * فما لا يُخزَّن لا يُسرَق، و«أرني مفتاحي» بابٌ خلفيّ على كلّ تكامل.
 *
 * **والسحبُ لا رجعةَ فيه**، فيُسأل عنه مرّتين: زرٌّ ثمّ تأكيدٌ باسم
 * المفتاح — لا نافذةُ «أمتأكّد؟» التي تُضغط بلا قراءة.
 */
export function ApiKeysPanel({
  keys,
  canEdit,
}: {
  keys: readonly ApiKeyView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState(60);
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [minted, setMinted] = useState<{ raw: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const field =
    'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-ink';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-70';

  async function send(url: string, method: string, body?: unknown): Promise<unknown | null> {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = (await response.json()) as { data?: unknown; error?: { messageAr: string } };
      if (!response.ok) {
        setToast({ tone: 'error', text: json.error?.messageAr ?? 'تعذر الإجراء.' });
        return null;
      }
      return json.data ?? null;
    } finally {
      setBusy(false);
    }
  }

  async function issue(): Promise<void> {
    const data = (await send('/api/v1/admin/api-keys', 'POST', {
      name,
      scopes,
      rateLimit: limit,
    })) as { raw?: string } | null;
    if (data?.raw === undefined) return;

    setMinted({ raw: data.raw, name });
    setName('');
    setScopes([]);
    setToast({ tone: 'success', text: 'أصدرت المفتاح — انسخه الآن.' });
    router.refresh();
  }

  async function revoke(id: string): Promise<void> {
    const data = await send(`/api/v1/admin/api-keys/${id}`, 'DELETE');
    if (data === null) return;
    setConfirming(null);
    setToast({ tone: 'success', text: 'سحبت المفتاح — ولا يعمل بعدها.' });
    router.refresh();
  }

  return (
    <>
      {/*
        ═══ بطاقةُ السرّ — تُعرض مرّةً ولا تعود ═══

        **وتُقال صراحةً**: من يغلقها بلا نسخ يأخذ مفتاحًا جديدًا. وإخفاءُ
        ذلك يجعل المشغّل يظنّ أنّه يستطيع العودة إليها.
      */}
      {minted === null ? null : (
        <section className="mb-7 rounded-xl border border-accent-800 bg-accent-100 p-5">
          <h2 className="mb-2 text-sm font-bold">مفتاح «{minted.name}» — انسخه الآن</h2>
          <p className="mb-4 text-2xs leading-loose opacity-80">
            هذه المرة الوحيدة التي يظهر فيها. لا يخزن عندنا إلا مجزأ، فلا سبيل
            لاسترجاعه — ومن أغلق هذه البطاقة بلا نسخ يصدر مفتاحا جديدا ويسحب هذا.
          </p>
          <code
            dir="ltr"
            className="bidi-ltr block w-full overflow-x-auto rounded-md border border-line bg-bg px-3 py-2.5 font-num text-sm"
          >
            {minted.raw}
          </code>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(minted.raw);
                setToast({ tone: 'success', text: 'نسخ المفتاح.' });
              }}
            >
              انسخ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMinted(null)}>
              نسخته — أغلق
            </Button>
          </div>
        </section>
      )}

      {!canEdit ? null : (
        <section className="mb-7 rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-sm font-bold">إصدار مفتاح</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              اسم المفتاح — لمن هو
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="تطبيق الجوال · شريك البحث"
                className={field}
              />
            </label>
            <label className={label}>
              <span className="flex items-center gap-2">
                حد الطلبات في الدقيقة
                <span className="font-num text-3xs opacity-65">
                  {RATE_LIMIT_RANGE.min}–{RATE_LIMIT_RANGE.max}
                </span>
              </span>
              <input
                type="number"
                dir="ltr"
                value={limit}
                min={RATE_LIMIT_RANGE.min}
                max={RATE_LIMIT_RANGE.max}
                onChange={(e) => setLimit(Number(e.target.value))}
                className={cn(field, 'font-num bidi-ltr')}
              />
            </label>
          </div>

          {/*
            **والنطاقُ يُفحص فعلًا**: كل مسارٍ يعلن نطاقَه والحارس يفحصه،
            فما يُمنح هنا هو ما يُفتح هناك — لا حقلٌ يبدو صلاحيةً ولا يُقرأ.
          */}
          <fieldset className="mt-4">
            <legend className="mb-2.5 text-2xs font-semibold opacity-70">
              النطاقات — والفارغ يعني كل سطح القراءة العام
            </legend>
            <div className="flex flex-col gap-2.5">
              {API_SCOPES.map((scope) => (
                <label key={scope} className="flex items-start gap-2.5 text-2xs">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes((was) =>
                        e.target.checked ? [...was, scope] : was.filter((s) => s !== scope),
                      )
                    }
                    className="mt-0.5 size-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="font-semibold">{API_SCOPE_LABEL[scope]}</span>
                    <code dir="ltr" className="bidi-ltr mx-1.5 font-num opacity-65">
                      {scope}
                    </code>
                    <span className="block opacity-70">{API_SCOPE_HINT[scope]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <Button size="sm" disabled={busy || name.trim() === ''} onClick={() => void issue()}>
              أصدر المفتاح
            </Button>
          </div>
        </section>
      )}

      {keys.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm opacity-70">
          لا مفتاح بعد — والواجهة العامة لا ترد على أحد حتى يصدر أول مفتاح.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {keys.map((key) => (
            <section
              key={key.id}
              className={cn(
                'rounded-xl border border-line bg-surface p-5',
                key.revokedAt === null ? '' : 'opacity-70',
              )}
            >
              <header className="mb-3.5 flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{key.name}</span>
                  <code dir="ltr" className="bidi-ltr block font-num text-2xs opacity-65">
                    {key.prefix}…
                  </code>
                </span>
                {key.revokedAt === null ? (
                  <Badge tone="accent">يعمل</Badge>
                ) : (
                  <Badge tone="danger">مسحوب</Badge>
                )}
              </header>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs opacity-75">
                <span className="flex items-center gap-1.5">
                  الحد في الدقيقة
                  <ArabicNumber value={key.rateLimit} />
                </span>
                <span>
                  النطاقات:{' '}
                  {key.scopes.length === 0
                    ? 'كل سطح القراءة العام'
                    : key.scopes
                        .map((scope) => API_SCOPE_LABEL[scope as ApiScope] ?? scope)
                        .join(' · ')}
                </span>
                <span>
                  آخر استعمال:{' '}
                  {key.lastUsedAt === null ? 'لم يستعمل بعد' : riyadh.format(new Date(key.lastUsedAt))}
                </span>
                <span>أصدر {riyadh.format(new Date(key.createdAt))}</span>
              </div>

              {key.revokedAt !== null || !canEdit ? null : (
                <div className="mt-4 border-t border-line pt-4">
                  {confirming === key.id ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-2xs">
                        سحب «{key.name}» نهائي — وكل من يستعمله يتوقف فورا.
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => void revoke(key.id)}
                      >
                        اسحبه
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        تراجع
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(key.id)}>
                      اسحب المفتاح
                    </Button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </>
  );
}
