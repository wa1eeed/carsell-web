import sharp from 'sharp';

/**
 * كشف اللوحة وطمسها — **قبل التخزين لا بعده**.
 *
 * لوحة سيارة تكشف مالكها: من صوّرها يعرف رقمها، ومن يعرف الرقم يصل إلى
 * الاسم والعنوان عبر خدمات طرف ثالث. فالطمس ليس تحسينًا بل شرط نشر.
 *
 * **وهذا يفرض أن يمرّ الرفع بالخادم.** الرفع الموقَّع المباشر إلى R2
 * صحيح لشعار ماركة يرفعه الأدمن، وخطأٌ لصورة إعلان: صورةٌ تذهب من
 * المتصفّح إلى التخزين لا يراها الخادم فلا يطمسها، ووعدُ «تُحفظ
 * مطموسة» يصير وعدًا لا يملك أحد الوفاء به.
 *
 * ═══ حدود هذا الكاشف ═══
 *
 * كاشف هندسي لا نموذج تعلّم: يبحث عن مستطيلات بنسبة اللوحة السعودية
 * (٢٫٤:١) وكثافة حواف عالية، في النصف السفلي حيث تقع اللوحة عادةً.
 *
 * **يخطئ في اتجاهين، وليسا متساويين:**
 *   · إيجابية كاذبة ⇒ بقعة ضبابية في مكان لا لوحة فيه. مزعج ومرئي.
 *   · سلبية كاذبة ⇒ لوحةٌ تُنشر مقروءة. لا رجعة فيه.
 * فالعتبات مضبوطة نحو الالتقاط لا نحو الدقّة، **والبائع يرى النتيجة
 * ويضيف طمسًا يدويًا** — وهو الضمانة الأخيرة لا الأولى.
 */

/** نسبة اللوحة السعودية عرضًا إلى ارتفاع (مواصفة `PlateBadge`). */
const PLATE_RATIO = 2.4;

/** عرض التحليل — ثابت فلا تتغيّر العتبات بحجم الصورة. */
const ANALYSIS_WIDTH = 320;

/** حجم الخلية في شبكة كثافة الحواف. */
const CELL = 8;

export type PlateRegion = {
  /** نسب من ٠ إلى ١ — مستقلّة عن أبعاد الصورة الأصلية. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** ثقة تقريبية ٠–١، للعرض لا للقرار. */
  confidence: number;
};

export type BlurResult = {
  buffer: Buffer;
  regions: PlateRegion[];
  /** `true` إن طُمست منطقة واحدة على الأقل. */
  blurred: boolean;
  width: number;
  height: number;
};

/** كثافة الحواف لكل خلية — تباين أفقي بين البكسلات المتجاورة. */
function edgeGrid(pixels: Buffer, width: number, height: number): number[][] {
  const cols = Math.floor(width / CELL);
  const rows = Math.floor(height / CELL);
  const grid: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const line: number[] = [];
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      for (let y = 0; y < CELL; y += 1) {
        for (let x = 0; x < CELL - 1; x += 1) {
          const at = (row * CELL + y) * width + (col * CELL + x);
          sum += Math.abs((pixels[at] ?? 0) - (pixels[at + 1] ?? 0));
        }
      }
      line.push(sum / (CELL * (CELL - 1)));
    }
    grid.push(line);
  }
  return grid;
}

/**
 * أرضية مطلقة لكثافة الحواف.
 *
 * العتبة النسبية وحدها (مضاعف المتوسّط) تنهار على صورة ملساء: متوسّطها
 * يقارب الصفر فيصير كل شيء أضعافه، فتُطمَس سماءٌ خالية. والأرضية تقول
 * «لا حواف هنا أصلًا» — وهو ما لا يقوله أي مضاعف.
 */
const MIN_ABSOLUTE_DENSITY = 12;

/**
 * يبحث عن مستطيلات بنسبة اللوحة وكثافة حواف تفوق العتبة.
 *
 * الحروف والأرقام تنتج تباينًا أفقيًا كثيفًا في مساحة صغيرة — وهذا ما
 * يميّز اللوحة عن الهيكل الأملس حولها.
 */
export function findPlateRegions(
  grid: number[][],
  options: { minMultiple?: number; fromRow?: number } = {},
): PlateRegion[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return [];

  const from = options.fromRow ?? 0;
  const all = grid.flat();
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const threshold = Math.max(mean * (options.minMultiple ?? 2.2), MIN_ABSOLUTE_DENSITY);

  const found: (PlateRegion & { score: number })[] = [];

  // اللوحة بين ٤٪ و٢٠٪ من ارتفاع **الصورة** لا من نطاق البحث
  for (let h = Math.max(1, Math.round(rows * 0.04)); h <= Math.round(rows * 0.2); h += 1) {
    const w = Math.round(h * PLATE_RATIO);
    if (w < 2 || w > cols) continue;

    for (let row = from; row + h <= rows; row += 1) {
      for (let col = 0; col + w <= cols; col += 1) {
        let sum = 0;
        for (let y = row; y < row + h; y += 1) {
          for (let x = col; x < col + w; x += 1) sum += grid[y]?.[x] ?? 0;
        }
        const density = sum / (h * w);
        if (density < threshold) continue;

        found.push({
          x: col / cols,
          y: row / rows,
          width: w / cols,
          height: h / rows,
          confidence: Math.min(1, density / (threshold * 1.5)),
          /**
           * **الكثافة × المساحة** لا الكثافة وحدها: نافذةٌ صغيرة داخل
           * لوحة أكثف من اللوحة كاملة، فترتيبٌ بالكثافة وحدها يختار
           * شريحة من الرقم ويترك بقيّته مقروءة.
           */
          score: density * h * w,
        });
      }
    }
  }

  return mergeOverlaps(found);
}

/** المستطيلات المتداخلة لوحة واحدة — تُدمج في أوسعها. */
function mergeOverlaps(regions: (PlateRegion & { score: number })[]): PlateRegion[] {
  const sorted = [...regions].sort((a, b) => b.score - a.score);
  const kept: PlateRegion[] = [];

  for (const region of sorted) {
    const overlaps = kept.some(
      (other) =>
        region.x < other.x + other.width &&
        region.x + region.width > other.x &&
        region.y < other.y + other.height &&
        region.y + region.height > other.y,
    );
    if (!overlaps) {
      const { score: _score, ...clean } = region;
      kept.push(clean);
    }
  }
  // أكثر من لوحتين في صورة واحدة إشارةُ ضجيج لا مركبات
  return kept.slice(0, 2);
}

/** توسعة هامشية — الطمس الملتصق بالحرف يترك أطرافه مقروءة. */
const PADDING = 0.25;

const NOT_AN_IMAGE: Omit<BlurResult, 'buffer'> = {
  regions: [],
  blurred: false,
  width: 0,
  height: 0,
};

export async function blurPlates(input: Buffer): Promise<BlurResult> {
  /**
   * مدخل تالف **يُعاد كما هو ولا يرمي**: الرفع يأتي من المتصفّح، ورميةٌ
   * هنا تصير ٥٠٠ بلا رسالة بدل رفضٍ يقول للبائع ما الخطأ. والتحقّق من
   * كونه صورة مسؤولية الطبقة الأعلى، وهذه تكتفي بألّا تنهار.
   */
  let width = 0;
  let height = 0;
  let pixels: Buffer;
  let analysisHeight = 0;

  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    if (width === 0 || height === 0) return { buffer: input, ...NOT_AN_IMAGE };

    analysisHeight = Math.max(1, Math.round((height / width) * ANALYSIS_WIDTH));
    pixels = await sharp(input, { failOn: 'none' })
      .greyscale()
      .resize(ANALYSIS_WIDTH, analysisHeight, { fit: 'fill' })
      .raw()
      .toBuffer();
  } catch {
    return { buffer: input, ...NOT_AN_IMAGE };
  }

  const grid = edgeGrid(pixels, ANALYSIS_WIDTH, analysisHeight);

  /**
   * البحث في النصف السفلي وحده: اللوحة تحت خطّ منتصف المركبة دائمًا،
   * والنصف العلوي فيه الزجاج والانعكاسات — أغزر مصادر الإيجابية الكاذبة.
   */
  const regions = findPlateRegions(grid, { fromRow: Math.floor(grid.length / 2) });

  if (regions.length === 0) {
    return { buffer: input, regions: [], blurred: false, width, height };
  }

  /**
   * الطمس **يُعاد تركيبه من قصاصة مموّهة** لا بمستطيل معتم: المشتري
   * يحتاج أن يرى أن هناك لوحة وأنها طُمست، لا مربّعًا أسود يبدو عيبًا
   * في الصورة. والتمويه بنصف قطر يتناسب مع المساحة، فلا يُعكَس.
   */
  const patches = await Promise.all(
    regions.map(async (region) => {
      const pad = region.height * PADDING;
      const left = Math.max(0, Math.round((region.x - pad / PLATE_RATIO) * width));
      const top = Math.max(0, Math.round((region.y - pad) * height));
      const patchWidth = Math.min(
        width - left,
        Math.max(1, Math.round((region.width + (2 * pad) / PLATE_RATIO) * width)),
      );
      const patchHeight = Math.min(
        height - top,
        Math.max(1, Math.round((region.height + 2 * pad) * height)),
      );

      const patch = await sharp(input, { failOn: 'none' })
        .extract({ left, top, width: patchWidth, height: patchHeight })
        .blur(Math.max(4, patchHeight / 3))
        .toBuffer();

      return { input: patch, left, top };
    }),
  );

  const buffer = await sharp(input, { failOn: 'none' }).composite(patches).toBuffer();
  return { buffer, regions, blurred: true, width, height };
}

/**
 * طمس يدويّ بمنطقة يحدّدها البائع — الضمانة الأخيرة.
 * الكاشف الآلي يخطئ، ومن يرى صورته يرى ما فاته.
 */
export async function blurRegion(input: Buffer, region: PlateRegion): Promise<Buffer> {
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return input;
  }
  if (width === 0 || height === 0) return input;

  const left = Math.max(0, Math.round(region.x * width));
  const top = Math.max(0, Math.round(region.y * height));
  const patchWidth = Math.min(width - left, Math.max(1, Math.round(region.width * width)));
  const patchHeight = Math.min(height - top, Math.max(1, Math.round(region.height * height)));

  const patch = await sharp(input, { failOn: 'none' })
    .extract({ left, top, width: patchWidth, height: patchHeight })
    .blur(Math.max(4, patchHeight / 3))
    .toBuffer();

  return sharp(input, { failOn: 'none' }).composite([{ input: patch, left, top }]).toBuffer();
}
