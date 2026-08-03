'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { ImageUploader, type UploadedImage } from '@/components/ui/ImageUploader';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import { Stepper } from '@/components/ui/Stepper';
import { TaxStatusDialog } from '@/components/site/TaxStatusDialog';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { toLatinDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

type Option = { id: string; nameAr: string; nameEn: string };

type Vehicle = {
  vin: string;
  brandId: string;
  modelId: string;
  year: string;
  mileageKm: string;
  transmission: string;
  fuel: string;
  spec: string;
  city: string;
  colorExterior: string;
};

const EMPTY: Vehicle = {
  vin: '', brandId: '', modelId: '', year: '', mileageKm: '',
  transmission: 'AUTOMATIC', fuel: 'PETROL', spec: 'SAUDI', city: '', colorExterior: '',
};

const STEPS = ['vehicle', 'photos', 'method'] as const;
const METHODS = ['DIRECT', 'NEGOTIATION', 'AUCTION'] as const;

/**
 * Wh — ثلاث خطوات.
 *
 * **الجلب مسار أوّل والإدخال اليدوي مسار أوّل**، لا أصلٌ وبديل. رقم
 * الهيكل يملأ ما يعرفه ويترك الباقي، والبائع يكمل — وهذا هو الحال
 * الغالب لا الاستثناء، لأن ما يُستخرج من الرقم نفسه سنةٌ وماركة فقط.
 *
 * والحالة كلّها في العميل هنا **بخلاف Wb**: هذه استمارة لا شاشة نتائج،
 * ورابطٌ يحمل نصف مركبة لا يفيد أحدًا ولا يُشارَك.
 */
export function SellWizard({
  taxProfile,
  brands,
  cities,
  locale,
  vinLookupEnabled,
}: {
  taxProfile: TaxProfile;
  brands: readonly Option[];
  cities: readonly string[];
  locale: string;
  /** الراية المطفأة تُخفي الحقل كلّيًا — لا تُعطّله. */
  vinLookupEnabled: boolean;
}) {
  const t = useTranslations('sell');
  const te = useTranslations('enums');
  const tx = useTranslations('tax');

  const [step, setStep] = useState<(typeof STEPS)[number]>('vehicle');
  const [vehicle, setVehicle] = useState<Vehicle>(EMPTY);
  const [models, setModels] = useState<Option[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('DIRECT');

  /**
   * ═══ الوضع الضريبيّ يُسأل هنا، لا عند «ادفع» ═══
   *
   * والنشر أوّل إجراءٍ له أثر ضريبيّ: الإعلان يُظهر سعرًا للمشتري، وشكلُ
   * السعر يتبع وضع البائع. فالسؤال قبل النشر لا بعده.
   *
   * **والحارس يُبنى مع الزرّ لا بعده**: بين بناء النشر وحراسته نافذةٌ
   * تُنشَر فيها إعلاناتٌ بلا تصنيف.
   */
  const [tax, setTax] = useState<TaxProfile>(taxProfile);
  const [askingTax, setAskingTax] = useState(false);
  /** استثناء الإعلان الواحد — `null` يعني «اتبع وضع البائع». */
  const [taxableSupply, setTaxableSupply] = useState<boolean | null>(null);

  /**
   * حارس النشر — يُستدعى حين يُبنى الإنشاء الفعليّ، ويحمل معه
   * `taxableSupply` استثناءَ الإعلان.
   */
  const publish = (): { taxableSupply: boolean | null } | null => {
    if (tax.needsAnswer) {
      setAskingTax(true);
      return null;
    }
    return { taxableSupply };
  };
  void publish;

  /**
   * **لا حالة تفتح النموذج**: الحقول ظاهرة من اللحظة الأولى. جلب
   * الرقم التسلسلي يحتاج ربطًا بخدمة مؤجَّلة، وبناء النموذج على أنه
   * المسار الأول يفتحه على طريق مسدود.
   */
  const [filledCount, setFilledCount] = useState<number | null>(null);
  const [vinFailed, setVinFailed] = useState(false);
  const [alreadyListed, setAlreadyListed] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<Vehicle>): void => setVehicle((v) => ({ ...v, ...patch }));

  const loadModels = async (brandId: string): Promise<void> => {
    if (brandId === '') {
      setModels([]);
      return;
    }
    const response = await fetch(`/api/v1/models?brandId=${brandId}`);
    const body = (await response.json()) as { data?: Option[] };
    setModels(body.data ?? []);
  };

  /**
   * الجلب. **فشله يفتح الإدخال اليدوي ويقول السبب** — ولا يطلب من
   * البائع رقمًا آخر لا يملكه.
   */
  /**
   * الجلب **مساعد لا مسار**.
   *
   * نجاحه يملأ ما يعرفه ويقول كم حقلًا مُلئ، والحقول تبقى قابلة
   * للتعديل كلّها. وفشله **ليس حدثًا**: سطر رمادي واحد، بلا رسالة خطأ
   * وبلا تحويل — لأن الفشل هو الحال المتوقّع ما دامت الخدمة مؤجَّلة،
   * وتحويلُه إلى خطأ يُشعر البائع أنه أخطأ وهو لم يخطئ.
   *
   * والاستثناء الوحيد: مركبة معروضة بالفعل. تلك ليست فشل جلب بل
   * قاعدة عمل توقف — سيارةٌ بإعلانين تُفسد كل إحصاء.
   */
  const lookup = async (): Promise<void> => {
    setBusy(true);
    setVinFailed(false);
    setFilledCount(null);
    setAlreadyListed(false);

    try {
      const response = await fetch('/api/v1/vin/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vin: vehicle.vin }),
      });
      const body = (await response.json()) as {
        data?: { vin: string; year: number | null; brandId: string | null };
        error?: { code: string };
      };

      if (!response.ok || body.data === undefined) {
        if (body.error?.code === 'VIN_ALREADY_LISTED') setAlreadyListed(true);
        else setVinFailed(true);
        return;
      }

      const patch: Partial<Vehicle> = { vin: body.data.vin };
      let filled = 0;
      if (body.data.year !== null) {
        patch.year = String(body.data.year);
        filled += 1;
      }
      if (body.data.brandId !== null) {
        patch.brandId = body.data.brandId;
        filled += 1;
        await loadModels(body.data.brandId);
      }

      set(patch);
      setFilledCount(filled);
    } catch {
      // الشبكة أو الخدمة — الحال نفسه: لا حدث
      setVinFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const label = 'mb-1.5 block text-2xs font-semibold opacity-60';
  const field =
    'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none';

  const vehicleReady =
    vehicle.brandId !== '' && vehicle.modelId !== '' && vehicle.year !== '' &&
    vehicle.mileageKm !== '' && vehicle.city !== '';
  const photosReady = images.length > 0 && price !== '';

  return (
    <>
      <Stepper
        steps={STEPS.map((id) => ({ id, label: t(`step.${id}`) }))}
        active={step}
        onSelect={(id) => setStep(id as (typeof STEPS)[number])}
        className="mb-9"
      />

      {step === 'vehicle' ? (
        <section className="max-w-3xl">
          {/**
            * الحقل المساعد أعلى النموذج — لا تبويب ولا خيار متكافئ.
            * والراية المطفأة تُخفيه كلّيًا، والنموذج يعمل كاملًا بدونه.
            */}
          {!vinLookupEnabled ? null : (
            <div className="mb-7 rounded-xl border border-line bg-surface p-5">
              <p className="mb-3 text-xs opacity-70">{t('vinOptional')}</p>

              <div className="flex flex-wrap gap-2.5">
                <input
                  dir="ltr"
                  value={vehicle.vin}
                  onChange={(event) =>
                    set({ vin: toLatinDigits(event.target.value).toUpperCase().slice(0, 17) })
                  }
                  placeholder="JTDBE32K123456789"
                  maxLength={17}
                  aria-label={t('vinTitle')}
                  className={cn(field, 'font-num min-w-56 flex-1 tracking-wider')}
                />
                <Button
                  variant="outline"
                  onClick={() => void lookup()}
                  disabled={vehicle.vin.length !== 17 || busy}
                >
                  {t('lookup')}
                </Button>
              </div>

              {/* النجاح: كم حقلًا مُلئ، ودعوة صريحة لمراجعته */}
              {filledCount === null ? null : (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-2 rounded-md bg-accent-100 px-3.5 py-2.5 text-2xs text-accent-900"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                  <span className="flex items-center gap-1.5">
                    {t('filledPrefix')} <ArabicNumber value={filledCount} /> {t('filledSuffix')}
                  </span>
                </p>
              )}

              {/* الفشل: سطر رمادي واحد. لا خطأ ولا تحويل — الجلب ليس المسار */}
              {!vinFailed ? null : (
                <p className="mt-3 text-2xs opacity-45">{t('vinFailedQuiet')}</p>
              )}

              {/* الاستثناء: قاعدة عمل توقف، لا فشل جلب */}
              {!alreadyListed ? null : (
                <p role="alert" className="mt-3 rounded-md bg-warn-100 px-3.5 py-2.5 text-2xs text-warn-900">
                  {t('vinListed')}
                </p>
              )}
            </div>
          )}

          <h2 className="mb-4 text-lg font-bold">{t('vehicleData')}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>{t('brand')}</span>
              <select
                value={vehicle.brandId}
                onChange={(event) => {
                  set({ brandId: event.target.value, modelId: '' });
                  void loadModels(event.target.value);
                }}
                className={field}
              >
                <option value="" />
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {locale === 'ar' ? brand.nameAr : brand.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={label}>{t('model')}</span>
              <select
                value={vehicle.modelId}
                onChange={(event) => set({ modelId: event.target.value })}
                disabled={models.length === 0}
                className={field}
              >
                <option value="" />
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {locale === 'ar' ? model.nameAr : model.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={label}>{t('year')}</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={vehicle.year}
                onChange={(event) =>
                  set({ year: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 4) })
                }
                className={cn(field, 'font-num')}
              />
            </label>

            <label>
              <span className={label}>{t('mileage')}</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={vehicle.mileageKm}
                onChange={(event) =>
                  set({ mileageKm: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 7) })
                }
                className={cn(field, 'font-num')}
              />
            </label>

            {(
              [
                ['transmission', ['AUTOMATIC', 'MANUAL', 'CVT', 'DCT']],
                ['fuel', ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC']],
                ['spec', ['SAUDI', 'GCC', 'AGENT_IMPORT']],
              ] as const
            ).map(([key, values]) => (
              <label key={key}>
                <span className={label}>{t(key)}</span>
                <select
                  value={vehicle[key]}
                  onChange={(event) => set({ [key]: event.target.value })}
                  className={field}
                >
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {te(`${key}.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <label>
              <span className={label}>{t('city')}</span>
              <select
                value={vehicle.city}
                onChange={(event) => set({ city: event.target.value })}
                className={field}
              >
                <option value="" />
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button onClick={() => setStep('photos')} disabled={!vehicleReady} className="mt-7">
            {t('next')}
          </Button>
        </section>
      ) : null}

      {step === 'photos' ? (
        <div className="flex flex-col gap-10 lg:flex-row">
          <section className="min-w-0 flex-1">
            <ImageUploader images={images} onChange={setImages} max={10} className="mb-9" />

            <h3 className="mb-1.5 text-sm font-bold">{t('askPrice')}</h3>
            <div className="mb-2 flex max-w-xs items-center gap-2.5 rounded-md border border-line bg-bg px-4 py-3">
              <input
                dir="ltr"
                inputMode="numeric"
                value={price}
                onChange={(event) =>
                  setPrice(toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 8))
                }
                className="font-num w-full bg-transparent text-lg font-bold outline-none"
              />
              <span className="text-2xs opacity-50">{t('currency')}</span>
            </div>

            {/*
              ═══ استثناء الإعلان الواحد ═══

              لا تظهر للمسجَّل: إعلاناته خاضعة أصلًا، وخانةٌ تسأله عمّا
              أجاب عنه ضجيج. وتظهر للفرد وحده لأنها عنده استثناء — مركبةٌ
              تابعة لنشاطٍ تجاريّ بين مركباته الشخصية.
            */}
            {tax.status !== 'INDIVIDUAL' ? null : (
              <label className="mb-2 flex max-w-md cursor-pointer items-start gap-2.5 text-2xs leading-relaxed opacity-70">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={taxableSupply === true}
                  onChange={(event) => setTaxableSupply(event.target.checked ? true : null)}
                />
                <span>
                  {tx('listingTaxable')}
                  <span className="block opacity-70">{tx('listingTaxableHint')}</span>
                </span>
              </label>
            )}

            <div className="mt-7 flex gap-2.5">
              <Button variant="outline" onClick={() => setStep('vehicle')}>
                {t('back')}
              </Button>
              <Button onClick={() => setStep('method')} disabled={!photosReady}>
                {t('next')}
              </Button>
            </div>
            {photosReady ? null : (
              <p className="mt-3 text-2xs opacity-55">
                {images.length === 0 ? t('needPhotos') : t('needPrice')}
              </p>
            )}
          </section>

          <aside className="w-full shrink-0 lg:w-80">
            <section className="rounded-xl border border-line bg-surface p-5">
              <h3 className="mb-3.5 text-xs font-bold">{t('summary')}</h3>
              <p className="mb-1 flex flex-wrap items-baseline gap-1.5 text-sm font-bold">
                <span className="bidi-isolate">
                  {brands.find((b) => b.id === vehicle.brandId)?.nameAr ?? ''}{' '}
                  {models.find((m) => m.id === vehicle.modelId)?.nameAr ?? ''}
                </span>
                {vehicle.year === '' ? null : (
                  <ArabicNumber value={Number(vehicle.year)} grouped={false} />
                )}
              </p>
              <p className="mb-4 flex flex-wrap items-center gap-2 text-2xs opacity-55">
                {vehicle.mileageKm === '' ? null : (
                  <Quantity unit="km" count={Number(vehicle.mileageKm)} />
                )}
                <span aria-hidden className="opacity-40">·</span>
                <span className="bidi-isolate">{vehicle.city}</span>
              </p>

              {price === '' ? null : (
                <Money amount={Number(price)} size="lg" className="mb-4 block" />
              )}

              <div className="flex items-center justify-between border-t border-line pt-3.5 text-xs">
                <span className="opacity-60">{t('listingFee')}</span>
                <span className="font-bold text-accent-700">{t('free')}</span>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {step === 'method' ? (
        <section className="max-w-3xl">
          <h2 className="mb-5 text-lg font-bold">{t('methodTitle')}</h2>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {METHODS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={cn(
                  'rounded-xl p-5 text-start',
                  method === key ? 'bg-accent text-bg' : 'border border-line hover:bg-ink/5',
                )}
              >
                <span className="mb-1.5 block text-base font-bold">{t(`method.${key}`)}</span>
                <span className={cn('block text-2xs leading-loose', method === key ? 'opacity-80' : 'opacity-60')}>
                  {t(`methodBody.${key}`)}
                </span>
              </button>
            ))}
          </div>

          {/*
            ═══ التذكير يسبق لحظة الحاجة ═══

            اكتشافُ «عليك تحديد وضعك الضريبي» عند ضغط «انشر» أسوأ توقيت.
            فيظهر هنا قبله، بزرٍّ يعمل فعلًا — لا بتحذيرٍ بلا مخرج.
          */}
          {!tax.needsAnswer ? null : (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line p-4">
              <p className="min-w-0 flex-1 text-2xs leading-loose opacity-70">{tx('prompt')}</p>
              <Button size="sm" variant="outline" onClick={() => setAskingTax(true)}>
                {tx('title')}
              </Button>
            </div>
          )}

          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setStep('photos')}>
              {t('back')}
            </Button>
            {/*
              النشر الفعليّ لم يُبنَ بعد، فالزرّ يبقى معطَّلًا — **وزرٌّ
              يبدو حيًّا ولا يفعل وعدٌ مُخلَف**. والحارس قائمٌ في `publish`
              من الآن، فلا نافذة بين بناء النشر وحراسته.
            */}
            <Button disabled>{t('publish')}</Button>
            <Button variant="ghost">{t('saveDraft')}</Button>
          </div>
        </section>
      ) : null}

      <TaxStatusDialog
        open={askingTax}
        onClose={() => setAskingTax(false)}
        initial={tax}
        onSaved={(profile) => {
          setTax(profile);
          setAskingTax(false);
        }}
      />
    </>
  );
}
