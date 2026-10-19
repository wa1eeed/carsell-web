import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { ADMIN_NAV } from '@/components/admin/nav';
import { checkApiKey } from '@/lib/api/public-key';
import { API_SCOPES, allows, isApiScope } from '@/lib/api/scopes';
import { API_SCOPE_HINT, API_SCOPE_LABEL } from '@/lib/labels/api-keys';
import { adminApiKeys, issueApiKey, revokeApiKey, updateApiKey } from '@/lib/domain/api-keys';
import { stripComments } from '../scripts/strip-comments.mjs';

const ROOT = process.cwd();
const admin = { id: 'test-admin-apikeys' };
const MADE = 'اختبار المفاتيح';

afterAll(async () => {
  await db.apiKey.deleteMany({ where: { name: { startsWith: MADE } } });
  await db.auditLog.deleteMany({ where: { actorId: admin.id } });
});

/**
 * ═══ قفلٌ بلا مفتاح ═══
 *
 * ثلاثةُ مسارات تطلب مفتاحًا، والمصادقةُ و`mintKey` والحدُّ مبنيّة —
 * **ولا شيء كان يُصدر مفتاحًا**، فالواجهةُ العامّة لم تكن تُنادى في
 * أيّ بيئةٍ وُجدت.
 */
describe('مفاتيح الواجهة العامة', () => {
  it('الوجهة في الملاحة ولها شاشة ومساران', () => {
    const entry = ADMIN_NAV.flatMap((group) => group.items).find(
      (item) => item.href === '/admin/api-keys',
    );
    expect(entry).toBeDefined();
    for (const path of [
      'src/app/admin/api-keys/page.tsx',
      'src/app/api/v1/admin/api-keys/route.ts',
      'src/app/api/v1/admin/api-keys/[id]/route.ts',
    ]) {
      expect(() => readFileSync(join(ROOT, path))).not.toThrow();
    }
  });

  it('ولكل نطاق تسمية وشرح', () => {
    for (const scope of API_SCOPES) {
      expect(API_SCOPE_LABEL[scope]).toBeTruthy();
      expect(API_SCOPE_HINT[scope]).toBeTruthy();
    }
    expect(isApiScope('read:listings')).toBe(true);
    expect(isApiScope('write:everything')).toBe(false);
  });

  /**
   * ═══ والمفتاحُ يُصدَر فيعمل، ويُسحب فيتوقّف ═══
   *
   * **والرحلةُ تُمشى إلى آخرها**: الإصدارُ وحده لا يُثبت شيئًا ما لم
   * يُصادَق بالخامّ الذي خرج منه.
   */
  it('يُصدر فيُصادَق به، ويُسحب فيُرفض', async () => {
    const issued = await issueApiKey(
      admin,
      { name: `${MADE} — رحلة`, scopes: [], rateLimit: 30 },
      '10.0.0.1',
    );
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    expect(issued.raw.startsWith('csk_')).toBe(true);
    expect(issued.key.prefix).toBe(issued.raw.slice(0, 8));

    const live = await checkApiKey(`Bearer ${issued.raw}`);
    expect(live.ok).toBe(true);
    if (live.ok) expect(live.rateLimit).toBe(30);

    const revoked = await revokeApiKey(admin, issued.key.id, null);
    expect(revoked.ok).toBe(true);

    const after = await checkApiKey(`Bearer ${issued.raw}`);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe('REVOKED');

    /** **ولا رجعة**: السحبُ مرّةً واحدة، والثانيةُ تُردّ. */
    const again = await revokeApiKey(admin, issued.key.id, null);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_REVOKED');
  });

  /** **والسرُّ لا يعود من القراءة أبدًا** — ولا تجزئتُه. */
  it('ولا يخرج السر ولا تجزئته من القراءة', async () => {
    const issued = await issueApiKey(
      admin,
      { name: `${MADE} — سر`, scopes: [], rateLimit: 60 },
      null,
    );
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const rows = await adminApiKeys();
    const row = rows.find((entry) => entry.id === issued.key.id);
    expect(row).toBeDefined();
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(issued.raw);
    expect(Object.keys(row ?? {})).not.toContain('keyHash');

    /** وسجلُّ التدقيق يكتب البادئة لا السرّ — وإلّا بطلت تجزئتُه. */
    const log = await db.auditLog.findFirst({
      where: { actorId: admin.id, action: 'apikey.issue', entityId: issued.key.id },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.after)).not.toContain(issued.raw);
    expect(JSON.stringify(log?.after)).toContain(issued.key.prefix);
  });

  /**
   * ═══ والنطاقُ يُفحص — أو لا يُعرض ═══
   *
   * الحقلُ كان يُخزَّن ويُعاد ولا يُفحص، و`docs/api/public.md` تسمّيها
   * «أسوأ من غياب الحقل». **ويُقاس بتجاوزه**: مفتاحٌ بنطاقٍ واحد
   * يُمنع من الآخر.
   */
  it('والنطاق يقيد فعلا، والفارغ يبقى على معناه', () => {
    expect(allows([], 'read:listings')).toBe(true);
    expect(allows([], 'read:dealers')).toBe(true);
    expect(allows(['read:listings'], 'read:listings')).toBe(true);
    expect(allows(['read:listings'], 'read:dealers')).toBe(false);
  });

  /** **وكلُّ مسارٍ عامّ يُعلن نطاقَه** — وإلّا فالحقلُ زينة. */
  it('وكل مسار عام يعلن نطاقه', () => {
    const routes = [
      ['src/app/api/public/v1/listings/route.ts', 'read:listings'],
      ['src/app/api/public/v1/listings/[ref]/route.ts', 'read:listings'],
      ['src/app/api/public/v1/dealers/route.ts', 'read:dealers'],
    ] as const;

    for (const [path, scope] of routes) {
      const source = stripComments(readFileSync(join(ROOT, path), 'utf8'));
      expect(source, path).toContain(`requirePublicKey(request, '${scope}')`);
    }
  });

  it('ويرفض نطاقا مجهولا وحدا خارج المدى واسما فارغا', async () => {
    const badScope = await issueApiKey(
      admin,
      { name: `${MADE} — نطاق`, scopes: ['write:all'], rateLimit: 60 },
      null,
    );
    expect(badScope.ok).toBe(false);
    if (!badScope.ok) expect(badScope.reason).toBe('INVALID_SCOPE');

    const badLimit = await issueApiKey(
      admin,
      { name: `${MADE} — حد`, scopes: [], rateLimit: 99999 },
      null,
    );
    expect(badLimit.ok).toBe(false);
    if (!badLimit.ok) expect(badLimit.reason).toBe('INVALID_LIMIT');

    const badName = await issueApiKey(admin, { name: '   ', scopes: [], rateLimit: 60 }, null);
    expect(badName.ok).toBe(false);
    if (!badName.ok) expect(badName.reason).toBe('INVALID_NAME');
  });

  /** **والمسحوبُ لا يُعدَّل** — تغييرُ حدٍّ على مفتاحٍ ميّت وهم. */
  it('ولا يعدل مسحوب', async () => {
    const issued = await issueApiKey(
      admin,
      { name: `${MADE} — تعديل`, scopes: [], rateLimit: 60 },
      null,
    );
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const renamed = await updateApiKey(
      admin,
      issued.key.id,
      { name: `${MADE} — مسمى`, rateLimit: 120, scopes: ['read:dealers'] },
      null,
    );
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.key.rateLimit).toBe(120);
      expect(renamed.key.scopes).toEqual(['read:dealers']);
    }

    await revokeApiKey(admin, issued.key.id, null);
    const dead = await updateApiKey(admin, issued.key.id, { rateLimit: 10 }, null);
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.reason).toBe('REVOKED');
  });
});
