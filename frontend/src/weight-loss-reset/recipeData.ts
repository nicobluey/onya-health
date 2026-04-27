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

function normalizeRecipe(recipe: Recipe, fallbackImageUrl: string): Recipe {
  return {
    ...recipe,
    imageUrl: recipe.imageUrl || fallbackImageUrl || FALLBACK_RECIPE_IMAGE_URL,
    dietaryTags: Array.isArray(recipe.dietaryTags) ? recipe.dietaryTags : [],
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
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

