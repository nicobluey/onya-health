#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'data', 'dietitians-australia-recipes', 'recipes.json');
const OUTPUT_PATH = path.join(ROOT, 'frontend', 'public', 'weight-loss-reset-recipes.json');
const FALLBACK_IMAGE_URL = '/nutrionist.webp';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseMinutes(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*min/);
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  let minutes = 0;
  if (hourMatch) minutes += Math.round(Number(hourMatch[1]) * 60);
  if (minuteMatch) minutes += Math.round(Number(minuteMatch[1]));
  if (!hourMatch && !minuteMatch && numberMatch) minutes += Math.round(Number(numberMatch[1]));
  return minutes > 0 ? minutes : undefined;
}

function parseNumberFromNutrition(value) {
  const text = String(value || '').toLowerCase().replace(/,/g, '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function extractMacros(nutrition = {}) {
  let calories;
  let protein;
  let carbs;
  let fat;
  const normalizedEntries = Object.entries(nutrition).map(([key, value]) => [normalizeText(key), String(value || '')]);

  for (const [key, rawValue] of normalizedEntries) {
    const value = parseNumberFromNutrition(rawValue);
    if (!Number.isFinite(value)) continue;

    if (key.includes('engery') || key.includes('energy')) {
      const lowered = rawValue.toLowerCase();
      const kcalMatch = lowered.match(/(\d+(?:\.\d+)?)\s*(?:kcal|calories?|cal)\b/);
      if (kcalMatch) {
        calories = Math.round(Number(kcalMatch[1]));
      } else if (/\bkj\b/.test(lowered)) {
        calories = Math.round(value / 4.184);
      } else {
        calories = Math.round(value);
      }
    } else if (key.includes('protein')) {
      protein = Math.round(value);
    } else if (key.includes('carbo')) {
      carbs = Math.round(value);
    } else if (key.includes('fat') && key.includes('total')) {
      fat = Math.round(value);
    }
  }

  return { calories, protein, carbs, fat };
}

function parseIngredientLine(line) {
  const text = String(line || '').trim().replace(/\s+/g, ' ');
  if (!text) return { name: '' };
  return { name: text };
}

function inferDietaryTags(recipe) {
  const labels = [
    ...(Array.isArray(recipe.collections) ? recipe.collections : []),
    ...(Array.isArray(recipe.cardTags) ? recipe.cardTags : []),
  ].map((entry) => normalizeText(entry));
  const set = new Set();

  if (labels.includes('vegetarian')) set.add('vegetarian');
  if (labels.includes('gluten free')) set.add('gluten-free');
  if (labels.includes('lactose free')) {
    set.add('lactose-free');
    set.add('dairy-free');
  }
  if (labels.includes('high protein')) set.add('high-protein');
  if (labels.includes('high fibre')) set.add('high-fibre');
  if (labels.includes('low fodmap')) set.add('low-fodmap');
  if (labels.includes('quick and easy') || labels.includes('30 minute meals')) set.add('quick-and-easy');
  if (labels.includes('budget')) set.add('budget-friendly');
  if (labels.includes('smoothie')) set.add('breakfast-friendly');
  if (labels.includes('dessert')) set.add('dessert');

  return [...set];
}

function inferAllergens(recipe, dietaryTags) {
  const text = [
    ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
    ...(Array.isArray(recipe.ingredientsTags) ? recipe.ingredientsTags : []),
  ]
    .join(' ')
    .toLowerCase();

  const allergens = new Set();
  if (/\b(wheat|flour|bread|pasta|barley|rye|crumb|gluten)\b/.test(text)) allergens.add('gluten');
  if (/\b(milk|yoghurt|yogurt|cheese|feta|ricotta|cream|butter|haloumi|paneer|bocconcini)\b/.test(text)) allergens.add('dairy');
  if (/\begg(s)?\b/.test(text)) allergens.add('egg');
  if (/\b(nut|almond|cashew|walnut|pecan|hazelnut|pistachio|peanut)\b/.test(text)) allergens.add('nut');
  if (/\b(soy|tofu)\b/.test(text)) allergens.add('soy');
  if (/\b(salmon|tuna|fish)\b/.test(text)) allergens.add('fish');
  if (/\b(prawn|shrimp|shellfish|mussel|oyster|crab)\b/.test(text)) allergens.add('shellfish');
  if (/\b(sesame)\b/.test(text)) allergens.add('sesame');

  // Dietary tags from the source can safely remove hard contradictions.
  if (dietaryTags.includes('gluten-free')) allergens.delete('gluten');
  if (dietaryTags.includes('dairy-free') || dietaryTags.includes('lactose-free')) allergens.delete('dairy');

  return [...allergens];
}

function mealTypeHintScore(recipe, hint) {
  const title = normalizeText(recipe.title);
  const labels = [
    ...(Array.isArray(recipe.collections) ? recipe.collections : []),
    ...(Array.isArray(recipe.cardTags) ? recipe.cardTags : []),
  ]
    .map((entry) => normalizeText(entry))
    .join(' ');
  const text = `${title} ${labels}`;

  if (hint === 'breakfast') {
    if (/\b(breakfast|muesli|porridge|smoothie|lassi)\b/.test(text)) return 5;
    if (/\b(quick and easy|30 minute meals)\b/.test(text)) return 1;
  }
  if (hint === 'lunch') {
    if (/\b(lunch|lunchbox|salad|soup|light meals and lunch)\b/.test(text)) return 5;
    if (/\b(single serve|vegetables and salads)\b/.test(text)) return 2;
  }
  if (hint === 'dinner') {
    if (/\b(main course|curry|stew|roast|stir fry|casserole|pasta|risotto|barbeque|grill|pho|laksa)\b/.test(text)) return 5;
    if (/\b(family friendly|cooking for a crowd|slow cooker)\b/.test(text)) return 2;
  }
  if (hint === 'snack') {
    if (/\b(snack|dessert|slice|bars|bites|finger food|dip|hommus|muffin)\b/.test(text)) return 5;
  }
  return 0;
}

function inferMealType(recipe, index) {
  const scored = [
    { mealType: 'breakfast', score: mealTypeHintScore(recipe, 'breakfast') },
    { mealType: 'lunch', score: mealTypeHintScore(recipe, 'lunch') },
    { mealType: 'dinner', score: mealTypeHintScore(recipe, 'dinner') },
    { mealType: 'snack', score: mealTypeHintScore(recipe, 'snack') },
  ].sort((a, b) => b.score - a.score);

  if (scored[0].score > 0) return scored[0].mealType;

  // Balanced fallback to guarantee enough breakfast/lunch/dinner options.
  const fallback = ['breakfast', 'lunch', 'dinner'];
  return fallback[index % fallback.length];
}

function inferEstimatedCost(recipe, dietaryTags) {
  const labels = (recipe.collections || []).map((entry) => normalizeText(entry));
  if (labels.includes('budget') || dietaryTags.includes('budget-friendly')) return 'low cost';
  if ((recipe.ingredients || []).length >= 14) return 'premium';
  return 'balanced';
}

function buildRecipe(recipe, index) {
  const dietaryTags = inferDietaryTags(recipe);
  const allergens = inferAllergens(recipe, dietaryTags);
  const { calories, protein, carbs, fat } = extractMacros(recipe.nutrition || {});
  const prepMinutes = parseMinutes(recipe.prepTime);
  const cookMinutes = parseMinutes(recipe.cookTime);
  const prepTimeMinutes = prepMinutes || undefined;
  const cookTimeMinutes = cookMinutes || undefined;
  const totalTimeMinutes =
    Number.isFinite(prepMinutes) && Number.isFinite(cookMinutes)
      ? prepMinutes + cookMinutes
      : prepMinutes || cookMinutes || 30;
  const id = slugify(recipe.slug || recipe.title || `recipe-${index + 1}`);

  return {
    id,
    title: String(recipe.title || '').trim(),
    description: String(recipe.method?.[0] || recipe.serves || '').trim(),
    imageUrl: recipe.photoUrl || FALLBACK_IMAGE_URL,
    ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map(parseIngredientLine).filter((entry) => entry.name),
    instructions: Array.isArray(recipe.method) ? recipe.method.filter(Boolean) : [],
    calories,
    protein,
    carbs,
    fat,
    mealType: inferMealType(recipe, index),
    dietaryTags,
    allergens,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
    estimatedCost: inferEstimatedCost(recipe, dietaryTags),
    source: {
      provider: 'dietitians-australia',
      url: recipe.url || '',
      dietitian: recipe.dietitian || '',
      serves: recipe.serves || '',
      prepTime: recipe.prepTime || '',
      cookTime: recipe.cookTime || '',
      collections: recipe.collections || [],
      cuisines: recipe.cuisines || [],
      ingredientTags: recipe.ingredientsTags || [],
      cardTags: recipe.cardTags || [],
      nutritionRaw: recipe.nutrition || {},
    },
  };
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const payload = JSON.parse(raw);
  const sourceRecipes = Array.isArray(payload?.recipes) ? payload.recipes : [];
  const recipes = sourceRecipes.map((recipe, index) => buildRecipe(recipe, index));
  const mealTypeCounts = recipes.reduce(
    (acc, recipe) => {
      acc[recipe.mealType] = (acc[recipe.mealType] || 0) + 1;
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'Dietitians Australia scraped recipes',
    recipeCount: recipes.length,
    fallbackImageUrl: FALLBACK_IMAGE_URL,
    mealTypeCounts,
    recipes,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output), 'utf8');

  console.log(
    JSON.stringify(
      {
        input: INPUT_PATH,
        output: OUTPUT_PATH,
        recipeCount: recipes.length,
        mealTypeCounts,
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
