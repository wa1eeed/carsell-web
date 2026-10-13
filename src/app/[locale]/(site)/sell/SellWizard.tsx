'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Button } from '@/components/ui/Button';
import { ImageUploader, type UploadedImage } from '@/components/ui/ImageUploader';
import { Money } from '@/components/ui/Money';
import { Quantity } from '@/components/ui/Quantity';
import {
  Choice,
  Note,
  PriceField,
  Readout,
  SettingsBlock,
  Toggle,
  trimZeros,
} from '@/components/site/AuctionSettings';
import { Stepper } from '@/components/ui/Stepper';
import { PriceGuidance } from '@/components/site/PriceGuidance';
import type { RangeStats } from '@/components/ui/RangeBar';
import { TaxStatusDialog } from '@/components/site/TaxStatusDialog';
import type { TaxProfile } from '@/lib/domain/tax-profile';
import { displayDigits, toLatinDigits, AR_DATE_LOCALE } from '@/lib/arabic';
import { cn } from '@/lib/cn';

type Option = { id: string; nameAr: string; nameEn: string };

/** فئةٌ **بمواصفاتها** — وهي ما يملأ الحقول عند اختيارها. */
type TrimSpec = Option & {
  bodyType: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  seats: number;
  doors: number;
};

/** ما يعرفه الكتالوج عن هذا الطراز — والحقول تُحصر به. */
type SpecOptions = {
  bodyTypes: string[];
  transmissions: string[];
  fuels: string[];
  drivetrains: string[];
  seats: number[];
  fromTrims: number;
};

const ALL_OPTIONS: SpecOptions = {
  bodyTypes: ['SEDAN', 'SUV', 'HATCHBACK', 'COUPE', 'PICKUP', 'VAN', 'WAGON', 'CONVERTIBLE'],
  transmissions: ['AUTOMATIC', 'MANUAL', 'CVT', 'DCT'],
  fuels: ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC'],
  drivetrains: ['FWD', 'RWD', 'AWD', 'FOURWD'],
  seats: [2, 4, 5, 7, 8],
  fromTrims: 0,
};

type Vehicle = {
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
};

const EMPTY: Vehicle = {
  vin: '', brandId: '', modelId: '', trimId: '', condition: 'USED', year: '', mileageKm: '',
  transmission: 'AUTOMATIC', fuel: 'PETROL', spec: 'SAUDI', city: '', colorExterior: '',
};

/**
 * رقمٌ من حقلٍ يقبل كل صيغة لصق — **و`null` للفارغ لا صفر**.
 *
 * `Number('')` صفرٌ، و«احتياطيّ بصفر» ليس «بلا احتياطيّ»: الأوّل
 * يُبلَغ بأوّل ريال، والثاني لا يوجد. وخلطُهما يجعل البائع يظنّ أن له
 * حدًّا ولا حدّ له.
 */
/** سطرٌ في بطاقة المراجعة — تسميةٌ وقيمة، لا حقل. */
function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5 last:border-0">
      <dt className="shrink-0 opacity-55">{label}</dt>
      <dd className="bidi-isolate truncate font-bold">{value}</dd>
    </div>
  );
}

function digits(value: string): number | null {
  const clean = toLatinDigits(value).replace(/\D/g, '');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
export type AuctionLimits = {
  durationsDays: number[];
  minIncrement: string;
  defaultDeposit: string;
  buyNowBeforeReserve: boolean;
  /** مدّتا التمديد — تُعرضان شرطًا ولا تُدارَان من هنا. */
  extendWindowSeconds: number;
  extendBySeconds: number;
};

export function SellWizard({
  taxProfile,
  brands,
  cities,
  locale,
  vinLookupEnabled,
  auctionLimits,
  rules,
}: {
  taxProfile: TaxProfile;
  brands: readonly Option[];
  cities: readonly string[];
  locale: string;
  /** الراية المطفأة تُخفي الحقل كلّيًا — لا تُعطّله. */
  vinLookupEnabled: boolean;
  /**
   * حدود المشغّل — **لا تُكتب هنا**. المدد وأدنى فرقٍ بين مزايدتين
   * والعربون في لوحة المزادات، ونسخُها يجعل المعالج يعرض مدّةً يرفضها
   * الخادم.
   */
  auctionLimits: AuctionLimits;
  /**
   * قواعدُ المنصّة بقيمها الحيّة — **تُعرض ولا تُسأل**. ومهلةُ عرضٍ
   * مكتوبةٌ في الشاشة تتباعد عن الإعداد أوّل تغيير، فتَعِد البائع
   * بمهلةٍ غير التي تقع.
   */
  rules: { offerTtlHours: number; paymentWindowHours: number; transferFee: number };
}) {
  const router = useRouter();
  const t = useTranslations('sell');
  const te = useTranslations('enums');
  const tx = useTranslations('tax');

  const [step, setStep] = useState<(typeof STEPS)[number]>('vehicle');
  const [vehicle, setVehicle] = useState<Vehicle>(EMPTY);
  const [models, setModels] = useState<Option[]>([]);
  const [trims, setTrims] = useState<TrimSpec[]>([]);
  const [options, setOptions] = useState<SpecOptions>(ALL_OPTIONS);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('DIRECT');

  /**
   * ═══ إعدادات طريقة البيع — ولم يكن للمعالج واحدةٌ منها ═══
   *
   * من اختار «مزاد» نشر إعلانًا نوعُه `AUCTION` **بلا مزاد**: لا مدّة
   * ولا احتياطيّ ولا خطوة مزايدة — ولا شيء في المنتج كلّه يُنشئ الصفّ
   * إلّا البذرة. فصفحةُ المزاد ٤٠٤، وصفحةُ المركبة تعرض «اشترِ الآن»
   * تحت وسم «مزاد».
   *
   * ومن اختار «تفاوض» لم يُسأل عن حدّه الأدنى — والنطاق يرفض العروض
   * دونه، ومركز المساعدة يقول للمشتري إن البائع يحدّده.
   */
  const [durationDays, setDurationDays] = useState<number>(
    auctionLimits.durationsDays[0] ?? 3,
  );
  const [startNow, setStartNow] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [bidIncrement, setBidIncrement] = useState('');
  const [buyNowPrice, setBuyNowPrice] = useState('');
  const [minAcceptPrice, setMinAcceptPrice] = useState('');
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [viewingCity, setViewingCity] = useState('');
  const [viewingAddress, setViewingAddress] = useState('');

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

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  /**
   * النشر — **والوضع الضريبيّ شرطٌ قبله**.
   *
   * وهو أوّل إجراءٍ للبائع له أثر ضريبيّ: شكل السعر المعروض للمشتري
   * يتبع وضعه. فتُفتح النافذة ثم **يُستأنف النشر تلقائيًّا** بعد الحفظ.
   */
  /**
   * ═══ الحفظ كمسودّة ═══
   *
   * **ولا يمرّ بحُرّاس النشر**: المسودّة لا تُعرض على أحد، فلا تُسأل
   * عن وضعٍ ضريبيّ ولا تنتظر توثيق هوية. وأقلُّ ما تحتاجه مركبةٌ
   * مُعرَّفة — وهي ما تُملأ في الخطوة الأولى.
   */
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * ═══ احفظ في سياراتي — بلا إعلان ═══
   *
   * **وزرُّ «أضف سيارة» في «سياراتي» كان يقود إلى هنا** ولا طريق
   * ينتهي بمركبةٍ بلا إعلان: المسودّة نفسها تكتب `Listing`. فكان
   * المرآب لا ينمو من الشاشة أبدًا.
   */
  const saveVehicle = (): void => {
    if (publishing) return;
    setPublishing(true);
    setSaveError(null);

    void (async () => {
      const response = await fetch('/api/v1/vehicles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
          vin: vehicle.vin === '' ? null : vehicle.vin,
        }),
      }).catch(() => null);

      setPublishing(false);

      if (response === null) {
        setSaveError(t('publishNetwork'));
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { messageAr?: string } }
          | null;
        setSaveError(payload?.error?.messageAr ?? t('publishFailed'));
        return;
      }

      /** **والوجهة تقول أين حُفظت** — ومنها يُعرض أو يُطلب عليه خدمة. */
      router.push(`/${locale}/account/vehicles?saved=1`);
    })();
  };

  const saveDraft = (): void => {
    if (publishing) return;
    setPublishing(true);
    setPublishError(null);

    void (async () => {
      const response = await fetch('/api/v1/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draft: true,
          type: method,
          // سعرٌ لم يُكتب بعد يُحفظ واحدًا — والنشر يفحصه
          askPrice: Math.max(1, Number(toLatinDigits(price).replace(/\D/g, '')) || 1),
          taxableSupply: null,
          vehicle: {
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
            vin: vehicle.vin === '' ? null : vehicle.vin,
          },
          images: images.map((image) => image.key),
        }),
      }).catch(() => null);

      setPublishing(false);

      if (response === null) {
        setPublishError(t('publishNetwork'));
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { messageAr?: string } }
          | null;
        setPublishError(payload?.error?.messageAr ?? t('publishFailed'));
        return;
      }

      /** **والوجهة تقول إنها مسودّة** — ولا تُقرأ نشرًا. */
      router.push(`/${locale}/account/listings?saved=draft`);
    })();
  };

  /**
   * متى يُغلق المزاد — **بالحساب نفسه الذي يكتبه الخادم**: بدايةٌ
   * (الآن أو الموعد المختار) زائدَ المدّة.
   */
  const closesAtLabel = ((): string => {
    const begins = startNow || startsAt === '' ? new Date() : new Date(startsAt);
    if (Number.isNaN(begins.getTime())) return '—';
    const ends = new Date(begins.getTime() + durationDays * 86_400_000);
    return new Intl.DateTimeFormat(locale === 'ar' ? AR_DATE_LOCALE : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(ends);
  })();

  /**
   * إحصاءُ السوق لهذه المركبة — **يُطلب عند دخول خطوة السعر وحدها**.
   * وطلبُه مع كل ضغطةٍ في خانة السعر يُغرق الخادم بلا فائدة: الشريحة
   * لا تتغيّر بتغيّر السعر.
   */
  const [priceStat, setPriceStat] = useState<RangeStats | null>(null);

  useEffect(() => {
    if (step !== 'photos' || vehicle.modelId === '' || vehicle.city === '') return;
    const params = new URLSearchParams({
      modelId: vehicle.modelId,
      trimId: vehicle.trimId,
      year: toLatinDigits(vehicle.year).replace(/\D/g, ''),
      mileageKm: toLatinDigits(vehicle.mileageKm).replace(/\D/g, ''),
      city: vehicle.city,
    });
    let alive = true;
    void fetch(`/api/v1/price-stat?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { stat: RangeStats | null } } | null) => {
        if (alive) setPriceStat(payload?.data?.stat ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [step, vehicle.modelId, vehicle.trimId, vehicle.year, vehicle.mileageKm, vehicle.city]);

  /** وصفُ الشريحة التي بُني عليها الرقم — «كامري ٢٠٢٢ في الرياض». */
  const segmentLabel = [
    models.find((row) => row.id === vehicle.modelId)?.nameAr ?? '',
    vehicle.year === '' ? '' : displayDigits(vehicle.year),
    vehicle.city === '' ? '' : `${t('inCity')} ${vehicle.city}`,
  ]
    .filter((part) => part !== '')
    .join(' ');

  const publish = (): void => {
    if (tax.needsAnswer) {
      setAskingTax(true);
      return;
    }
    if (publishing) return;

    setPublishing(true);
    setPublishError(null);

    void (async () => {
      const response = await fetch('/api/v1/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: method,
          askPrice: Number(toLatinDigits(price).replace(/\D/g, '')),
          taxableSupply,
          vehicle: {
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
            vin: vehicle.vin === '' ? null : vehicle.vin,
          },
          // المفاتيح وحدها — والخادم يقرأ بصماتها من عنده
          images: images.map((image) => image.key),

          /**
           * **والحقل الفارغ `null` لا صفر.** `Number('')` صفرٌ،
           * و«احتياطيّ بصفر» ليس «بلا احتياطيّ» — الأوّل يُبلَغ بأوّل
           * ريال، والثاني لا يوجد.
           */
          ...(method !== 'AUCTION'
            ? {}
            : {
                auction: {
                  durationDays,
                  startsAt:
                    startNow || startsAt === '' ? null : new Date(startsAt).toISOString(),
                  reservePrice: digits(reservePrice),
                  bidIncrement: digits(bidIncrement),
                  buyNowPrice: buyNowOn ? digits(buyNowPrice) : null,
                  depositAmount: digits(depositAmount),
                  viewingCity: viewingCity === '' ? null : viewingCity,
                  viewingAddress: viewingAddress.trim() === '' ? null : viewingAddress.trim(),
                },
              }),

          ...(method !== 'NEGOTIATION'
            ? {}
            : { negotiation: { minAcceptPrice: digits(minAcceptPrice) } }),
        }),
      }).catch(() => null);

      setPublishing(false);

      if (response === null) {
        setPublishError(t('publishNetwork'));
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { data?: { ref: string; status: string }; error?: { messageAr?: string } }
        | null;

      if (response.status === 428) {
        // لم يُسأل بعد — النافذة تفتح، والحفظ يعيد المحاولة
        setAskingTax(true);
        return;
      }

      if (!response.ok) {
        setPublishError(payload?.error?.messageAr ?? t('publishFailed'));
        return;
      }

      /**
       * **«نُشر» و«قيد المراجعة» ليسا سواءً.** والشاشة التي تقول «نُشر»
       * عن إعلانٍ في الطابور تَعِد بما لم يقع، فيبحث عنه البائع في
       * النتائج فلا يجده.
       */
      router.push(
        payload?.data?.status === 'PENDING_REVIEW'
          ? `/${locale}/account?listed=review`
          : `/${locale}/account?listed=${payload?.data?.ref ?? ''}`,
      );
    })();
  };

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

  /**
   * ═══ اختيار الفئة يملأ ما تمليه ═══
   *
   * `Trim` يحمل الهيكل وناقل الحركة والوقود والدفع والمقاعد منذ اليوم
   * الأوّل، **ولا أحد كان يقرؤها في الإدخال**: تُعرض ليتعرّف البائع
   * على فئته، ثم يملأ الحقول بيده من قائمةٍ ثابتة — فيُنشر إعلانٌ
   * بمواصفةٍ تناقض فئته.
   */
  /** الفئة المختارة — ومنها يُعرض الموروث. */
  const inheritedTrim = trims.find((row) => row.id === vehicle.trimId) ?? null;

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
    vehicle.brandId !== '' && vehicle.modelId !== '' && vehicle.trimId !== '' &&
    vehicle.year !== '' && vehicle.mileageKm !== '' && vehicle.city !== '' &&
    vehicle.colorExterior !== '';
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
                onChange={(event) => {
                  set({ modelId: event.target.value, trimId: '' });
                  void loadTrims(event.target.value);
                }}
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

            {/*
              **الفئة إلزامية**: منها يُنسخ الهيكل والدفع وعدد المقاعد.
              وطلبُها من البائع حقلٌ واحد، وإدخالُها يدويًّا أربعةٌ يخطئ
              في أحدها — والمخطّط نفسه يقول إنها «تُنسخ لقطةً وقت النشر».
            */}
            <label>
              <span className={label}>{t('trim')}</span>
              <select
                value={vehicle.trimId}
                onChange={(event) => pickTrim(event.target.value)}
                disabled={trims.length === 0}
                className={field}
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

            {/*
              **الخيارات من الكتالوج لا من التعداد.** وكانت أربعة نواقل
              وأربعة أنواع وقود لكل مركبة — فيُعرض «كهربائي» على
              لاندكروزر، ويختاره بائعٌ فيُنشر إعلانٌ بمواصفةٍ لا وجود لها.

              و«المواصفة الإقليمية» تبقى كاملةً: سعوديّ أو خليجيّ أو وارد
              وكيل صفةُ استيرادٍ لا تُملى من الفئة.
            */}
            {/*
              ═══ الموروث من الفئة يُعرض ولا يُحرَّر ═══

              الخادم يأخذ الهيكل والدفع والمقاعد **من الفئة** لقطةً
              (قرار ٣٢) — فحقلٌ يملؤه البائع بها لا يغيّر شيئًا، وهو
              وعدٌ مُخلَف بشكل حقل. وكان الهيكل غائبًا عن الاستمارة
              أصلًا، فلا البائع يراه ولا يعرف ما سيُنشر.
            */}
            {inheritedTrim === null ? null : (
              <div className="sm:col-span-2 rounded-lg border border-line bg-surface px-4 py-3">
                <p className="mb-2 text-3xs font-bold opacity-55">من الفئة — تُسجَّل كما هي</p>
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

            {(
              [
                ['transmission', options.transmissions],
                ['fuel', options.fuels],
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

            {/*
              اللون والحالة **يُجمعان هنا لأن المخطّط يطلبهما**، وكان
              المعالج يرسل بلا لون فيردّ الخادم ٤٢٢ — نشرٌ لا يمكن أن
              ينجح من الشاشة أصلًا. والحالة مرشِّح في البحث، فغيابها
              يُخفي المركبة عن نصف الباحثين.
            */}
            <label>
              <span className={label}>{t('colorExterior')}</span>
              <input
                value={vehicle.colorExterior}
                onChange={(event) => set({ colorExterior: event.target.value })}
                className={field}
              />
            </label>

            <label>
              <span className={label}>{t('condition')}</span>
              <select
                value={vehicle.condition}
                onChange={(event) => set({ condition: event.target.value })}
                className={field}
              >
                <option value="USED">{te('condition.USED')}</option>
                <option value="NEW">{te('condition.NEW')}</option>
              </select>
            </label>
          </div>

          {/*
            ═══ وطريقان من هنا ═══

            **ليس كلُّ من يضيف سيارةً يبيعها.** من يريد عليها فحصًا أو
            تأمينًا أو تقرير «موجز» يحتاج أن تكون في المنصّة لا أن
            تُعرض على الناس — وربطُ وجودها بعرضها يُخرج من السوق كلَّ
            من يريد خدمةً ولا يبيع.
            وبيانات هذه الخطوة وحدها تكفي لحفظها: الصور وطريقة البيع
            شرطا **العرض**.
          */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button onClick={() => setStep('photos')} disabled={!vehicleReady}>
              {t('next')}
            </Button>

            <Button
              variant="outline"
              onClick={saveVehicle}
              disabled={!vehicleReady || publishing}
            >
              احفظ في سياراتي
            </Button>
          </div>

          {saveError === null ? null : (
            <p className="mt-3 text-2xs text-danger">{saveError}</p>
          )}
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
              ═══ إرشادُ السعر — ولم يكن ═══

              صدرُ الصفحة يَعِد بـ«سعرٍ عادل» ثمّ تُقدَّم خانةٌ فارغة
              بلا مرجع. **والبيانات كانت كلّها موجودة** — `PriceStat`
              و`priceStatFor` و`RangeBar` — وستُّ سلاسلَ لهذه اللوحة
              في `ar.json` لا يناديها أحد.
            */}
            <PriceGuidance
              price={Number(toLatinDigits(price).replace(/\D/g, ''))}
              stat={priceStat}
              segment={segmentLabel}
              />

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
            ═══ إعدادات المزاد — Wh3 ═══

            **ولا تظهر إلّا لمن اختاره.** حقولٌ لطريقةٍ لم تُختَر تُربك
            وتُطال الاستمارة، ومن اختار «مباشر» لا شأن له بخطوة مزايدة.
          */}
          {method !== 'AUCTION' ? null : (
            <div className="mb-7 flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line">
              {/*
                ═══ الأسعار ═══

                **وسعر الافتتاح يُعرض ولا يُعاد سؤاله**: كتبه البائع في
                الخطوة السابقة، وحقلٌ ثانٍ له يُنتج رقمين قد يختلفان.
              */}
              <SettingsBlock title={t('auction.prices')}>
                <Readout
                  label={t('auction.openPrice')}
                  value={price === '' ? '—' : <Money amount={Number(toLatinDigits(price))} />}
                  hint={t('auction.openPriceHint')}
                />
                <PriceField
                  label={t('auction.reserve')}
                  hint={t('auction.reserveHint')}
                  value={reservePrice}
                  onChange={setReservePrice}
                />
                <PriceField
                  label={t('auction.increment')}
                  hint={`${t('auction.incrementHint')} ${displayDigits(trimZeros(auctionLimits.minIncrement))}`}
                  value={bidIncrement}
                  onChange={setBidIncrement}
                />
                <Note>{t('auction.reserveNote')}</Note>
              </SettingsBlock>

              {/* ═══ التوقيت ═══ */}
              <SettingsBlock title={t('auction.timing')}>
                <Choice
                  options={[
                    { key: 'now', label: t('auction.startNow') },
                    { key: 'later', label: t('auction.startScheduled') },
                  ]}
                  active={startNow ? 'now' : 'later'}
                  onSelect={(key) => setStartNow(key === 'now')}
                />

                {startNow ? null : (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-3xs font-bold opacity-60">
                      {t('auction.startAt')}
                    </span>
                    {/* الموعد يُقارن خانةً بخانة — لاتينيّ معزول */}
                    <input
                      dir="ltr"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(event) => setStartsAt(event.target.value)}
                      /*
              **و`w-0 flex-1` تصلح في صفٍّ لا في عمود.** نسختُها من
              إصلاح خانات الرمز — وهناك الحاوية أفقيّة فالعرض يأتي من
              القسمة. وهنا `flex-col`، فـ`flex-1` تمسّ الارتفاع و`w-0`
              تبقى عرضًا صفرًا: **فانكمش الحقل إلى نقطة.**
            */
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-start font-num text-sm"
                    />
                    <span className="text-3xs leading-loose opacity-45">
                      {t('auction.startAtHint')}
                    </span>
                  </label>
                )}

                <fieldset>
                  <legend className="mb-2.5 text-3xs font-bold opacity-60">
                    {t('auction.duration')}
                  </legend>
                  <Choice
                    options={auctionLimits.durationsDays.map((days) => ({
                      key: String(days),
                      label: <Quantity unit="days" count={days} />,
                    }))}
                    active={String(durationDays)}
                    onSelect={(key) => setDurationDays(Number(key))}
                  />
                </fieldset>

                {/*
                  **والتمديد شرطٌ يُقال لا مفتاحٌ يُدار.** التصميم يرسمه
                  مفتاحًا، ومدّتاه في لوحة المزادات لا في يد البائع —
                  ومفتاحٌ لا يغيّر شيئًا أسوأ من سطرٍ يشرح. والأرقام من
                  الإعداد فلا تتباعد عنه.
                */}
                <Note>
                  {t('auction.extendRule', {
                    window: displayDigits(String(Math.round(auctionLimits.extendWindowSeconds / 60))),
                    by: displayDigits(String(Math.round(auctionLimits.extendBySeconds / 60))),
                  })}
                </Note>

                {!auctionLimits.buyNowBeforeReserve ? null : (
                  <>
                    <Toggle
                      label={t('auction.buyNow')}
                      hint={t('auction.buyNowHint')}
                      on={buyNowOn}
                      onToggle={() => {
                        setBuyNowOn(!buyNowOn);
                        if (buyNowOn) setBuyNowPrice('');
                      }}
                    />
                    {!buyNowOn ? null : (
                      <PriceField
                        label={t('auction.buyNowAmount')}
                        hint={t('auction.buyNowAmountHint')}
                        value={buyNowPrice}
                        onChange={setBuyNowPrice}
                      />
                    )}
                  </>
                )}
              </SettingsBlock>

              {/* ═══ العربون والمزايدون ═══ */}
              <SettingsBlock title={t('auction.depositTitle')}>
                <PriceField
                  label={t('auction.depositField')}
                  hint={`${t('auction.depositHint')} ${displayDigits(trimZeros(auctionLimits.defaultDeposit))}`}
                  value={depositAmount}
                  onChange={setDepositAmount}
                />
                {/*
                  **ومن يزايد شرطٌ لا خيار.** التصميم يعرضه حقلًا،
                  والقاعدة في الخادم: حسابٌ موثّق الهوية وقادر على
                  الشراء. فيُقال ولا يُسأل عنه.
                */}
                <Readout
                  label={t('auction.whoBids')}
                  value={t('auction.whoBidsValue')}
                  hint={t('auction.whoBidsHint')}
                />
                <Note>{t('auction.depositNote')}</Note>
              </SettingsBlock>

              {/*
                ═══ موقع المعاينة — وكان يُقرأ ولا يُكتب ═══

                صفحة المزاد تعرض «المعاينة متاحة في …» أو «لم يحدّد
                البائع موقع معاينة»، والثانية كانت **الحال الوحيد
                الممكن** لأيّ مزادٍ ينشئه بائع.
              */}
              <SettingsBlock title={t('auction.viewing')}>
                <label className="flex flex-col gap-1.5">
                  <span className="text-3xs font-bold opacity-60">{t('auction.viewingCity')}</span>
                  <select
                    value={viewingCity}
                    onChange={(event) => setViewingCity(event.target.value)}
                    className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
                  >
                    <option value="">{t('auction.viewingNone')}</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </label>

                {viewingCity === '' ? null : (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-3xs font-bold opacity-60">
                      {t('auction.viewingArea')}
                    </span>
                    <input
                      value={viewingAddress}
                      onChange={(event) => setViewingAddress(event.target.value)}
                      placeholder={t('auction.viewingAreaPlaceholder')}
                      className="rounded-md border border-line bg-bg px-3 py-2 text-sm"
                    />
                    <span className="text-3xs leading-loose opacity-45">
                      {t('auction.viewingHint')}
                    </span>
                  </label>
                )}
              </SettingsBlock>
            </div>
          )}

          {/*
            ═══ إعدادات التفاوض — Wh3b ═══

            كانت حقلًا واحدًا في صندوق. والتصميم يقسمها كتلتين —
            **الأسعار** و**قواعد الردّ** — ويجعل لكلٍّ شرحَه. والفرق
            ليس زينة: البائع هنا يقرّر رقمًا **لا يراه المشتري أبدًا**،
            فإن لم يُقَل له ما يفعله الرقم ترك الحقل فارغًا وبقي يردّ
            يدويًّا على كل عرضٍ لا يقبله.
          */}
          {method !== 'NEGOTIATION' ? null : (
            <div className="mb-7 flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line">
              <SettingsBlock title={t('negotiation.prices')}>
                {/* **والمعروض يُعرض ولا يُعاد سؤاله** — كُتب في الخطوة السابقة */}
                <Readout
                  label={t('negotiation.asking')}
                  value={price === '' ? '—' : <Money amount={Number(toLatinDigits(price))} />}
                  hint={t('negotiation.askingHint')}
                />
                <PriceField
                  label={t('negotiation.minAccept')}
                  hint={t('negotiation.minAcceptHint')}
                  value={minAcceptPrice}
                  onChange={setMinAcceptPrice}
                />
                <Note>{t('negotiation.hiddenNote')}</Note>
              </SettingsBlock>

              {/*
                ═══ قواعد الردّ — تُقال ولا تُسأل ═══

                **ولا تُعرض مفاتيحَ.** التصميم يرسمها بطاقاتٍ تشبه
                الحقول، ومفتاحٌ لا يغيّر شيئًا أسوأ من غيابه: يضغطه
                البائع فلا يقع شيء، ولا رسالة. فهي قراءاتٌ بقيمها
                الحيّة من إعدادات المنصّة.
              */}
              <SettingsBlock title={t('negotiation.replyRules')}>
                <Readout
                  label={t('negotiation.window')}
                  value={<Quantity unit="hours" count={rules.offerTtlHours} />}
                  hint={t('negotiation.windowHint')}
                />
                <Readout
                  label={t('negotiation.multiple')}
                  value={t('negotiation.multipleValue')}
                  hint={t('negotiation.multipleHint')}
                />
                {/*
                  **والجملة نصٌّ، فلا يبلغها `<Quantity>`.** تُصاغ
                  فلا يحكم العددُ المعدودَ — «مهلة الدفع (٢٤ ساعة)» —
                  والرقم على `displayDigits`. (البوابة ١٨.)
                */}
                <Note>
                  {t('negotiation.accepted', {
                    hours: locale === 'ar'
                      ? displayDigits(String(rules.paymentWindowHours))
                      : String(rules.paymentWindowHours),
                  })}
                </Note>
              </SettingsBlock>
            </div>
          )}

          {/*
            ═══ إعدادات البيع المباشر — Wh3a ═══

            **ولم تكن له لوحة أصلًا.** من اختار «مباشر» رأى البطاقات
            الثلاث ثمّ زرّ النشر — بلا ما يقول له ما السعر الذي سيُنشر،
            ولا ما يتحمّله هو من الرسوم، ولا أن بإمكانه فتح التفاوض.
          */}
          {method !== 'DIRECT' ? null : (
            <div className="mb-7 rounded-xl border border-line bg-surface p-5.5">
              <h3 className="mb-4 text-base font-bold">{t('direct.title')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Readout
                  label={t('direct.price')}
                  value={price === '' ? '—' : <Money amount={Number(toLatinDigits(price))} />}
                  hint={t('direct.priceHint')}
                />
                <Readout
                  label={t('direct.transferFee')}
                  value={<Money amount={rules.transferFee} />}
                  hint={t('direct.transferFeeHint')}
                />
                <Note>
                  {t('direct.rules', {
                    hours: locale === 'ar'
                      ? displayDigits(String(rules.paymentWindowHours))
                      : String(rules.paymentWindowHours),
                  })}
                </Note>
              </div>
            </div>
          )}

          {/*
            ═══ المراجعة قبل النشر ═══

            التصميم يضع بطاقةً أخيرة تجمع **ما سيُنشر** قبل الزرّ:
            المركبة وطريقة البيع والأرقام. والسبب ليس زينة — خطوة
            المزاد وحدها فيها تسعةُ حقول، ومن ملأها لا يستطيع أن
            يتذكّر ما كتب في الأولى، ولا يعود إليها خشية أن يفقد ما
            أدخله.

            **ولا تُعيد سؤالَ شيء**: قراءةٌ ممّا كُتب، فإن خالفت ما في
            ذهنه رجع بزرّ «رجوع» وقد عرف أين.
          */}
          <div className="mb-6 overflow-hidden rounded-xl border border-line">
            <h3 className="border-b border-line bg-surface px-5 py-3.5 text-sm font-bold">
              {t('review.title')}
            </h3>
            <dl className="grid gap-x-8 gap-y-3 bg-bg p-5 text-2xs sm:grid-cols-2">
              <ReviewRow
                label={t('review.vehicle')}
                value={
                  [
                    brands.find((row) => row.id === vehicle.brandId)?.nameAr ?? '',
                    models.find((row) => row.id === vehicle.modelId)?.nameAr ?? '',
                    vehicle.year === '' ? '' : displayDigits(vehicle.year),
                  ]
                    .filter((part) => part !== '')
                    .join(' ') || '—'
                }
              />
              <ReviewRow label={t('review.method')} value={t(`method.${method}`)} />
              {method === 'AUCTION' ? (
                <>
                  <ReviewRow
                    label={t('auction.openPrice')}
                    value={price === '' ? '—' : <Money amount={Number(toLatinDigits(price))} />}
                  />
                  {/*
                    **والاحتياطيّ يُقال «مخفيّ» ويُعرض لصاحبه.** هو
                    وحده من يراه، وإخفاؤه عنه هنا يجعله ينشر رقمًا لا
                    يتذكّره.
                  */}
                  {/*
                    ═══ وموعدُ الإغلاق يُعرض قبل أن يُقرّ ═══

                    البائع يختار **مدّةً** من شرائح ولا يرى متى يُغلق
                    مزادُه. والتحذير أسفل البطاقة يقول إن المدّة لا
                    تُعدَّل بعد أوّل مزايدة — **فيُطلَب إقرارُ ما لا
                    رجعة فيه بلا عرض نتيجته**، وهو عكسُ ما وُضعت
                    البطاقة له.
                  */}
                  <ReviewRow label={t('review.closesAt')} value={closesAtLabel} />
                  <ReviewRow
                    label={t('review.reserve')}
                    value={
                      reservePrice === ''
                        ? t('review.noReserve')
                        : <Money amount={Number(toLatinDigits(reservePrice))} />
                    }
                  />
                </>
              ) : (
                <ReviewRow
                  label={t('review.price')}
                  value={price === '' ? '—' : <Money amount={Number(toLatinDigits(price))} />}
                />
              )}
              <ReviewRow label={t('review.photos')} value={<Quantity unit="photos" count={images.length} />} />
              <ReviewRow label={t('review.city')} value={vehicle.city === '' ? '—' : vehicle.city} />
            </dl>
            {/*
              **وما لا رجعة فيه يُقال قبله لا بعده.** المزاد بعد أوّل
              مزايدة لا تُعدَّل أسعارُه ولا مدّته — ومن عرف ذلك بعد
              النشر عرفه متأخّرًا.
            */}
            {method !== 'AUCTION' ? null : (
              <p className="border-t border-line bg-warn-100 px-5 py-3.5 text-3xs leading-loose text-warn-900">
                {t('review.auctionLock')}
              </p>
            )}
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

          {publishError === null ? null : (
            <p className="mb-3.5 rounded-md border border-warn-200 bg-warn-100 px-4 py-3 text-2xs text-warn-900">
              {publishError}
            </p>
          )}

          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setStep('photos')}>
              {t('back')}
            </Button>
            <Button onClick={publish} disabled={publishing}>
              {publishing ? t('publishing') : t('publish')}
            </Button>
            {/*
              ═══ «احفظ كمسودة» — كان بلا `onClick` أصلًا ═══

              يضغطه البائع بعد سبع خطواتٍ ورفعِ صور فلا يقع شيء، ولا
              رسالة. **وزرٌّ لا يفعل شيئًا أسوأ من غيابه**: من ضغطه
              حسب عمله محفوظًا فأغلق الصفحة.

              والمسودّة لا تلتزم بشيء، فلا تُشترط لها هويةٌ ولا آيبان
              ولا وضعٌ ضريبيّ — تلك شروط العرض على الناس.
            */}
            <Button variant="ghost" onClick={saveDraft} disabled={publishing}>
              {t('saveDraft')}
            </Button>
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
          // أجاب ⇒ يُستأنف النشر، ولا يُطلب منه الضغط ثانيةً
          publish();
        }}
      />
    </>
  );
}
