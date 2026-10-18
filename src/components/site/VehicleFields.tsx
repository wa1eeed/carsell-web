'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Field, fieldShell } from '@/components/ui/Field';
import { ChoiceGroup } from '@/components/ui/ChoiceGroup';
import { BrandMark, Picker } from '@/components/ui/Picker';
import { Quantity } from '@/components/ui/Quantity';
import { Toggle } from '@/components/ui/Toggle';
import { LicensePlate } from '@/components/ui/plate/LicensePlate';
import { PlateField } from '@/components/ui/plate/PlateField';
import { ALL_OPTIONS, type SpecOptions } from '@/lib/catalog/specs';
import type { SellFormFeature } from '@/lib/catalog/features';
import { cityLabel } from '@/lib/labels/cities';
import { displayDigits, toLatinDigits } from '@/lib/arabic';
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
/** وماركةٌ معها شعارُها — من `Brand.logoUrl` لا من مقطعٍ يُشتقّ. */
export type BrandOption = CatalogOption & { logoUrl: string | null };

/** فئةٌ **بمواصفاتها** — وهي ما يملأ الحقول عند اختيارها. */
export type TrimSpec = CatalogOption & {
  bodyType: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  seats: number;
  doors: number;
  /** سعةُ المحرك نصًّا — `Decimal` لا يعبر حدَّ الخادم. */
  engineL: string | null;
  cylinders: number | null;
  /** ما تأتي به الفئة — يصل البائعَ مُعلَّمًا، ولا يحصر ما يراه. */
  featureKeys: string[];
};

/** ما يعرفه الكتالوج عن هذا الطراز — والحقول تُحصر به. */
export { ALL_OPTIONS, type SpecOptions };

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
  /** لونُ المقصورة — عاملٌ بصريّ يسأل عنه المشتري. */
  colorInterior: string;
  /** حالُ الهيكل والصبغ — يقرّه البائع ويتجاوزه الفحص (قرار ١٦). */
  paintStatus: string;
  /**
   * ═══ ما تحمله سيارته — يقرّه هو ═══
   *
   * **ولم يكن يُسأل.** `ListingFeature` بلا كاتبٍ في المنتج كلِّه،
   * فالفلترُ يعرض «فتحة سقف» ولا إعلانَ حقيقيّ يحملها. والفئةُ
   * تُرجّح فتصل مُعلَّمةً، وهو يشطب ما ليس عنده.
   */
  features: string[];
  /** وحالُ استخدامها — للمستعملة وحدها. */
  accidentStatus: string;
  previousOwners: string;
  /** نوعُ التسجيل — تصنيفُ المرور، وافتراضُه من الطراز. */
  registrationType: string;
  /** حالُ الفحص الدوريّ ورخصةِ السير — للمستعملة ذات اللوحات. */
  periodicInspection: string;
  licenseStatus: string;
  /** وبيانُ الكهربائية — يظهر بحسب الوقود. */
  batteryKwh: string;
  rangeKm: string;
  chargePort: string;
  /**
   * بطاقةٌ جمركية — **للجديدة التي لم تُسجَّل بعد**.
   *
   * المستوردةُ حديثًا لا لوحةَ لها حتى تُسجَّل. وسؤالُ صاحبها عن لوحةٍ
   * لا يملكها يجعله يتركها فارغة — فلا يُعرف المركبُ بشيء، ولا تُطلب
   * عليه خدمةُ فحصٍ ولا تقريرُ موجز.
   */
  customsCard: string;
};

/**
 * ═══ سنواتُ الصنع — تُشتقّ ولا تُكتب ═══
 *
 * **وقائمةٌ تنتهي بسنةٍ كتبها أحدٌ تتقادم أوّلَ يناير**: موديلُ السنة
 * الجديدة يُطرح قبل أن تبدأ، وهو أكثرُ ما يُضاف — فبائعُه لا يجد سنته
 * ويغلق الصفحة. فالحدُّ الأعلى **السنة الجارية محسوبةً عند التصيير**،
 * والأدنى ١٩٦٠ بقرار المالك.
 *
 * **والأحدثُ أوّلًا**: من يبيع سيارةً عمرُها سنتان يجدها في أوّل سطر،
 * ومن يبيع واحدةً عمرُها ثلاثون يبحث — وهو الأندر.
 */
const OLDEST_MODEL_YEAR = 1960;

/**
 * ═══ طولان لا يُخلطان ═══
 *
 * **البطاقةُ الجمركية عشرةُ أرقام، ورقمُ الهيكل سبعةَ عشرَ خانةً**
 * فيها حروفٌ وأرقام (قولُ المالك ٢٠٢٦-١٠-١٨). والخلطُ بينهما ليس
 * خطأً في حقل: وثيقةُ تأمين المركبة الجديدة تُفعَّل على البطاقة
 * وتُربط بنجم والمرور — فمن كتب رقم الهيكل مكانها **لا يعرف أنّه
 * أخطأ حتى تُرفض وثيقتُه**.
 *
 * فالطولان هنا، يقرؤهما الحقلان والتنويهان معًا — ولا يُكتب رقمٌ
 * في موضعين.
 */
export const REGISTRATION_TYPES = [
  'PRIVATE', 'PRIVATE_TRANSPORT', 'PUBLIC_TRANSPORT',
  'MINIBUS', 'TAXI', 'MOTORCYCLE', 'HEAVY_EQUIPMENT',
] as const;

export const DOCUMENT_STATES = ['VALID', 'EXPIRED'] as const;

export const ACCIDENT_STATES = ['NONE', 'REPORTED', 'UNREPORTED'] as const;

export const PREVIOUS_OWNERS = [
  'FIRST', 'SECOND', 'THREE', 'FOUR', 'MORE_THAN_FOUR',
] as const;

export const VIN_LENGTH = 17;
export const CUSTOMS_LENGTH = 10;

export function modelYears(now: Date = new Date()): number[] {
  const newest = now.getFullYear();
  const out: number[] = [];
  for (let year = newest; year >= OLDEST_MODEL_YEAR; year -= 1) out.push(year);
  return out;
}

export const EMPTY_VEHICLE: VehicleDraft = {
  vin: '', brandId: '', modelId: '', trimId: '', condition: 'USED', year: '', mileageKm: '',
  features: [],
  transmission: 'AUTOMATIC', fuel: 'PETROL', spec: 'SAUDI', city: '', colorExterior: '',
  plateLetters: '', plateNumbers: '', customsCard: '',
  colorInterior: '', paintStatus: 'ORIGINAL', registrationType: 'PRIVATE',
  accidentStatus: '', previousOwners: '',
  periodicInspection: '', licenseStatus: '',
  batteryKwh: '', rangeKm: '', chargePort: '',
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
    /**
     * **والفئةُ تُرجّح ولا تحسم.** ما تأتي به يصل مُعلَّمًا، ولا
     * يُمسَح ما علّمه البائع بيده: من شطب «فتحة سقف» ثمّ بدّل الفئة
     * لا يُعاد تعليمُها عليه خطأً — بل يُضاف الجديد إلى اختياره.
     */
    set({
      trimId,
      transmission: trim.transmission,
      fuel: trim.fuel,
      features: [...new Set([...vehicle.features, ...trim.featureKeys])],
    });
  };

  /**
   * ═══ والمملوءةُ مسبقًا تُحمَّل قوائمُها مرّة ═══
   *
   * حالةٌ تبدأ بماركةٍ وطرازٍ (سيارةٌ من «سياراتي») لا تمرّ بـ`onChange`
   * فلا يُنادى `loadModels` — **فتُعرض قائمتا الطراز والفئة فارغتين
   * والقيمةُ فيهما مختارة**، ولا تظهر بطاقةُ الموروث من الفئة. وهي
   * الصورةُ التي تجعل البائع يظنّ أنّ بياناته ضاعت.
   *
   * **ومرّةً واحدة**: `useRef` لا `useState` — فلا يُعيد التحميلَ
   * تصييرٌ ولا يفتح حلقة.
   */
  const preloaded = useRef(false);
  useEffect(() => {
    if (preloaded.current) return;
    if (initial.brandId === '' && initial.modelId === '') return;
    preloaded.current = true;
    void (async () => {
      if (initial.brandId !== '') await loadModels(initial.brandId);
      if (initial.modelId !== '') await loadTrims(initial.modelId);
    })();
    // الحمولةُ الابتدائية ثابتةٌ بعد أوّل تصيير — ولا تُعاد القراءة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ═══ حالُ كلّ قسم — تُحسب من الحقول لا تُكتب بيد ═══
   *
   * **والعدّادُ يُحسب بمرشّح القائمة التي يفتحها** (قاعدةُ مركز
   * المساعدة): القسمُ «مكتمل» متى امتلأت حقولُه هي، لا متى بلغ عددٌ
   * مكتوبٌ في مكانٍ آخر. فحقلٌ يُضاف إلى قسمٍ يدخل حسابَه تلقائيًّا.
   */
  const sections = {
    identity: [vehicle.brandId, vehicle.modelId, vehicle.trimId, vehicle.year],
    /**
     * ═══ المطلوبُ قائمةٌ قالها المالك ═══
     *
     * «لا تجعل كل شيء إلزاميًّا حتى لا يتراجع المعلن عن النشر، ولكن
     * ضع حقولًا حاسمة تضمن فلترة البحث» — فالممشى والوارد وحالُ
     * الهيكل واللونان مطلوبة، ورقمُ الهيكل اختياريّ.
     */
    condition: [
      vehicle.mileageKm,
      vehicle.colorExterior,
      vehicle.colorInterior,
      vehicle.city,
      vehicle.spec,
    ],
  } as const;

  const filled = (group: readonly string[]): number =>
    group.filter((value) => value !== '').length;

  const progress = {
    identity: { done: filled(sections.identity), total: sections.identity.length },
    condition: { done: filled(sections.condition), total: sections.condition.length },
  };

  /**
   * ما يكفي لإنشاء مركبة — **وهو مجموعُ الأقسام لا شرطٌ ثانٍ بجوارها**.
   * وشرطان لشيءٍ واحد يتباعدان أوّل حقلٍ يُضاف إلى أحدهما.
   */
  const required = [...sections.identity, ...sections.condition];
  const ready = filled(required) === required.length;

  return {
    vehicle, set, models, trims, options, inheritedTrim,
    loadModels, loadTrims, pickTrim, ready, progress,
    /** للعدّاد العلويّ — «٥ من ٧». */
    completion: { done: filled(required), total: required.length },
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
    customsCard: vehicle.customsCard.trim() === '' ? null : vehicle.customsCard.trim(),
    colorInterior: vehicle.colorInterior.trim() === '' ? null : vehicle.colorInterior.trim(),
    paintStatus: vehicle.paintStatus,
    accidentStatus: vehicle.accidentStatus === '' ? null : vehicle.accidentStatus,
    previousOwners: vehicle.previousOwners === '' ? null : vehicle.previousOwners,
    registrationType: vehicle.registrationType === '' ? null : vehicle.registrationType,
    /** **والفارغُ غيابٌ لا قيمة**: مَن لم يُسأل لم يُجب. */
    periodicInspection: vehicle.periodicInspection === '' ? null : vehicle.periodicInspection,
    licenseStatus: vehicle.licenseStatus === '' ? null : vehicle.licenseStatus,
    batteryKwh: numberOrNull(vehicle.batteryKwh),
    rangeKm: numberOrNull(vehicle.rangeKm),
    chargePort: vehicle.chargePort === '' ? null : vehicle.chargePort,
    vin: vehicle.vin === '' ? null : vehicle.vin,
    /** ما يقرّه البائع عن سيارته — والشطبُ فعلٌ، فالفارغةُ تُرسَل. */
    features: vehicle.features,
  };
}

/** رقمٌ من حقلٍ نصّيّ — و`''` غيابٌ لا صفر. */
function numberOrNull(value: string): number | null {
  const clean = toLatinDigits(value).replace(/[^0-9.]/g, '');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ═══ قسمٌ من النموذج — عنوانٌ وحالُه ═══
 *
 * **وشبكةٌ من أحدَ عشرَ حقلًا بلا عناوين تُمسح بالعين ولا تُقرأ**: من
 * يفتحها لا يعرف كم بقي، ولا أيُّ حقلٍ يتبع أيًّا. والأقسامُ تقول
 * ثلاثًا في سطر: **ما هذا** · **كم بقي منه** · **وهل فرغتَ منه**.
 *
 * والعدّادُ يُحسب من الحقول نفسِها (`catalog.progress`) لا من رقمٍ
 * مكتوب — فحقلٌ يُضاف يدخل حسابَه، ولا يبقى عدّادٌ يكذب.
 */
function Section({
  step,
  title,
  note,
  done,
  total,
  children,
}: {
  step: number;
  title: string;
  note?: string;
  done?: number;
  total?: number;
  children: ReactNode;
}) {
  const complete = done !== undefined && total !== undefined && done === total;

  return (
    <section className="rounded-xl border border-line bg-surface/60 p-5">
      <header className="mb-4 flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'font-num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-3xs font-bold transition-colors',
            complete ? 'bg-accent text-bg' : 'border border-line text-ink/60',
          )}
        >
          {complete ? '✓' : displayDigits(String(step))}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">{title}</h3>
          {note === undefined ? null : (
            <p className="mt-1 text-3xs leading-loose opacity-70">{note}</p>
          )}
        </div>

        {/*
          **والشارة تُحسب من المعروض لا من رقمٍ ثانٍ.** وتظهر بنبضةٍ
          مرّةً عند الاكتمال لا ما دامت مكتملة: حركةٌ دائمة في قسمٍ
          فرغ منه صاحبه تسحب العين إلى ما لا يحتاجها.
        */}
        {/*
          **والشارةُ تقول «تمّ» ولا تعدّ.** رقمٌ مقابل كلّ عنوانٍ
          يُقرأ قائمةَ أعمال، والعلامةُ وحدها تكفي لمن يمسح الصفحة.
          (طلب المالك ٢٠٢٦-١٠-١٨.)
        */}
        {!complete ? null : (
          <span className="settle shrink-0 rounded-full bg-accent-100 px-2.5 py-1 text-3xs font-bold text-accent-900">
            اكتمل
          </span>
        )}
      </header>

      {children}
    </section>
  );
}

/**
 * ═══ شريطُ الإنجاز — «كم بقي» في سطر ═══
 *
 * **ونموذجٌ لا يقول كم بقي يُترك عند أوّل تردّد.** الزرُّ في آخره
 * معطَّلٌ حتى يكتمل، فمن ملأ ستّةً من سبعة يراه معطَّلًا ولا يعرف
 * أيُّ حقلٍ منعه — فيمسح الشاشة بعينه حقلًا حقلًا، أو يغلقها.
 *
 * والعددُ من الحقول نفسِها (`catalog.completion`) لا من رقمٍ مكتوب:
 * **كلُّ عدّادٍ يساوي طول ما يفتحه** — وهي قاعدةُ مركز المساعدة.
 */
export function VehicleProgress({ catalog }: { catalog: VehicleCatalog }) {
  const { done, total } = catalog.completion;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="text-2xs font-bold">
          {catalog.ready ? 'بيانات السيارة مكتملة' : 'بيانات السيارة'}
        </p>
        {/*
          ═══ نسبةٌ لا عدَّ حقول ═══

          **وعدُّ الحقول يُقرأ قائمةَ أعمال.** «٧ / ٧» يقول للقارئ كم
          أمامه قبل أن يبدأ — ومن رآها عشرةً ظنّ الطريق طويلًا فأغلق.
          والنسبةُ تقول كم قطع ولا تقول كم بقي عددًا. (طلب المالك
          ٢٠٢٦-١٠-١٨.) والمعنى في `progressbar` تحته.
        */}
        <p aria-hidden className="font-num text-3xs opacity-70">
          <ArabicNumber value={pct} percent />
        </p>
      </div>

      {/*
        **والشريطُ عنصرُ تقدّمٍ حقيقيّ لا رسمٌ ملوّن**: من لا يرى اللون
        يسمع «٥ من ٧» من قارئ الشاشة، لا «صورة».
      */}
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="اكتمال بيانات السيارة"
        className="h-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out',
            catalog.ready ? 'bg-accent' : 'bg-ink/50',
          )}
          style={{ width: `${String(pct)}%` }}
        />
      </div>
    </div>
  );
}

export function VehicleFields({
  catalog,
  brands,
  cities,
  locale,
  identity,
}: {
  catalog: VehicleCatalog;
  brands: readonly BrandOption[];
  cities: readonly string[];
  locale: string;
  /**
   * ═══ هويّةُ سيارةٍ قائمة — تُعرض ولا تُحرَّر ═══
   *
   * الماركةُ والطرازُ والفئةُ والسنة لقطةُ الكتالوج وقت التسجيل
   * (قرار ٣٢)، **ومن غيّرها لم يصحّح سيارته بل وضع مكانها أخرى**.
   * والخادم يتجاهل المُرسَل منها أصلًا ويقرأ الصفّ — فحقلٌ يُحرَّر
   * ولا أثر له وعدٌ مُخلَف بشكل حقل.
   */
  identity?: { locked: true; title: string };
}) {
  const t = useTranslations('sell');
  const { vehicle, set, models, trims, progress } = catalog;

  return (
    <div className="cascade flex flex-col gap-4">
      {identity !== undefined ? (
        <section
          style={{ '--i': 0 } as CSSProperties}
          className="flex items-start gap-3.5 rounded-xl border border-accent bg-accent-100/40 p-5"
        >
          <span aria-hidden className="mt-0.5 shrink-0 text-accent-900">
            <CarMark />
          </span>
          <div className="min-w-0">
            <p className="text-3xs font-bold opacity-70">من سياراتك — تعرض كما هي</p>
            <p className="mt-1 text-base font-bold">{identity.title}</p>
          </div>
        </section>
      ) : (
        <div style={{ '--i': 0 } as CSSProperties}>
          <Section
            step={1}
            title="السيارة"
            note="الماركة والطراز والفئة — ومنها يأخذ الإعلان اسمه."
            done={progress.identity.done}
            total={progress.identity.total}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                ═══ والماركةُ تُعرف بشعارها قبل اسمها ═══

                `Brand.logoUrl` في المخطّط ولوحةُ الأدمن ترفعه منذ
                بُنيت — **و`<select>` لا يحمل صورة**: المواصفة تمنع
                داخل `<option>` كلَّ ما ليس نصًّا. فالقائمةُ لنا.
                (طلب المالك ٢٠٢٦-١٠-١٨.)
              */}
              <Field label={t('brand')} htmlFor="veh-brand" required>
                <Picker
                  id="veh-brand"
                  value={vehicle.brandId}
                  placeholder="اختر الماركة"
                  searchPlaceholder="ابحث عن ماركة…"
                  onChange={(next) => {
                    set({ brandId: next, modelId: '', trimId: '' });
                    void catalog.loadModels(next);
                  }}
                  options={brands.map((brand) => ({
                    value: brand.id,
                    label: locale === 'ar' ? brand.nameAr : brand.nameEn,
                    sub: locale === 'ar' ? brand.nameEn : brand.nameAr,
                    media: <BrandMark name={brand.nameAr} logoUrl={brand.logoUrl} />,
                  }))}
                />
              </Field>

              {/*
                ═══ والقائمةُ تقول لماذا هي مغلقة ═══

                قائمةٌ معطَّلةٌ بلا كلمة تجعل القارئ يظنّ العطل في
                الصفحة. و«اختر الماركة أولا» سطرٌ واحد يُنهي السؤال.
              */}
              <Field
                label={t('model')}
                htmlFor="veh-model"
                required
                {...(vehicle.brandId === '' ? { hint: 'اختر الماركة أولا.' } : {})}
              >
                <Picker
                  id="veh-model"
                  value={vehicle.modelId}
                  placeholder="اختر الطراز"
                  emptyLabel="اختر الماركة أولا"
                  searchPlaceholder="ابحث عن طراز…"
                  disabled={models.length === 0}
                  onChange={(next) => {
                    set({ modelId: next, trimId: '' });
                    void catalog.loadTrims(next);
                  }}
                  /**
                   * **والاسمُ الآخر يُعرض ويُبحث به.** الماركةُ تحمل
                   * سطرًا ثانيًا منذ بُنيت، والطرازُ لا — وكان ذلك
                   * يمرّ على ثلاثةٍ وسبعين طرازًا معروفة الأسماء.
                   * ثمّ وصل الكتالوج العريض بمئتين وثلاثين، فصار من
                   * يبحث عن «GLC» أو «X5» **لا يجد شيئًا**: التسمية
                   * العربية «جي إل سي» لا يكتبها أحد، والبحث يقارن
                   * المعروض وحده. (و`Picker` يرشّح بـ`sub` أصلًا.)
                   */
                  options={models.map((model) => ({
                    value: model.id,
                    label: locale === 'ar' ? model.nameAr : model.nameEn,
                    ...otherName(model.nameAr, model.nameEn, locale),
                  }))}
                />
              </Field>

              {/*
                **الفئة إلزامية**: منها يُنسخ الهيكل والدفع وعدد المقاعد.
                وطلبُها من البائع حقلٌ واحد، وإدخالُها يدويًّا أربعةٌ يخطئ
                في أحدها — والمخطّط نفسه يقول إنها «تُنسخ لقطةً وقت النشر».
              */}
              <Field
                label={t('trim')}
                htmlFor="veh-trim"
                required
                {...(vehicle.modelId === ''
                  ? { hint: 'اختر الطراز أولا.' }
                  : { hint: 'منها نأخذ الهيكل والدفع وعدد المقاعد.' })}
              >
                <Picker
                  id="veh-trim"
                  value={vehicle.trimId}
                  placeholder="اختر الفئة"
                  emptyLabel="اختر الطراز أولا"
                  disabled={trims.length === 0}
                  onChange={(next) => catalog.pickTrim(next)}
                  options={trims.map((trim) => ({
                    value: trim.id,
                    label: locale === 'ar' ? trim.nameAr : trim.nameEn,
                    ...otherName(trim.nameAr, trim.nameEn, locale),
                  }))}
                />
              </Field>

              {/*
                **والسنةُ قائمةٌ لا حقلُ كتابة.** حقلٌ حرّ يقبل «202»
                و«20222» و«1899»، ويردّها الخادم بعد الإرسال —
                والقائمةُ لا تعرض إلّا المقبول. (طلب المالك ٢٠٢٦-١٠-١٨.)
              */}
              <Field label={t('year')} htmlFor="veh-year" required>
                <Picker
                  id="veh-year"
                  value={vehicle.year}
                  placeholder="اختر السنة"
                  searchPlaceholder="اكتب السنة…"
                  onChange={(next) => set({ year: next })}
                  options={modelYears().map((year) => ({
                    value: String(year),
                    label: displayDigits(String(year)),
                  }))}
                />
              </Field>
            </div>

            {/*
              ═══ وبابٌ لما ليس في القائمة ═══

              القائمة تعرض ما يُكمَل وحده — **وشرطٌ يُفرَض بلا بابٍ
              لاستيفائه قفلٌ بلا مفتاح**: من لا يجد ماركته يغلق الصفحة
              ولا نعرف أنّه جاء. فسطرٌ واحد يفتح الطريق ويُسمِعُنا الطلب.
            */}
            <Link
              href={`/${locale}/help/contact`}
              className="mt-3.5 inline-block py-1 text-3xs opacity-70 underline underline-offset-4 hover:opacity-100"
            >
              {t('brandMissing')}
            </Link>
          </Section>
        </div>
      )}

      <MutableVehicleFields catalog={catalog} cities={cities} locale={locale} />
    </div>
  );
}

/**
 * الاسمُ باللغة الأخرى سطرًا ثانيًا — **ولا يُكرَّر حين يتّحدان**:
 * فئةٌ اسمها «LE» بالعربية والإنجليزية تُصبح سطرين متطابقين.
 */
function otherName(
  nameAr: string,
  nameEn: string,
  locale: string,
): { sub?: string } {
  const other = locale === 'ar' ? nameEn : nameAr;
  const shown = locale === 'ar' ? nameAr : nameEn;
  return other === shown ? {} : { sub: other };
}

/** علامةُ سيارةٍ — لبطاقة الهويّة المقفلة. */
function CarMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14M4 17v-4.2a2 2 0 0 1 .2-.9l1.9-3.8A2 2 0 0 1 7.9 7h8.2a2 2 0 0 1 1.8 1.1l1.9 3.8c.13.28.2.59.2.9V17" />
      <circle cx="7.5" cy="17" r="1.6" />
      <circle cx="16.5" cy="17" r="1.6" />
    </svg>
  );
}

/**
 * ═══ ما يتغيّر من المركبة — مشتركٌ بين الاستمارتين ═══
 *
 * سيارةٌ جديدة تُدخَل بهويّتها ثمّ بهذه، وسيارةٌ من «سياراتي» تُعرض
 * هويّتُها ثمّ تُحرَّر هذه وحدها. **والقائمةُ واحدة**: نسختان لما
 * يُعدَّل تتباعدان أوّلَ حقلٍ يُضاف إلى إحداهما — وقد وقع مثلُه في
 * حمولة المركبة فأُغلق بالبوابة ٦٠.
 *
 * وهي الحقول نفسها التي يفتحها `PATCH /api/v1/vehicles/{id}`
 * ويكتبها `mutableVehicleFields` في النطاق.
 */
function MutableVehicleFields({
  catalog,
  cities,
  locale,
}: {
  catalog: VehicleCatalog;
  cities: readonly string[];
  locale: string;
}) {
  const t = useTranslations('sell');
  const te = useTranslations('enums');
  const { vehicle, set, options, inheritedTrim, progress } = catalog;

  /**
   * ═══ شجرةُ الشروط — النموذجُ يتبع المحرّك ═══
   *
   * **ولا يُسأل أحدٌ عن محرّكٍ لا وجودَ له.** الكهربائيةُ بلا سعةِ
   * محرّكٍ ولا سلندرات ولا ناقلِ حركةٍ تقليديّ؛ والبنزينُ بلا بطارية
   * ولا مدًى ولا مدخلِ شحن؛ **والهجينُ يُسأل عن الاثنين لأنّ فيه
   * الاثنين**. (طلب المالك ٢٠٢٦-١٠-١٨.)
   */
  const isElectric = vehicle.fuel === 'ELECTRIC';
  const hasBattery = isElectric || vehicle.fuel === 'HYBRID' || vehicle.fuel === 'PLUGIN_HYBRID';

  return (
    <>
      <div style={{ '--i': 1 } as CSSProperties}>
        <Section
          step={2}
          title="حالها اليوم"
          note="ما يتغير مع الوقت — ويظهر في بطاقة الإعلان."
          done={progress.condition.done}
          total={progress.condition.total}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('mileage')} htmlFor="veh-mileage" unit="كم" required>
              <input
                id="veh-mileage"
                dir="ltr"
                inputMode="numeric"
                placeholder="64000"
                value={vehicle.mileageKm}
                onChange={(event) =>
                  set({
                    mileageKm: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 7),
                  })
                }
                className={cn(fieldShell(), 'font-num')}
              />
            </Field>

            {/*
              اللون والحالة **يُجمعان هنا لأن المخطّط يطلبهما**، وكان
              المعالج يرسل بلا لون فيردّ الخادم ٤٢٢ — نشرٌ لا يمكن أن
              ينجح من الشاشة أصلًا. والحالة مرشِّح في البحث، فغيابها
              يُخفي المركبة عن نصف الباحثين.
            */}
            <Field label={t('colorExterior')} htmlFor="veh-colour" required>
              <input
                id="veh-colour"
                placeholder="ابيض لؤلؤي"
                value={vehicle.colorExterior}
                onChange={(event) => set({ colorExterior: event.target.value })}
                className={fieldShell()}
              />
            </Field>

            {/*
              **واللونُ الداخليّ عاملٌ بصريّ يسأل عنه المشتري** — وكان
              العمودُ في المخطّط بلا نموذجٍ يكتبه. (طلب المالك.)
            */}
            <Field label="اللون الداخلي" htmlFor="veh-colour-in" required>
              <input
                id="veh-colour-in"
                placeholder="بيج"
                value={vehicle.colorInterior}
                onChange={(event) => set({ colorInterior: event.target.value })}
                className={fieldShell()}
              />
            </Field>


            <Field label={t('city')} htmlFor="veh-city" required>
              <Picker
                id="veh-city"
                value={vehicle.city}
                placeholder="اختر المدينة"
                searchPlaceholder="ابحث عن مدينة…"
                onChange={(next) => set({ city: next })}
                options={cities.map((city) => ({
                  value: city,
                  label: cityLabel(city, locale),
                }))}
              />
            </Field>

          </div>
        </Section>
      </div>

      <div style={{ '--i': 2 } as CSSProperties}>
        <Section
          step={3}
          title="مواصفاتها"
          note="ما تأخذه من الفئة يسجل كما هو، وما تختاره أنت يبقى لك."
        >
          {/*
            ═══ الموروث من الفئة يُعرض ولا يُحرَّر ═══

            الخادم يأخذ الهيكل والدفع والمقاعد **من الفئة** لقطةً
            (قرار ٣٢) — فحقلٌ يملؤه البائع بها لا يغيّر شيئًا، وهو
            وعدٌ مُخلَف بشكل حقل. وكان الهيكل غائبًا عن الاستمارة
            أصلًا، فلا البائع يراه ولا يعرف ما سيُنشر.
          */}
          {inheritedTrim === null ? null : (
            <div className="reveal mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-bg px-4 py-3 text-2xs">
              <span className="text-3xs font-bold opacity-70">من الفئة</span>
              <span>{te(`bodyType.${inheritedTrim.bodyType}`)}</span>
              <span aria-hidden className="opacity-30">·</span>
              <span>{te(`drivetrain.${inheritedTrim.drivetrain}`)}</span>
              <span aria-hidden className="opacity-30">·</span>
              {/* الجملة لا يحكمها المعدود — والعدد بين قوسين (البوابة ١٨) */}
              <span className="font-num">
                <Quantity unit="seats" count={inheritedTrim.seats} />
              </span>

              {/*
                **وسعةُ المحرك وسلندراتُه من الفئة** — في المخطّط منذ
                بُني (١٢٥ فئةً من ١٢٦ تحملهما) ولم تُعرضا في
                الاستمارة قطّ. وتسقطان عن الكهربائية. (طلب المالك.)
              */}
              {isElectric || inheritedTrim.engineL === null ? null : (
                <>
                  <span aria-hidden className="opacity-30">·</span>
                  <span className="font-num" dir="ltr">
                    {displayDigits(inheritedTrim.engineL)} L
                  </span>
                </>
              )}
              {isElectric || inheritedTrim.cylinders === null ? null : (
                <>
                  <span aria-hidden className="opacity-30">·</span>
                  <span className="font-num">
                    <Quantity unit="cylinders" count={inheritedTrim.cylinders} />
                  </span>
                </>
              )}
            </div>
          )}

          {/*
            ═══ وبيانُ الكهربائية يظهر لمن له بطارية ═══

            **ويرفع قيمةَ الإعلان**: من يبحث عن كهربائيةٍ يسأل عن
            المدى والمدخل قبل أن يسأل عن اللون. و`CCS2` قياسيُّ
            السعودية. (طلب المالك ٢٠٢٦-١٠-١٨.)
          */}
          {!hasBattery ? null : (
            <div className="reveal mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="سعة البطارية" htmlFor="veh-battery" unit="kWh">
                <input
                  id="veh-battery"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder="77.4"
                  value={vehicle.batteryKwh}
                  onChange={(event) =>
                    set({
                      batteryKwh: toLatinDigits(event.target.value)
                        .replace(/[^0-9.]/g, '')
                        .slice(0, 6),
                    })
                  }
                  className={cn(fieldShell(), 'font-num')}
                />
              </Field>

              <Field label="المدى بالشحنة الواحدة" htmlFor="veh-range" unit="كم">
                <input
                  id="veh-range"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="480"
                  value={vehicle.rangeKm}
                  onChange={(event) =>
                    set({
                      rangeKm: toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 4),
                    })
                  }
                  className={cn(fieldShell(), 'font-num')}
                />
              </Field>

              <Field
                label="نوع مدخل الشحن"
                htmlFor="veh-port"
                hint="CCS2 هو القياسي في السعودية."
              >
                <Picker
                  id="veh-port"
                  value={vehicle.chargePort}
                  placeholder="اختياري"
                  onChange={(next) => set({ chargePort: next })}
                  options={(['CCS2', 'GBT', 'TYPE2'] as const).map((value) => ({
                    value,
                    label: te(`chargePort.${value}`),
                  }))}
                />
              </Field>
            </div>
          )}

          {/*
            **الخيارات من الكتالوج لا من التعداد.** وكانت أربعة نواقل
            وأربعة أنواع وقود لكل مركبة — فيُعرض «كهربائي» على
            لاندكروزر، ويختاره بائعٌ فيُنشر إعلانٌ بمواصفةٍ لا وجود لها.

            و«المواصفة الإقليمية» تبقى كاملةً: سعوديّ أو خليجيّ أو وارد
            وكيل صفةُ استيرادٍ لا تُملى من الفئة.
          */}
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                /**
                 * ═══ وناقلُ الحركة يسقط عن الكهربائية ═══
                 *
                 * **لا ناقلَ تقليديًّا فيها** — فحقلٌ يسأل عنه يُجبر
                 * صاحبَها على جوابٍ لا يصف سيارته. (طلب المالك.)
                 */
                ...(isElectric ? [] : [['transmission', options.transmissions] as const]),
                ['fuel', options.fuels],
                ['spec', ['SAUDI', 'GCC', 'AGENT_IMPORT', 'AMERICAN', 'KOREAN']],
              ] as const
            ).map(([key, values]) => (
              <Field key={key} label={t(key)} htmlFor={`veh-${key}`}>
                <Picker
                  id={`veh-${key}`}
                  value={vehicle[key]}
                  placeholder="—"
                  onChange={(next) => set({ [key]: next })}
                  options={values.map((value) => ({
                    value,
                    label: te(`${key}.${value}`),
                  }))}
                />
              </Field>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

/**
 * ═══ اللوحة — إدخالُها دائم، وإظهارُها مفتاح ═══
 *
 * `Vehicle.plateLetters` في المخطّط منذ بُني **ولا نموذجَ في المنتج
 * يكتبه**: تكتبه البذرةُ وحدها، فكلُّ مركبةٍ ينشرها بائعٌ حقيقيّ بلا
 * لوحة — وتقريرُ فحصها ينقصه ما تُعرف به.
 *
 * ═══ والفرقُ بين الإدخال والإظهار ═══
 *
 * **تُدخَل دائمًا**: تقريرُ الفحص يحملها بقرار المالك، ولوحةُ الأدمن
 * تقرؤها. **وتُظهَر باختيار**: المنصّة تطمس اللوحة في الصور، فعرضُها
 * نصًّا بجوار صورةٍ مطموسة ينقض الطمس.
 *
 * وكان مربّعَ اختيار — **والمربّع يقول «سيُرسَل مع الاستمارة»
 * والمفتاح يقول «هذا مُفعَّل الآن»**، والثاني هو الواقع: اختيارٌ
 * قائمٌ بذاته يُغيّره صاحبُه متى شاء. (طلب المالك ٢٠٢٦-١٠-١٨.)
 */
export function VehiclePlateField({
  catalog,
  consent,
  step = 4,
}: {
  catalog: VehicleCatalog;
  /** غيابُه يعني أن لا إعلان هنا — ومركبةُ المرآب لا تُعرض على أحد. */
  consent?: { on: boolean; onToggle: () => void };
  step?: number;
}) {
  const t = useTranslations('sell');
  const te = useTranslations('enums');
  const { vehicle, set } = catalog;
  const complete = vehicle.plateLetters.length === 3 && vehicle.plateNumbers.length > 0;

  /**
   * **وحالُ التسجيل سؤالُ شاشةٍ لا حقلٌ يُرسَل.** المخزَّنُ هو الجواب:
   * بطاقةٌ مكتوبة تعني «جمركية»، وغيابُها يعني «لوحات». فلا يُضاف
   * إلى `VehicleDraft` حقلٌ لا يصل الخادم (البوابة ٦٠).
   *
   * **ويُشتقّ ابتداؤه من المخزَّن** — فمن يعود إلى استمارةٍ مملوءة
   * يجد جوابَه كما تركه، لا السؤالَ من أوّله.
   */
  const vin = vehicle.vin;
  const customs = vehicle.customsCard;

  const [registration, setRegistration] = useState<'customs' | 'plate'>(
    vehicle.customsCard.trim() === '' ? 'plate' : 'customs',
  );

  /**
   * ═══ والجديدةُ قد لا تكون مسجَّلة بعد ═══
   *
   * المستوردةُ حديثًا لا لوحةَ لها حتى تُسجَّل، وتُعرف ببطاقتها
   * الجمركية. **وسؤالُ صاحبها عن لوحة يجعله يتركها فارغة** — فلا
   * يُعرف المركبُ بشيء، ولا تُطلب عليه خدمة.
   *
   * ═══ والسؤالُ يُطرح صريحًا لا يُستنتج من حقلٍ يُملأ ═══
   *
   * كان الحقلان يظهران معًا للجديدة، ويختفي أحدُهما حين يُكتب
   * الآخر — **فيقرأ صاحبُها حقلين ولا يعرف أيُّهما يخصّه**، ويجرّب.
   * فالسؤالُ الآن أوّلًا: «ببطاقة جمركية أم بلوحات صادرة؟» —
   * والحقلُ بعده واحد. (طلب المالك ٢٠٢٦-١٠-١٨.)
   *
   * **والمستعملةُ لا تُسأل**: لا تكون مستعملةً إلّا وقد سُجِّلت.
   */
  const isNew = vehicle.condition === 'NEW';
  const byCustoms = isNew && registration === 'customs';
  /** مستعملةٌ ولها لوحات — وهي وحدها من تُسأل عن وثيقتيها. */
  const asksDocuments = !isNew;

  return (
    <div style={{ '--i': 3 } as CSSProperties}>
      <Section
        step={step}
        title="بيانات تسجيل المركبة"
        note="تعرف بها سيارتك عند طلب الخدمات — ولا يظهر منها في الإعلان إلا ما تختاره."
      >
        {/*
          ═══ الرقمُ والحال في صفّ، واللوحةُ تحتهما ═══

          **وجُرِّبت اللوحةُ بجوار رقم الهيكل فلم تناسب**: الحقلُ
          سطرٌ واحد وهي خاناتٌ ومعاينةٌ وتنويه، فيطول أحدُ عمودَي
          الصفّ ضعفَ الآخر ويختلّ. فعادت إلى عرضها الكامل — ولها
          بطاقتُها: الخاناتُ والمعاينةُ متجاورتان فيها، يُغيّر
          ويرى في موضعٍ واحد. (تصحيحُ المالك ٢٠٢٦-١٠-١٨.)
        */}
        <div className="mb-5 grid items-start gap-5 sm:grid-cols-2">
          {/*
            **ورقمُ الهيكل لا يظهر في الإعلان** — يُدخَل ليُطلب به
            فحصٌ أو تقرير، لا ليُعرض. والتنويهُ بجواره لأنّ من لا
            يعرف لماذا يُسأل عنه لا يكتبه. (طلب المالك ٢٠٢٦-١٠-١٨.)
          */}
          {/*
            ═══ ورقمُ الهيكل سبعةَ عشرَ خانةً — لا عشرًا ═══
            **والخلطُ بينه وبين البطاقة الجمركية يكسر وثيقةَ تأمين.**
            البطاقةُ عشرةُ أرقام، ورقمُ الهيكل سبعةَ عشرَ خانةً فيها
            حروفٌ وأرقام (قولُ المالك ٢٠٢٦-١٠-١٨). ومن يكتب أحدَهما
            في حقل الآخر لا يعرف أنّه أخطأ حتى تُرفض وثيقتُه.
            فالحقلُ يقول طولَه ويعدّ ما كُتب — **ولا يُترك الخطأ
            ليُكتشف عند الخدمة**.
          */}
          <Field
            label={t('vinTitle')}
            htmlFor="veh-vin"
            note="لا يظهر لأحد غيرك. نحفظه لتطلب به الخدمات لاحقا: إصدار التأمين أو تجديده، وتقرير موجز، وخدمات الفحص."
            {...(vin === '' || vin.length === VIN_LENGTH
              ? { hint: '١٧ خانة — حروف وأرقام، كما في الرخصة أو خلف الزجاج الأمامي.' }
              /** والعددُ بين قوسين فلا يحكم المعدود (البوابة ١٨). */
              : { error: `الخانات المكتوبة (${displayDigits(String(vin.length))}) والمطلوب ١٧.` })}
          >
            <input
              id="veh-vin"
              dir="ltr"
              inputMode="text"
              placeholder="JTDBE32K123456789"
              maxLength={VIN_LENGTH}
              value={vin}
              /** والحروفُ والأرقامُ وحدها — ولا مسافةَ ولا شرطة. */
              onChange={(event) =>
                set({
                  vin: toLatinDigits(event.target.value)
                    .toUpperCase()
                    .replace(/[^0-9A-Z]/g, '')
                    .slice(0, VIN_LENGTH),
                })
              }
              className={cn(fieldShell(), 'font-num tracking-wider')}
            />
          </Field>

          {/*
            ═══ نوعُ التسجيل — تصنيفُ المرور لا شكلُ المركبة ═══

            **وهو غيرُ الهيكل**: بيك أبٌ واحد قد يكون «خصوصي» أو
            «نقل خاص»، وفانٌ واحد «حافلة صغيرة» أو «نقل عام» —
            والفرقُ في اللوحة والرسوم والتأمين لا في الشكل.
            (طلب المالك ٢٠٢٦-١٠-١٨.)
          */}
          <Field label="نوع التسجيل" htmlFor="veh-regtype">
            <Picker
              id="veh-regtype"
              value={vehicle.registrationType}
              placeholder="اختر النوع"
              onChange={(next) => set({ registrationType: next })}
              options={REGISTRATION_TYPES.map((value) => ({
                value,
                label: te(`registrationType.${value}`),
              }))}
            />
          </Field>

          <Field label={t('condition')} htmlFor="veh-condition">
            <Picker
              id="veh-condition"
              value={vehicle.condition}
              placeholder={te('condition.USED')}
              onChange={(next) =>
                /** وتبديلُ الحال يُفرغ ما لا يخصّه — فلا يُرسل ما لا يُعرض. */
                set(next === 'NEW' ? { condition: next } : { condition: next, customsCard: '' })
              }
              options={[
                { value: 'USED', label: te('condition.USED') },
                { value: 'NEW', label: te('condition.NEW') },
              ]}
            />
          </Field>
        </div>

        {!isNew ? null : (
          <div className="reveal mb-5">
            <ChoiceGroup
              label="حالة تسجيل السيارة"
              hint="السيارة الجديدة قد تكون ما زالت ببطاقتها الجمركية ولم تصدر لها لوحات بعد."
              value={registration}
              onChange={(next) => {
                const picked = next === 'customs' ? 'customs' : 'plate';
                setRegistration(picked);
                /**
                 * **وتبديلُ الجواب يمحو ما لا يخصّه.** بطاقةٌ تبقى
                 * مكتوبةً بعد اختيار «لوحات صادرة» تُرسَل إلى الخادم
                 * وتُخزَّن — فتصير السيارةُ ببطاقةٍ ولوحةٍ معًا،
                 * وتناقضُ ذلك لا يراه أحد.
                 */
                if (picked === 'plate') set({ customsCard: '' });
                else set({ plateLetters: '', plateNumbers: '' });
              }}
              options={[
                {
                  value: 'plate',
                  label: 'صدرت لها لوحات',
                  hint: 'مسجلة في المرور ولها رقم لوحة.',
                  icon: <PlateMark />,
                },
                {
                  value: 'customs',
                  label: 'ما زالت ببطاقة جمركية',
                  hint: 'وصلت حديثا ولم تسجل بعد.',
                  icon: <CustomsMark />,
                },
              ]}
            />
          </div>
        )}

        {/*
          ═══ وحالُ الوثيقتين — للمستعملة ذات اللوحات وحدها ═══

          **الجديدةُ لم يحن فحصُها**، ومن لا لوحةَ له لا استمارةَ له.
          فسؤالُ أيِّهما في غير موضعه يطلب جوابًا لا وجودَ له.
          **ولا تُعرضان للعلن** (قرار المالك): تُقرآن في لوحة الأدمن
          وفي صفحة سيارته وحدهما.
        */}
        {!asksDocuments ? null : (
          <div className="reveal mb-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="حالة الفحص الدوري"
              htmlFor="veh-inspection"
              note="لا تظهر في الإعلان. نسألها لنعرف ما تحتاجه سيارتك من خدمات."
            >
              <Picker
                id="veh-inspection"
                value={vehicle.periodicInspection}
                placeholder="لم تحدد"
                onChange={(next) => set({ periodicInspection: next })}
                options={DOCUMENT_STATES.map((value) => ({
                  value,
                  label: te(`documentStatus.${value}`),
                }))}
              />
            </Field>

            <Field
              label="حالة رخصة السير (الاستمارة)"
              htmlFor="veh-license"
              note="لا تظهر في الإعلان. نسألها لنعرف ما تحتاجه سيارتك من خدمات."
            >
              <Picker
                id="veh-license"
                value={vehicle.licenseStatus}
                placeholder="لم تحدد"
                onChange={(next) => set({ licenseStatus: next })}
                options={DOCUMENT_STATES.map((value) => ({
                  value,
                  label: te(`documentStatus.${value}`),
                }))}
              />
            </Field>
          </div>
        )}

        {/*
          **والخانةُ الثانية واحدة**: بطاقةٌ أو لوحة، لا هما معًا —
          فخياران لشيءٍ واحد يجعلان صاحبَهما يملأ الاثنين أو يحتار.
        */}
        {byCustoms ? (
          <div className="reveal flex flex-col gap-3">
            <Field
              label="رقم البطاقة الجمركية"
                  htmlFor="veh-customs"
                  note="لا يظهر لأحد غيرك. عليه يصدر تأمين السيارة الجديدة قبل اللوحة، ويربط بنجم والمرور."
                  {...(customs === '' || customs.length === CUSTOMS_LENGTH
                    ? { hint: '١٠ أرقام — غير رقم الهيكل، ولا تكتب أحدهما مكان الآخر.' }
                    : { error: `الأرقام المكتوبة (${displayDigits(String(customs.length))}) والمطلوب ١٠.` })}
                >
                  <input
                    id="veh-customs"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="1234567890"
                    maxLength={CUSTOMS_LENGTH}
                    value={customs}
                    /** أرقامٌ وحدها — فحرفٌ هنا يعني أنّه كتب رقم الهيكل. */
                    onChange={(event) =>
                      set({
                        customsCard: toLatinDigits(event.target.value)
                          .replace(/\D/g, '')
                          .slice(0, CUSTOMS_LENGTH),
                      })
                    }
                    className={cn(fieldShell(), 'font-num tracking-wider')}
                  />
                </Field>
            <p className="rounded-lg border border-line bg-bg px-4 py-3 text-3xs leading-loose opacity-75">
              حين تسجل السيارة وتصدر لها لوحة تقدر تضيفها من «سياراتي».
            </p>
          </div>
        ) : (
          /*
            ═══ وللوحةِ عنوانُها فوق تنويهها ═══

            **والتنويهُ بلا عنوانٍ يُنسب إلى ما قبله.** كان يقع تحت
            «حالة المركبة» مباشرةً فيُقرأ شرحًا لها — وهو يتكلّم عن
            اللوحة. فالعنوانُ أوّلًا، ثمّ تنويهُه، ثمّ خاناته.
            (تصحيحُ المالك ٢٠٢٦-١٠-١٨.)
          */
          <PlateField
            label="رقم لوحة المركبة"
            note="لا يظهر لأحد إلا باختيارك. وننصح بإدخاله لتطلب به الخدمات لاحقا: إصدار التأمين أو تجديده، وتقرير موجز، وخدمات الفحص — أنت أو المشتري."
            hint="ثلاثة حروف وأربعة أرقام، كما في رخصة السير."
            letters={vehicle.plateLetters}
            numbers={vehicle.plateNumbers}
            onLetters={(plateLetters) => set({ plateLetters })}
            onNumbers={(plateNumbers) => set({ plateNumbers })}
          />
        )}

        {/*
          **والسطرُ يتبع ما وقع**: من سجّل بطاقةً جمركية لا لوحةَ له،
          فسطرٌ يقول «اللوحة تبقى خاصة بك» يَعِد بما لا وجود له.
        */}
        {byCustoms ? null : consent === undefined ? (
          <p className="mt-4 text-3xs leading-loose opacity-70">
            اللوحة تبقى خاصة بك. وإذا عرضت السيارة للبيع لاحقا تختار وقتها إظهارها من عدمه.
          </p>
        ) : (
          <div className="mt-5">
            {/*
              **والمفتاح لا يُفتح على لوحةٍ ناقصة**: «أظهر اللوحة»
              وعدٌ بما لا يوجد — ومفتاحٌ معطَّل يقول لماذا أصدقُ من
              مفتاحٍ يُقلب فلا يقع شيء.
            */}
            <Toggle
              label={t('showPlate')}
              hint={t('showPlateHint')}
              on={consent.on && complete}
              onToggle={consent.onToggle}
              disabled={!complete}
              disabledReason="أدخل حروف اللوحة وأرقامها أولا، ثم اختر إظهارها."
              icon={<PlateMark />}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-56 max-w-full">
                  <LicensePlate
                    letters={vehicle.plateLetters}
                    numbers={vehicle.plateNumbers}
                    size="fill"
                  />
                </div>
                <p className="min-w-40 flex-1 text-3xs leading-loose opacity-75">
                  هكذا تظهر لمن يفتح إعلانك. وتبقى مطموسة في الصور على كل حال.
                </p>
              </div>
            </Toggle>
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * ═══ حالُ استخدام المركبة — قسمٌ بذاته، وللمستعملة وحدها ═══
 *
 * **والجديدةُ لا حوادثَ لها ولا مالكَ سابق**، فسؤالُها عنهما يطلب
 * جوابًا لا وجودَ له — ويُشعر صاحبَها أنّ عليه ما ليس عليه.
 *
 * وكان «حالُ الهيكل والصبغ» بين اللون والمدينة في «حالها اليوم» —
 * وهو **إقرارٌ عن تاريخها** لا وصفٌ لحالها اليوم. فاجتمع مع أخويه:
 * الحوادثُ أوّلًا لأنّها أثقلُها، ثمّ الهيكلُ الخارجيّ، ثمّ الملّاك.
 * (طلب المالك ٢٠٢٦-١٠-١٨.)
 */
export function VehicleUsageFields({
  catalog,
  step = 5,
}: {
  catalog: VehicleCatalog;
  step?: number;
}) {
  const te = useTranslations('enums');
  const { vehicle, set } = catalog;

  /** **ولا تُسأل الجديدة** — ولا يُرسَل عنها ما لم يُسأل عنه. */
  if (vehicle.condition === 'NEW') return null;

  return (
    <div style={{ '--i': 4 } as CSSProperties}>
      <Section
        step={step}
        title="حالة استخدام السيارة"
        note="إقرارك عن تاريخها — ويبني ثقة المشتري ويقلل الأسئلة المتكررة."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            **والمسجَّلُ غيرُ غير المسجَّل.** حادثٌ في نجم يظهر في
            تقرير «موجز» ويعرفه المشتري مهما قال البائع، وغيرُ
            المسجَّل لا يظهر — فالتفريقُ إقرارٌ من صاحبه.
          */}
          <Field
            label="حالة الحوادث والأضرار"
            htmlFor="veh-accidents"
            hint="المسجل يظهر في تقرير موجز، فذكره يوفر عليك السؤال."
          >
            <Picker
              id="veh-accidents"
              value={vehicle.accidentStatus}
              placeholder="اختر الحالة"
              onChange={(next) => set({ accidentStatus: next })}
              options={ACCIDENT_STATES.map((value) => ({
                value,
                label: te(`accidentStatus.${value}`),
              }))}
            />
          </Field>

          <Field
            label="حالة الهيكل الخارجي"
            htmlFor="veh-paint"
            hint="يقره البائع، ويتجاوزه تقرير الفحص إن اختلف."
          >
            <Picker
              id="veh-paint"
              value={vehicle.paintStatus}
              placeholder="اختر الحالة"
              onChange={(next) => set({ paintStatus: next })}
              options={(['ORIGINAL', 'PARTIAL', 'REPAINTED', 'UNKNOWN'] as const).map(
                (value) => ({ value, label: te(`paintStatus.${value}`) }),
              )}
            />
          </Field>

          {/* **وعددُ الملّاك يُحرّك السعر** — «مالك أول» وصفٌ يُبحث عنه. */}
          <Field label="عدد الملاك السابقين" htmlFor="veh-owners">
            <Picker
              id="veh-owners"
              value={vehicle.previousOwners}
              placeholder="اختر العدد"
              onChange={(next) => set({ previousOwners: next })}
              options={PREVIOUS_OWNERS.map((value) => ({
                value,
                label: te(`previousOwners.${value}`),
              }))}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

/** علامةُ بطاقةٍ جمركية — لخيار «ما زالت ببطاقة جمركية». */
function CustomsMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9.5h18M7 13.5h4M7 16h7" />
    </svg>
  );
}

/** علامةُ لوحة — لمفتاح الإظهار. */
function PlateMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <path d="M6.5 11h2M11 11h2M15.5 11h2M6.5 14.5h11" />
    </svg>
  );
}

/**
 * ═══ مميّزاتُ السيارة — يقرّها صاحبُها ═══
 *
 * **ولم تكن الاستمارةُ تسأل عنها قطّ.** الكتالوجُ فيه تسعٌ وثلاثون
 * ميزة، والفئاتُ تحمل ألفًا وأربعمئة رابط، والفلترُ يصفّي بها وصفحةُ
 * السيارة تعرضها — **و`ListingFeature` بلا كاتبٍ في المنتج كلِّه**.
 * قِيس ٢٠٢٦-١٠-١٨: ستّون إعلانًا من اثنين وستّين تحمل مميّزات،
 * والستّون مزروعة. فمن صفّى على «فتحة سقف» لم يجد إعلانًا واحدًا
 * حقيقيًّا. (طلب المالك ٢٠٢٦-١٠-١٨.)
 *
 * ═══ والقائمةُ من الكتالوج، والعلامةُ من الفئة ═══
 *
 * ما يظهر هنا يقرّره المشغّل **مرّةً** في `/admin/catalog/features`
 * بموضع `sell_form` — لا في كلّ فئة: الفئاتُ تحمل ٤٫١ ميزةً وسطيًّا،
 * فحصرُ الاستمارة بها يُري بائعَ مرسيدس أربعةَ مربّعات ولا يدعه يقول
 * «فتحة سقف». والفئةُ تُرجّح: ما تأتي به يصل مُعلَّمًا، ويشطب هو ما
 * ليس في سيارته. (قرار المالك: «في الكتالوج مرّة · والفئة تُرجّح».)
 */
const FEATURE_GROUPS = [
  ['SAFETY', 'الأمان'],
  ['COMFORT', 'الراحة'],
  ['TECH', 'التقنية'],
] as const;

export function VehicleFeatureFields({
  catalog,
  features,
  locale,
  step = 6,
}: {
  catalog: VehicleCatalog;
  features: readonly SellFormFeature[];
  locale: string;
  step?: number;
}) {
  const { vehicle, set } = catalog;

  /**
   * **وكتالوجٌ فارغٌ لا يُعرض قسمًا فارغًا.** المشغّل قد يرفع
   * `sell_form` عن كلّ ميزة، وعنوانٌ تحته فراغٌ يقرؤه البائع عطلًا.
   */
  if (features.length === 0) return null;

  const toggle = (key: string): void =>
    set({
      features: vehicle.features.includes(key)
        ? vehicle.features.filter((one) => one !== key)
        : [...vehicle.features, key],
    });

  /** المجموعاتُ بترتيبٍ ثابت، وما لا مجموعةَ له يلحق في آخرها. */
  const known = new Set(FEATURE_GROUPS.map(([key]) => key as string));
  const groups: readonly (readonly [string, string, readonly SellFormFeature[]])[] = [
    ...FEATURE_GROUPS.map(
      ([key, title]) => [key, title, features.filter((one) => one.group === key)] as const,
    ),
    ['OTHER', 'أخرى', features.filter((one) => !known.has(one.group))] as const,
  ].filter(([, , rows]) => rows.length > 0);

  const chosen = vehicle.features.length;

  return (
    <div style={{ '--i': 5 } as CSSProperties}>
      <Section
        step={step}
        title="مميزاتها"
        note="علم ما في سيارتك فعلا — والمشتري يصفي بها، فالدقة تجلب الجاد."
      >
        {/*
          **والعددُ يُصاغ فلا يحكم المعدودُ الجملة** — «المحدد (٣)»
          لا «٣ مميزات»، فالعربية ستُّ صيغ والرقم لاتينيّ في النصّ.
        */}
        <p className="mb-4 text-3xs opacity-70">
          المحدد (<ArabicNumber value={chosen} grouped={false} />)
        </p>

        <div className="flex flex-col gap-5">
          {groups.map(([key, title, rows]) => (
            <fieldset key={key} className="border-0 p-0">
              <legend className="mb-2.5 text-2xs font-bold opacity-80">{title}</legend>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((feature) => {
                  const on = vehicle.features.includes(feature.key);
                  return (
                    <label
                      key={feature.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-2xs transition-colors',
                        on ? 'bg-accent-100/60' : 'hover:bg-line/40',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(feature.key)}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        {locale === 'ar' ? feature.nameAr : feature.nameEn}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Section>
    </div>
  );
}
