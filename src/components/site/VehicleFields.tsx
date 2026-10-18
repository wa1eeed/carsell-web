'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Quantity } from '@/components/ui/Quantity';
import { PlateField } from '@/components/ui/plate/PlateField';
import { cityLabel } from '@/lib/labels/cities';
import { toLatinDigits } from '@/lib/arabic';
import { cn } from '@/lib/cn';

/**
 * ═══ حقولُ المركبة — استمارةٌ واحدة يقرؤها البابان ═══
 *
 * بابان يُنشئان مركبة: معالجُ البيع، وشاشةُ «أضف سيارة» في الحساب.
 * ونسخُ الحقول في الثاني يُنتج استمارتين تتباعدان أوّل تغيير —
 * فيُضاف حقلٌ إلى إحداهما، أو يُشدَّد تطبيعٌ في واحدة، **فتُنشأ
 * مركبتان مختلفتا البيانات من منتجٍ واحد**. وقد وقع مثلُه في قاعدة
 * المال فنُقلت إلى `money.ts`.
 *
 * فالحقول هنا، والشاشتان تستدعيان. وما يخصّ **العرض** — الصور
 * والسعر وطريقة البيع وإظهارُ اللوحة — يبقى في معالج البيع: شروطُ
 * المِلك ليست شروطَ العرض.
 */

export type CatalogOption = { id: string; nameAr: string; nameEn: string };

/** فئةٌ **بمواصفاتها** — وهي ما يملأ الحقول عند اختيارها. */
export type TrimSpec = CatalogOption & {
  bodyType: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  seats: number;
  doors: number;
};

/** ما يعرفه الكتالوج عن هذا الطراز — والحقول تُحصر به. */
export type SpecOptions = {
  bodyTypes: string[];
  transmissions: string[];
  fuels: string[];
  drivetrains: string[];
  seats: number[];
  fromTrims: number;
};

export const ALL_OPTIONS: SpecOptions = {
  bodyTypes: ['SEDAN', 'SUV', 'HATCHBACK', 'COUPE', 'PICKUP', 'VAN', 'WAGON', 'CONVERTIBLE'],
  transmissions: ['AUTOMATIC', 'MANUAL', 'CVT', 'DCT'],
  fuels: ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC'],
  drivetrains: ['FWD', 'RWD', 'AWD', 'FOURWD'],
  seats: [2, 4, 5, 7, 8],
  fromTrims: 0,
};

/**
 * المركبةُ كما تُدخَل — **ولا `showPlate` فيها**: إظهارُ اللوحة
 * خاصّيةُ الإعلان لا خاصّيةُ المركبة، ومركبةٌ في المرآب لا تُعرض على
 * أحد فلا معنى لسؤال صاحبها عمّا يُظهره.
 */
export type VehicleDraft = {
  vin: string;
  brandId: string;
  modelId: string;
  /** الفئة تُملي الهيكل والدفع والمقاعد — فلا تُكتب يدويًّا */
  trimId: string;
  condition: string;
  year: string;
  mileageKm: string;
  transmission: string;
  fuel: string;
  spec: string;
  city: string;
  colorExterior: string;
  /** لوحةُ المركبة — وكان العمودان في المخطّط بلا نموذجٍ يكتبهما. */
  plateLetters: string;
  plateNumbers: string;
};

export const EMPTY_VEHICLE: VehicleDraft = {
  vin: '', brandId: '', modelId: '', trimId: '', condition: 'USED', year: '', mileageKm: '',
  transmission: 'AUTOMATIC', fuel: 'PETROL', spec: 'SAUDI', city: '', colorExterior: '',
  plateLetters: '', plateNumbers: '',
};

export const LABEL_CLASS = 'mb-1.5 block text-2xs font-semibold opacity-70';
export const FIELD_CLASS =
  'w-full rounded-md border border-line bg-bg px-3.5 py-2.5 text-sm outline-none';

/**
 * الكتالوجُ المتتالي — الماركةُ تفتح الطرازات، والطرازُ يفتح الفئات،
 * والفئةُ تملأ ما تمليه. وحالتُه هنا ليُشاركها النداءان.
 */
export function useVehicleCatalog(initial: VehicleDraft = EMPTY_VEHICLE) {
  const [vehicle, setVehicle] = useState<VehicleDraft>(initial);
  const [models, setModels] = useState<CatalogOption[]>([]);
  const [trims, setTrims] = useState<TrimSpec[]>([]);
  const [options, setOptions] = useState<SpecOptions>(ALL_OPTIONS);

  const set = (patch: Partial<VehicleDraft>): void =>
    setVehicle((current) => ({ ...current, ...patch }));

  const loadModels = async (brandId: string): Promise<void> => {
    if (brandId === '') {
      setModels([]);
      return;
    }
    const response = await fetch(`/api/v1/models?brandId=${brandId}`);
    const body = (await response.json()) as { data?: CatalogOption[] };
    setModels(body.data ?? []);
  };

  /** الفئات تتبع الطراز — كما تتبع الطرازاتُ الماركة. */
  const loadTrims = async (modelId: string): Promise<void> => {
    if (modelId === '') {
      setTrims([]);
      return;
    }
    const response = await fetch(`/api/v1/trims?modelId=${modelId}`);
    const body = (await response.json()) as {
      data?: { trims?: TrimSpec[]; options?: SpecOptions };
    };
    setTrims(body.data?.trims ?? []);
    /**
     * **والخيارات من الكتالوج لا من التعداد.** وطرازٌ بلا فئاتٍ منشورة
     * يعود بالتعداد كاملًا — والحصرُ إلى لا شيء يقفل الاستمارة على
     * بائعٍ لا يجد خيارًا واحدًا ولا رسالةً تقول لماذا.
     */
    setOptions(body.data?.options ?? ALL_OPTIONS);
  };

  /** الفئة المختارة — ومنها يُعرض الموروث. */
  const inheritedTrim = trims.find((row) => row.id === vehicle.trimId) ?? null;

  /**
   * ═══ اختيار الفئة يملأ ما تمليه ═══
   *
   * `Trim` يحمل الهيكل وناقل الحركة والوقود والدفع والمقاعد منذ اليوم
   * الأوّل، **ولا أحد كان يقرؤها في الإدخال**: تُعرض ليتعرّف البائع
   * على فئته، ثم يملأ الحقول بيده من قائمةٍ ثابتة — فيُنشر إعلانٌ
   * بمواصفةٍ تناقض فئته.
   */
  const pickTrim = (trimId: string): void => {
    const trim = trims.find((row) => row.id === trimId);
    if (trim === undefined) {
      set({ trimId });
      return;
    }
    /**
     * **ويُملأ ما يقبله الخادم وحده.** الهيكل والدفع والمقاعد تأتيه من
     * الفئة مباشرةً (قرار ٣٢)، فوضعُها في الحالة يوهم أنها تُرسَل.
     */
    set({ trimId, transmission: trim.transmission, fuel: trim.fuel });
  };

  /** ما يكفي لإنشاء مركبة — وهو ما يفحصه الخادم نفسه. */
  const ready =
    vehicle.brandId !== '' && vehicle.modelId !== '' && vehicle.trimId !== '' &&
    vehicle.year !== '' && vehicle.mileageKm !== '' && vehicle.city !== '' &&
    vehicle.colorExterior !== '';

  return {
    vehicle, set, models, trims, options, inheritedTrim,
    loadModels, loadTrims, pickTrim, ready,
  };
}

export type VehicleCatalog = ReturnType<typeof useVehicleCatalog>;

/**
 * ═══ حمولةُ `POST /api/v1/vehicles` ═══
 *
 * **والتحويلُ يُكتب مرّة**: ثلاثةُ نداءاتٍ كانت تبني الجسد بيدها —
 * النشرُ والمسودّةُ والحفظُ في المرآب — فأُسقطت اللوحةُ من أحدها بلا
 * أن يلحظه أحد: حقلٌ يملؤه البائع ولا يصل الخادم.
 */
export function vehiclePayload(vehicle: VehicleDraft) {
  return {
    brandId: vehicle.brandId,
    modelId: vehicle.modelId,
    trimId: vehicle.trimId,
    year: Number(toLatinDigits(vehicle.year).replace(/\D/g, '')),
    mileageKm: Number(toLatinDigits(vehicle.mileageKm).replace(/\D/g, '')),
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    spec: vehicle.spec,
    condition: vehicle.condition,
    city: vehicle.city,
    colorExterior: vehicle.colorExterior,
    plateLetters: vehicle.plateLetters === '' ? null : vehicle.plateLetters,
    plateNumbers: vehicle.plateNumbers === '' ? null : vehicle.plateNumbers,
    vin: vehicle.vin === '' ? null : vehicle.vin,
  };
}

export function VehicleFields({
  catalog,
  brands,
  cities,
  locale,
}: {
  catalog: VehicleCatalog;
  brands: readonly CatalogOption[];
  cities: readonly string[];
  locale: string;
}) {
  const t = useTranslations('sell');
  const te = useTranslations('enums');
  const { vehicle, set, models, trims, options, inheritedTrim } = catalog;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        <span className={LABEL_CLASS}>{t('brand')}</span>
        <select
          value={vehicle.brandId}
          onChange={(event) => {
            set({ brandId: event.target.value, modelId: '', trimId: '' });
            void catalog.loadModels(event.target.value);
          }}
          className={FIELD_CLASS}
        >
          <option value="" />
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {locale === 'ar' ? brand.nameAr : brand.nameEn}
            </option>
          ))}
        </select>
        {/*
          ═══ وبابٌ لما ليس في القائمة ═══

          القائمة صارت تعرض ما يُكمَل وحده — **وشرطٌ يُفرَض بلا
          بابٍ لاستيفائه قفلٌ بلا مفتاح**: من لا يجد ماركته يغلق الصفحة
          ولا نعرف أنّه جاء. فسطرٌ واحد يفتح الطريق ويُسمِعُنا الطلب.
        */}
        <Link
          href={`/${locale}/help/contact`}
          className="mt-1.5 inline-block py-1 text-3xs opacity-70 underline underline-offset-4 hover:opacity-100"
        >
          {t('brandMissing')}
        </Link>
      </label>

      <label>
        <span className={LABEL_CLASS}>{t('model')}</span>
        <select
          value={vehicle.modelId}
          onChange={(event) => {
            set({ modelId: event.target.value, trimId: '' });
            void catalog.loadTrims(event.target.value);
          }}
          disabled={models.length === 0}
          className={FIELD_CLASS}
        >
          <option value="" />
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {locale === 'ar' ? model.nameAr : model.nameEn}
            </option>
          ))}
        </select>
      </label>

      {/*
        **الفئة إلزامية**: منها يُنسخ الهيكل والدفع وعدد المقاعد.
        وطلبُها من البائع حقلٌ واحد، وإدخالُها يدويًّا أربعةٌ يخطئ
        في أحدها — والمخطّط نفسه يقول إنها «تُنسخ لقطةً وقت النشر».
      */}
      <label>
        <span className={LABEL_CLASS}>{t('trim')}</span>
        <select
          value={vehicle.trimId}
          onChange={(event) => catalog.pickTrim(event.target.value)}
          disabled={trims.length === 0}
          className={FIELD_CLASS}
        >
          <option value="" />
          {trims.map((trim) => (
            <option key={trim.id} value={trim.id}>
              {locale === 'ar' ? trim.nameAr : trim.nameEn}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={LABEL_CLASS}>{t('year')}</span>
        <input
          dir="ltr"
          inputMode="numeric"
          value={vehicle.year}
          onChange={(event) =>
            set({ year: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 4) })
          }
          className={cn(FIELD_CLASS, 'font-num')}
        />
      </label>

      <label>
        <span className={LABEL_CLASS}>{t('mileage')}</span>
        <input
          dir="ltr"
          inputMode="numeric"
          value={vehicle.mileageKm}
          onChange={(event) =>
            set({ mileageKm: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 7) })
          }
          className={cn(FIELD_CLASS, 'font-num')}
        />
      </label>

      {/*
        ═══ الموروث من الفئة يُعرض ولا يُحرَّر ═══

        الخادم يأخذ الهيكل والدفع والمقاعد **من الفئة** لقطةً
        (قرار ٣٢) — فحقلٌ يملؤه البائع بها لا يغيّر شيئًا، وهو
        وعدٌ مُخلَف بشكل حقل. وكان الهيكل غائبًا عن الاستمارة
        أصلًا، فلا البائع يراه ولا يعرف ما سيُنشر.
      */}
      {inheritedTrim === null ? null : (
        <div className="sm:col-span-2 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="mb-2 text-3xs font-bold opacity-70">من الفئة — تُسجَّل كما هي</p>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs">
            <span>{te(`bodyType.${inheritedTrim.bodyType}`)}</span>
            <span aria-hidden className="opacity-30">·</span>
            <span>{te(`drivetrain.${inheritedTrim.drivetrain}`)}</span>
            <span aria-hidden className="opacity-30">·</span>
            {/* الجملة لا يحكمها المعدود — والعدد بين قوسين (البوابة ١٨) */}
            <span className="font-num">
              <Quantity unit="seats" count={inheritedTrim.seats} />
            </span>
          </p>
        </div>
      )}

      {/*
        **الخيارات من الكتالوج لا من التعداد.** وكانت أربعة نواقل
        وأربعة أنواع وقود لكل مركبة — فيُعرض «كهربائي» على
        لاندكروزر، ويختاره بائعٌ فيُنشر إعلانٌ بمواصفةٍ لا وجود لها.

        و«المواصفة الإقليمية» تبقى كاملةً: سعوديّ أو خليجيّ أو وارد
        وكيل صفةُ استيرادٍ لا تُملى من الفئة.
      */}
      {(
        [
          ['transmission', options.transmissions],
          ['fuel', options.fuels],
          ['spec', ['SAUDI', 'GCC', 'AGENT_IMPORT']],
        ] as const
      ).map(([key, values]) => (
        <label key={key}>
          <span className={LABEL_CLASS}>{t(key)}</span>
          <select
            value={vehicle[key]}
            onChange={(event) => set({ [key]: event.target.value })}
            className={FIELD_CLASS}
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
        <span className={LABEL_CLASS}>{t('city')}</span>
        <select
          value={vehicle.city}
          onChange={(event) => set({ city: event.target.value })}
          className={FIELD_CLASS}
        >
          <option value="" />
          {cities.map((city) => (
            <option key={city} value={city}>
              {cityLabel(city, locale)}
            </option>
          ))}
        </select>
      </label>

      {/*
        اللون والحالة **يُجمعان هنا لأن المخطّط يطلبهما**، وكان
        المعالج يرسل بلا لون فيردّ الخادم ٤٢٢ — نشرٌ لا يمكن أن
        ينجح من الشاشة أصلًا. والحالة مرشِّح في البحث، فغيابها
        يُخفي المركبة عن نصف الباحثين.
      */}
      <label>
        <span className={LABEL_CLASS}>{t('colorExterior')}</span>
        <input
          value={vehicle.colorExterior}
          onChange={(event) => set({ colorExterior: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>

      <label>
        <span className={LABEL_CLASS}>{t('condition')}</span>
        <select
          value={vehicle.condition}
          onChange={(event) => set({ condition: event.target.value })}
          className={FIELD_CLASS}
        >
          <option value="USED">{te('condition.USED')}</option>
          <option value="NEW">{te('condition.NEW')}</option>
        </select>
      </label>
    </div>
  );
}

/**
 * ═══ واللوحةُ حقلٌ مستقلّ ═══
 *
 * `Vehicle.plateLetters` في المخطّط منذ بُني **ولا نموذجَ في المنتج
 * يكتبه**: تكتبه البذرةُ وحدها، فكلُّ مركبةٍ ينشرها بائعٌ حقيقيّ بلا
 * لوحة — وتقريرُ فحصها ينقصه ما تُعرف به.
 *
 * وهو خارج الشبكة لأنّ تحته معاينةً ترسم اللوحة وهو يكتب.
 */
export function VehiclePlateField({ catalog }: { catalog: VehicleCatalog }) {
  const t = useTranslations('sell');
  return (
    <PlateField
      label={t('plate')}
      hint={t('plateHint')}
      letters={catalog.vehicle.plateLetters}
      numbers={catalog.vehicle.plateNumbers}
      onLetters={(plateLetters) => catalog.set({ plateLetters })}
      onNumbers={(plateNumbers) => catalog.set({ plateNumbers })}
    />
  );
}
