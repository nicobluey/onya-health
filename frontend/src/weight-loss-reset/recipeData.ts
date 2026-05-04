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

function escapeXml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRecipePlaceholderImage(recipe: Recipe) {
  const mealType = normalizeText(String(recipe.mealType || ''));
  const palette =
    mealType === 'breakfast'
      ? { from: '#F59E0B', to: '#F97316', accent: '#7C2D12' }
      : mealType === 'lunch'
        ? { from: '#10B981', to: '#059669', accent: '#064E3B' }
        : mealType === 'dinner'
          ? { from: '#0EA5E9', to: '#2563EB', accent: '#1E3A8A' }
          : { from: '#8B5CF6', to: '#7C3AED', accent: '#4C1D95' };

  const title = String(recipe.title || 'Recipe').trim() || 'Recipe';
  const words = title.split(/\s+/).filter(Boolean).slice(0, 7);
  const wrapped = [];
  while (words.length > 0) {
    wrapped.push(words.splice(0, 3).join(' '));
  }
  const textLines = wrapped.slice(0, 3);
  const safeTitle = escapeXml(title);
  const safeLine1 = escapeXml(textLines[0] || title);
  const safeLine2 = escapeXml(textLines[1] || '');
  const safeLine3 = escapeXml(textLines[2] || '');
  const safeMealType = escapeXml(mealType || 'meal');
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}" />
      <stop offset="100%" stop-color="${palette.to}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)" />
  <circle cx="1020" cy="120" r="220" fill="rgba(255,255,255,0.14)" />
  <circle cx="220" cy="560" r="240" fill="rgba(255,255,255,0.10)" />
  <text x="70" y="170" font-size="42" font-family="Inter, Arial, sans-serif" fill="rgba(255,255,255,0.88)">Onya Health</text>
  <text x="70" y="245" font-size="70" font-weight="700" font-family="Inter, Arial, sans-serif" fill="white">${safeLine1}</text>
  <text x="70" y="325" font-size="70" font-weight="700" font-family="Inter, Arial, sans-serif" fill="white">${safeLine2}</text>
  <text x="70" y="405" font-size="70" font-weight="700" font-family="Inter, Arial, sans-serif" fill="white">${safeLine3}</text>
  <rect x="70" y="455" rx="20" ry="20" width="330" height="72" fill="rgba(255,255,255,0.22)" />
  <text x="95" y="503" font-size="38" font-family="Inter, Arial, sans-serif" fill="${palette.accent}">${safeMealType}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

function normalizeRecipe(recipe: Recipe, fallbackImageUrl: string): Recipe {
  const nutritionRaw = parseNutritionRaw(recipe);
  const calories = normalizeCalories(recipe);
  const protein = normalizeMacroValue(nutritionRaw.Protein || nutritionRaw.protein, recipe.protein);
  const carbs = normalizeMacroValue(nutritionRaw.Carbohydrates || nutritionRaw.carbohydrates, recipe.carbs);
  const fat = normalizeMacroValue(nutritionRaw['Total Fat'] || nutritionRaw.totalFat || nutritionRaw.fat, recipe.fat);
  const source = safeSourceRecord(recipe);
  const serves = parseServesCount(source.serves);

  const fallbackCandidate = String(recipe.imageUrl || fallbackImageUrl || '').trim();
  const hasConcretePhoto = Boolean(fallbackCandidate) && fallbackCandidate !== FALLBACK_RECIPE_IMAGE_URL;
  const imageUrl = hasConcretePhoto ? fallbackCandidate : buildRecipePlaceholderImage(recipe);

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
      if (recipes.length === 0) {
        return FALLBACK_RECIPES;
      }
      return recipes.map((recipe) => normalizeRecipe(recipe, fallbackImageUrl));
    })
    .catch(() => FALLBACK_RECIPES);

  return cachedRecipesPromise;
}

export function recipesById(recipes: Recipe[]) {
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}
