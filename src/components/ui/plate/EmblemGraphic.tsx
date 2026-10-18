import { EMBLEM_ART, isImageArt, STRIP_SYMBOL, type EmblemArt } from './emblem-art'

/**
 * يرسم شعارًا داخل مجموعة SVG.
 *
 * الصورية تُرسم كما هي: شفافيتها مخبوزة في ملفّها ومقصوصة على حدّ الرسم، فلا
 * قناع ولا مرشِّح ولا فرقَ بين محرّك ومحرّك. والمتجهة أشكالٌ تحمل ألوانها.
 */
export function EmblemShapes({
  art,
  monochrome,
  /** ارتفاع صندوق الرسم داخل نظام إحداثيات 100×100 */
  box = 100,
}: {
  art: EmblemArt
  monochrome?: string
  box?: number
}) {
  if (isImageArt(art)) {
    const { content, imageRatio } = art

    // نكبّر الصورة حتى يملأ صندوق الرسم المساحة المطلوبة، ثم نزيحها
    const imgHeight = box / content.height
    const imgWidth = imgHeight * imageRatio
    const imgX = box / 2 - imgWidth * (content.x + content.width / 2)
    const imgY = -content.y * imgHeight

    /*
     * تُرسَم كما هي — بلا قناع ولا مرشِّح.
     *
     * الشفافية مخبوزة في الملفّ (انظر `emblem-art.ts`)، فما بقي عملٌ للمتصفّح
     * إلّا وضعها في موضعها. وكل ما سبق من حيلٍ لانتزاع البياض في العرض كان
     * يعمل في محرّك ويسقط في آخر.
     *
     * و`monochrome` لم يعد يُلوّن: اللون مخبوزٌ في نسخته. ويبقى في التوقيع
     * لأنّ الشعارات المتجهة تستعمله.
     */
    return (
      <image
        href={art.href}
        x={imgX}
        y={imgY}
        width={imgWidth}
        height={imgHeight}
        preserveAspectRatio="none"
      />
    )
  }

  return (
    <>
      {art.groups.map((group, groupIndex) => (
        <g key={groupIndex} transform={group.transform}>
          {group.shapes.map((shape, shapeIndex) => {
            const fill = monochrome ?? art.colors[shape.role]
            if (shape.kind === 'text') {
              return (
                <text
                  key={shapeIndex}
                  x={shape.x}
                  y={shape.y}
                  fill={fill}
                  fontSize={shape.size}
                  fontWeight={700}
                  textAnchor="middle"
                  letterSpacing={shape.letterSpacing ?? 0}
                >
                  {shape.text}
                </text>
              )
            }
            return <path key={shapeIndex} d={shape.d} fill={fill} opacity={shape.opacity} />
          })}
        </g>
      ))}
    </>
  )
}

/** شعار مستقل بحجمه الخاص — يُستخدم في المصغّرات وقوائم الاختيار. */
export function EmblemIcon({
  emblem,
  className,
  monochrome,
}: {
  emblem: string
  className?: string
  monochrome?: string
}) {
  const art = EMBLEM_ART[emblem]
  if (!art) return null
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={art.title}>
      <EmblemShapes art={art} monochrome={monochrome} />
    </svg>
  )
}

export { EMBLEM_ART, STRIP_SYMBOL }
