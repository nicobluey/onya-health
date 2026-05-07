import { FALLBACK_RECIPE_IMAGE_URL } from './constants';
import type { Recipe } from './types';

interface RecipesPayload {
  recipes?: Recipe[];
  fallbackImageUrl?: string;
}

const FALLBACK_RECIPES: Recipe[] = [
  {
    id: 'fallback-protein-bowl',
    title: 'Quick Protein Bowl',
    description: 'A simple high-protein bowl with vegetables and grains.',
    imageUrl: FALLBACK_RECIPE_IMAGE_URL,
    ingredients: [
      { name: 'Chicken breast', category: 'protein' },
      { name: 'Mixed salad leaves', category: 'produce' },
      { name: 'Cooked quinoa', category: 'grains' },
      { name: 'Olive oil', category: 'pantry' },
    ],
    instructions: [
      'Cook chicken until done, slice, and season lightly.',
      'Assemble salad leaves, quinoa, and chicken in a bowl.',
      'Drizzle with olive oil and serve.',
    ],
    calories: 480,
    protein: 38,
    carbs: 30,
    fat: 19,
    mealType: 'lunch',
    dietaryTags: ['high-protein'],
    allergens: [],
    prepTimeMinutes: 20,
    estimatedCost: 'balanced',
  },
];

function normalizeText(value: string) {
  return String(value || '').toLowerCase().trim();
}

function isConcreteRecipeImage(url: string) {
  const value = String(url || '').trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  return /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(value);
}

function parseServesCount(raw: unknown) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return undefined;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((entry) => Number(entry[1])).filter((value) => Number.isFinite(value) && value > 0);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return Math.round(matches[0] * 100) / 100;
  const average = matches.reduce((sum, value) => sum + value, 0) / matches.length;
  return Math.round(average * 100) / 100;
}

function extractNumberFromText(raw: unknown) {
  const text = String(raw || '').replace(/,/g, '').trim();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function safeSourceRecord(recipe: Recipe) {
  if (!recipe.source || typeof recipe.source !== 'object') return {} as Record<string, unknown>;
  return recipe.source as Record<string, unknown>;
}

function parseNutritionRaw(recipe: Recipe) {
  const source = safeSourceRecord(recipe);
  const nutritionRaw = source.nutritionRaw;
  if (!nutritionRaw || typeof nutritionRaw !== 'object') return {} as Record<string, unknown>;
  return nutritionRaw as Record<string, unknown>;
}

function normalizeCalories(recipe: Recipe) {
  const nutritionRaw = parseNutritionRaw(recipe);
  const energyRaw = String(nutritionRaw.Energy || nutritionRaw.Engery || nutritionRaw.energy || '').trim();
  if (energyRaw) {
    const caloriesMatch = energyRaw.match(/(\d+(?:\.\d+)?)\s*calories?/i);
    if (caloriesMatch) {
      const value = Number(caloriesMatch[1]);
      if (Number.isFinite(value) && value > 0) return Math.round(value);
    }

    const kjMatch = energyRaw.match(/(\d+(?:\.\d+)?)\s*kj/i);
    if (kjMatch) {
      const kjValue = Number(kjMatch[1]);
      if (Number.isFinite(kjValue) && kjValue > 0) {
        return Math.round(kjValue / 4.184);
      }
    }
  }

  const directCalories = Number(recipe.calories || 0);
  if (!Number.isFinite(directCalories) || directCalories <= 0) return undefined;
  if (directCalories > 1000) return Math.round(directCalories / 4.184);
  return Math.round(directCalories);
}

function normalizeMacroValue(rawValue: unknown, fallback?: number) {
  const parsed = extractNumberFromText(rawValue);
  if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 10) / 10;
  if (!Number.isFinite(Number(fallback || 0)) || Number(fallback || 0) <= 0) return undefined;
  return Math.round(Number(fallback) * 10) / 10;
}

function normalizeMealType(recipe: Recipe): Recipe['mealType'] {
  const current = normalizeText(String(recipe.mealType || ''));
  const baseMealType = current === 'breakfast' || current === 'lunch' || current === 'dinner' || current === 'snack' ? current : '';
  const source = safeSourceRecord(recipe);
  const collections = Array.isArray(source.collections) ? source.collections : [];
  const cardTags = Array.isArray(source.cardTags) ? source.cardTags : [];
  const descriptor = normalizeText(
    [
      recipe.title,
      recipe.description,
      ...(recipe.dietaryTags || []),
      ...collections.map((value) => String(value || '')),
      ...cardTags.map((value) => String(value || '')),
    ].join(' '),
  );

  const hasBreakfastHint = /(breakfast|bircher|muesli|porridge|smoothie)/.test(descriptor);
  const hasDessertHint = /(dessert|mousse|cake|cheesecake|tartlet|slice|sweet)/.test(descriptor);
  const hasSnackHint = /\bsnack/.test(descriptor);

  if (hasBreakfastHint) return 'breakfast';
  if (hasDessertHint || hasSnackHint) return 'snack';

  if (baseMealType === 'dinner' || baseMealType === 'lunch') {
    const calories = normalizeCalories(recipe) || 0;
    const protein = Number(recipe.protein || 0);
    if (calories > 0 && calories < 220 && protein < 12) {
      return 'snack';
    }
  }

  if (baseMealType) return baseMealType as Recipe['mealType'];
  return 'lunch';
}

function normalizeRecipe(recipe: Recipe, fallbackImageUrl: string, datasetFallbackImageUrl: string): Recipe {
  const nutritionRaw = parseNutritionRaw(recipe);
  const calories = normalizeCalories(recipe);
  const protein = normalizeMacroValue(nutritionRaw.Protein || nutritionRaw.protein, recipe.protein);
  const carbs = normalizeMacroValue(nutritionRaw.Carbohydrates || nutritionRaw.carbohydrates, recipe.carbs);
  const fat = normalizeMacroValue(nutritionRaw['Total Fat'] || nutritionRaw.totalFat || nutritionRaw.fat, recipe.fat);
  const source = safeSourceRecord(recipe);
  const serves = parseServesCount(source.serves);

  const recipeImageCandidate = String(recipe.imageUrl || '').trim();
  const fallbackCandidate = String(fallbackImageUrl || '').trim();
  const datasetFallbackCandidate = String(datasetFallbackImageUrl || '').trim();
  const imageUrl = isConcreteRecipeImage(recipeImageCandidate)
    ? recipeImageCandidate
    : isConcreteRecipeImage(fallbackCandidate)
      ? fallbackCandidate
      : isConcreteRecipeImage(datasetFallbackCandidate)
        ? datasetFallbackCandidate
        : undefined;

  return {
    ...recipe,
    imageUrl,
    serves,
    dietaryTags: Array.isArray(recipe.dietaryTags) ? recipe.dietaryTags : [],
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    calories,
    protein,
    carbs,
    fat,
    mealType: normalizeMealType(recipe),
  };
}

let cachedRecipesPromise: Promise<Recipe[]> | null = null;

export function loadWeightLossRecipes() {
  if (cachedRecipesPromise) return cachedRecipesPromise;

  cachedRecipesPromise = fetch('/weight-loss-reset-recipes.json')
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Could not load recipe dataset.');
      }
      const payload = (await response.json()) as RecipesPayload;
      const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
      const fallbackImageUrl = payload.fallbackImageUrl || FALLBACK_RECIPE_IMAGE_URL;
      const datasetFallbackImageUrl =
        recipes
          .map((recipe) => String(recipe?.imageUrl || '').trim())
          .find((value) => isConcreteRecipeImage(value)) || '';
      if (recipes.length === 0) {
        return FALLBACK_RECIPES;
      }
      return recipes.map((recipe) => normalizeRecipe(recipe, fallbackImageUrl, datasetFallbackImageUrl));
    })
    .catch(() => FALLBACK_RECIPES);

  return cachedRecipesPromise;
}

export function recipesById(recipes: Recipe[]) {
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}
