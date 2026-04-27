import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd();
const RECIPES_JSON_PATH = path.join(ROOT, 'frontend/public/weight-loss-reset-recipes.json');
const IMAGE_ROOT = path.join(ROOT, 'frontend/public/Food Images/Food Images');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(ROOT, '.env'));
loadEnvFile(path.resolve(ROOT, 'backend', '.env'));

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BUCKET = String(process.env.WEIGHT_LOSS_RESET_IMAGE_BUCKET || 'weight-loss-reset-images').trim();
const CONCURRENCY = Math.min(16, Math.max(1, Number(process.env.WEIGHT_LOSS_RESET_UPLOAD_CONCURRENCY || 8)));
const MAX_WIDTH = Math.min(1800, Math.max(640, Number(process.env.WEIGHT_LOSS_RESET_IMAGE_MAX_WIDTH || 1080)));
const WEBP_QUALITY = Math.min(90, Math.max(45, Number(process.env.WEIGHT_LOSS_RESET_IMAGE_QUALITY || 62)));

const includeAllImages = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
const limitIndex = process.argv.findIndex((arg) => arg === '--limit');
const uploadLimit =
  limitIndex >= 0 && process.argv[limitIndex + 1] ? Math.max(1, Number(process.argv[limitIndex + 1]) || 0) : 0;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!BUCKET) {
  throw new Error('Missing WEIGHT_LOSS_RESET_IMAGE_BUCKET');
}

function canonicalSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function encodePathForUrl(inputPath) {
  return inputPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function isImageFile(fileName) {
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

function toPublicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodePathForUrl(objectPath)}`;
}

function hashSuffix(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
}

async function listImageFilesRecursive(dirPath) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listImageFilesRecursive(absolute);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && isImageFile(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function parseRecipePayload(raw) {
  const parsed = JSON.parse(raw || '{}');
  const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
  return {
    payload: parsed,
    recipes,
  };
}

function localImagePathFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (/^https?:\/\//i.test(url)) return '';
  const cleaned = url.replace(/^\//, '');
  if (!cleaned) return '';
  const decoded = decodeURIComponent(cleaned);
  return path.join(ROOT, 'frontend/public', decoded);
}

function toUploadRecord(localPath) {
  const relative = path.relative(IMAGE_ROOT, localPath).replace(/\\/g, '/');
  const parsed = path.parse(relative);
  const slug = canonicalSlug(parsed.name) || 'recipe-image';
  const hash = hashSuffix(relative.toLowerCase());
  const objectPath = `recipes/${slug}-${hash}.webp`;
  return {
    localPath,
    relative,
    objectPath,
  };
}

async function storageRequest(endpoint, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/${endpoint}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers,
    },
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = contentType.includes('application/json') ? JSON.parse(text) : text;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Storage request failed (${response.status}) for ${endpoint}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function ensurePublicBucket() {
  const buckets = await storageRequest('bucket');
  const existing = Array.isArray(buckets) ? buckets.find((bucket) => bucket?.name === BUCKET || bucket?.id === BUCKET) : null;
  if (existing) return;
  await storageRequest('bucket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
    }),
  });
}

async function compressImageToWebp(localPath) {
  const inputBuffer = await fs.promises.readFile(localPath);
  const basePipeline = sharp(inputBuffer, { failOn: 'none', animated: false }).rotate();
  const metadata = await basePipeline.metadata();
  const pipeline =
    metadata.width && metadata.width > MAX_WIDTH
      ? basePipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true })
      : basePipeline;
  const compressedBuffer = await pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer();

  return {
    originalBytes: inputBuffer.length,
    compressedBytes: compressedBuffer.length,
    buffer: compressedBuffer,
  };
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let index = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const itemIndex = index;
      index += 1;
      results[itemIndex] = await worker(items[itemIndex], itemIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  if (!fs.existsSync(RECIPES_JSON_PATH)) {
    throw new Error(`Recipes JSON not found at ${RECIPES_JSON_PATH}`);
  }
  if (!fs.existsSync(IMAGE_ROOT)) {
    throw new Error(`Image directory not found at ${IMAGE_ROOT}`);
  }

  const rawPayload = await fs.promises.readFile(RECIPES_JSON_PATH, 'utf8');
  const { payload, recipes } = parseRecipePayload(rawPayload);

  const localImagePaths = new Set();
  if (includeAllImages) {
    const allImageFiles = await listImageFilesRecursive(IMAGE_ROOT);
    for (const filePath of allImageFiles) {
      localImagePaths.add(filePath);
    }
  } else {
    for (const recipe of recipes) {
      const localPath = localImagePathFromPublicUrl(recipe?.imageUrl);
      if (!localPath) continue;
      localImagePaths.add(localPath);
    }
  }

  let uploadRecords = Array.from(localImagePaths)
    .filter((filePath) => fs.existsSync(filePath))
    .map(toUploadRecord);

  if (uploadLimit > 0) {
    uploadRecords = uploadRecords.slice(0, uploadLimit);
  }

  if (uploadRecords.length === 0) {
    console.log('No local recipe images found to upload.');
    return;
  }

  if (!dryRun) {
    await ensurePublicBucket();
  }

  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;

  const uploaded = await runWithConcurrency(
    uploadRecords,
    async (record, index) => {
      const compressed = await compressImageToWebp(record.localPath);
      totalOriginalBytes += compressed.originalBytes;
      totalCompressedBytes += compressed.compressedBytes;

      if (!dryRun) {
        await storageRequest(`object/${encodeURIComponent(BUCKET)}/${encodePathForUrl(record.objectPath)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'image/webp',
            'x-upsert': 'true',
          },
          body: compressed.buffer,
        });
      }

      if ((index + 1) % 100 === 0 || index === uploadRecords.length - 1) {
        console.log(`Processed ${index + 1}/${uploadRecords.length} images`);
      }

      return {
        ...record,
        publicUrl: toPublicUrl(record.objectPath),
      };
    },
    CONCURRENCY
  );

  const uploadedByLocalPath = new Map(uploaded.map((entry) => [entry.localPath, entry.publicUrl]));

  if (!includeAllImages) {
    for (const recipe of recipes) {
      const localPath = localImagePathFromPublicUrl(recipe?.imageUrl);
      if (!localPath) continue;
      const remoteUrl = uploadedByLocalPath.get(localPath);
      if (remoteUrl) {
        recipe.imageUrl = remoteUrl;
      }
    }
  }

  if (!dryRun && !includeAllImages) {
    payload.generatedAt = new Date().toISOString();
    payload.imageStorage = {
      provider: 'supabase',
      bucket: BUCKET,
      compressedFormat: 'webp',
      maxWidth: MAX_WIDTH,
      quality: WEBP_QUALITY,
      uploadedImages: uploadRecords.length,
    };
    await fs.promises.writeFile(RECIPES_JSON_PATH, JSON.stringify(payload), 'utf8');
  }

  const compressionRatio = totalOriginalBytes > 0 ? totalCompressedBytes / totalOriginalBytes : 1;
  console.log(
    JSON.stringify(
      {
        mode: includeAllImages ? 'all-images' : 'recipes-only',
        dryRun,
        bucket: BUCKET,
        uploadedImages: uploadRecords.length,
        totalOriginalBytes,
        totalCompressedBytes,
        compressionRatio: Number(compressionRatio.toFixed(4)),
        recipesJsonUpdated: !dryRun && !includeAllImages,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
