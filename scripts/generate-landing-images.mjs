import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const API_URL = 'https://api.openai.com/v1/images/generations';
const ROOT_DIR = process.cwd();

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const envText = fsSync.readFileSync(filePath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
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

function parseCliArgs(argv) {
  const args = {
    dryRun: false,
    only: '',
  };

  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    if (raw.startsWith('--only=')) args.only = raw.slice('--only='.length).trim();
  }

  return args;
}

function toSafeFilename(value) {
  return String(value).replace(/[^a-z0-9-]/gi, '-');
}

const landingImageJobs = [
  {
    key: 'work',
    outputFile: 'frontend/public/landing-work-certificate.png',
    prompt:
      'Hyper-realistic photo of an Australian adult at home on a laptop completing an online medical certificate request while mildly unwell, clean modern interior, smartphone and laptop visible, subtle healthcare context, calm trustworthy telehealth mood, natural daylight, professional documentary style, detailed skin texture, realistic hands, no logos, no watermark.',
  },
  {
    key: 'university',
    outputFile: 'frontend/public/landing-university-certificate.png',
    prompt:
      'Hyper-realistic photo of a university student in Australia at a desk using laptop and phone to request a medical certificate online, notebooks and assessment papers nearby, mild fatigue expression, tidy student apartment, natural window light, modern telehealth brand style, realistic details, no logos, no watermark.',
  },
  {
    key: 'carers-leave',
    outputFile: 'frontend/public/landing-carers-certificate.png',
    prompt:
      'Hyper-realistic photo of an Australian carer at home completing a telehealth leave request on a smartphone while supporting an older family member in the background, compassionate but calm moment, modern home interior, trustworthy healthcare visual style, realistic skin and hands, no logos, no watermark.',
  },
];

async function generateImage({
  apiKey,
  models,
  size,
  quality,
  outputFormat,
  outputCompression,
  job,
}) {
  let lastError = null;
  for (const model of models) {
    const payload = {
      model,
      prompt: job.prompt,
      size,
      quality,
      output_format: outputFormat,
      n: 1,
    };

    if (outputFormat === 'jpeg' || outputFormat === 'webp') {
      payload.output_compression = outputCompression;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = responseBody?.error?.message || JSON.stringify(responseBody);
      lastError = new Error(`Image generation failed (${job.key}, model ${model}): ${detail}`);
      continue;
    }

    const item = responseBody?.data?.[0] || null;
    if (!item) {
      lastError = new Error(`Image generation failed (${job.key}, model ${model}): missing image payload`);
      continue;
    }

    if (item.b64_json) {
      return { buffer: Buffer.from(item.b64_json, 'base64'), model };
    }

    if (item.url) {
      const imageRes = await fetch(item.url);
      if (!imageRes.ok) {
        lastError = new Error(
          `Image download failed (${job.key}, model ${model}): ${imageRes.status} ${imageRes.statusText}`
        );
        continue;
      }
      const arr = await imageRes.arrayBuffer();
      return { buffer: Buffer.from(arr), model };
    }

    lastError = new Error(`Image generation failed (${job.key}, model ${model}): no image payload`);
  }

  throw lastError || new Error(`Image generation failed (${job.key})`);
}

async function main() {
  loadEnvFile(path.resolve(ROOT_DIR, '.env'));
  loadEnvFile(path.resolve(ROOT_DIR, 'backend', '.env'));

  const { dryRun, only } = parseCliArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY || '';
  const preferredModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
  const models = [...new Set([preferredModel, 'gpt-image-1'])];
  const size = process.env.OPENAI_IMAGE_SIZE || '1536x1024';
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';
  const outputFormat = process.env.OPENAI_IMAGE_OUTPUT_FORMAT || 'png';
  const outputCompression = Number(process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 90);

  if (!dryRun && !apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Add it to your .env file before running this script.');
  }

  let jobs = landingImageJobs;
  if (only) {
    const wanted = new Set(
      only
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    jobs = jobs.filter((job) => wanted.has(job.key));
    if (jobs.length === 0) {
      throw new Error(`No landing image jobs matched --only=${toSafeFilename(only)}`);
    }
  }

  console.log('Generating landing images with OpenAI...');
  console.log(`Models: ${models.join(' -> ')} | Size: ${size} | Quality: ${quality} | Format: ${outputFormat}`);

  for (const job of jobs) {
    const absPath = path.resolve(ROOT_DIR, job.outputFile);
    await fs.mkdir(path.dirname(absPath), { recursive: true });

    if (dryRun) {
      console.log(`[dry-run] ${job.key} -> ${job.outputFile}`);
      continue;
    }

    const { buffer, model } = await generateImage({
      apiKey,
      models,
      size,
      quality,
      outputFormat,
      outputCompression,
      job,
    });

    await fs.writeFile(absPath, buffer);
    console.log(`[ok] ${job.key} -> ${job.outputFile} (${model})`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
