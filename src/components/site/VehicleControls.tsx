'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { toLatinDigits } from '@/lib/arabic';

/**
 * ═══ تعديل مركبة وحذفها من «سياراتي» ═══
 *
 * الشاشة بُنيت تعرض وتربط، **ولا تُعدّل ولا تحذف** — فمن أخطأ في
 * الممشى يعيش معه، ومن أضاف سيارةً مرّتين يراهما أبدًا.
 *
 * ═══ وما يُعدَّل هو ما يتغيّر ═══
 *
 * الممشى يزيد كل يوم، واللون يُصبغ، والمدينة ينتقل صاحبها. أمّا
 * الماركة والطراز والفئة فلقطةُ الكتالوج وقت الإضافة (قرار ٣٢)،
 * وتغييرُها يجعلها مركبةً أخرى — فمن أخطأ فيها يحذف ويضيف.
 *
 * ═══ والحذف يقول سببَ منعه ═══
 *
 * «لا يمكن الحذف» وحدها تترك صاحبها يحاول مرّة بعد مرّة. والمعروضة
 * تُسحب من العرض أوّلًا، والمفحوصة لها تقريرٌ يقرؤه مشترٍ.
 */
const DENIED: Record<string, string> = {
  HAS_LISTING: 'هذه السيارة معروضة — اسحب إعلانها أوّلًا ثم احذفها.',
  HAS_INSPECTION: 'لها تقرير فحصٍ يقرؤه المشترون — لا تُحذف وتقريرُها قائم.',
};

export function VehicleControls({
  vehicleId,
  mileageKm,
  colorExterior,
  city,
  cities,
  canRemove,
}: {
  vehicleId: string;
  mileageKm: number;
  colorExterior: string;
  city: string;
  cities: readonly string[];
  /** معروضةٌ أو مفحوصة ⇒ لا زرَّ حذفٍ أصلًا — وزرٌّ يُرفض دائمًا أسوأ من غيابه. */
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * **والاستمارة تُملأ عند فتحها لا عند التركيب.** `useState(prop)`
   * ينسخ الخاصّية مرّةً، فتتقادم عند التنقّل داخل التطبيق: يُعدَّل
   * ممشًى ثمّ يُفتح المحرّر فيعرض القديم. (البوابة أمسكتها.)
   */
  const [km, setKm] = useState('');
  const [colour, setColour] = useState('');
  const [where, setWhere] = useState('');

  const openEditor = (): void => {
    setKm(String(mileageKm));
    setColour(colorExterior);
    setWhere(city);
    setEditing(true);
  };

  const save = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/vehicles/${vehicleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mileageKm: Number(toLatinDigits(km).replace(/\D/g, '')),
          colorExterior: colour,
          city: where,
        }),
      }).catch(() => null);

      if (response === null || !response.ok) {
        setToast('تعذّر الحفظ.');
        return;
      }

      setEditing(false);
      setToast('حُفظت البيانات.');
      router.refresh();
    });
  };

  const remove = (): void => {
    start(async () => {
      const response = await fetch(`/api/v1/vehicles/${vehicleId}`, { method: 'DELETE' }).catch(
        () => null,
      );

      if (response === null || !response.ok) {
        const payload = (await response?.json().catch(() => null)) as
          | { error?: { fields?: { vehicle?: string } } }
          | null;
        const why = payload?.error?.fields?.vehicle;
        setToast((why === undefined ? undefined : DENIED[why]) ?? 'تعذّر الحذف.');
        setConfirming(false);
        return;
      }

      setToast('حُذفت السيارة.');
      router.refresh();
    });
  };

  const field = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-2xs';
  const label = 'mb-1 block text-3xs font-bold opacity-55';

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : openEditor())}
          className="relative z-10 rounded-full border border-line px-3.5 py-1.5 text-3xs font-bold hover:border-ink"
        >
          تعديل
        </button>

        {!canRemove ? null : confirming ? (
          <>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="relative z-10 rounded-full bg-danger px-3.5 py-1.5 text-3xs font-bold text-bg"
            >
              أكّد الحذف
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="relative z-10 text-3xs underline underline-offset-2 opacity-60"
            >
              تراجع
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="relative z-10 rounded-full border border-line px-3.5 py-1.5 text-3xs font-bold opacity-60 hover:border-danger hover:text-danger hover:opacity-100"
          >
            حذف
          </button>
        )}
      </span>

      {!editing ? null : (
        <div className="relative z-10 mt-3 grid w-full gap-3 rounded-lg border border-line bg-bg p-3.5 sm:grid-cols-3">
          <label>
            <span className={label}>الممشى — كم</span>
            <input dir="ltr" value={km} onChange={(e) => setKm(e.target.value)} className={field} />
          </label>

          <label>
            <span className={label}>اللون</span>
            <input value={colour} onChange={(e) => setColour(e.target.value)} className={field} />
          </label>

          <label>
            <span className={label}>المدينة</span>
            <select value={where} onChange={(e) => setWhere(e.target.value)} className={field}>
              {cities.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <span className="flex flex-wrap items-center gap-2.5 sm:col-span-3">
            <Button size="sm" onClick={save} disabled={pending}>احفظ</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>إلغاء</Button>
            {/*
              **والماركة والطراز لا يُعدَّلان** — ويُقال لماذا، وإلّا
              بحث عنهما صاحبُها في كل زاوية.
            */}
            <span className="text-3xs opacity-50">
              الماركة والطراز والفئة تُسجَّل مرّةً عند الإضافة — ومن أخطأ فيها يحذف ويضيف.
            </span>
          </span>
        </div>
      )}

      {toast === null ? null : <Toast title={toast} />}
    </>
  );
}
