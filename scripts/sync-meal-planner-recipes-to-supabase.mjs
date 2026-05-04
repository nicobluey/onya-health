#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RECIPES_JSON_PATH = path.join(ROOT, 'frontend', 'public', 'weight-loss-reset-recipes.json');
const TABLE = 'meal_planner_recipes';
const BATCH_SIZE = 200;
const RESET_BEFORE_SYNC = process.argv.includes('--reset');

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const text = fsSync.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(ROOT, '.env'));
loadEnvFile(path.resolve(ROOT, 'backend', '.env'));

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

async function restRequest(endpoint, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (prefer) headers.Prefer = prefer;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Supabase REST request failed (${response.status}) for ${endpoint}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function toRow(recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description || null,
    image_url: recipe.imageUrl || null,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    calories: Number.isFinite(recipe.calories) ? recipe.calories : null,
    protein: Number.isFinite(recipe.protein) ? recipe.protein : null,
    carbs: Number.isFinite(recipe.carbs) ? recipe.carbs : null,
    fat: Number.isFinite(recipe.fat) ? recipe.fat : null,
    meal_type: recipe.mealType || 'lunch',
    dietary_tags: Array.isArray(recipe.dietaryTags) ? recipe.dietaryTags : [],
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    prep_time_minutes: Number.isFinite(recipe.prepTimeMinutes) ? recipe.prepTimeMinutes : null,
    estimated_cost: recipe.estimatedCost || null,
    source: recipe.source || {},
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const raw = await fs.readFile(RECIPES_JSON_PATH, 'utf8');
  const payload = JSON.parse(raw || '{}');
  const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
  if (recipes.length === 0) {
    throw new Error(`No recipes found in ${RECIPES_JSON_PATH}`);
  }

  // Verify the table exists first so failures are explicit.
  try {
    await restRequest(`${TABLE}?select=id&limit=1`);
  } catch (error) {
    throw new Error(
      `${error.message}\n\nRun migration supabase/migrations/20260504_create_meal_planner_recipes.sql in Supabase first, then retry.`,
    );
  }

  if (RESET_BEFORE_SYNC) {
    await restRequest(`${TABLE}?id=neq.__no_rows__`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  }

  const rows = recipes.map(toRow);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await restRequest(`${TABLE}?on_conflict=id`, {
      method: 'POST',
      body: batch,
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }

  console.log(
    JSON.stringify(
      {
        table: TABLE,
        recipeCount: rows.length,
        resetBeforeSync: RESET_BEFORE_SYNC,
        syncedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});

