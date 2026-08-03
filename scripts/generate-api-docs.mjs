#!/usr/bin/env node
/**
 * ═══ توليد ERD وOpenAPI — والمكتوب بيدٍ ينحرف أوّل ترحيل ═══
 *
 * مخطّطٌ يُرسم يدويًّا يصف الشجرة **يوم رُسم**، ثم يبقى على وصفه بينما
 * تتغيّر. فيُقرأ سنةً كاملة وهو يكذب، ولا يُكتشف كذبه إلا حين يبني أحدهم
 * عليه.
 *
 * ولذلك التوليد **جزء من الفحص**: `--check` تُسقط البناء إن اختلف
 * المولَّد عن المحفوظ، فترحيلٌ بلا تحديث المخطّط لا يمرّ.
 *
 * ═══ وما لا يُقرأ يُعلَن ═══
 *
 * مولّدٌ يتخطّى بصمتٍ ما لا يفهمه يُنتج وثيقةً تدّعي اكتمالًا ليس فيها.
 * فكل مسارٍ يتعذّر تحليل مخطّطه يظهر في `unparsed` ويُسقط `--check`.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const ERD_OUT = join(ROOT, 'docs', 'architecture', 'erd.md');
const API_OUT = join(ROOT, 'docs', 'api', 'openapi.json');

// ═══════════════════════ ERD ═══════════════════════

/** يقرأ النماذج وعلاقاتها من `schema.prisma` — المصدر الوحيد. */
function parseModels(source) {
  const models = [];
  const blocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, name, body] of blocks) {
    const fields = [];
    const relations = [];

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('//') || line.startsWith('///') || line.startsWith('@@')) {
        continue;
      }
      const match = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (match === null) continue;

      const [, field, type, list, optional] = match;
      const isRelation = /^[A-Z]/.test(type) && !PRIMITIVES.has(type);

      if (isRelation) {
        relations.push({ field, target: type, many: list === '[]', optional: optional === '?' });
      } else {
        fields.push({
          field,
          type: type + (list ?? '') + (optional ?? ''),
          id: line.includes('@id'),
          unique: line.includes('@unique'),
        });
      }
    }
    models.push({ name, fields, relations });
  }
  return models;
}

const PRIMITIVES = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Decimal', 'Json', 'Bytes', 'BigInt']);

function renderErd(models, enums) {
  const lines = [];
  lines.push('# Entity relationship diagram');
  lines.push('');
  lines.push('> **Generated from `prisma/schema.prisma` — do not edit by hand.**');
  lines.push('> Run `npm run docs:generate`. `npm run verify` fails if this file is stale,');
  lines.push('> because a diagram drawn by hand describes the tree on the day it was drawn.');
  lines.push('');
  lines.push(`${models.length} models · ${enums.length} enums`);
  lines.push('');

  // ═══ المخطّط ═══ العلاقات وحدها: ٦٧ نموذجًا بكل حقولها لا يُقرأ
  lines.push('## Relationships');
  lines.push('');
  lines.push('```mermaid');
  lines.push('erDiagram');
  const seen = new Set();
  for (const model of models) {
    for (const rel of model.relations) {
      const key = [model.name, rel.target].sort().join('|') + rel.field;
      if (seen.has(key)) continue;
      seen.add(key);
      const cardinality = rel.many ? '||--o{' : rel.optional ? '|o--||' : '}o--||';
      lines.push(`  ${model.name} ${cardinality} ${rel.target} : "${rel.field}"`);
    }
  }
  lines.push('```');
  lines.push('');

  lines.push('## Models');
  lines.push('');
  for (const model of models) {
    lines.push(`### \`${model.name}\``);
    lines.push('');
    lines.push('| Field | Type | Key |');
    lines.push('|---|---|---|');
    for (const field of model.fields) {
      const key = field.id ? 'PK' : field.unique ? 'unique' : '';
      lines.push(`| \`${field.field}\` | \`${field.type}\` | ${key} |`);
    }
    if (model.relations.length > 0) {
      lines.push('');
      lines.push(
        'Relations: ' +
          model.relations.map((rel) => `\`${rel.field}\` → \`${rel.target}\``).join(' · '),
      );
    }
    lines.push('');
  }

  lines.push('## Enums');
  lines.push('');
  for (const item of enums) {
    lines.push(`- \`${item.name}\` — ${item.values.map((v) => `\`${v}\``).join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function parseEnums(source) {
  const enums = [];
  for (const [, name, body] of source.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const values = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('///'));
    enums.push({ name, values });
  }
  return enums;
}

// ═══════════════════════ OpenAPI ═══════════════════════

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

/** مسار الملف ⇒ مسار الـHTTP، و`[id]` ⇒ `{id}`. */
function routePath(file) {
  const rel = relative(join(ROOT, 'src', 'app'), file).split(sep).slice(0, -1);
  return '/' + rel.map((part) => part.replace(/^\[(?:\.\.\.)?(\w+)\]$/, '{$1}')).join('/');
}

/**
 * تحويل حقلٍ من Zod إلى JSON Schema.
 *
 * ويغطّي الأنماط المستعملة في الشجرة وحدها. وما خرج عنها **يُعلَن ولا
 * يُتخطّى**: العائد `null` يُدرج المسار في `unparsed`.
 */
function zodField(expr) {
  const optional = /\.optional\(\)/.test(expr);
  const nullable = /\.nullable\(\)/.test(expr);
  const wrap = (schema) => ({ ...schema, ...(nullable ? { nullable: true } : {}) , __optional: optional });

  if (/^z\.string\(/.test(expr)) {
    const max = expr.match(/\.max\((\d+)\)/);
    const min = expr.match(/\.min\((\d+)\)/);
    return wrap({
      type: 'string',
      ...(min ? { minLength: Number(min[1]) } : {}),
      ...(max ? { maxLength: Number(max[1]) } : {}),
    });
  }
  if (/^z\.number\(/.test(expr)) {
    const min = expr.match(/\.min\(([\d_]+)\)/);
    const max = expr.match(/\.max\(([\d_]+)\)/);
    return wrap({
      type: /\.int\(\)/.test(expr) ? 'integer' : 'number',
      ...(min ? { minimum: Number(min[1].replace(/_/g, '')) } : {}),
      ...(max ? { maximum: Number(max[1].replace(/_/g, '')) } : {}),
    });
  }
  if (/^z\.boolean\(/.test(expr)) return wrap({ type: 'boolean' });
  if (/^z\.enum\(/.test(expr)) {
    const inner = expr.match(/z\.enum\(\[([^\]]*)\]/);
    const values = inner === null ? [] : [...inner[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return wrap({ type: 'string', enum: values });
  }
  if (/^z\.array\(/.test(expr)) return wrap({ type: 'array', items: { type: 'string' } });
  if (/^z\.literal\(/.test(expr)) {
    const value = expr.match(/z\.literal\('([^']*)'\)/);
    return wrap({ type: 'string', enum: value === null ? [] : [value[1]] });
  }
  if (/^z\.record\(/.test(expr)) return wrap({ type: 'object' });
  return null;
}

/** يقسم جسم `z.object({...})` إلى أزواج، محترمًا الأقواس المتداخلة. */
function splitFields(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

/**
 * ثوابت المخطّطات المحلّية — `const BODY_TYPE = z.enum([...])`.
 *
 * وحقلٌ يشير إليها ليس نمطًا غير مدعوم بل **اسمًا يُحَلّ**. وبلا الحلّ
 * يظهر المسار في `unparsed` وهو مفهومٌ تمامًا — وإنذارٌ كاذب يُفقد
 * القائمة معناها.
 */
function localSchemas(source) {
  const table = new Map();
  for (const [, name, expr] of source.matchAll(/^const ([A-Z][A-Z0-9_]*) = (z\.[^;]+);$/gm)) {
    table.set(name, expr.replace(/\s+/g, ' '));
  }
  return table;
}

function parseRoute(file) {
  const source = readFileSync(file, 'utf8');
  const locals = localSchemas(source);
  const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
    (m) => m[1].toLowerCase(),
  );
  if (methods.length === 0) return null;

  const guard = source.includes('requireAdmin(')
    ? 'admin'
    : source.includes('currentUser(')
      ? 'user'
      : 'public';

  const permission = source.match(/requireAdmin\(request,\s*'([^']+)'/)?.[1] ?? null;

  let body = null;
  let unparsed = false;
  const schema = source.match(/const Body = z\.object\(\{([\s\S]*?)\n\}\);/);
  if (schema !== null) {
    const properties = {};
    const required = [];
    for (const chunk of splitFields(schema[1])) {
      const line = chunk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
      if (line === '') continue;
      const pair = line.match(/^(\w+):\s*([\s\S]+)$/);
      if (pair === null) {
        unparsed = true;
        continue;
      }
      const [, name, expr] = pair;
      // اسمٌ محلّيّ يُحَلّ إلى تعبيره، مع بقاء لواحقه (`.nullable()` …)
      const resolved = expr
        .trim()
        .replace(/^([A-Z][A-Z0-9_]*)/, (match) => locals.get(match) ?? match);
      const parsed = zodField(resolved);
      if (parsed === null) {
        unparsed = true;
        continue;
      }
      const { __optional, ...rest } = parsed;
      properties[name] = rest;
      if (!__optional) required.push(name);
    }
    body = { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
  }

  return { path: routePath(file), methods, guard, permission, body, unparsed };
}

function renderOpenApi(routes) {
  const paths = {};
  for (const route of routes) {
    paths[route.path] ??= {};
    for (const method of route.methods) {
      const parameters = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
        name: m[1],
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));

      paths[route.path][method] = {
        summary: `${method.toUpperCase()} ${route.path}`,
        tags: [route.path.split('/')[3] ?? 'root'],
        ...(route.guard === 'public' ? {} : { security: [{ [route.guard]: [] }] }),
        ...(route.permission === null ? {} : { 'x-permission': route.permission }),
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(route.body === null || method === 'get'
          ? {}
          : {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: route.body } },
              },
            }),
        responses: {
          200: { description: 'OK' },
          401: { description: 'Unauthorized' },
          422: { description: 'Validation failed' },
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CarSell API',
      version: '1.0.0',
      description:
        'Generated from the route tree and the Zod schemas in each route. Do not edit by hand — run `npm run docs:generate`.',
    },
    servers: [{ url: 'https://carsell.one' }],
    components: {
      securitySchemes: {
        user: { type: 'apiKey', in: 'cookie', name: 'carsell_session' },
        admin: { type: 'apiKey', in: 'cookie', name: 'carsell_admin' },
      },
    },
    paths,
  };
}

// ═══════════════════════ مخطّطات الحالات ═══════════════════════

/**
 * ═══ الحالة المرسومة تُطابق التعداد ═══
 *
 * والمخطّط يُكتب بيد (الانتقالات في الكود لا في المخطّط)، فيسهل أن
 * يُسمّى فيه حالٌ لا وجود لها — وقد وقع: رُسمت `UNDER_REVIEW` و
 * `RESOLVED_SPLIT` و`ENDED`/`WON`/`UNSOLD` ولا شيء منها في المخطّط.
 *
 * **ووثيقةٌ تسمّي حالًا غير قائمة أسوأ من غياب الوثيقة**: من يقرؤها
 * يبني عليها. فكل اسمٍ في `stateDiagram-v2` يُقابَل بتعدادات المخطّط.
 */
function checkStateDiagrams(enums) {
  const file = join(ROOT, 'docs', 'workflows', 'state-machines.md');
  let source = '';
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const known = new Set();
  for (const item of enums) for (const value of item.values) known.add(value);

  const unknown = new Set();
  for (const [, body] of source.matchAll(/```mermaid\n(stateDiagram-v2[\s\S]*?)```/g)) {
    for (const line of body.split('\n')) {
      const code = line.split(':')[0];
      // أسماءٌ بصيغة التعدادات وحدها — والبقية نصٌّ وصفيّ
      for (const [, name] of code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
        if (!known.has(name)) unknown.add(name);
      }
    }
  }
  return [...unknown];
}

// ═══════════════════════ التشغيل ═══════════════════════

const source = readFileSync(SCHEMA, 'utf8');
const models = parseModels(source);
const enums = parseEnums(source);
const erd = renderErd(models, enums);

const routes = walk(join(ROOT, 'src', 'app', 'api')).map(parseRoute).filter(Boolean);
routes.sort((a, b) => a.path.localeCompare(b.path));
const openapi = JSON.stringify(renderOpenApi(routes), null, 2) + '\n';

const unparsed = routes.filter((route) => route.unparsed).map((route) => route.path);
const ghostStates = checkStateDiagrams(enums);
const check = process.argv.includes('--check');

if (check) {
  let stale = false;
  for (const [path, next] of [[ERD_OUT, erd], [API_OUT, openapi]]) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = '';
    }
    if (current !== next) {
      console.error(`✗ ${relative(ROOT, path)} قديم — شغّل npm run docs:generate`);
      stale = true;
    }
  }
  if (unparsed.length > 0) {
    console.error('✗ مسارات تعذّر تحليل مخطّطها — والمولّد لا يتخطّى بصمت:');
    for (const path of unparsed) console.error(`  ${path}`);
    stale = true;
  }
  if (ghostStates.length > 0) {
    console.error('✗ حالات في state-machines.md لا وجود لها في المخطّط:');
    for (const name of ghostStates) console.error(`  ${name}`);
    stale = true;
  }
  if (stale) process.exit(1);
  console.log(
    `✓ التوثيق المولَّد محدَّث — ${String(models.length)} نموذجًا · ${String(routes.length)} مسارًا`,
  );
} else {
  mkdirSync(join(ROOT, 'docs', 'architecture'), { recursive: true });
  writeFileSync(ERD_OUT, erd);
  writeFileSync(API_OUT, openapi);
  console.log(`✓ ${String(models.length)} نموذجًا · ${String(enums.length)} تعدادًا → docs/architecture/erd.md`);
  console.log(`✓ ${String(routes.length)} مسارًا → docs/api/openapi.json`);
  if (unparsed.length > 0) {
    console.log('⚠ مسارات تعذّر تحليل مخطّطها:');
    for (const path of unparsed) console.log(`  ${path}`);
  }
  if (ghostStates.length > 0) {
    console.log('⚠ حالات مرسومة لا وجود لها في المخطّط:');
    for (const name of ghostStates) console.log(`  ${name}`);
  }
}
