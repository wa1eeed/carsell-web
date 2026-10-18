'use client';

import type { BodyType, FuelType } from '@/generated/prisma/enums';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArabicNumber } from '@/components/ui/ArabicNumber';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Sheet';
import { Quantity } from '@/components/ui/Quantity';
import { Toast } from '@/components/ui/Toast';
import type { ModelRow, TrimRow } from '@/lib/domain/catalog';
import { cn } from '@/lib/cn';

type BrandOption = { id: string; nameAr: string; nameEn: string; slug: string };

/** القيَم الموروثة بأسمائها العربية — تُعرض ولا تُترجم في ملفات اللغة. */
const BODY = {
  SEDAN: 'سيدان', SUV: 'دفع رباعي', CROSSOVER: 'كروس أوفر', PICKUP: 'وانيت',
  HATCHBACK: 'هاتشباك', COUPE: 'كوبيه', CONVERTIBLE: 'مكشوفة', VAN: 'فان',
} as const satisfies Record<BodyType, string>;
const TRANS = { AUTOMATIC: 'أوتوماتيك', MANUAL: 'عادي', CVT: 'CVT', DCT: 'DCT' } as const;
const FUEL = {
  PETROL: 'بنزين', DIESEL: 'ديزل', HYBRID: 'هايبرد',
  PLUGIN_HYBRID: 'هجين قابل للشحن', ELECTRIC: 'كهرباء',
} as const satisfies Record<FuelType, string>;
const DRIVE = { FWD: 'أمامي', RWD: 'خلفي', AWD: 'رباعي دائم', FOUR_WD: 'رباعي' } as const;

type TrimDraft = {
  id?: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  bodyType: keyof typeof BODY;
  transmission: keyof typeof TRANS;
  fuel: keyof typeof FUEL;
  drivetrain: keyof typeof DRIVE;
  seats: number;
  doors: number;
};

/**
 * **والمانعُ بياناتٌ لا جملة.**
 *
 * كتبتُها أوّل مرّة `` `له ${n} فئة` `` فأخرجت «له 2 فئة» — **والاثنان
 * في العربية «فئتان»**، والجمع ستُّ صيغ لا واحدة. فالعدد يحكم
 * معدوده داخل `Quantity`، والجارّ وحده خارجه (البوابة ١٨).
 */
type Blocker = { lead: string; unit: 'trims' | 'inventory'; count: number };

type ModelDraft = {
  id?: string;
  nameAr: string;
  nameEn: string;
  yearFrom: number;
  yearTo: number | null;
};

const EMPTY_TRIM: TrimDraft = {
  nameAr: '', nameEn: '', yearFrom: new Date().getFullYear(),
  bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL',
  drivetrain: 'FWD', seats: 5, doors: 4,
};

export function CatalogTree({
  brands,
  brandId,
  models,
  modelId,
  trims,
  canEdit,
}: {
  brands: readonly BrandOption[];
  brandId: string;
  models: readonly ModelRow[];
  modelId: string | null;
  trims: readonly TrimRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<TrimDraft | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft | null>(null);
  /**
   * ═══ والحذفُ يُسأل عنه مرّة ═══
   *
   * ما يُحذف هنا لا يُسترجع، والزرّ بجوار «تعديل» — فاليدُ تزلّ.
   */
  const [removing, setRemoving] = useState<
    { kind: 'models' | 'trims'; id: string; name: string; blockedBy: Blocker | null } | null
  >(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const model = models.find((m) => m.id === modelId) ?? null;

  function go(next: { brand?: string; model?: string }): void {
    const params = new URLSearchParams();
    params.set('brand', next.brand ?? brandId);
    if (next.model !== undefined) params.set('model', next.model);
    router.push(`/admin/catalog/models?${params.toString()}`);
  }

  async function send(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<boolean> {
    setBusy(true);
    setErrors({});
    try {
      const response = await fetch(`/api/v1/admin/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await response.json()) as {
        error?: { messageAr: string; fields?: Record<string, string> };
      };
      if (json.error !== undefined) {
        setErrors(json.error.fields ?? {});
        setToast({ tone: 'error', text: json.error.messageAr });
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const columns: readonly Column<TrimRow>[] = [
    { id: 'name', header: 'الفئة', cell: (t) => <span className="font-semibold">{t.nameEn}</span> },
    { id: 'body', header: 'نوع الهيكل', cell: (t) => BODY[t.bodyType] },
    { id: 'trans', header: 'ناقل الحركة', cell: (t) => TRANS[t.transmission] },
    { id: 'fuel', header: 'الوقود', cell: (t) => FUEL[t.fuel] },
    { id: 'drive', header: 'الدفع', cell: (t) => DRIVE[t.drivetrain] },
    { id: 'seats', header: 'المقاعد', numeric: true, cell: (t) => <ArabicNumber value={t.seats} /> },
    {
      id: 'actions',
      header: '',
      cell: (t) =>
        canEdit ? (
          <span className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push(`/admin/catalog/trims/${t.id}`)}
            >
              تعديل
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() =>
                setRemoving({
                  kind: 'trims',
                  id: t.id,
                  name: t.nameEn,
                  blockedBy:
                    t.vehicleCount > 0
                      ? { lead: 'عليها', unit: 'inventory', count: t.vehicleCount }
                      : null,
                })
              }
            >
              حذف
            </Button>
          </span>
        ) : null,
    },
  ];

  const field =
    'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base outline-none focus:border-accent';
  const label = 'flex flex-col gap-1.5 text-2xs font-semibold opacity-70';

  return (
    /*
      **والعمودان يتراكبان تحت `lg`.** `w-[250px] shrink-0` على شاشة
      ٣٧٥ تأخذ ٢٥٠ وتترك للوحة الفئات **٧٧px** — جدولٌ بستّة أعمدة
      في عرض كلمة. والشجرة فوق واللوحة تحتها، فلكلٍّ عرضُ الشاشة.
    */
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* الشجرة — ٢٥٠px على الحاسوب، وعرضُ الشاشة على الهاتف */}
      <aside className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3 lg:w-[250px] lg:shrink-0">
        <label className={label}>
          الماركة
          <select
            value={brandId}
            onChange={(e) => go({ brand: e.target.value })}
            className={cn(field, 'text-sm')}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => go({ model: m.id })}
              className={cn(
                'flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-start text-sm font-semibold',
                m.id === modelId ? 'bg-ink text-bg' : 'opacity-70 hover:opacity-100',
              )}
            >
              <span className="flex-1 truncate">{m.nameAr}</span>
              <ArabicNumber
                value={m.trimCount}
                className={cn('text-3xs', m.id === modelId ? 'opacity-100' : 'opacity-65')}
              />
              {m.visible ? null : <span className="text-3xs opacity-70">مخفي</span>}
            </button>
          ))}
        </div>

        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-auto w-full"
            onClick={() =>
              setModelDraft({ nameAr: '', nameEn: '', yearFrom: new Date().getFullYear(), yearTo: null })
            }
          >
            أضف طرازا
          </Button>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {model === null ? (
          <p className="text-sm opacity-70">لا طرازات لهذه الماركة بعد.</p>
        ) : (
          <>
            <header className="flex items-end gap-4 rounded-lg border border-line bg-surface p-4.5">
              <div>
                <h2 className="text-xl font-bold">
                  {model.nameAr} — <span className="font-body-en">{model.nameEn}</span>
                </h2>
                {/* كل مقطع معزول — الفاصل بين رقم وكلمة عربية ينزلق */}
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-70">
                  <Quantity unit="trims" count={model.trimCount} />
                  <span aria-hidden className="opacity-40">·</span>
                  <Quantity unit="listings" count={model.listingCount} />
                  <span aria-hidden className="opacity-40">·</span>
                  <span className="bidi-isolate">
                    السنوات <ArabicNumber value={model.yearFrom} grouped={false} />–
                    <ArabicNumber value={model.yearTo ?? new Date().getFullYear()} grouped={false} />
                  </span>
                </p>
              </div>
              <span className="flex-1" />
              {model.visible ? null : <Badge tone="warn">مخفي</Badge>}
              {!canEdit ? null : (
                <>
                  {/*
                    ═══ والطراز كان يُنشأ ولا يُعدّل ═══

                    `PATCH /models/{id}` و`DELETE` مبنيّتان ومختبَرتان منذ
                    بُنيت الشاشة، **ولا زرّ يبلغهما**: طرازٌ كُتب اسمُه خطأً
                    يبقى خطأً إلى الأبد، وما أُضيف سهوًا يسكن القائمة ويظهر
                    للبائع في معالج البيع.
                  */}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setModelDraft({
                        id: model.id,
                        nameAr: model.nameAr,
                        nameEn: model.nameEn,
                        yearFrom: model.yearFrom,
                        yearTo: model.yearTo,
                      })
                    }
                  >
                    تعديل الطراز
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void send(`models/${model.id}`, 'PATCH', { visible: !model.visible }).then(
                        (done) =>
                          done
                            ? setToast({
                                tone: 'success',
                                text: model.visible ? 'أخفي الطراز.' : 'ظهر الطراز.',
                              })
                            : null,
                      )
                    }
                  >
                    {model.visible ? 'أخفه' : 'أظهره'}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-danger"
                    onClick={() =>
                      setRemoving({
                        kind: 'models',
                        id: model.id,
                        name: model.nameAr,
                        blockedBy:
                          model.trimCount > 0
                            ? { lead: 'له', unit: 'trims', count: model.trimCount }
                            : model.vehicleCount > 0
                              ? { lead: 'عليه', unit: 'inventory', count: model.vehicleCount }
                              : null,
                      })
                    }
                  >
                    احذفه
                  </Button>
                  <Button onClick={() => setDraft({ ...EMPTY_TRIM, yearFrom: model.yearFrom })}>
                    أضف فئة
                  </Button>
                </>
              )}
            </header>

            <DataTable
              columns={columns}
              rows={trims}
              rowKey={(t) => t.id}
              empty={{ title: 'لا فئات لهذا الطراز', description: 'أضف أول فئة بقيمها الموروثة.' }}
            />

            <section className="rounded-lg border border-line bg-surface p-5.5">
              <h3 className="mb-2.5 text-3xs font-bold tracking-[0.14em] opacity-65">
                أثر ذلك في التطبيق
              </h3>
              <p className="text-sm leading-loose opacity-72">
                حين يختار البائع {brands.find((b) => b.id === brandId)?.nameAr} ←{' '}
                {model.nameAr} ← إحدى الفئات، تملأ آليا: نوع الهيكل وناقل الحركة
                والوقود والدفع وعدد المقاعد. فلا يعبئ خمسة حقول، ولا تتضارب البيانات
                بين إعلانين للطراز نفسه. والقيم تنسخ لقطة وقت النشر — فتعديلها هنا
                لا يمس إعلانا منشورا.
              </p>
            </section>
          </>
        )}
      </div>

      {/* حوار الفئة */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === undefined ? 'فئة جديدة' : 'تعديل الفئة'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>إلغاء</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (draft === null || model === null) return;
                const done =
                  draft.id === undefined
                    ? await send('trims', 'POST', { ...draft, modelId: model.id })
                    : await send(`trims/${draft.id}`, 'PATCH', draft);
                if (done) {
                  setDraft(null);
                  setToast({ tone: 'success', text: 'حفظت الفئة.' });
                }
              }}
            >
              احفظ
            </Button>
          </>
        }
      >
        {draft === null ? null : (
          <div className="grid grid-cols-2 gap-3.5">
            <label className={label}>
              الاسم العربي — إلزامي
              <input
                value={draft.nameAr}
                onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                className={cn(field, errors.nameAr !== undefined && 'border-danger')}
              />
            </label>
            <label className={label}>
              الاسم الإنجليزي — إلزامي
              <input
                dir="ltr"
                value={draft.nameEn}
                onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.nameEn !== undefined && 'border-danger')}
              />
            </label>

            {(
              [
                ['bodyType', 'نوع الهيكل', BODY],
                ['transmission', 'ناقل الحركة', TRANS],
                ['fuel', 'الوقود', FUEL],
                ['drivetrain', 'نظام الدفع', DRIVE],
              ] as const
            ).map(([key, title, options]) => (
              <label key={key} className={label}>
                {title}
                <select
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value } as TrimDraft)}
                  className={cn(field, 'text-sm')}
                >
                  {Object.entries(options).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            {(
              [
                ['seats', 'عدد المقاعد'],
                ['doors', 'عدد الأبواب'],
                ['yearFrom', 'من سنة'],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className={label}>
                {title}
                <input
                  type="number"
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                  className={cn(field, 'font-num', errors[key] !== undefined && 'border-danger')}
                />
              </label>
            ))}
          </div>
        )}
      </Modal>

      {/* حوار الطراز */}
      <Modal
        open={modelDraft !== null}
        onClose={() => setModelDraft(null)}
        title={modelDraft?.id === undefined ? 'طراز جديد' : 'تعديل الطراز'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModelDraft(null)}>إلغاء</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (modelDraft === null) return;
                const { id, ...body } = modelDraft;
                const done =
                  id === undefined
                    ? await send('models', 'POST', { ...body, brandId })
                    : await send(`models/${id}`, 'PATCH', body);
                if (done) {
                  setModelDraft(null);
                  setToast({
                    tone: 'success',
                    text: id === undefined ? 'أضيف الطراز.' : 'حفظ الطراز.',
                  });
                }
              }}
            >
              احفظ
            </Button>
          </>
        }
      >
        {modelDraft === null ? null : (
          <div className="flex flex-col gap-3.5">
            <label className={label}>
              الاسم العربي — إلزامي
              <input
                value={modelDraft.nameAr}
                onChange={(e) => setModelDraft({ ...modelDraft, nameAr: e.target.value })}
                className={cn(field, errors.nameAr !== undefined && 'border-danger')}
              />
            </label>
            <label className={label}>
              الاسم الإنجليزي — إلزامي
              <input
                dir="ltr"
                value={modelDraft.nameEn}
                onChange={(e) => setModelDraft({ ...modelDraft, nameEn: e.target.value })}
                className={cn(field, 'bidi-ltr', errors.nameEn !== undefined && 'border-danger')}
              />
            </label>
            <label className={label}>
              من سنة
              <input
                type="number"
                value={modelDraft.yearFrom}
                onChange={(e) => setModelDraft({ ...modelDraft, yearFrom: Number(e.target.value) })}
                className={cn(field, 'font-num', errors.yearFrom !== undefined && 'border-danger')}
              />
            </label>
            <label className={label}>
              {/* **والفراغُ معنًى لا نقص**: طرازٌ يُنتَج إلى اليوم. */}
              إلى سنة — يترك فارغا إن كان ينتج
              <input
                type="number"
                value={modelDraft.yearTo ?? ''}
                onChange={(e) =>
                  setModelDraft({
                    ...modelDraft,
                    yearTo: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className={cn(field, 'font-num', errors.yearTo !== undefined && 'border-danger')}
              />
            </label>
          </div>
        )}
      </Modal>

      {/*
        ═══ حوارُ الحذف — ويقول المانع قبل الضغط ═══

        الخادم يرفض حذف ما له فئاتٌ أو مركبات، **والشاشة تقول ذلك
        بالعدد قبل النقرة** لا بعدها — والعددُ هو `vehicleCount` الذي يحرس
        به النطاق، لا `listingCount` الذي يعدّ المعروض وحده.
      */}
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing?.kind === 'models' ? 'حذف الطراز' : 'حذف الفئة'}
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
              تراجع
            </Button>
            <Button
              variant="danger"
              disabled={busy || removing?.blockedBy !== null}
              onClick={async () => {
                if (removing === null) return;
                const done = await send(`${removing.kind}/${removing.id}`, 'DELETE');
                if (done) {
                  const wasModel = removing.kind === 'models';
                  setRemoving(null);
                  setToast({ tone: 'success', text: wasModel ? 'حذف الطراز.' : 'حذفت الفئة.' });
                  if (wasModel) go({ model: undefined });
                }
              }}
            >
              {busy ? 'يحذف…' : 'نعم، احذفه'}
            </Button>
          </>
        }
      >
        {removing === null ? null : removing.blockedBy !== null ? (
          <p className="text-xs leading-loose">
            <b className="bidi-isolate">{removing.name}</b> {removing.blockedBy.lead}{' '}
            <Quantity unit={removing.blockedBy.unit} count={removing.blockedBy.count} /> — ولا
            يحذف ما يستعمل. <b>أخفه بدل حذفه</b>: يختفي من معالج البيع ومن الفلاتر، وتبقى
            البيانات القائمة عليه كما هي.
          </p>
        ) : (
          <p className="text-xs leading-loose">
            يحذف <b className="bidi-isolate">{removing.name}</b> نهائيا ولا يسترجع.
            {removing.kind === 'models' ? ' ولا فئة عليه ولا مركبة.' : ' ولا مركبة عليها.'}
          </p>
        )}
      </Modal>

      {toast === null ? null : (
        <div className="fixed bottom-6 end-6 z-50">
          <Toast tone={toast.tone} title={toast.text} />
        </div>
      )}
    </div>
  );
}
