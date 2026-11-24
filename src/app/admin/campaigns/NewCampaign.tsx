'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

/**
 * ═══ A9 — حملةٌ جديدة ═══
 *
 * الشرائحُ تُبنى وتُحفظ، والإرسالُ مبنيٌّ بضوابطه (الموافقة · التهدئة ·
 * السقف الشهريّ) — **وبينهما لا شيء ينشئ حملة**: فما في الشاشة هو ما
 * زرعته البذرة، ومشغّلٌ أراد حملةً لم يجد بابًا.
 *
 * ═══ والتوقيت يُعرض بما يقع ═══
 *
 * يرسم الترميزُ خيارين: «أفضل وقت لكل مستخدم» و«وقت محدّد». والأوّل
 * يحتاج ساعةَ فتحِ كلِّ مستخدم — **ولا تطبيق يرسلها بعد**، فعرضُه وعدٌ
 * بما لا يقع. والثاني يقع: `scheduledAt` تُكتب، و`sendDueCampaigns`
 * تُرسل ما حلّ موعدُه.
 */

const CHANNELS = [
  { key: 'email', label: 'بريد' },
  { key: 'sms', label: 'رسالة' },
  { key: 'push', label: 'إشعار دفع' },
] as const;

export function NewCampaign({
  segments,
}: {
  segments: readonly { id: string; nameAr: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState('');
  const [channels, setChannels] = useState<readonly string[]>(['push']);
  /**
   * **والمختارُ مرجعٌ لا فهرس** (البوابة ٤٧): قائمةُ الشرائح تتغيّر
   * بحفظِ شريحةٍ جديدة، وفهرسٌ محفوظ يشير بعدها إلى غيرها.
   */
  const [segmentId, setSegmentId] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [timing, setTiming] = useState<'draft' | 'at'>('draft');
  const [at, setAt] = useState('');

  const chosenSegment = segments.find((segment) => segment.id === segmentId) ?? null;
  const ready =
    nameAr.trim() !== '' &&
    bodyAr.trim() !== '' &&
    channels.length > 0 &&
    chosenSegment !== null &&
    (timing === 'draft' || at !== '');

  const save = (): void => {
    start(async () => {
      const response = await fetch('/api/v1/admin/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nameAr: nameAr.trim(),
          channels,
          segmentId,
          subjectAr: subjectAr.trim(),
          bodyAr: bodyAr.trim(),
          // الحقل محلّيّ بلا منطقة — يُبنى بتوقيت المتصفّح ثمّ يُرسَل UTC
          scheduledAt: timing === 'at' ? new Date(at).toISOString() : '',
        }),
      }).catch(() => null);

      const body = (await response?.json().catch(() => null)) as
        | { data?: { status?: string }; error?: { messageAr?: string } }
        | null;

      if (response === null || !response.ok) {
        setToast(body?.error?.messageAr ?? 'تعذر الإنشاء.');
        return;
      }

      setToast(
        body?.data?.status === 'SCHEDULED'
          ? 'جدولت الحملة — وتحوسب الشريحة وقت الإرسال لا الآن.'
          : 'حفظت مسودة — تراجعها ثم ترسلها بيدك.',
      );
      setOpen(false);
      setNameAr('');
      setSubjectAr('');
      setBodyAr('');
      setAt('');
      setTiming('draft');
      router.refresh();
    });
  };

  const toggle = (key: string): void => {
    setChannels((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };

  return (
    <>
      {/* **واللفظُ لفظُ الترميز** — «+ حملة جديدة» بعلامتها، فهي جزءُ الزرّ */}
      <Button size="sm" onClick={() => setOpen(true)}>
        + حملة جديدة
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="حملة جديدة"
        className="w-[460px]"
        footer={
          <div className="flex gap-2.5">
            <Button size="sm" disabled={pending || !ready} onClick={save}>
              {pending ? 'جاري…' : timing === 'at' ? 'جدول الحملة' : 'احفظ مسودة'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {segments.length === 0 ? (
            <p className="rounded-md border border-line p-3 text-3xs leading-loose opacity-75">
              <b>لا شريحة بعد.</b> الحملة ترسل إلى شريحة، فعرف واحدة أولا من زر
              «عرف شريحة».
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">اسم الحملة</span>
            <input
              value={nameAr}
              placeholder="خصم على الفحص لمن أضاف مركبة"
              onChange={(event) => setNameAr(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">القناة</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((channel) => (
                <label
                  key={channel.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-2xs"
                >
                  <input
                    type="checkbox"
                    checked={channels.includes(channel.key)}
                    onChange={() => toggle(channel.key)}
                    className="size-4 accent-ink"
                  />
                  {channel.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">الشريحة</span>
            <select
              value={segmentId}
              onChange={(event) => setSegmentId(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm"
            >
              <option value="">اختر شريحة</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.nameAr}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">العنوان (للبريد)</span>
            <input
              value={subjectAr}
              onChange={(event) => setSubjectAr(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-bold opacity-70">النص</span>
            <textarea
              rows={4}
              value={bodyAr}
              onChange={(event) => setBodyAr(event.target.value)}
              className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm leading-loose"
            />
          </label>

          <div className="flex flex-col gap-2 border-t border-line pt-3.5">
            <span className="text-2xs font-bold opacity-70">التوقيت</span>
            <label className="flex cursor-pointer items-center gap-2 text-2xs">
              <input
                type="radio"
                checked={timing === 'draft'}
                onChange={() => setTiming('draft')}
                className="size-4 accent-ink"
              />
              مسودة — ترسلها بيدك بعد المراجعة
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-2xs">
              <input
                type="radio"
                checked={timing === 'at'}
                onChange={() => setTiming('at')}
                className="size-4 accent-ink"
              />
              وقت محدد
            </label>
            {timing === 'at' ? (
              <input
                type="datetime-local"
                dir="ltr"
                value={at}
                onChange={(event) => setAt(event.target.value)}
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-start font-num text-sm"
              />
            ) : null}
            {/*
              **ولا يُعرض ما لا يقع.** «أفضل وقت لكل مستخدم» يحتاج ساعةَ
              فتحِ كلِّ مستخدم، ولا تطبيق يرسلها بعد — فيُقال سببُ غيابها
              ولا يُعرض خيارٌ لا يعمل.
            */}
            <p className="text-3xs leading-loose opacity-65">
              «أفضل وقت لكل مستخدم» في التصميم يحتاج ساعة فتح التطبيق لكل حساب،
              ولا تطبيق يرسلها بعد.
            </p>
          </div>
        </div>
      </Sheet>

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
