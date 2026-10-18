import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { addVehicle } from '@/lib/domain/garage';
import { createListing, type PublishInput } from '@/lib/domain/publish';

/**
 * ═══ سيارةٌ واحدة، صفٌّ واحد ═══
 *
 * `createListing` كانت تُنشئ `Vehicle` دائمًا، وزرُّ «اعرضها للبيع»
 * في «سياراتي» يقود إلى معالجٍ فارغ — **فمن سجّل سيارته في حسابه
 * ليطلب عليها فحصًا ثمّ قرّر بيعها يخرج بصفّين لسيارةٍ واحدة**:
 * فحصُها على أحدهما وإعلانُها على الآخر، والقائمةُ تعدّها اثنتين.
 */
const madeVehicles: string[] = [];
const madeListings: string[] = [];
const touched = new Map<string, {
  taxStatus: 'INDIVIDUAL' | 'VAT_REGISTERED' | null;
  email: string | null;
  idVerified: boolean;
  iban: string | null;
}>();

afterAll(async () => {
  await db.listingImage.deleteMany({ where: { listingId: { in: madeListings } } });
  await db.listing.deleteMany({ where: { id: { in: madeListings } } });
  await db.vehicle.deleteMany({ where: { id: { in: madeVehicles } } });
  await db.uploadedAsset.deleteMany({ where: { r2Key: { startsWith: 'garage-probe/' } } });
  /** **والاستعادة إلى ما كان لا إلى فراغ** — الصفّ مزروع لا مصنوع هنا. */
  for (const [id, before] of touched) await db.user.update({ where: { id }, data: before });
  await db.$disconnect();
});

async function sellerReady(): Promise<string> {
  const seller = await db.user.findFirstOrThrow({
    where: { dealerId: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!touched.has(seller.id)) {
    touched.set(seller.id, {
      taxStatus: seller.taxStatus,
      email: seller.email,
      idVerified: seller.idVerified,
      iban: seller.iban,
    });
  }
  await db.user.update({
    where: { id: seller.id },
    data: {
      taxStatus: 'INDIVIDUAL',
      email: seller.email ?? `probe${seller.id.slice(-6)}@carsell.one`,
      idVerified: true,
      iban: seller.iban ?? 'SA0380000000608010167519',
    },
  });
  return seller.id;
}

async function garageCar(sellerId: string): Promise<string> {
  const trim = await db.trim.findFirstOrThrow({
    where: { visible: true },
    select: { id: true, modelId: true, model: { select: { brandId: true } } },
  });
  const made = await addVehicle({
    sellerId,
    vehicle: {
      brandId: trim.model.brandId,
      modelId: trim.modelId,
      trimId: trim.id,
      year: 2021,
      mileageKm: 30_000,
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'الرياض',
      colorExterior: 'اسود',
      vin: null,
      plateLetters: 'ابح',
      plateNumbers: '4321',
    },
  });
  expect(made.ok).toBe(true);
  if (!made.ok) throw new Error('unreachable');
  madeVehicles.push(made.vehicleId);
  return made.vehicleId;
}

async function publishInput(sellerId: string, vehicleId: string): Promise<PublishInput> {
  const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const key = `garage-probe/${vehicleId}.jpg`;
  await db.uploadedAsset.upsert({
    where: { r2Key: key },
    create: { r2Key: key, ownerId: sellerId, phash: '0f1e2d3c4b5a6978', plateBlurred: true, qualityFlags: [] },
    update: { ownerId: sellerId },
  });
  return {
    sellerId,
    vehicleId,
    type: 'DIRECT',
    askPrice: 88_000,
    taxableSupply: null,
    vehicle: {
      brandId: row.brandId,
      modelId: row.modelId,
      trimId: row.trimId ?? '',
      year: row.year,
      /** **والممشى يزيد بين التسجيل والعرض** — فهو من الاستمارة. */
      mileageKm: 41_500,
      transmission: 'AUTOMATIC',
      fuel: 'PETROL',
      spec: 'SAUDI',
      condition: 'USED',
      city: 'جدة',
      colorExterior: 'ابيض',
      vin: null,
      plateLetters: null,
      plateNumbers: null,
    },
    images: [key],
  };
}

describe('عرضُ سيارةٍ من المرآب', () => {
  it('لا تُنشأ مركبةٌ ثانية — والإعلان يشير إلى صفّها', async () => {
    const sellerId = await sellerReady();
    const before = await db.vehicle.count({ where: { ownerId: sellerId } });
    const vehicleId = await garageCar(sellerId);

    const result = await createListing(await publishInput(sellerId, vehicleId));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const listing = await db.listing.findFirstOrThrow({
      where: { ref: result.ref },
      select: { id: true, vehicleId: true, city: true },
    });
    madeListings.push(listing.id);

    /** الإعلانُ على الصفّ نفسِه — لا على نسخةٍ منه. */
    expect(listing.vehicleId).toBe(vehicleId);
    /** **والعددُ زاد بواحدةٍ فقط** — وهي التي سجّلها الاختبار. */
    expect(await db.vehicle.count({ where: { ownerId: sellerId } })).toBe(before + 1);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    /** وما يتغيّر يُحدَّث: الممشى والمدينة واللون. */
    expect(row.mileageKm).toBe(41_500);
    expect(row.city).toBe('جدة');
    expect(listing.city).toBe('جدة');
    /** **والفارغُ لا يمحو مخزَّنًا** — من ترك اللوحة لم يطلب حذفها. */
    expect(row.plateLetters).toBe('ابح');
    expect(row.plateNumbers).toBe('4321');
  });

  it('ومركبةُ غيرك لا يُقال عنها شيء', async () => {
    const sellerId = await sellerReady();
    const other = await db.vehicle.findFirstOrThrow({
      where: { ownerId: { not: sellerId } },
      select: { id: true },
    });
    const input = await publishInput(sellerId, other.id);
    const result = await createListing(input);
    expect(result).toEqual({ ok: false, reason: 'VEHICLE_NOT_FOUND' });
  });

  it('ومعروضةٌ بالفعل تُردّ بسببها — فصاحبُها يعرف لماذا', async () => {
    const sellerId = await sellerReady();
    const listed = await db.listing.findFirstOrThrow({
      where: { sellerId, status: { in: ['PUBLISHED', 'PENDING_REVIEW', 'RESERVED'] } },
      select: { vehicleId: true },
    });
    const result = await createListing(await publishInput(sellerId, listed.vehicleId));
    expect(result).toEqual({ ok: false, reason: 'VEHICLE_ALREADY_LISTED' });
  });

  /**
   * **والمسودّةُ مثلُها.** كانت تخرج قبل الحلّ فتكتب نسخةً ثانية،
   * **وأثرُها لا يُرى**: مركبتان في «سياراتي» والمسودّةُ لا تظهر لأحد.
   */
  it('والمسودّة لا تكتب نسخةً ثانية', async () => {
    const sellerId = await sellerReady();
    const vehicleId = await garageCar(sellerId);
    const before = await db.vehicle.count({ where: { ownerId: sellerId } });

    const input = await publishInput(sellerId, vehicleId);
    const result = await createListing({ ...input, draft: true, images: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('DRAFT');

    const listing = await db.listing.findFirstOrThrow({
      where: { ref: result.ref },
      select: { id: true, vehicleId: true },
    });
    madeListings.push(listing.id);

    expect(listing.vehicleId).toBe(vehicleId);
    expect(await db.vehicle.count({ where: { ownerId: sellerId } })).toBe(before);
  });

  /**
   * **والهويّةُ من الصفّ لا من الجسد.** نداءٌ مباشر ببيانات أخرى كان
   * سيُنشر إعلانًا يقول ماركةً والمركبةُ ماركةٌ ثانية.
   */
  it('وهويّةُ المركبة لا يغيّرها جسدُ الطلب', async () => {
    const sellerId = await sellerReady();
    const vehicleId = await garageCar(sellerId);
    const mine = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });

    const otherBrand = await db.trim.findFirstOrThrow({
      where: { visible: true, model: { brandId: { not: mine.brandId } } },
      select: { id: true, modelId: true, model: { select: { brandId: true } } },
    });

    const input = await publishInput(sellerId, vehicleId);
    const result = await createListing({
      ...input,
      vehicle: {
        ...input.vehicle,
        brandId: otherBrand.model.brandId,
        modelId: otherBrand.modelId,
        trimId: otherBrand.id,
        year: 1999,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const listing = await db.listing.findFirstOrThrow({
      where: { ref: result.ref },
      select: { id: true, vehicleId: true },
    });
    madeListings.push(listing.id);

    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(row.brandId).toBe(mine.brandId);
    expect(row.modelId).toBe(mine.modelId);
    expect(row.year).toBe(mine.year);
  });
});
