'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { BRAND_ACCENT_HEX } from '@/lib/brand';
import type { SiteView } from '@/lib/domain/dealer-site';

const field =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none focus:border-ink';

/**
 * ═══ `D16` — إعدادُ موقع المعرض ═══
 *
 * **والنشرُ قرارٌ لا افتراض**: صفحةٌ نصفُ معدّة لا تُفتح للناس، فتبدأ
 * مخفيّةً حتى يضغط صاحبُها «انشر».
 */
export function SiteForm({
  site,
  origin,
  dealerName,
  city,
}: {
  site: SiteView | null;
  origin: string;
  dealerName: string;
  city: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ slug: string; token: string | null } | null>(null);

  const [slug, setSlug] = useState(site?.slug ?? '');
  const [tagline, setTagline] = useState(site?.tagline ?? '');
  const [accent, setAccent] = useState(site?.accent ?? '');
  const [visible, setVisible] = useState(site?.visible ?? false);
  const [domain, setDomain] = useState(site?.customDomain ?? '');

  const submit = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/dealer/site', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          tagline: tagline.trim() === '' ? null : tagline.trim(),
          accent: accent.trim() === '' ? null : accent.trim(),
          visible,
          customDomain: domain.trim() === '' ? null : domain.trim(),
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { data?: { slug?: string; domainToken?: string | null }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر الحفظ.');
        return;
      }
      setSaved({ slug: body?.data?.slug ?? slug, token: body?.data?.domainToken ?? null });
      router.refresh();
    });
  };

  const address = `${origin}/showroom/${slug === '' ? '…' : slug}`;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">عنوان موقعك</h2>
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          بحروف لاتينية — ومنه يبنى الرابط، فعربي يصير مرمزا ويصعب نسخه.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">العنوان</span>
          <input
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="jeddah-auto"
            className={`${field} bidi-ltr`}
          />
          {/* **ورقمٌ يُحفظ ويُطبع يُرى أثرُه قبل حفظه** — فيقرأ الرابط كما سيكون. */}
          <span dir="ltr" className="bidi-ltr text-3xs opacity-65">
            {address}
          </span>
        </label>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3.5 text-sm font-bold">الهوية</h2>
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">سطر تحت الاسم</span>
            <input
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              placeholder={`معرض سيارات في ${city}`}
              className={field}
            />
            <span className="text-3xs opacity-65">
              واتركه فارغا فيعرض «معرض سيارات في {city}».
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs opacity-70">لون هويتك</span>
            <span className="flex items-center gap-2.5">
              <input
                type="color"
                value={accent === '' ? BRAND_ACCENT_HEX : accent}
                onChange={(event) => setAccent(event.target.value)}
                aria-label="لون الهوية"
                className="h-10 w-14 rounded-md border border-line bg-bg"
              />
              <input
                dir="ltr"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                placeholder={BRAND_ACCENT_HEX}
                className={`${field} bidi-ltr font-num`}
              />
            </span>
            <span className="text-3xs opacity-65">
              واتركه فارغا فيستعمل لون كارز. وشعارك هو الشعار المرفوع في ملفك العام.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">دومينك</h2>
        {/*
          ═══ والدومينُ خطوتان، تُقال الثانيةُ صراحةً ═══

          الأولى إثباتُ الملكية بسجلّ `TXT` — نقرؤه نحن. والثانيةُ شهادةُ
          TLS يصدرها الوسيط، **وهي خطوةُ تشغيلٍ عندنا لا عندك**. ومن قيل
          له «جاهز» ثمّ فتح دومينَه فوجد تحذيرَ أمانٍ يحسب العطلَ فينا —
          فيُقال ما يقع كما يقع.
        */}
        <p className="mb-3.5 text-3xs leading-loose opacity-70">
          يعمل موقعك على عنواننا من اليوم. والدومين الخاص خطوتان: تثبت ملكيته هنا، ثم
          نصدر له شهادة أمان — ونخبرك حين يعمل.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-3xs opacity-70">الدومين — اختياري</span>
          <input
            dir="ltr"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="cars.example.com"
            className={`${field} bidi-ltr`}
          />
        </label>

        {site?.customDomain === null || site?.customDomain === undefined ? null : (
          <p className="mt-3 text-3xs leading-loose opacity-75">
            {site.domainVerified
              ? 'ملكية الدومين مثبتة — وتبقى الشهادة عندنا.'
              : 'لم تثبت ملكيته بعد — أضف السجل أدناه ثم أخبرنا.'}
          </p>
        )}

        {site?.domainToken === null || site?.domainToken === undefined ? null : (
          <p
            dir="ltr"
            className="bidi-ltr font-num mt-2 rounded-md border border-line bg-bg px-3 py-2 text-3xs"
          >
            TXT _carz-verify = {site.domainToken}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-bold">النشر</h2>
        <p className="mb-3 text-3xs leading-loose opacity-70">
          ولا ينشر موقعك حتى تقرره — فصفحة نصف معدة لا تفتح للناس.
        </p>
        <label className="flex items-center gap-2.5 text-2xs">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
            className="size-4 accent-ink"
          />
          انشر موقع {dealerName}
        </label>
      </section>

      {saved === null ? null : (
        <p className="rounded-lg border border-accent bg-accent-100/40 px-4 py-3 text-2xs leading-loose">
          حفظ. وعنوانك{' '}
          <a
            dir="ltr"
            href={`${origin}/showroom/${saved.slug}`}
            className="bidi-ltr underline"
            target="_blank"
            rel="noreferrer"
          >
            {`${origin}/showroom/${saved.slug}`}
          </a>
          {visible ? '' : ' — وهو مخفي حتى تنشره.'}
        </p>
      )}

      <div>
        <Button disabled={pending || slug.trim().length < 3} onClick={submit}>
          {pending ? 'يحفظ…' : 'احفظ'}
        </Button>
      </div>

      {toast === null ? null : <Toast title={toast} />}
    </div>
  );
}
