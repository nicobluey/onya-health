#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(ROOT, '.env'));
loadEnvFile(path.resolve(ROOT, '.env.vercel'));
loadEnvFile(path.resolve(ROOT, 'backend', '.env'));

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
).trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();

const IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini').trim();
const IMAGE_QUALITY = String(process.env.OPENAI_IMAGE_QUALITY || 'low').trim();
const IMAGE_SIZE = String(process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim();
const IMAGE_COMPRESSION = Math.max(1, Math.min(100, Number(process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 70)));
const BUCKET = String(process.env.MEAL_RECIPE_IMAGE_BUCKET || process.env.WEIGHT_LOSS_IMAGE_BUCKET || 'weight-loss-reset-images').trim();
const TABLE = 'meal_planner_recipes';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGE_TIMEOUT_MS = Math.max(5_000, Number(process.env.OPENAI_MEAL_IMAGE_TIMEOUT_MS || 25_000));
const NETWORK_TIMEOUT_MS = Math.max(5_000, Number(process.env.BACKFILL_NETWORK_TIMEOUT_MS || 25_000));

function parseArgs(argv) {
  const args = {
    backfill: false,
    limit: 0,
    concurrency: 2,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--backfill') {
      args.backfill = true;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--limit') {
      args.limit = Math.max(0, Math.floor(Number(argv[index + 1] || 0)));
      index += 1;
      continue;
    }
    if (token === '--concurrency') {
      args.concurrency = Math.max(1, Math.min(8, Math.floor(Number(argv[index + 1] || 2))));
      index += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log([
        'Usage:',
        '  node scripts/backfill-generated-recipe-images.mjs                 # stats only',
        '  node scripts/backfill-generated-recipe-images.mjs --backfill      # generate + upload missing images',
        '  node scripts/backfill-generated-recipe-images.mjs --backfill --limit 50 --concurrency 3',
      ].join('\n'));
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function assertConfig({ requireOpenAi = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (requireOpenAi && !OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY (required for --backfill)');
  }
}

async function restRequest(endpoint, { method = 'GET', body, prefer = 'return=representation' } = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: prefer,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, NETWORK_TIMEOUT_MS);

  const text = await response.text();
  const payload = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })() : null;

  if (!response.ok) {
    throw new Error(`Supabase REST request failed (${response.status}) for ${endpoint}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function resolveRowImageUrl(row = {}) {
  const source = row?.source && typeof row.source === 'object' && !Array.isArray(row.source) ? row.source : {};
  const top = String(row?.image_url || '').trim();
  const sourceImage = String(source.image_url || source.imageUrl || '').trim();
  return top || sourceImage || '';
}

function isConcreteImage(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return /^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(value);
}

function parseSupportedDataImageUri(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const match = candidate.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const mime = String(match[1] || '').trim().toLowerCase();
  const extensionByMime = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  const extension = extensionByMime[mime];
  if (!extension) return null;
  const body = String(match[2] || '').replace(/\s+/g, '');
  if (!body) return null;
  return { mime, extension, body };
}

function normalizeStoragePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.replace(/^\/+/, '');
}

function buildPublicStorageUrl(objectPath) {
  const normalized = normalizeStoragePath(objectPath);
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const encodedBucket = encodeURIComponent(BUCKET);
  const encodedPath = normalized
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

async function uploadBufferToStorage({ objectPath, buffer, contentType }) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${objectPath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    },
    NETWORK_TIMEOUT_MS,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Storage upload failed (${response.status}): ${text || ''}`.trim());
  }
}

function buildImagePrompt(row = {}) {
  const title = String(row?.title || 'meal').trim();
  const description = String(row?.description || '').trim();
  const ingredients = Array.isArray(row?.ingredients)
    ? row.ingredients
        .map((entry) => String(entry?.name || '').trim())
        .filter(Boolean)
        .slice(0, 7)
        .join(', ')
    : '';

  return [
    `Photorealistic plated food image of "${title}".`,
    description ? `Context: ${description}.` : '',
    ingredients ? `Use visible ingredients consistent with: ${ingredients}.` : '',
    'Accurate food depiction matching the meal title and ingredients.',
    'Natural daylight, clean bowl/plate, shallow depth of field, appetizing but realistic.',
    'No text, no logos, no watermarks, no packaging, no people, no hands.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function generateOpenAiImageBuffer(row) {
  const prompt = buildImagePrompt(row);

  const createBody = (withCompression) => {
    const body = {
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      output_format: 'webp',
    };
    if (withCompression) {
      body.output_compression = IMAGE_COMPRESSION;
    }
    return body;
  };

  const requestImage = async (withCompression) => {
    const response = await fetchWithTimeout(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody(withCompression)),
    }, OPENAI_IMAGE_TIMEOUT_MS);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || JSON.stringify(payload);
      const error = new Error(`OpenAI image generation failed (${response.status}): ${message}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  let payload;
  try {
    payload = await requestImage(true);
  } catch (errorObject) {
    const message = String(errorObject?.message || '').toLowerCase();
    if (message.includes('output_compression') || message.includes('unsupported') || message.includes('invalid parameter')) {
      payload = await requestImage(false);
    } else {
      throw errorObject;
    }
  }

  const image = payload?.data?.[0] || null;
  if (image?.b64_json) {
    return {
      buffer: Buffer.from(image.b64_json, 'base64'),
      contentType: 'image/webp',
    };
  }

  if (image?.url) {
    const response = await fetchWithTimeout(image.url, {}, NETWORK_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`OpenAI image download failed (${response.status})`);
    }
    const contentType = String(response.headers.get('content-type') || 'image/webp').split(';')[0].trim().toLowerCase();
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: contentType || 'image/webp',
    };
  }

  throw new Error('OpenAI image generation returned no image payload');
}

function sanitizeRecipeIdForPath(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return normalized || 'recipe';
}

async function patchRecipeImage(row, imageUrl) {
  const source = row?.source && typeof row.source === 'object' && !Array.isArray(row.source) ? { ...row.source } : {};
  source.image_url = imageUrl;
  source.imageUrl = imageUrl;

  await restRequest(`${TABLE}?id=eq.${encodeURIComponent(String(row.id))}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      image_url: imageUrl,
      source,
      updated_at: new Date().toISOString(),
    },
  });
}

async function listAllRecipes() {
  return restRequest(
    `${TABLE}?select=id,title,description,ingredients,image_url,source,generated_by,is_active,updated_at&order=updated_at.desc&limit=2000`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
}

async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const output = new Array(items.length);
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(items[index], index);
      }
    })
  );
  return output;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function ensureRecipeImageUrl(row) {
  const existing = resolveRowImageUrl(row);
  const parsedData = parseSupportedDataImageUri(existing);

  if (parsedData) {
    const buffer = Buffer.from(parsedData.body, 'base64');
    const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 14);
    const objectPath = `meal-planner/recipes/${sanitizeRecipeIdForPath(row.id)}-${hash}.${parsedData.extension}`;
    await uploadBufferToStorage({ objectPath, buffer, contentType: parsedData.mime });
    return buildPublicStorageUrl(objectPath);
  }

  if (/^https?:\/\//i.test(existing)) {
    return existing;
  }

  const generated = await generateOpenAiImageBuffer(row);
  const extension = String(generated.contentType || '').includes('png') ? 'png' : 'webp';
  const hash = createHash('sha1').update(generated.buffer).digest('hex').slice(0, 14);
  const objectPath = `meal-planner/recipes/${sanitizeRecipeIdForPath(row.id)}-${hash}.${extension}`;
  await uploadBufferToStorage({ objectPath, buffer: generated.buffer, contentType: generated.contentType || 'image/webp' });
  return buildPublicStorageUrl(objectPath);
}

function summarizeRows(rows) {
  const allRows = Array.isArray(rows) ? rows : [];
  const generatedRows = allRows.filter((row) => ['openai', 'rules'].includes(String(row?.generated_by || '').trim().toLowerCase()));
  const missing = allRows.filter((row) => !isConcreteImage(resolveRowImageUrl(row)));
  const generatedMissing = generatedRows.filter((row) => !isConcreteImage(resolveRowImageUrl(row)));
  const dataUriImages = generatedRows.filter((row) => /^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(resolveRowImageUrl(row)));

  return {
    total: allRows.length,
    generated: generatedRows.length,
    generatedOpenAi: generatedRows.filter((row) => String(row?.generated_by || '').trim().toLowerCase() === 'openai').length,
    generatedRules: generatedRows.filter((row) => String(row?.generated_by || '').trim().toLowerCase() === 'rules').length,
    missingImages: missing.length,
    generatedMissingImages: generatedMissing.length,
    generatedDataUriImages: dataUriImages.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertConfig({ requireOpenAi: args.backfill });

  const beforeRows = await listAllRecipes();
  const beforeSummary = summarizeRows(beforeRows);

  const eligible = beforeRows
    .filter((row) => row && typeof row === 'object')
    .filter((row) => ['openai', 'rules'].includes(String(row?.generated_by || '').trim().toLowerCase()))
    .filter((row) => Boolean(row?.is_active ?? true))
    .filter((row) => {
      const image = resolveRowImageUrl(row);
      if (!isConcreteImage(image)) return true;
      return /^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(image);
    });

  const backfillTargets = args.limit > 0 ? eligible.slice(0, args.limit) : eligible;

  const output = {
    mode: args.backfill ? 'backfill' : 'stats',
    dryRun: args.dryRun,
    limit: args.limit,
    concurrency: args.concurrency,
    before: beforeSummary,
    candidates: backfillTargets.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    failures: [],
    completedAt: null,
  };

  if (!args.backfill) {
    output.completedAt = new Date().toISOString();
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  await runWithConcurrency(backfillTargets, args.concurrency, async (row) => {
    output.processed += 1;
    try {
      const nextImageUrl = await ensureRecipeImageUrl(row);
      if (!nextImageUrl) {
        throw new Error('No image URL generated');
      }
      if (!args.dryRun) {
        await patchRecipeImage(row, nextImageUrl);
      }
      output.succeeded += 1;
    } catch (errorObject) {
      output.failed += 1;
      output.failures.push({
        recipeId: String(row?.id || ''),
        title: String(row?.title || ''),
        message: errorObject?.message || String(errorObject),
      });
    }
    if (output.processed % 10 === 0 || output.processed === backfillTargets.length) {
      console.error(
        `[backfill] ${output.processed}/${backfillTargets.length} processed · ${output.succeeded} ok · ${output.failed} failed`
      );
    }
  });

  const afterRows = await listAllRecipes();
  output.after = summarizeRows(afterRows);
  output.completedAt = new Date().toISOString();
  console.log(JSON.stringify(output, null, 2));
}

main().catch((errorObject) => {
  console.error(errorObject?.message || String(errorObject));
  process.exit(1);
});
