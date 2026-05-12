#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'frontend', 'public', 'meal-fallbacks');
const ENV_PATH = path.join(ROOT, '.env.vercel');
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

function readEnvFile(filepath) {
  return fs.readFile(filepath, 'utf8').then((text) => {
    const env = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = String(rawLine || '').trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      env[key] = value;
    }
    return env;
  });
}

function buildPrompt(mealType, variantLabel) {
  const baseStyle =
    'Premium photorealistic food photography, natural daylight, ceramic plate or bowl, appetizing, no text, no logos, no people, no hands, clean composition.';
  if (mealType === 'breakfast') {
    return `${baseStyle} Breakfast meal concept: ${variantLabel}.`;
  }
  if (mealType === 'lunch') {
    return `${baseStyle} Lunch meal concept: ${variantLabel}.`;
  }
  if (mealType === 'dinner') {
    return `${baseStyle} Dinner meal concept: ${variantLabel}.`;
  }
  return `${baseStyle} Healthy snack concept: ${variantLabel}.`;
}

async function generateOne({ apiKey, model, quality, size, compression, mealType, variantLabel, outputPath }) {
  const response = await fetch(OPENAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: buildPrompt(mealType, variantLabel),
      n: 1,
      size,
      quality,
      output_format: 'webp',
      output_compression: compression,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || JSON.stringify(payload);
    throw new Error(`Image generation failed (${response.status}) for ${mealType}/${variantLabel}: ${detail}`);
  }

  const image = payload?.data?.[0] || null;
  const base64 = String(image?.b64_json || '').trim();
  if (!base64) {
    throw new Error(`No b64_json returned for ${mealType}/${variantLabel}`);
  }

  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(outputPath, buffer);
}

async function withConcurrency(items, limit, mapper) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      await mapper(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const env = await readEnvFile(ENV_PATH);
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing in .env.vercel');

  const model = String(env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini').trim() || 'gpt-image-1-mini';
  const quality = String(env.OPENAI_IMAGE_QUALITY || 'low').trim() || 'low';
  const size = String(env.OPENAI_IMAGE_SIZE || '1024x1024').trim() || '1024x1024';
  const compression = Math.max(1, Math.min(100, Number(env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 65)));

  const variants = {
    breakfast: ['high-protein egg bowl', 'berry chia yogurt parfait', 'savory avocado toast plate', 'oats fruit protein bowl'],
    lunch: ['grilled chicken salad bowl', 'tuna quinoa herb bowl', 'turkey basil rice bowl', 'chickpea lentil rainbow salad'],
    dinner: ['salmon vegetables plate', 'lean turkey meatball bowl', 'stir-fry tofu vegetables bowl', 'roasted chicken quinoa plate'],
    snack: ['greek yogurt berries cup', 'nuts fruit snack plate', 'hummus veggie snack board', 'protein smoothie bowl'],
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const jobs = [];
  for (const [mealType, labels] of Object.entries(variants)) {
    labels.forEach((variantLabel, index) => {
      jobs.push({
        mealType,
        variantLabel,
        outputPath: path.join(OUTPUT_DIR, `${mealType}-${index + 1}.webp`),
      });
    });
  }

  console.log(`Generating ${jobs.length} fallback meal images with ${model}...`);
  await withConcurrency(jobs, 2, async (job, index) => {
    console.log(`- ${job.mealType}: ${job.variantLabel}`);
    await generateOne({
      apiKey,
      model,
      quality,
      size,
      compression,
      mealType: job.mealType,
      variantLabel: job.variantLabel,
      outputPath: job.outputPath,
    });
  });
  console.log(`Done. Images saved to ${OUTPUT_DIR}`);
}

main().catch((errorObject) => {
  console.error(errorObject?.message || String(errorObject));
  process.exit(1);
});
