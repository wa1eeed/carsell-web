import { db } from '@/lib/db';
import { randomBytes } from 'node:crypto';
import { toSlug } from './listing-detail';

/**
 * ═══ `D16` — الصفحةُ الرسمية للمعرض ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٦: «لاندنق بيج كموقع رسمي له يعرض سياراته فقط …
 * بهويته و يمكن تركيب شعاره و دومينه».
 *
 * **وهي غيرُ صفحته في سوقنا.** `/ar/dealers/{slug}` صفحةٌ داخل كارز
 * بشريطها وهويّتها، وهذه موقعُه هو — ومن فتحها لا يُؤخذ إلى سيارةِ
 * جاره.
 *
 * ═══ والدومينُ خطوتان، تُقال الثانيةُ صراحةً ═══
 *
 * الأولى يملكها التطبيق: يحفظ الاسمَ ويُثبت ملكيّتَه بسجلّ `TXT`.
 * والثانيةُ شهادةُ TLS يصدرها الوسيط (Caddy) — **خطوةُ تشغيلٍ خارج
 * المستودع**. فالصفحةُ تعمل على مسارنا من يومها، ولا يُقال للمعرض إنّ
 * دومينَه جاهزٌ قبل أن يكون.
 */

export type SiteInput = {
  slug: string;
  tagline: string | null;
  accent: string | null;
  visible: boolean;
  customDomain: string | null;
};

export type SiteResult =
  | { ok: true; slug: string; domainToken: string | null }
  | { ok: false; reason: 'VALIDATION'; fields: Record<string, string> }
  | { ok: false; reason: 'SLUG_TAKEN' | 'DOMAIN_TAKEN' };

/** لونُ هويّةٍ واحدٌ سادسُ عشريّ — والباقي يُشتقّ منه في الصفحة. */
const HEX = /^#[0-9a-fA-F]{6}$/;
/** اسمُ مضيفٍ لا رابط — ومن لصق `https://` يُنظَّف له لا يُردّ. */
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

export function validateSite(input: SiteInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const slug = toSlug(input.slug).replace(/[^a-z0-9-]/g, '');
  /**
   * **والعنوانُ لاتينيٌّ** — ومنه يُبنى الرابط، وعربيٌّ يصير مُرمَّزًا
   * فيُقارَن مُرمَّزًا بمفكوك ويردّ ٤٠٤ صامتًا (الصنف المسجَّل ثلاثًا).
   */
  if (slug.length < 3) fields.slug = 'SHORT';
  if (input.accent !== null && input.accent !== '' && !HEX.test(input.accent)) {
    fields.accent = 'FORMAT';
  }
  if (input.customDomain !== null && input.customDomain.trim() !== '') {
    if (!HOST.test(normalizeDomain(input.customDomain))) fields.customDomain = 'FORMAT';
  }
  return fields;
}

export async function saveDealerSite(
  actor: { userId: string; dealerId: string },
  input: SiteInput,
  now: Date = new Date(),
): Promise<SiteResult> {
  const fields = validateSite(input);
  if (Object.keys(fields).length > 0) return { ok: false, reason: 'VALIDATION', fields };

  const slug = toSlug(input.slug).replace(/[^a-z0-9-]/g, '');
  const domain =
    input.customDomain === null || input.customDomain.trim() === ''
      ? null
      : normalizeDomain(input.customDomain);

  /**
   * **ويُقرأ قبل الكتابة** — فاصطدامُ الفريد يرمي «Unique constraint
   * failed» ويتّهم الحفظ لا الاسمَ المأخوذ.
   */
  const slugTaken = await db.dealerSite.findFirst({
    where: { slug, dealerId: { not: actor.dealerId } },
    select: { id: true },
  });
  if (slugTaken !== null) return { ok: false, reason: 'SLUG_TAKEN' };

  if (domain !== null) {
    const domainTaken = await db.dealerSite.findFirst({
      where: { customDomain: domain, dealerId: { not: actor.dealerId } },
      select: { id: true },
    });
    if (domainTaken !== null) return { ok: false, reason: 'DOMAIN_TAKEN' };
  }

  const current = await db.dealerSite.findUnique({
    where: { dealerId: actor.dealerId },
    select: { customDomain: true, domainToken: true },
  });

  /**
   * **وتبديلُ الدومين يُبطل إثباتَه.** من أثبت `a.com` ثمّ كتب `b.com`
   * لم يُثبت الثاني — وبقاءُ `domainVerifiedAt` يجعل الصفحةَ تُخدم على
   * اسمٍ لا يملكه.
   */
  const changed = current?.customDomain !== domain;
  const token =
    domain === null ? null : changed ? `carz-site-${randomBytes(8).toString('hex')}` : current?.domainToken ?? null;

  const saved = await db.dealerSite.upsert({
    where: { dealerId: actor.dealerId },
    create: {
      dealerId: actor.dealerId,
      slug,
      tagline: input.tagline,
      accent: input.accent === '' ? null : input.accent,
      visible: input.visible,
      customDomain: domain,
      domainToken: token,
      createdAt: now,
    },
    update: {
      slug,
      tagline: input.tagline,
      accent: input.accent === '' ? null : input.accent,
      visible: input.visible,
      customDomain: domain,
      domainToken: token,
      ...(changed ? { domainVerifiedAt: null } : {}),
    },
    select: { slug: true, domainToken: true },
  });

  await db.auditLog.create({
    data: {
      actorId: actor.userId,
      actorType: 'user',
      entity: 'DealerSite',
      entityId: actor.dealerId,
      action: 'dealer.site.saved',
      before: { domain: current?.customDomain ?? null },
      after: { slug: saved.slug, domain, visible: input.visible },
      ip: null,
      createdAt: now,
    },
  });

  return { ok: true, slug: saved.slug, domainToken: saved.domainToken };
}

export type SiteView = {
  slug: string;
  tagline: string | null;
  accent: string | null;
  visible: boolean;
  customDomain: string | null;
  domainToken: string | null;
  domainVerified: boolean;
};

export async function dealerSite(dealerId: string): Promise<SiteView | null> {
  const row = await db.dealerSite.findUnique({
    where: { dealerId },
    select: {
      slug: true, tagline: true, accent: true, visible: true,
      customDomain: true, domainToken: true, domainVerifiedAt: true,
    },
  });
  if (row === null) return null;
  return {
    slug: row.slug,
    tagline: row.tagline,
    accent: row.accent,
    visible: row.visible,
    customDomain: row.customDomain,
    domainToken: row.domainToken,
    domainVerified: row.domainVerifiedAt !== null,
  };
}

/**
 * ═══ الصفحةُ العامّة — بسلَحفتها لا بمعرّفها ═══
 *
 * **والمخفيّةُ كالمعدومة**: صفحةٌ لم يقرّر صاحبُها نشرَها لا تُفتح
 * للناس، ولا يُفرَّق بين الغائبة والمخفيّة — وجودُها ليس خبرًا يُعطى.
 */
export async function publicSite(slug: string): Promise<{ dealerSlug: string; site: SiteView } | null> {
  const row = await db.dealerSite.findFirst({
    where: { slug, visible: true, dealer: { status: 'ACTIVE' } },
    select: {
      slug: true, tagline: true, accent: true, visible: true,
      customDomain: true, domainVerifiedAt: true,
      dealer: { select: { slug: true } },
    },
  });
  if (row === null) return null;
  return {
    dealerSlug: row.dealer.slug,
    site: {
      slug: row.slug,
      tagline: row.tagline,
      accent: row.accent,
      visible: row.visible,
      customDomain: row.customDomain,
      /** **ولا يخرج رمزُ الإثبات في صفحةٍ عامّة** — هو سرُّ تحقّقٍ لا بيان. */
      domainToken: null,
      domainVerified: row.domainVerifiedAt !== null,
    },
  };
}
