import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { previewImport, runImport } from '@/lib/domain/dealer-import';
import { importNoteAr } from '@/lib/labels/dealer';

/**
 * ═══ `D3` — الاستيراد الجماعيّ ═══
 *
 * **والمعاينةُ تَعِد بما يقع.** وُجد بالمشي أنّ صفًّا بفئةٍ ليست من
 * الطراز يُعرض «سليمًا» ثمّ يُترَك عند الاستيراد — فالمعاينةُ تَعِد
 * بما لا يقع، وهو عينُ ما وُضعت لتمنعه.
 */
const VINS = ['1HGCM82633A004352', '4HGCM82633A004355'];

afterAll(async () => {
  /** **وما يُنشئه الاختبار يُحذف فيه** — وإلّا تراكمت مركباتٌ تضخّم كل عدّاد. */
  await db.vehicle.deleteMany({ where: { vin: { in: VINS } } });
});

async function fixture() {
  const owner = await db.user.findFirst({
    where: { dealerRole: 'OWNER', dealer: { status: 'ACTIVE' } },
    select: { id: true, dealerId: true, dealer: { select: { city: true } } },
  });
  expect(owner, 'لا مالكَ معرضٍ نشط في البذرة').not.toBeNull();

  const trim = await db.trim.findFirst({
    where: { visible: true },
    select: { nameAr: true, model: { select: { nameAr: true, brand: { select: { nameAr: true } } } } },
  });
  expect(trim, 'لا فئةَ في الكتالوج').not.toBeNull();
  return { owner, trim };
}

function csv(brand: string, model: string, trim: string): string {
  /** **والشرطُ يُصنَع لا يُنتظَر**: كلُّ شكلٍ يرسمه الترميز له سطرُه. */
  return [
    'VIN,Make,Model,Trim,Model Year,Mileage,Asking,Colour,Branch,Notes',
    `${VINS[0]},${brand},${model},${trim},2022,48000,92000,أبيض,,ملاحظة تتجاهل`,
    `SHORTVIN,${brand},${model},${trim},2022,1000,50000,أسود,,`,
    `2HGCM82633A004353,ماركة لا وجود لها,${model},${trim},2022,1000,50000,أسود,,`,
    `3HGCM82633A004354,${brand},${model},فئة لا وجود لها,2022,1000,50000,أسود,,`,
    `${VINS[1]},${brand},${model},${trim},2022,1000,0,أسود,,`,
    `5HGCM82633A004356,${brand},${model},${trim},2022,1000,50000,أسود,فرع لا وجود له,`,
  ].join('\r\n');
}

describe('الاستيراد الجماعي', () => {
  it('والمعاينة تعد بما يقع — فما عرض سليما يستورد', async () => {
    const { owner, trim } = await fixture();
    if (owner === null || owner.dealerId === null || trim === null) return;

    await db.vehicle.deleteMany({ where: { vin: { in: VINS } } });
    const text = csv(trim.model.brand.nameAr, trim.model.nameAr, trim.nameAr);

    const preview = await previewImport(owner.dealerId, text);
    const result = await runImport({
      dealerId: owner.dealerId,
      actorId: owner.id,
      text,
      branchId: null,
      city: owner.dealer?.city ?? 'الرياض',
    });

    /**
     * **والجاهزُ في المعاينة هو ما دخل بالضبط.** كان الفارقُ واحدًا
     * (الفئةُ لم تُفحص في المعاينة)، فعُرضت «سليمة» وتُركت.
     */
    expect(result.created + result.updated).toBe(preview.totals.ready);
    expect(result.skipped.length).toBe(
      preview.rows.filter((row) => row.severity === 'ERROR').length,
    );
  });

  it('وكل سبب يسمي عموده وقيمته لا «صف مرفوض»', async () => {
    const { owner, trim } = await fixture();
    if (owner === null || owner.dealerId === null || trim === null) return;

    const preview = await previewImport(
      owner.dealerId,
      csv(trim.model.brand.nameAr, trim.model.nameAr, trim.nameAr),
    );

    const flagged = preview.rows.filter((row) => row.note !== null);
    expect(flagged.length, 'الملفُّ المصطنع بلا ملاحظات — فالاختبار لا يقيس شيئًا').toBeGreaterThan(3);

    for (const row of flagged) {
      if (row.note === null) continue;
      const text = importNoteAr(row.note);
      expect(text.length, `سببٌ فارغ للرمز ${row.note.code}`).toBeGreaterThan(5);
      /** **والقيمةُ المرفوضة تُقتبس** — فمن يفتح الملفّ يجدها. */
      if (row.note.value !== undefined && row.note.value !== '') {
        expect(text, row.note.code).toContain(row.note.value);
      }
    }
  });

  it('والعمود المتجاهل يقال ولا يبتلع', async () => {
    const { owner, trim } = await fixture();
    if (owner === null || owner.dealerId === null || trim === null) return;

    const preview = await previewImport(
      owner.dealerId,
      csv(trim.model.brand.nameAr, trim.model.nameAr, trim.nameAr),
    );
    expect(preview.ignoredColumns).toContain('Notes');
  });

  it('وعمود الرقم التسلسلي الغائب يسمى — ولا يقرأ الملف بدونه', async () => {
    const { owner } = await fixture();
    if (owner === null || owner.dealerId === null) return;

    const preview = await previewImport(owner.dealerId, 'Make,Model\nتويوتا,كامري');
    expect(preview.missingColumn).toBe('vin');
    expect(preview.rows).toEqual([]);
  });
});
