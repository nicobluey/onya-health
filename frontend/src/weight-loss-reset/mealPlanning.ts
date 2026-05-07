import { MEAL_PLAN_DAYS } from './constants';
import type { CoreMealType, MealPlan, MealPlanDay, MealType, OnboardingAnswers, Recipe, WeightLogEntry } from './types';

export interface GroceryItem {
  key: string;
  name: string;
  category: string;
  quantities: string[];
}

export interface GroceryGroup {
  category: string;
  items: GroceryItem[];
}

export interface MealGroceryBreakdown {
  mealType: MealType;
  recipeIds: string[];
  recipeTitles: string[];
  groups: GroceryGroup[];
}

export interface MealPlanGenerationResult {
  mealPlan: MealPlan;
  notes: string[];
}

const CRITICAL_REQUIREMENTS = new Set(['vegetarian', 'vegan', 'gluten free', 'dairy free', 'nut free', 'halal', 'kosher']);
const MEAL_PREP_PATTERNS: Record<MealType, number[]> = {
  breakfast: [0, 0, 1, 1, 0, 1, 0],
  lunch: [0, 0, 1, 1, 2, 2, 1],
  dinner: [0, 0, 1, 1, 2, 2, 1],
  snack: [0, 1, 0, 1, 0, 1, 0],
};
const MEAL_PREP_BASE_COUNTS: Record<MealType, number> = {
  breakfast: 2,
  lunch: 2,
  dinner: 2,
  snack: 2,
};
const BREAKFAST_MAX_CALORIES_STRICT = 620;
const BREAKFAST_MAX_CALORIES_RELAXED = 760;
const BREAKFAST_MAX_TOTAL_MINUTES_STRICT = 45;
const BREAKFAST_MAX_TOTAL_MINUTES_RELAXED = 60;
const BREAKFAST_MAX_INGREDIENTS_STRICT = 14;
const MAIN_MEAL_MAX_TOTAL_MINUTES_STRICT = 90;
const MAIN_MEAL_MAX_TOTAL_MINUTES_RELAXED = 110;
const LUNCH_MIN_CALORIES_STRICT = 280;
const LUNCH_MIN_PROTEIN_STRICT = 14;
const DINNER_MIN_CALORIES_STRICT = 320;
const DINNER_MIN_PROTEIN_STRICT = 16;
const BREAKFAST_HEAVY_KEYWORDS = [
  'main course',
  'dinner',
  'lunch',
  'curry',
  'risotto',
  'roast',
  'stew',
  'pho',
  'laksa',
  'noodle soup',
  'stir fry',
];
const SWEET_OR_SNACK_KEYWORDS = [
  'mousse',
  'smoothie',
  'bircher',
  'muesli',
  'dessert',
  'cake',
  'cheesecake',
  'tart',
  'slice',
  'cookie',
  'biscuit',
  'snack',
  'beverage',
  'drink',
];
const CORE_MEAL_TYPE_ORDER: CoreMealType[] = ['breakfast', 'lunch', 'dinner'];

function getPlannedMealsPerDay(mealsPerDay: number) {
  const parsed = Math.round(Number(mealsPerDay || 3));
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(2, Math.min(3, parsed));
}

function getPlannedDayCount(daysPerWeek: number) {
  const parsed = Math.round(Number(daysPerWeek || 7));
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(2, Math.min(MEAL_PLAN_DAYS.length, parsed));
}

function getCoreMealTypesForMealsPerDay(mealsPerDay: number): Array<'breakfast' | 'lunch' | 'dinner'> {
  if (getPlannedMealsPerDay(mealsPerDay) <= 2) return ['lunch', 'dinner'];
  return ['breakfast', 'lunch', 'dinner'];
}

function normalizeCoreMealTypes(input: unknown): CoreMealType[] {
  if (!Array.isArray(input)) return [];
  const normalized = [...new Set(
    input
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry): entry is CoreMealType => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner')
  )];
  return CORE_MEAL_TYPE_ORDER.filter((entry) => normalized.includes(entry));
}

function getCoreMealTypesForAnswers(answers: OnboardingAnswers): Array<'breakfast' | 'lunch' | 'dinner'> {
  const explicit = normalizeCoreMealTypes(answers?.selectedMealTypes);
  if (explicit.length >= 2) return explicit;
  return getCoreMealTypesForMealsPerDay(answers?.mealsPerDay || 3);
}

function getIncludeSnackForAnswers(answers: OnboardingAnswers) {
  const explicit = normalizeCoreMealTypes(answers?.selectedMealTypes);
  if (explicit.length > 0) return false;
  return getPlannedMealsPerDay(answers?.mealsPerDay || 3) >= 4;
}

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function tokenizeCsvLike(input: string) {
  return input
    .split(/[,\n;]/g)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function normalizeRequirements(requirements: string[]) {
  const lowered = (requirements || []).map((item) => normalizeText(item));
  const withoutDefault = lowered.filter((item) => item !== 'no specific requirements');
  return withoutDefault.length > 0 ? withoutDefault : [];
}

function normalizeCuisinePreferences(preferences: string[]) {
  const lowered = (preferences || []).map((item) => normalizeText(item)).filter(Boolean);
  return [...new Set(lowered.filter((item) => item !== 'no preference' && item !== 'not specified'))];
}

function normalizeFavoriteFoods(preferences: string[]) {
  return [...new Set((preferences || []).map((item) => normalizeText(item)).filter(Boolean))];
}

function readUnknownStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return tokenizeCsvLike(value).map((entry) => entry.trim()).filter(Boolean);
  }
  return [] as string[];
}

function recipeCuisineTags(recipe: Recipe) {
  const source = recipe.source && typeof recipe.source === 'object' ? (recipe.source as Record<string, unknown>) : {};
  const cuisines = [
    ...readUnknownStringArray(source.cuisines),
    ...readUnknownStringArray(source.cardTags),
  ].map((entry) => normalizeText(entry));
  return [...new Set(cuisines.filter((entry) => entry && entry !== 'not specified'))];
}

function recipeMatchesCuisinePreferences(recipe: Recipe, preferences: string[]) {
  if (preferences.length === 0) return true;
  const cuisines = recipeCuisineTags(recipe);
  if (cuisines.length === 0) return false;
  return preferences.some((preference) =>
    cuisines.some((cuisine) => cuisine === preference || cuisine.includes(preference) || preference.includes(cuisine))
  );
}

function extractAllergyTerms(answers: OnboardingAnswers) {
  const fromChips = answers.allergyChips.map((chip) => chip.toLowerCase());
  const fromText = tokenizeCsvLike(answers.allergiesText);
  return [...new Set([...fromChips, ...fromText])];
}

function extractDislikes(answers: OnboardingAnswers) {
  return tokenizeCsvLike(answers.dislikes);
}

function recipeText(recipe: Recipe) {
  return `${recipe.title} ${recipe.ingredients.map((item) => item.name).join(' ')}`.toLowerCase();
}

function recipeMatchesDietaryRequirements(recipe: Recipe, requirements: string[]) {
  const tags = new Set((recipe.dietaryTags || []).map((tag) => normalizeText(tag)));
  const allergens = new Set((recipe.allergens || []).map((allergen) => normalizeText(allergen)));

  for (const requirement of requirements) {
    const normalized = normalizeText(requirement);
    if (normalized === 'vegetarian' && !tags.has('vegetarian')) return false;
    if (normalized === 'vegan' && !tags.has('vegan')) return false;
    if (normalized === 'gluten free' && allergens.has('gluten')) return false;
    if (normalized === 'dairy free' && allergens.has('dairy')) return false;
    if (normalized === 'nut free' && allergens.has('nut')) return false;
    if (normalized === 'low carb' && !tags.has('low-carb')) return false;
    if (normalized === 'high protein' && !tags.has('high-protein')) return false;
  }

  return true;
}

function recipePassesAllergyCheck(recipe: Recipe, allergyTerms: string[]) {
  if (allergyTerms.length === 0) return true;
  const text = recipeText(recipe);
  const allergens = new Set((recipe.allergens || []).map((item) => normalizeText(item)));
  const hasToken = (value: string) => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  const hasFreeToken = (value: string) =>
    new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[-\\s]?free\\b`, 'i').test(text);

  for (const allergyTerm of allergyTerms) {
    const normalized = normalizeText(allergyTerm);
    if (!normalized) continue;

    if (normalized.includes('gluten')) {
      if (allergens.has('gluten')) return false;
      if (hasToken('gluten') && !hasFreeToken('gluten')) return false;
      continue;
    }

    if (normalized.includes('peanut')) {
      if (allergens.has('peanut') || allergens.has('peanuts')) return false;
      if (hasToken('peanut') && !hasFreeToken('peanut')) return false;
      continue;
    }

    if (normalized.includes('tree nut') || normalized === 'nuts' || normalized === 'nut') {
      if ([...allergens].some((token) => token.includes('nut') || token.includes('almond') || token.includes('walnut'))) {
        return false;
      }
      if (hasToken('nut') && !hasFreeToken('nut')) return false;
      continue;
    }

    if (normalized.includes('dairy') || normalized.includes('milk') || normalized.includes('lactose')) {
      if ([...allergens].some((token) => token.includes('dairy') || token.includes('milk') || token.includes('lactose'))) {
        return false;
      }
      if (
        (hasToken('dairy') || hasToken('milk') || hasToken('cheese') || hasToken('yoghurt') || hasToken('yogurt')) &&
        !(hasFreeToken('dairy') || hasFreeToken('lactose'))
      ) {
        return false;
      }
      continue;
    }

    if (allergens.has(normalized) || [...allergens].some((token) => token.includes(normalized) || normalized.includes(token))) {
      return false;
    }
    if (hasToken(normalized) && !hasFreeToken(normalized)) {
      return false;
    }
  }

  return true;
}

function recipePassesDislikes(recipe: Recipe, dislikes: string[]) {
  if (dislikes.length === 0) return true;
  const text = recipeText(recipe);
  return !dislikes.some((term) => text.includes(term));
}

function recipeDescriptorText(recipe: Recipe) {
  const source = recipe.source && typeof recipe.source === 'object' ? (recipe.source as Record<string, unknown>) : {};
  const collections = readUnknownStringArray(source.collections);
  const cardTags = readUnknownStringArray(source.cardTags);
  const cuisines = readUnknownStringArray(source.cuisines);
  return normalizeText(
    [recipe.title, recipe.description || '', ...(recipe.dietaryTags || []), ...collections, ...cardTags, ...cuisines].join(' ')
  );
}

function recipeEstimatedTotalMinutes(recipe: Recipe) {
  const total = Number(recipe.totalTimeMinutes || 0);
  if (Number.isFinite(total) && total > 0) return total;
  const prep = Number(recipe.prepTimeMinutes || 0);
  const cook = Number(recipe.cookTimeMinutes || 0);
  if (Number.isFinite(prep) && Number.isFinite(cook) && prep > 0 && cook > 0) return prep + cook;
  if (Number.isFinite(prep) && prep > 0) return prep;
  if (Number.isFinite(cook) && cook > 0) return cook;
  return 0;
}

function recipeHasValidIngredientList(recipe: Recipe) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (ingredients.length < 3) return false;
  const validIngredients = ingredients.filter((ingredient) => /[a-z]/i.test(String(ingredient.name || '').trim()));
  return validIngredients.length >= 3;
}

function isMainMealCandidate(recipe: Recipe, mealType: MealType) {
  if (mealType === 'snack') return true;
  const calories = Number(recipe.calories || 0);
  const protein = Number(recipe.protein || 0);
  const descriptor = recipeDescriptorText(recipe);

  if (containsAny(descriptor, SWEET_OR_SNACK_KEYWORDS)) {
    return false;
  }

  // Guard against snack-like items being scheduled as lunch/dinner.
  if (calories > 0 && calories < 260 && protein < 16) return false;
  return true;
}

function isBreakfastMealCandidate(recipe: Recipe, stage: 1 | 2 | 3) {
  const descriptor = recipeDescriptorText(recipe);
  const calories = Number(recipe.calories || 0);
  const totalMinutes = recipeEstimatedTotalMinutes(recipe);
  const ingredientCount = recipe.ingredients.length || 0;

  if (containsAny(descriptor, SWEET_OR_SNACK_KEYWORDS.filter((entry) => !['bircher', 'muesli', 'smoothie'].includes(entry)))) {
    return false;
  }

  if (stage === 1 && containsAny(descriptor, BREAKFAST_HEAVY_KEYWORDS)) return false;
  if (stage <= 2 && calories > (stage === 1 ? BREAKFAST_MAX_CALORIES_STRICT : BREAKFAST_MAX_CALORIES_RELAXED)) return false;
  if (stage <= 2 && totalMinutes > (stage === 1 ? BREAKFAST_MAX_TOTAL_MINUTES_STRICT : BREAKFAST_MAX_TOTAL_MINUTES_RELAXED)) return false;
  if (stage === 1 && ingredientCount > BREAKFAST_MAX_INGREDIENTS_STRICT) return false;
  if (stage <= 2 && !recipeHasValidIngredientList(recipe)) return false;

  return true;
}

function isMainMealPlanningCandidate(recipe: Recipe, mealType: MealType, stage: 1 | 2 | 3) {
  if (!isMainMealCandidate(recipe, mealType)) return false;

  const descriptor = recipeDescriptorText(recipe);
  const calories = Number(recipe.calories || 0);
  const protein = Number(recipe.protein || 0);
  const totalMinutes = recipeEstimatedTotalMinutes(recipe);
  const stageStrict = stage === 1;

  if (containsAny(descriptor, SWEET_OR_SNACK_KEYWORDS)) return false;
  if (stage <= 2 && totalMinutes > (stageStrict ? MAIN_MEAL_MAX_TOTAL_MINUTES_STRICT : MAIN_MEAL_MAX_TOTAL_MINUTES_RELAXED)) return false;

  if (stageStrict) {
    const minCalories = mealType === 'dinner' ? DINNER_MIN_CALORIES_STRICT : LUNCH_MIN_CALORIES_STRICT;
    const minProtein = mealType === 'dinner' ? DINNER_MIN_PROTEIN_STRICT : LUNCH_MIN_PROTEIN_STRICT;
    if (calories > 0 && calories < minCalories && protein < minProtein) return false;
  }

  if (stage <= 2 && calories > 1200) return false;
  if (stage <= 2 && !recipeHasValidIngredientList(recipe)) return false;
  return true;
}

function recipePassesMealPlanningHeuristics(recipe: Recipe, mealType: MealType, stage: 1 | 2 | 3) {
  if (mealType === 'breakfast') return isBreakfastMealCandidate(recipe, stage);
  if (mealType === 'lunch' || mealType === 'dinner') return isMainMealPlanningCandidate(recipe, mealType, stage);

  if (mealType === 'snack') {
    const descriptor = recipeDescriptorText(recipe);
    const calories = Number(recipe.calories || 0);
    const totalMinutes = recipeEstimatedTotalMinutes(recipe);
    if (containsAny(descriptor, BREAKFAST_HEAVY_KEYWORDS)) return false;
    if (stage <= 2 && calories > 550) return false;
    if (stage <= 2 && totalMinutes > 45) return false;
  }

  return true;
}

function seededRandom(seedInput: string) {
  let seed = 0;
  for (let index = 0; index < seedInput.length; index += 1) {
    seed = (seed << 5) - seed + seedInput.charCodeAt(index);
    seed |= 0;
  }

  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function recipePreferenceScore(recipe: Recipe, answers: OnboardingAnswers) {
  let score = 0;
  const title = recipe.title.toLowerCase();
  const tags = recipe.dietaryTags.map((tag) => tag.toLowerCase());
  const cuisinePreferences = normalizeCuisinePreferences(answers.preferredCuisines || []);
  const favoriteFoods = normalizeFavoriteFoods(answers.favoriteFoods || []);
  const timeMinutes = recipe.totalTimeMinutes || recipe.prepTimeMinutes || 40;

  if (tags.includes('high-protein')) score += 5;
  if (tags.includes('low-carb')) score += 2;
  if ((recipe.calories || 0) > 0 && (recipe.calories || 0) <= 620) score += 2;
  if (timeMinutes <= 25) score += 3;

  if (answers.preferredMealStyle === 'high protein' && tags.includes('high-protein')) score += 4;
  if (answers.preferredMealStyle === 'low prep' && timeMinutes <= 20) score += 3;
  if (answers.preferredMealStyle === 'quick and easy' && timeMinutes <= 25) score += 3;
  if (answers.preferredMealStyle === 'vegetarian leaning' && tags.includes('vegetarian')) score += 3;
  if (cuisinePreferences.length > 0 && recipeMatchesCuisinePreferences(recipe, cuisinePreferences)) score += 6;

  if (answers.groceryPreference === 'fastest meals possible' && timeMinutes <= 20) score += 2;
  if (answers.groceryPreference === 'meal prep friendly') {
    if (containsAny(title, ['bowl', 'stew', 'roast', 'salad', 'curry', 'stir fry'])) score += 3;
    if ((recipe.ingredients.length || 0) <= 11) score += 4;
    if ((recipe.ingredients.length || 0) >= 16) score -= 3;
  }
  if (answers.groceryPreference === 'simple supermarket ingredients' && (recipe.ingredients.length || 0) <= 10) score += 2;
  if (answers.groceryPreference === 'high variety') score += 1;

  if (answers.budgetPreference === 'low cost' && String(recipe.estimatedCost).toLowerCase().includes('low')) score += 2;
  if (answers.budgetPreference === 'premium' && String(recipe.estimatedCost).toLowerCase().includes('premium')) score += 1;

  if (favoriteFoods.length > 0) {
    const ingredientText = recipe.ingredients.map((ingredient) => normalizeText(ingredient.name || '')).join(' ');
    const descriptor = normalizeText(`${recipe.title} ${recipe.description || ''} ${ingredientText}`);
    const favouriteFoodMatches = favoriteFoods.reduce((count, preference) => {
      return descriptor.includes(preference) ? count + 1 : count;
    }, 0);
    score += favouriteFoodMatches * 3;
  }

  return score;
}

function buildCandidatePool({
  recipes,
  mealType,
  answers,
  stage,
}: {
  recipes: Recipe[];
  mealType: MealType;
  answers: OnboardingAnswers;
  stage: 1 | 2 | 3;
}) {
  const requirements = normalizeRequirements(answers.dietaryRequirements);
  const strictRequirements =
    stage === 1
      ? requirements
      : requirements.filter((requirement) => CRITICAL_REQUIREMENTS.has(normalizeText(requirement)));
  const allergyTerms = extractAllergyTerms(answers);
  const dislikes = stage === 3 ? [] : extractDislikes(answers);

  const withMealType =
    stage === 3
      ? recipes.filter((recipe) => {
          if (mealType === 'snack') {
            return recipe.mealType === 'snack' || recipe.mealType === 'breakfast';
          }
          if (mealType === 'lunch' || mealType === 'dinner') {
            return recipe.mealType === 'lunch' || recipe.mealType === 'dinner';
          }
          return recipe.mealType === mealType;
        })
      : recipes.filter((recipe) => recipe.mealType === mealType);

  return withMealType
    .filter((recipe) => recipePassesMealPlanningHeuristics(recipe, mealType, stage))
    .filter((recipe) => recipePassesAllergyCheck(recipe, allergyTerms))
    .filter((recipe) => recipeMatchesDietaryRequirements(recipe, strictRequirements))
    .filter((recipe) => recipePassesDislikes(recipe, dislikes))
    .sort((a, b) => recipePreferenceScore(b, answers) - recipePreferenceScore(a, answers) || a.title.localeCompare(b.title));
}

function ingredientTokenSet(recipe: Recipe) {
  const stop = new Set([
    'and',
    'with',
    'from',
    'fresh',
    'dried',
    'extra',
    'virgin',
    'olive',
    'oil',
    'salt',
    'pepper',
    'ground',
    'cup',
    'cups',
    'tbsp',
    'tsp',
  ]);
  const tokens = new Set<string>();
  for (const ingredient of recipe.ingredients || []) {
    const parts = normalizeText(ingredient.name || '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const part of parts) {
      if (part.length < 3) continue;
      if (stop.has(part)) continue;
      tokens.add(part);
    }
  }
  return tokens;
}

function tokenOverlapCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function pickMealPrepBaseRecipes({
  candidates,
  mealType,
  random,
}: {
  candidates: Recipe[];
  mealType: MealType;
  random: () => number;
}) {
  if (candidates.length === 0) return [] as Recipe[];
  const targetCount = MEAL_PREP_BASE_COUNTS[mealType];
  const sliceSize = Math.min(candidates.length, Math.max(targetCount * 3, targetCount));
  const pool = candidates.slice(0, sliceSize);
  const start = Math.floor(random() * pool.length);
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  const desiredCount = Math.max(1, Math.min(targetCount, rotated.length));
  const selected: Recipe[] = [rotated[0]];
  const tokenCache = new Map<string, Set<string>>();
  for (const recipe of rotated) {
    tokenCache.set(recipe.id, ingredientTokenSet(recipe));
  }

  while (selected.length < desiredCount) {
    let best: Recipe | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of rotated) {
      if (selected.some((entry) => entry.id === candidate.id)) continue;
      const candidateTokens = tokenCache.get(candidate.id) || new Set<string>();
      const overlap = selected.reduce((acc, entry) => {
        const selectedTokens = tokenCache.get(entry.id) || new Set<string>();
        return acc + tokenOverlapCount(selectedTokens, candidateTokens);
      }, 0);
      const rankBias = Math.max(0, rotated.length - rotated.indexOf(candidate));
      const score = overlap * 3 + rankBias;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
  }

  return selected;
}

function pickVariedRecipe({
  candidates,
  dayIndex,
  random,
  lastRecipeId,
}: {
  candidates: Recipe[];
  dayIndex: number;
  random: () => number;
  lastRecipeId?: string;
}) {
  if (candidates.length === 0) return undefined;
  const offset = Math.floor(random() * candidates.length);
  const ranked = candidates.map((recipe, index) => ({ recipe, indexScore: (index + offset + dayIndex) % candidates.length }));
  ranked.sort((a, b) => a.indexScore - b.indexScore);
  if (ranked.length === 1) return ranked[0].recipe;
  const first = ranked[0].recipe;
  if (lastRecipeId && first.id === lastRecipeId) {
    const alternative = ranked.find((entry) => entry.recipe.id !== lastRecipeId);
    return alternative?.recipe || first;
  }
  return first;
}

function selectMealPrepRecipe({
  baseRecipes,
  dayIndex,
  mealType,
  fallbackPool,
}: {
  baseRecipes: Recipe[];
  dayIndex: number;
  mealType: MealType;
  fallbackPool: Recipe[];
}) {
  const pattern = MEAL_PREP_PATTERNS[mealType];
  const source = baseRecipes.length > 0 ? baseRecipes : fallbackPool;
  if (source.length === 0) return undefined;
  const slot = pattern[dayIndex % pattern.length] || 0;
  return source[slot % source.length];
}

function calculateDayTotals(day: MealPlanDay, recipeMap: Map<string, Recipe>) {
  const ids = [
    day.meals.breakfast,
    day.meals.lunch,
    day.meals.dinner,
    ...(day.meals.snacks || []),
  ].filter(Boolean) as string[];

  const totals = ids.reduce(
    (acc, id) => {
      const recipe = recipeMap.get(id);
      if (!recipe) return acc;
      acc.calories += recipe.calories || 0;
      acc.protein += recipe.protein || 0;
      acc.carbs += recipe.carbs || 0;
      acc.fat += recipe.fat || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    calories: totals.calories || undefined,
    protein: totals.protein || undefined,
    carbs: totals.carbs || undefined,
    fat: totals.fat || undefined,
  };
}

function buildBestEffortPool({
  recipes,
  mealType,
  answers,
}: {
  recipes: Recipe[];
  mealType: 'breakfast' | 'lunch' | 'dinner';
  answers: OnboardingAnswers;
}) {
  const strict = buildCandidatePool({ recipes, mealType, answers, stage: 1 });
  if (strict.length > 0) return strict;
  const relaxed = buildCandidatePool({ recipes, mealType, answers, stage: 2 });
  if (relaxed.length > 0) return relaxed;
  const loose = buildCandidatePool({ recipes, mealType, answers, stage: 3 });
  if (loose.length > 0) return loose;
  const fallback = recipes.filter((recipe) =>
    mealType === 'breakfast'
      ? recipe.mealType === 'breakfast'
      : recipe.mealType === mealType || recipe.mealType === 'lunch' || recipe.mealType === 'dinner',
  );
  return fallback.length > 0 ? fallback : recipes;
}

function normalizeMealAssignmentsForPracticality(mealPlan: MealPlan, answers: OnboardingAnswers, recipeMap: Map<string, Recipe>): MealPlan {
  const recipes = [...recipeMap.values()];
  if (recipes.length === 0 || mealPlan.days.length === 0) return mealPlan;

  const coreMealTypes = getCoreMealTypesForAnswers(answers);
  const pools = {
    breakfast: buildBestEffortPool({ recipes, mealType: 'breakfast', answers }),
    lunch: buildBestEffortPool({ recipes, mealType: 'lunch', answers }),
    dinner: buildBestEffortPool({ recipes, mealType: 'dinner', answers }),
  };
  const repeatGuard = answers.groceryPreference === 'meal prep friendly' ? 4 : 3;
  const usageByType: Record<'breakfast' | 'lunch' | 'dinner', Map<string, number>> = {
    breakfast: new Map(),
    lunch: new Map(),
    dinner: new Map(),
  };

  const nextDays = mealPlan.days.map((day) => ({ ...day, meals: { ...day.meals } }));
  for (let dayIndex = 0; dayIndex < nextDays.length; dayIndex += 1) {
    const day = nextDays[dayIndex];

    for (const mealType of coreMealTypes) {
      const rawId = String(day.meals[mealType] || '').trim();
      const currentRecipe = rawId ? recipeMap.get(rawId) : undefined;
      const validCurrent = Boolean(currentRecipe && recipePassesMealPlanningHeuristics(currentRecipe, mealType, 1));
      const sameDayCoreIds = new Set(
        coreMealTypes
          .map((entry) => String(day.meals[entry] || '').trim())
          .filter((entry) => entry && entry !== rawId),
      );
      const previousId = dayIndex > 0 ? String(nextDays[dayIndex - 1].meals[mealType] || '').trim() : '';
      const existingCount = rawId ? usageByType[mealType].get(rawId) || 0 : 0;

      let pickedId = rawId;
      const needsReplacement = !rawId || !validCurrent || existingCount >= repeatGuard || sameDayCoreIds.has(rawId);
      if (needsReplacement) {
        const candidates = pools[mealType]
          .filter((recipe) => recipePassesMealPlanningHeuristics(recipe, mealType, 2))
          .map((recipe) => {
            const alreadyUsed = usageByType[mealType].get(recipe.id) || 0;
            return {
              recipe,
              alreadyUsed,
              preference: recipePreferenceScore(recipe, answers),
              isSameAsPreviousDay: recipe.id === previousId ? 1 : 0,
              isSameDayCollision: sameDayCoreIds.has(recipe.id) ? 1 : 0,
            };
          })
          .sort(
            (a, b) =>
              a.isSameDayCollision - b.isSameDayCollision ||
              a.alreadyUsed - b.alreadyUsed ||
              a.isSameAsPreviousDay - b.isSameAsPreviousDay ||
              b.preference - a.preference ||
              a.recipe.title.localeCompare(b.recipe.title),
          );

        const firstNonColliding = candidates.find((entry) => entry.isSameDayCollision === 0);
        pickedId = (firstNonColliding || candidates[0])?.recipe.id || rawId;
      }

      day.meals[mealType] = pickedId || undefined;
      if (pickedId) {
        usageByType[mealType].set(pickedId, (usageByType[mealType].get(pickedId) || 0) + 1);
      }
    }
  }

  return {
    ...mealPlan,
    days: nextDays,
  };
}

function parseRecipeServesCount(recipe: Recipe) {
  const direct = Number(recipe.serves || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromSource = String(recipe.source?.serves || '').trim().toLowerCase();
  if (!fromSource) return 1;
  const numbers = [...fromSource.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numbers.length === 0) return 1;
  if (numbers.length === 1) return numbers[0];
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function buildRecipeUsageMapFromMealPlan(mealPlan: MealPlan | null) {
  const usage = new Map<string, number>();
  if (!mealPlan) return usage;
  for (const day of mealPlan.days || []) {
    const ids = [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])].filter(Boolean) as string[];
    for (const id of ids) {
      usage.set(id, (usage.get(id) || 0) + 1);
    }
  }
  return usage;
}

function buildPrepDayPlan(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>, prepDay: string) {
  if (!mealPlan || mealPlan.days.length === 0) return undefined;
  const usage = buildRecipeUsageMapFromMealPlan(mealPlan);
  if (usage.size === 0) return undefined;

  const repeatedRecipes = [...usage.entries()]
    .filter(([, count]) => count >= 2)
    .map(([id, count]) => ({ recipe: recipeMap.get(id), count }))
    .filter((entry): entry is { recipe: Recipe; count: number } => Boolean(entry.recipe))
    .sort((a, b) => b.count - a.count || a.recipe.title.localeCompare(b.recipe.title))
    .slice(0, 4);

  const ingredientFrequency = new Map<string, number>();
  for (const recipe of recipeMap.values()) {
    if (!usage.has(recipe.id)) continue;
    const seenInRecipe = new Set<string>();
    for (const ingredient of recipe.ingredients || []) {
      const base = normalizeIngredientBaseName(String(ingredient.name || ''));
      const canonical = canonicalizeIngredientBaseName(base);
      if (!canonical || shouldIgnoreCanonicalIngredient(canonical)) continue;
      if (seenInRecipe.has(canonical)) continue;
      seenInRecipe.add(canonical);
      ingredientFrequency.set(canonical, (ingredientFrequency.get(canonical) || 0) + 1);
    }
  }

  const sharedIngredients = [...ingredientFrequency.entries()]
    .filter(([, frequency]) => frequency >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name]) => toIngredientDisplayName(name));

  const repeatedMealLabels = repeatedRecipes.length > 0
    ? repeatedRecipes.map((entry) => `${entry.recipe.title} (${entry.count} meals)`).join(', ')
    : 'your selected meals';

  const totalPrepMinutes = repeatedRecipes.reduce((sum, entry) => {
    const minutes = Math.max(
      0,
      Number(entry.recipe.totalTimeMinutes || 0) ||
        Number(entry.recipe.prepTimeMinutes || 0) + Number(entry.recipe.cookTimeMinutes || 0) ||
        Number(entry.recipe.prepTimeMinutes || 0) ||
        Number(entry.recipe.cookTimeMinutes || 0),
    );
    const batchMultiplier = Math.min(1.8, 0.9 + entry.count * 0.25);
    return sum + Math.round(minutes * batchMultiplier);
  }, 20);

  const steps = [
    `Batch-cook repeated recipes first: ${repeatedMealLabels}.`,
    sharedIngredients.length > 0
      ? `Wash and prep shared ingredients together: ${sharedIngredients.slice(0, 8).join(', ')}.`
      : 'Wash, chop, and portion all vegetables and herbs before cooking.',
    'Cook grains and proteins in larger batches, then cool and portion into labelled containers.',
    'Prepare sauces/dressings in jars so meals can be assembled quickly on busy days.',
    'Store 3 days in the fridge and freeze extra portions for later in the week.',
  ];

  return {
    title: 'Prep day game plan',
    prepDay: prepDay || 'Sunday',
    totalPrepMinutes,
    sharedIngredients,
    steps,
  };
}

interface PlanQualityCheckResult {
  valid: boolean;
  score: number;
  issues: string[];
}

function averageIngredientOverlapForDays(days: MealPlanDay[], recipeMap: Map<string, Recipe>) {
  const overlaps: number[] = [];
  const coreRecipes: Recipe[] = [];

  for (const day of days) {
    const breakfast = day.meals.breakfast ? recipeMap.get(day.meals.breakfast) : undefined;
    const lunch = day.meals.lunch ? recipeMap.get(day.meals.lunch) : undefined;
    const dinner = day.meals.dinner ? recipeMap.get(day.meals.dinner) : undefined;
    if (breakfast) coreRecipes.push(breakfast);
    if (lunch) coreRecipes.push(lunch);
    if (dinner) coreRecipes.push(dinner);
    if (lunch && dinner) {
      overlaps.push(tokenOverlapCount(ingredientTokenSet(lunch), ingredientTokenSet(dinner)));
    }
  }

  for (let index = 1; index < coreRecipes.length; index += 1) {
    overlaps.push(tokenOverlapCount(ingredientTokenSet(coreRecipes[index - 1]), ingredientTokenSet(coreRecipes[index])));
  }

  if (overlaps.length === 0) return 0;
  return overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
}

function evaluateGeneratedPlanQuality({
  days,
  recipeMap,
  useMealPrepPattern,
  poolSizes,
  coreMealTypes,
}: {
  days: MealPlanDay[];
  recipeMap: Map<string, Recipe>;
  useMealPrepPattern: boolean;
  poolSizes: Record<'breakfast' | 'lunch' | 'dinner', number>;
  coreMealTypes: Array<'breakfast' | 'lunch' | 'dinner'>;
}): PlanQualityCheckResult {
  let score = 100;
  const issues: string[] = [];
  const criticalIssues: string[] = [];
  const needsBreakfast = coreMealTypes.includes('breakfast');
  const needsLunch = coreMealTypes.includes('lunch');
  const needsDinner = coreMealTypes.includes('dinner');

  const breakfastCounts = new Map<string, number>();
  const lunchCounts = new Map<string, number>();
  const dinnerCounts = new Map<string, number>();

  for (const day of days) {
    const breakfastId = String(day.meals.breakfast || '').trim();
    const lunchId = String(day.meals.lunch || '').trim();
    const dinnerId = String(day.meals.dinner || '').trim();
    if ((needsBreakfast && !breakfastId) || (needsLunch && !lunchId) || (needsDinner && !dinnerId)) {
      criticalIssues.push(`Missing core meal on ${day.label}.`);
      continue;
    }

    const breakfastRecipe = breakfastId ? recipeMap.get(breakfastId) : undefined;
    const lunchRecipe = lunchId ? recipeMap.get(lunchId) : undefined;
    const dinnerRecipe = dinnerId ? recipeMap.get(dinnerId) : undefined;
    if ((needsBreakfast && !breakfastRecipe) || (needsLunch && !lunchRecipe) || (needsDinner && !dinnerRecipe)) {
      criticalIssues.push(`Recipe metadata missing for ${day.label}.`);
      continue;
    }

    if (needsBreakfast && breakfastRecipe && !recipePassesMealPlanningHeuristics(breakfastRecipe, 'breakfast', 1)) {
      criticalIssues.push(`Breakfast on ${day.label} is too heavy or impractical.`);
    }
    if (needsLunch && lunchRecipe && !recipePassesMealPlanningHeuristics(lunchRecipe, 'lunch', 1)) {
      criticalIssues.push(`Lunch on ${day.label} is too light, too sweet, or impractical.`);
    }
    if (needsDinner && dinnerRecipe && !recipePassesMealPlanningHeuristics(dinnerRecipe, 'dinner', 1)) {
      criticalIssues.push(`Dinner on ${day.label} is too light, too sweet, or impractical.`);
    }

    const coreIds = [needsBreakfast ? breakfastId : '', needsLunch ? lunchId : '', needsDinner ? dinnerId : ''].filter(Boolean);
    const uniqueCoreIds = new Set(coreIds);
    if (uniqueCoreIds.size !== coreIds.length) {
      score -= 8;
      issues.push(`Repeated core meal in the same day (${day.label}).`);
    }

    if (needsBreakfast && breakfastId) {
      breakfastCounts.set(breakfastId, (breakfastCounts.get(breakfastId) || 0) + 1);
    }
    if (needsLunch && lunchId) {
      lunchCounts.set(lunchId, (lunchCounts.get(lunchId) || 0) + 1);
    }
    if (needsDinner && dinnerId) {
      dinnerCounts.set(dinnerId, (dinnerCounts.get(dinnerId) || 0) + 1);
    }

    const totals = calculateDayTotals(day, recipeMap);
    const maxDailyCalories = coreMealTypes.length <= 2 ? 1900 : 2400;
    const minDailyCalories = coreMealTypes.length <= 2 ? 700 : 900;
    if ((totals.calories || 0) > maxDailyCalories) {
      score -= 6;
      issues.push(`Daily energy looks high on ${day.label}.`);
    }
    if ((totals.calories || 0) > 0 && (totals.calories || 0) < minDailyCalories) {
      score -= 10;
      issues.push(`Daily energy looks too low on ${day.label}.`);
    }
  }

  const breakfastRepeatMax = useMealPrepPattern ? 5 : 4;
  const lunchRepeatMax = useMealPrepPattern ? 4 : 3;
  const dinnerRepeatMax = useMealPrepPattern ? 4 : 3;
  if (needsBreakfast && [...breakfastCounts.values()].some((count) => count > breakfastRepeatMax)) {
    score -= 10;
    issues.push('Breakfast variety is too low for the week.');
  }
  if (needsLunch && [...lunchCounts.values()].some((count) => count > lunchRepeatMax)) {
    score -= 8;
    issues.push('Lunch variety is too low for the week.');
  }
  if (needsDinner && [...dinnerCounts.values()].some((count) => count > dinnerRepeatMax)) {
    score -= 8;
    issues.push('Dinner variety is too low for the week.');
  }

  if (needsBreakfast && poolSizes.breakfast >= 3 && breakfastCounts.size < 2) {
    score -= 12;
    issues.push('Breakfast choices are over-repeated.');
  }
  if (needsLunch && poolSizes.lunch >= 4 && lunchCounts.size < 2) {
    score -= 10;
    issues.push('Lunch choices are over-repeated.');
  }
  if (needsDinner && poolSizes.dinner >= 4 && dinnerCounts.size < 2) {
    score -= 10;
    issues.push('Dinner choices are over-repeated.');
  }

  const averageIngredientOverlap = averageIngredientOverlapForDays(days, recipeMap);
  const overlapTarget = useMealPrepPattern ? 3 : 1.5;
  if (averageIngredientOverlap < overlapTarget) {
    score -= useMealPrepPattern ? 14 : 8;
    issues.push('Meals do not share enough core ingredients for practical prep and shopping.');
  }

  if (criticalIssues.length > 0) {
    return {
      valid: false,
      score: Math.max(0, score - 30 - criticalIssues.length * 8),
      issues: [...criticalIssues, ...issues].slice(0, 6),
    };
  }

  return {
    valid: score >= 70,
    score: Math.max(0, score),
    issues: issues.slice(0, 6),
  };
}

export function generateMealPlan({
  recipes,
  answers,
  seedSalt = '',
}: {
  recipes: Recipe[];
  answers: OnboardingAnswers;
  seedSalt?: string;
}): MealPlanGenerationResult {
  const notes: string[] = [];
  const catalog = recipes.filter((recipe) => String(recipe?.id || '').trim());
  if (catalog.length === 0) {
    notes.push('No recipes available yet. Please refresh once the recipe catalog finishes loading.');
    return {
      mealPlan: {
        days: [],
        generatedBy: 'rules',
        notes,
        generatedAt: new Date().toISOString(),
      },
      notes,
    };
  }

  const baseSeed = `${answers.firstName}|${answers.age || ''}|${answers.goalWeightKg || ''}|${answers.biggestChallenge}|${answers.mainGoal}|${seedSalt}`;

  const plannedDayCount = getPlannedDayCount(answers.daysPerWeek);
  const coreMealTypes = getCoreMealTypesForAnswers(answers);
  const requiresSnack = getIncludeSnackForAnswers(answers);
  const mealTypesForDay: MealType[] = requiresSnack ? [...coreMealTypes, 'snack'] : [...coreMealTypes];

  const candidatePools = {
    breakfast: buildCandidatePool({ recipes, mealType: 'breakfast', answers, stage: 1 }),
    lunch: buildCandidatePool({ recipes, mealType: 'lunch', answers, stage: 1 }),
    dinner: buildCandidatePool({ recipes, mealType: 'dinner', answers, stage: 1 }),
    snack: buildCandidatePool({ recipes, mealType: 'snack', answers, stage: 1 }),
  };

  let relaxed = false;
  for (const mealType of mealTypesForDay) {
    if (candidatePools[mealType].length >= 7) continue;
    const stage2 = buildCandidatePool({ recipes, mealType, answers, stage: 2 });
    if (stage2.length >= candidatePools[mealType].length) {
      candidatePools[mealType] = stage2;
      relaxed = true;
    }
    if (candidatePools[mealType].length >= 7) continue;
    const stage3 = buildCandidatePool({ recipes, mealType, answers, stage: 3 });
    if (stage3.length > candidatePools[mealType].length) {
      candidatePools[mealType] = stage3;
      relaxed = true;
    }
  }

  if (relaxed) {
    notes.push(
      'We relaxed a few non-critical preferences to keep your plan varied while still respecting key dietary needs and allergy safety.'
    );
  }

  const fallbackCatalog = catalog;
  const relaxedPoolForMealType = (mealType: MealType) => {
    const base = fallbackCatalog.filter((recipe) =>
      mealType === 'snack' ? recipe.mealType === 'snack' || recipe.mealType === 'breakfast' : recipe.mealType === mealType
    );
    const relaxedMatches = base.filter((recipe) => recipePassesMealPlanningHeuristics(recipe, mealType, 2));
    if (relaxedMatches.length > 0) return relaxedMatches;
    if (base.length > 0) return base;
    return fallbackCatalog;
  };

  if (candidatePools.breakfast.length === 0) candidatePools.breakfast = relaxedPoolForMealType('breakfast');
  if (candidatePools.lunch.length === 0) candidatePools.lunch = relaxedPoolForMealType('lunch');
  if (candidatePools.dinner.length === 0) candidatePools.dinner = relaxedPoolForMealType('dinner');
  if (candidatePools.snack.length === 0) {
    candidatePools.snack = relaxedPoolForMealType('snack');
  }

  const useMealPrepPattern = answers.groceryPreference === 'meal prep friendly';
  const recipeMap = new Map(catalog.map((recipe) => [recipe.id, recipe]));
  const poolSizes = {
    breakfast: candidatePools.breakfast.length,
    lunch: candidatePools.lunch.length,
    dinner: candidatePools.dinner.length,
  };

  const buildDaysForAttempt = (attemptIndex: number) => {
    const random = seededRandom(`${baseSeed}|attempt:${attemptIndex}`);
    const mealPrepBases = useMealPrepPattern
      ? {
          breakfast: pickMealPrepBaseRecipes({ candidates: candidatePools.breakfast, mealType: 'breakfast', random }),
          lunch: pickMealPrepBaseRecipes({ candidates: candidatePools.lunch, mealType: 'lunch', random }),
          dinner: pickMealPrepBaseRecipes({ candidates: candidatePools.dinner, mealType: 'dinner', random }),
          snack: pickMealPrepBaseRecipes({ candidates: candidatePools.snack, mealType: 'snack', random }),
        }
      : {
          breakfast: [] as Recipe[],
          lunch: [] as Recipe[],
          dinner: [] as Recipe[],
          snack: [] as Recipe[],
        };

    const days: MealPlanDay[] = [];
    let lastBreakfastId = '';
    let lastLunchId = '';
    let lastDinnerId = '';
    let lastSnackId = '';

    for (let dayIndex = 0; dayIndex < plannedDayCount; dayIndex += 1) {
      const breakfastRecipe = useMealPrepPattern
        ? selectMealPrepRecipe({
            baseRecipes: mealPrepBases.breakfast,
            dayIndex,
            mealType: 'breakfast',
            fallbackPool: candidatePools.breakfast,
          })
        : pickVariedRecipe({
            candidates: candidatePools.breakfast,
            dayIndex,
            random,
            lastRecipeId: lastBreakfastId,
          });
      const lunchRecipe = useMealPrepPattern
        ? selectMealPrepRecipe({
            baseRecipes: mealPrepBases.lunch,
            dayIndex,
            mealType: 'lunch',
            fallbackPool: candidatePools.lunch,
          })
        : pickVariedRecipe({
            candidates: candidatePools.lunch,
            dayIndex,
            random,
            lastRecipeId: lastLunchId,
          });
      const dinnerRecipe = useMealPrepPattern
        ? selectMealPrepRecipe({
            baseRecipes: mealPrepBases.dinner,
            dayIndex,
            mealType: 'dinner',
            fallbackPool: candidatePools.dinner,
          })
        : pickVariedRecipe({
            candidates: candidatePools.dinner,
            dayIndex,
            random,
            lastRecipeId: lastDinnerId,
          });

      const breakfastId =
        coreMealTypes.includes('breakfast')
          ? breakfastRecipe?.id ||
            candidatePools.breakfast[dayIndex % candidatePools.breakfast.length]?.id ||
            fallbackCatalog[dayIndex % fallbackCatalog.length]?.id
          : undefined;
      const lunchId =
        lunchRecipe?.id ||
        candidatePools.lunch[dayIndex % candidatePools.lunch.length]?.id ||
        fallbackCatalog[(dayIndex + 1) % fallbackCatalog.length]?.id;
      const dinnerId =
        dinnerRecipe?.id ||
        candidatePools.dinner[dayIndex % candidatePools.dinner.length]?.id ||
        fallbackCatalog[(dayIndex + 2) % fallbackCatalog.length]?.id;

      const snackRecipe = requiresSnack
        ? useMealPrepPattern
          ? selectMealPrepRecipe({
              baseRecipes: mealPrepBases.snack,
              dayIndex,
              mealType: 'snack',
              fallbackPool: candidatePools.snack.length > 0 ? candidatePools.snack : candidatePools.breakfast,
            })
          : pickVariedRecipe({
              candidates: candidatePools.snack.length > 0 ? candidatePools.snack : candidatePools.breakfast,
              dayIndex,
              random,
              lastRecipeId: lastSnackId,
            })
        : undefined;
      const snacks = snackRecipe?.id ? [snackRecipe.id] : [];

      const day: MealPlanDay = {
        dayIndex,
        label: MEAL_PLAN_DAYS[dayIndex] || `Day ${dayIndex + 1}`,
        meals: {
          breakfast: breakfastId,
          lunch: lunchId,
          dinner: dinnerId,
          snacks: snacks.length > 0 ? snacks : undefined,
        },
      };
      day.totals = calculateDayTotals(day, recipeMap);
      days.push(day);
      if (breakfastId) lastBreakfastId = breakfastId;
      lastLunchId = lunchId || lastLunchId;
      lastDinnerId = dinnerId || lastDinnerId;
      lastSnackId = snacks[0] || lastSnackId;
    }

    return days;
  };

  let selectedDays: MealPlanDay[] = [];
  let selectedQuality: PlanQualityCheckResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attemptIndex = 0; attemptIndex < 8; attemptIndex += 1) {
    const candidateDays = buildDaysForAttempt(attemptIndex);
    const quality = evaluateGeneratedPlanQuality({
      days: candidateDays,
      recipeMap,
      useMealPrepPattern,
      poolSizes,
      coreMealTypes,
    });

    if (quality.score > bestScore) {
      bestScore = quality.score;
      selectedDays = candidateDays;
      selectedQuality = quality;
    }

    if (quality.valid) {
      selectedDays = candidateDays;
      selectedQuality = quality;
      if (attemptIndex > 0) {
        notes.push('Plan reshuffled for better practicality and variety.');
      }
      break;
    }
  }

  const days = selectedDays;
  const baseMealPlan: MealPlan = {
    days,
    generatedBy: 'rules',
    notes,
    generatedAt: new Date().toISOString(),
  };

  if (days.some((day) => coreMealTypes.some((mealType) => !day.meals[mealType]))) {
    notes.push('Some meals were broadened because available recipe matches were limited for your profile.');
  }
  if (selectedQuality && !selectedQuality.valid && selectedQuality.issues.length > 0) {
    notes.push(`Plan quality warning: ${selectedQuality.issues[0]}`);
  }

  const prepDayPlan = buildPrepDayPlan(baseMealPlan, recipeMap, answers.prepDay || 'Sunday');

  return {
    mealPlan: {
      ...baseMealPlan,
      prepDayPlan,
    },
    notes,
  };
}

export function getSwapCandidates({
  recipes,
  answers,
  mealType,
  currentRecipe,
  limit = 24,
}: {
  recipes: Recipe[];
  answers: OnboardingAnswers;
  mealType: MealType;
  currentRecipe?: Recipe;
  limit?: number;
}) {
  const hasConcreteImage = (recipe: Recipe) => {
    const candidate = String(recipe?.imageUrl || '').trim();
    if (!candidate) return false;
    if (/^data:image\/webp;base64,/i.test(candidate)) return true;
    if (candidate.includes('/api/patient/meal-plan/recipe-image')) return true;
    if (!/^https?:\/\//i.test(candidate)) return false;
    try {
      const parsed = new URL(candidate);
      if (parsed.pathname === '/api/patient/meal-plan/recipe-image') return true;
      if (parsed.pathname.toLowerCase().endsWith('.webp')) return true;
    } catch {
      return false;
    }
    return /(?:^|[?&])(fm|format)=webp(?:&|$)/i.test(candidate);
  };

  const strict = buildCandidatePool({ recipes, mealType, answers, stage: 1 });
  const withFallback = strict.length >= limit ? strict : buildCandidatePool({ recipes, mealType, answers, stage: 2 });
  const loose = withFallback.length >= limit ? withFallback : buildCandidatePool({ recipes, mealType, answers, stage: 3 });
  const filtered = loose.filter((recipe) => recipe.id !== currentRecipe?.id);
  const withConcreteImages = filtered.filter((recipe) => hasConcreteImage(recipe));
  let candidatePool = withConcreteImages;

  if (candidatePool.length < limit) {
    const criticalRequirements = normalizeRequirements(answers.dietaryRequirements).filter((requirement) =>
      CRITICAL_REQUIREMENTS.has(normalizeText(requirement))
    );
    const allergyTerms = extractAllergyTerms(answers);
    const broadFallback = recipes
      .filter((recipe) => recipe.id !== currentRecipe?.id)
      .filter((recipe) => hasConcreteImage(recipe))
      .filter((recipe) => recipePassesAllergyCheck(recipe, allergyTerms))
      .filter((recipe) => recipeMatchesDietaryRequirements(recipe, criticalRequirements))
      .sort((a, b) => {
        const typeA = a.mealType === mealType ? 2 : mealType === 'snack' && a.mealType === 'breakfast' ? 1 : 0;
        const typeB = b.mealType === mealType ? 2 : mealType === 'snack' && b.mealType === 'breakfast' ? 1 : 0;
        const imageA = hasConcreteImage(a) ? 1 : 0;
        const imageB = hasConcreteImage(b) ? 1 : 0;
        return (
          imageB - imageA ||
          typeB - typeA ||
          recipePreferenceScore(b, answers) - recipePreferenceScore(a, answers) ||
          a.title.localeCompare(b.title)
        );
      });
    if (candidatePool.length === 0) {
      candidatePool = broadFallback;
    } else {
      const merged = new Map(candidatePool.map((recipe) => [recipe.id, recipe]));
      for (const recipe of broadFallback) {
        if (!merged.has(recipe.id)) merged.set(recipe.id, recipe);
      }
      candidatePool = [...merged.values()];
    }
  }

  if (!currentRecipe) {
    return candidatePool
      .map((recipe) => ({ recipe, hasImage: hasConcreteImage(recipe) }))
      .sort((a, b) => Number(b.hasImage) - Number(a.hasImage) || a.recipe.title.localeCompare(b.recipe.title))
      .slice(0, limit)
      .map((entry) => entry.recipe);
  }

  return candidatePool
    .map((recipe) => {
      const calorieDelta = Math.abs((recipe.calories || 0) - (currentRecipe.calories || 0));
      const proteinDelta = Math.abs((recipe.protein || 0) - (currentRecipe.protein || 0));
      const delta = calorieDelta + proteinDelta * 2;
      return { recipe, delta, hasImage: hasConcreteImage(recipe) };
    })
    .sort((a, b) => Number(b.hasImage) - Number(a.hasImage) || a.delta - b.delta || a.recipe.title.localeCompare(b.recipe.title))
    .slice(0, limit)
    .map((entry) => entry.recipe);
}

export function swapMealInPlan({
  mealPlan,
  dayIndex,
  mealType,
  replacementRecipeId,
}: {
  mealPlan: MealPlan;
  dayIndex: number;
  mealType: MealType;
  replacementRecipeId: string;
}) {
  const nextDays = mealPlan.days.map((day) => {
    if (day.dayIndex !== dayIndex) return day;

    if (mealType === 'snack') {
      return {
        ...day,
        meals: {
          ...day.meals,
          snacks: [replacementRecipeId],
        },
      };
    }

    return {
      ...day,
      meals: {
        ...day.meals,
        [mealType]: replacementRecipeId,
      },
    };
  });

  return {
    ...mealPlan,
    days: nextDays,
    generatedAt: new Date().toISOString(),
  };
}

function constrainMealsPerDay(mealPlan: MealPlan, answers: OnboardingAnswers): MealPlan {
  const coreMealTypes = getCoreMealTypesForAnswers(answers);
  const includeSnack = getIncludeSnackForAnswers(answers);
  const nextDays = mealPlan.days.map((day) => ({
    ...day,
    meals: {
      breakfast: coreMealTypes.includes('breakfast') ? day.meals.breakfast : undefined,
      lunch: coreMealTypes.includes('lunch') ? day.meals.lunch : undefined,
      dinner: coreMealTypes.includes('dinner') ? day.meals.dinner : undefined,
      snacks: includeSnack ? day.meals.snacks : undefined,
    },
  }));
  return {
    ...mealPlan,
    days: nextDays,
  };
}

function constrainDaysPerWeek(mealPlan: MealPlan, answers: OnboardingAnswers): MealPlan {
  const plannedDayCount = getPlannedDayCount(answers.daysPerWeek);
  const nextDays = mealPlan.days.slice(0, plannedDayCount).map((day, dayIndex) => ({
    ...day,
    dayIndex,
    label: MEAL_PLAN_DAYS[dayIndex] || day.label || `Day ${dayIndex + 1}`,
  }));
  return {
    ...mealPlan,
    days: nextDays,
  };
}

function targetUniqueCountForMealType({
  mealType,
  plannedDayCount,
  mealPrepFriendly,
  aggressive,
}: {
  mealType: 'breakfast' | 'lunch' | 'dinner';
  plannedDayCount: number;
  mealPrepFriendly: boolean;
  aggressive: boolean;
}) {
  if (plannedDayCount <= 2) return 1;
  if (aggressive) {
    if (mealType === 'breakfast') return 1;
    return plannedDayCount >= 6 ? 2 : 1;
  }
  if (mealPrepFriendly) {
    if (plannedDayCount <= 4) return 1;
    return 2;
  }
  if (plannedDayCount <= 4) return 2;
  if (plannedDayCount <= 6) return 2;
  return 3;
}

function compactMealPlanVariety(
  mealPlan: MealPlan,
  answers: OnboardingAnswers,
  recipeMap: Map<string, Recipe>,
  aggressive = false,
): MealPlan {
  const coreMealTypes = getCoreMealTypesForAnswers(answers);
  const plannedDayCount = getPlannedDayCount(answers.daysPerWeek);
  const mealPrepFriendly = answers.groceryPreference === 'meal prep friendly';

  const nextDays = mealPlan.days.map((day) => ({ ...day, meals: { ...day.meals } }));
  for (const mealType of coreMealTypes) {
    const targetUnique = targetUniqueCountForMealType({
      mealType,
      plannedDayCount,
      mealPrepFriendly,
      aggressive,
    });
    if (targetUnique <= 0) continue;
    const counts = new Map<string, number>();
    for (const day of nextDays) {
      const id = String(day.meals[mealType] || '').trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    if (counts.size <= targetUnique) continue;

    const keepIds = [...counts.entries()]
      .map(([id, count]) => {
        const recipe = recipeMap.get(id);
        return { id, count, preference: recipe ? recipePreferenceScore(recipe, answers) : 0 };
      })
      .sort((a, b) => b.count - a.count || b.preference - a.preference || a.id.localeCompare(b.id))
      .slice(0, targetUnique)
      .map((entry) => entry.id);

    if (keepIds.length === 0) continue;
    const pattern = MEAL_PREP_PATTERNS[mealType];
    for (let dayIndex = 0; dayIndex < nextDays.length; dayIndex += 1) {
      const currentId = String(nextDays[dayIndex].meals[mealType] || '').trim();
      if (keepIds.includes(currentId)) continue;
      nextDays[dayIndex].meals[mealType] = keepIds[(pattern[dayIndex % pattern.length] || 0) % keepIds.length];
    }
  }

  return {
    ...mealPlan,
    days: nextDays,
  };
}

function countGroceryItemsForPlan(mealPlan: MealPlan, recipeMap: Map<string, Recipe>) {
  const groups = buildGroceryListFromMealPlan(mealPlan, recipeMap);
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

function groceryItemBudgetForAnswers(answers: OnboardingAnswers) {
  const days = getPlannedDayCount(answers.daysPerWeek);
  const coreMealTypes = getCoreMealTypesForAnswers(answers).length;
  const includeSnack = getIncludeSnackForAnswers(answers);
  const mealSlots = days * (coreMealTypes + (includeSnack ? 1 : 0));
  const baseline = Math.round(mealSlots * 4.2);
  const cap = answers.groceryPreference === 'meal prep friendly' ? 75 : 95;
  const floor = answers.groceryPreference === 'meal prep friendly' ? 28 : 36;
  return Math.max(floor, Math.min(cap, baseline));
}

export function postProcessGeneratedMealPlan(mealPlan: MealPlan, answers: OnboardingAnswers, recipeMap: Map<string, Recipe>) {
  const constrainedDays = constrainDaysPerWeek(mealPlan, answers);
  const constrained = constrainMealsPerDay(constrainedDays, answers);
  const practical = normalizeMealAssignmentsForPracticality(constrained, answers, recipeMap);
  const compacted = compactMealPlanVariety(practical, answers, recipeMap, false);
  const groceryItemCount = countGroceryItemsForPlan(compacted, recipeMap);
  const groceryItemBudget = groceryItemBudgetForAnswers(answers);
  const bounded = groceryItemCount > groceryItemBudget ? compactMealPlanVariety(compacted, answers, recipeMap, true) : compacted;
  const prepDay = answers.prepDay || bounded.prepDayPlan?.prepDay || 'Sunday';
  const withPrepDay = bounded.prepDayPlan
    ? {
        ...bounded,
        prepDayPlan: {
          ...bounded.prepDayPlan,
          prepDay,
        },
      }
    : bounded;
  return withRecalculatedTotals(withPrepDay, recipeMap);
}

export function withRecalculatedTotals(mealPlan: MealPlan, recipeMap: Map<string, Recipe>) {
  const nextMealPlan: MealPlan = {
    ...mealPlan,
    days: mealPlan.days.map((day) => ({
      ...day,
      totals: calculateDayTotals(day, recipeMap),
    })),
  };
  return {
    ...nextMealPlan,
    prepDayPlan: buildPrepDayPlan(nextMealPlan, recipeMap, mealPlan.prepDayPlan?.prepDay || 'Sunday'),
  };
}

const LEADING_UNIT_WORDS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'g', 'kg', 'ml', 'l',
  'oz', 'lb', 'clove', 'cloves', 'can', 'cans', 'tin', 'tins', 'packet', 'packets', 'bunch', 'bunches', 'sprig',
  'sprigs', 'slice', 'slices', 'fillet', 'fillets', 'piece', 'pieces', 'handful', 'handfuls', 'stalk', 'stalks',
  'stick', 'sticks', 'x', 'cm', 'mm',
]);
const IGNORED_INGREDIENT_LINES = [
  'dressing',
  'salad dressing',
  'serve with',
  'serving suggestion',
  'optional serving suggestion',
  'garnish',
  'toppings',
  'toppings for taste',
  'laksa paste',
  'cauliflower',
  'spiced yoghurt dressing',
];
const SENTENCE_NOISE_PATTERNS = [
  /for those with/i,
  /cost effective/i,
  /from scratch/i,
  /check the label/i,
  /not included in nutrition/i,
  /available in most grocery stores/i,
  /substitute/i,
  /time-saving option/i,
  /serving suggestion/i,
  /included in nutrition/i,
  /to garnish/i,
  /for garnish/i,
  /optional toppings/i,
  /^note[:\s]/i,
  /^optional[:\s]/i,
];
const IGNORED_CANONICAL_INGREDIENTS = new Set([
  'water',
  'cold water',
  'boiling water',
  'lukewarm water',
  'additional water',
  'poaching water',
  'cooking water',
  'ice',
  'ice-cube',
  'ice cube',
]);
const GENERIC_CANONICAL_INGREDIENTS = new Set([
  'low fat',
  'reduced fat',
  'fat free',
  'roasted',
  'mixed',
  'desiccated',
  'seed',
  'nuts',
  'few cashew',
  'freshly ground black pepper',
  'salt and pepper',
  'salt and black pepper',
]);
const LEADING_DESCRIPTORS = new Set([
  'and',
  'small',
  'medium',
  'large',
  'mini',
  'fresh',
  'frozen',
  'dried',
  'roasted',
  'toasted',
  'fried',
  'salt-reduced',
  'reduced-salt',
  'reduced',
  'low',
  'fat',
  'wholemeal',
  'wholegrain',
  'plain',
  'unsweetened',
  'unsalted',
  'salted',
  'free',
  'reduced-fat',
  'low-fat',
  'fat-free',
  'few',
  'packed',
  'cooked',
  'natural',
  'free-range',
  'skinless',
  'yellow',
  'red',
  'green',
  'brown',
  'white',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'grated',
  'crushed',
  'roughly',
  'finely',
  'halved',
]);
const NUMBER_WORD_VALUES: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  quarter: 0.25,
};
const FRACTION_CHARACTER_VALUES: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const QUANTITY_UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',
  packet: 'packet',
  packets: 'packet',
  bunch: 'bunch',
  bunches: 'bunch',
  sprig: 'sprig',
  sprigs: 'sprig',
  slice: 'slice',
  slices: 'slice',
  clove: 'clove',
  cloves: 'clove',
  egg: 'egg',
  eggs: 'egg',
  eggwhite: 'egg',
  eggwhites: 'egg',
  piece: 'piece',
  pieces: 'piece',
  fillet: 'fillet',
  fillets: 'fillet',
  stalk: 'stalk',
  stalks: 'stalk',
  stick: 'stick',
  sticks: 'stick',
  bag: 'bag',
  bags: 'bag',
  head: 'head',
  heads: 'head',
  pita: 'pita',
  pitas: 'pita',
  banana: 'banana',
  bananas: 'banana',
  avocado: 'avocado',
  avocados: 'avocado',
  carrot: 'carrot',
  carrots: 'carrot',
  onion: 'onion',
  onions: 'onion',
  zucchini: 'zucchini',
  zucchinis: 'zucchini',
  capsicum: 'capsicum',
  capsicums: 'capsicum',
  tomato: 'tomato',
  tomatoes: 'tomato',
  potato: 'potato',
  potatoes: 'potato',
  lemon: 'lemon',
  lemons: 'lemon',
  lime: 'lime',
  limes: 'lime',
  orange: 'orange',
  oranges: 'orange',
  date: 'date',
  dates: 'date',
  peach: 'peach',
  peaches: 'peach',
  mango: 'mango',
  mangoes: 'mango',
  leek: 'leek',
  leeks: 'leek',
};
const MEASURE_UNITS = new Set(['cup', 'tbsp', 'tsp', 'g', 'kg', 'ml', 'l']);
const UNIT_DISPLAY_ORDER = [
  'kg',
  'g',
  'l',
  'ml',
  'cup',
  'tbsp',
  'tsp',
  'can',
  'tin',
  'packet',
  'bunch',
  'clove',
  'egg',
  'piece',
  'slice',
  'sprig',
  'fillet',
  'stalk',
  'stick',
  'bag',
  'head',
  'pita',
  'banana',
  'avocado',
  'carrot',
  'onion',
  'zucchini',
  'capsicum',
  'tomato',
  'potato',
  'lemon',
  'lime',
  'orange',
  'date',
  'peach',
  'mango',
  'leek',
];
const QUALITATIVE_QUANTITY_PATTERNS = [
  /^to taste$/i,
  /^as needed$/i,
  /^as required$/i,
  /^for serving$/i,
  /^for garnish(?:ing)?$/i,
  /^optional$/i,
  /^pinch$/i,
  /^pinches$/i,
];

function isQualitativeQuantityLabel(value: string) {
  const normalized = cleanIngredientLine(String(value || '')).toLowerCase();
  if (!normalized) return false;
  return QUALITATIVE_QUANTITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function cleanIngredientLine(value: string) {
  return String(value || '')
    .replace(/[•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFractionCharacters(value: string) {
  return String(value || '').replace(
    /(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/g,
    (_, whole: string, fraction: string) => `${whole} ${fraction}`,
  );
}

function parseAmountToken(rawToken: string) {
  const token = normalizeText(rawToken);
  if (!token) return undefined;
  if (NUMBER_WORD_VALUES[token] !== undefined) return NUMBER_WORD_VALUES[token];
  if (FRACTION_CHARACTER_VALUES[token] !== undefined) return FRACTION_CHARACTER_VALUES[token];
  if (/^\d+\s+\d+\/\d+$/.test(token)) {
    const [whole, fraction] = token.split(/\s+/);
    const [numerator, denominator] = fraction.split('/').map(Number);
    if (!denominator) return undefined;
    return Number(whole) + numerator / denominator;
  }
  if (/^\d+\/\d+$/.test(token)) {
    const [numerator, denominator] = token.split('/').map(Number);
    if (!denominator) return undefined;
    return numerator / denominator;
  }
  const numeric = Number(token);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseAmountExpression(rawExpression: string) {
  const expression = normalizeFractionCharacters(rawExpression).replace(/\s+/g, ' ').trim().toLowerCase();
  if (!expression) return undefined;
  const rangeParts = expression.split(/\s*-\s*/).map((part) => parseAmountToken(part)).filter((value): value is number => Number.isFinite(value));
  if (rangeParts.length > 1) return rangeParts.reduce((acc, value) => acc + value, 0) / rangeParts.length;
  return parseAmountToken(expression);
}

function normalizeQuantityUnitToken(token: string) {
  const cleaned = normalizeText(token).replace(/[^a-z]/g, '');
  if (!cleaned) return '';
  return QUANTITY_UNIT_ALIASES[cleaned] || '';
}

function extractAggregatedQuantity(line: string) {
  const source = normalizeFractionCharacters(cleanIngredientLine(line).toLowerCase())
    .replace(/^(?:juice|rind|zest|seeds?)\s+of\s+/i, '')
    .replace(/^(?:about|approx(?:\.|imately)?)\s+/i, '')
    .trim();
  if (!source) return null;

  const compactUnitMatch = source.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l)\b/i);
  if (compactUnitMatch) {
    const normalized = normalizeAggregatedUnitAmount(
      Number(compactUnitMatch[1]),
      normalizeQuantityUnitToken(compactUnitMatch[2]) || compactUnitMatch[2].toLowerCase(),
    );
    return {
      amount: normalized.amount,
      unit: normalized.unit,
    };
  }

  const amountMatch = source.match(
    /^((?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)(?:\s*-\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?)/i
  );
  if (!amountMatch) return null;

  let amount = parseAmountExpression(amountMatch[1]);
  if (!amount || !Number.isFinite(amount) || amount <= 0) return null;

  let rest = source.slice(amountMatch[0].length).trim();
  if (/^x\b/i.test(rest)) {
    rest = rest.replace(/^x\b\s*/i, '');
    const multipliedMatch = rest.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l)\b/i);
    if (multipliedMatch) {
      const multiplier = Number(multipliedMatch[1]);
      if (Number.isFinite(multiplier) && multiplier > 0) {
        amount *= multiplier;
      }
      const normalized = normalizeAggregatedUnitAmount(
        amount,
        normalizeQuantityUnitToken(multipliedMatch[2]) || multipliedMatch[2].toLowerCase(),
      );
      return {
        amount: normalized.amount,
        unit: normalized.unit,
      };
    }
  }

  const unitTokens = rest.replace(/^[^a-z0-9]+/i, '').split(/\s+/).filter(Boolean);
  while (unitTokens.length > 0) {
    const token = normalizeText(unitTokens[0]).replace(/[^a-z]/g, '');
    if (!token || token === 'of' || token === 'and' || token === 'or' || token === 'x') {
      unitTokens.shift();
      continue;
    }
    if (LEADING_DESCRIPTORS.has(token)) {
      unitTokens.shift();
      continue;
    }
    break;
  }

  let unit = '';
  if (unitTokens.length >= 2) {
    unit = normalizeQuantityUnitToken(`${unitTokens[0]}${unitTokens[1]}`);
  }
  if (!unit) {
    for (const token of unitTokens.slice(0, 4)) {
      unit = normalizeQuantityUnitToken(token);
      if (unit) break;
    }
  }

  if (!unit) return null;
  const normalized = normalizeAggregatedUnitAmount(amount, unit);
  return { amount: normalized.amount, unit: normalized.unit };
}

function normalizeAggregatedUnitAmount(amount: number, unit: string) {
  let normalizedAmount = Number(amount || 0);
  let normalizedUnit = unit;
  if (unit === 'kg') {
    normalizedAmount *= 1000;
    normalizedUnit = 'g';
  } else if (unit === 'l') {
    normalizedAmount *= 1000;
    normalizedUnit = 'ml';
  }
  return { amount: normalizedAmount, unit: normalizedUnit };
}

function formatAggregatedAmount(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function formatQuantityUnit(unit: string, amount: number) {
  if (!unit) return '';
  if (unit === 'cup') return Math.abs(amount - 1) < 0.000001 ? 'cup' : 'cups';
  if (MEASURE_UNITS.has(unit)) return unit;
  if (Math.abs(amount - 1) < 0.000001) return unit;
  if (unit.endsWith('ch') || unit.endsWith('sh') || unit.endsWith('x') || unit.endsWith('z') || unit.endsWith('s')) {
    return `${unit}es`;
  }
  if (unit.endsWith('y') && !/[aeiou]y$/.test(unit)) {
    return `${unit.slice(0, -1)}ies`;
  }
  if (unit.endsWith('f')) {
    return `${unit.slice(0, -1)}ves`;
  }
  if (unit.endsWith('fe')) {
    return `${unit.slice(0, -2)}ves`;
  }
  return `${unit}s`;
}

function formatQuantityLabels(quantityTotals: Map<string, number>, unparsedCounts: Map<string, number>) {
  const totals = [...quantityTotals.entries()]
    .sort((a, b) => {
      const firstOrder = UNIT_DISPLAY_ORDER.indexOf(a[0]);
      const secondOrder = UNIT_DISPLAY_ORDER.indexOf(b[0]);
      const firstRank = firstOrder === -1 ? 999 : firstOrder;
      const secondRank = secondOrder === -1 ? 999 : secondOrder;
      if (firstRank !== secondRank) return firstRank - secondRank;
      return a[0].localeCompare(b[0]);
    })
    .map(([unit, amount]) => {
      let displayAmount = amount;
      let displayUnit = unit;
      if (unit === 'g' && amount >= 1000) {
        displayAmount = amount / 1000;
        displayUnit = 'kg';
      } else if (unit === 'ml' && amount >= 1000) {
        displayAmount = amount / 1000;
        displayUnit = 'l';
      }
      const unitLabel = formatQuantityUnit(displayUnit, displayAmount);
      return [formatAggregatedAmount(displayAmount), unitLabel].filter(Boolean).join(' ');
    });

  const looseTotals = new Map<string, number>();
  const qualitativeLabels = new Set<string>();
  const remainingUnparsed: Array<{ label: string; count: number }> = [];
  for (const [label, count] of unparsedCounts.entries()) {
    const cleanedLabel = cleanIngredientLine(label);
    if (isQualitativeQuantityLabel(cleanedLabel)) {
      qualitativeLabels.add(cleanedLabel.toLowerCase());
      continue;
    }
    const looseMatch = cleanedLabel.match(
      /^((?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)(?:\s*-\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?)\s+(.+)$/i
    );
    if (!looseMatch) {
      remainingUnparsed.push({ label: cleanedLabel, count });
      continue;
    }
    const looseAmount = parseAmountExpression(looseMatch[1]);
    const looseUnitText = cleanIngredientLine(looseMatch[2]).replace(/\s+/g, ' ').trim();
    if (isQualitativeQuantityLabel(looseUnitText)) {
      qualitativeLabels.add(looseUnitText.toLowerCase());
      continue;
    }
    if (!looseAmount || !Number.isFinite(looseAmount) || looseAmount <= 0 || !looseUnitText) {
      remainingUnparsed.push({ label: cleanedLabel, count });
      continue;
    }
    looseTotals.set(looseUnitText, (looseTotals.get(looseUnitText) || 0) + looseAmount * count);
  }

  const looseLabels = [...looseTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([unitText, amount]) => `${formatAggregatedAmount(amount)} ${unitText}`);

  const unparsed = [...remainingUnparsed]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(({ label, count }) => {
      if (isQualitativeQuantityLabel(label)) {
        return label.toLowerCase();
      }
      if (count <= 1.01) return label;
      return `${label} x${formatAggregatedAmount(count)}`;
    });

  const qualitative = [...qualitativeLabels]
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return [...totals, ...looseLabels, ...qualitative, ...unparsed];
}

function shouldIgnoreIngredientLine(line: string) {
  const normalized = normalizeText(line);
  if (!normalized) return true;
  if (/\boptional\b/i.test(line)) return true;
  if (/\bto serve\b/i.test(line)) return true;
  if (/\bgarnish\b/i.test(line)) return true;
  const lettersOnly = line.replace(/[^A-Za-z]/g, '');
  const isUpperHeading =
    lettersOnly.length >= 4 &&
    lettersOnly === lettersOnly.toUpperCase() &&
    line.split(/\s+/).filter(Boolean).length <= 6;
  if (isUpperHeading) return true;
  if (line.trim().endsWith(':')) return true;
  if (/\sand\s*$/i.test(line)) return true;
  if (/\bto taste\b/i.test(line)) return true;
  if (SENTENCE_NOISE_PATTERNS.some((pattern) => pattern.test(line))) return true;
  if (normalized.length > 75 && /\b(check|choose|available|substitute|suggestion|not included)\b/i.test(normalized)) return true;
  return IGNORED_INGREDIENT_LINES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

function extractInlineQuantity(line: string) {
  const match = line.match(
    /^((?:about|approx(?:\.|imately)?)?\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)(?:\s*-\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?(?:\s+[a-zA-Z%]+){0,2})/i
  );
  if (!match) return '';
  return match[1]
    .trim()
    .replace(/\s+of$/i, '')
    .replace(/\s+(?:ground|fresh|dried|chopped|minced|grated|crushed|sliced|diced|finely|roughly)$/i, '');
}

function normalizeIngredientBaseName(rawLine: string) {
  let value = cleanIngredientLine(rawLine);
  value = value.replace(/^\**\s*/, '').replace(/\**$/, '');
  value = value.replace(/\([^)]*\)/g, ' ');
  value = value.split(',')[0] || value;
  value = value.split(/\s[-–—]\s/)[0] || value;
  value = value.replace(/^[^a-zA-Z0-9]+/, '').trim();
  value = value.replace(
    /^(?:about|approx(?:\.|imately)?)?\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)(?:\s*-\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?\s*/i,
    '',
  );
  value = value.replace(/^(?:juice(?:\s+and\s+rind)?|rind|zest|seeds?|arils?)\s+of\s+/i, '');
  value = value.replace(/^juice\s+and\s+rind\s+of\s+/i, '');

  const tokens = value.split(/\s+/).filter(Boolean);
  while (tokens.length > 1) {
    const token = normalizeText(tokens[0]);
    if (LEADING_UNIT_WORDS.has(token) || /^\d+(g|kg|ml|l)$/i.test(token)) {
      tokens.shift();
      continue;
    }
    if (LEADING_DESCRIPTORS.has(token)) {
      tokens.shift();
      continue;
    }
    break;
  }

  value = tokens
    .join(' ')
    .replace(/^(?:of|fresh|dried)\s+/i, '')
    .replace(/^(?:piece|pieces|sprig|sprigs|handful|handfuls)\s+of\s+/i, '')
    .replace(/\b(?:leaf|leaves|stem|stems|sprig|sprigs)\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return value;
}

function canonicalizeIngredientBaseName(baseName: string) {
  let value = normalizeText(baseName)
    .replace(/[*/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  value = value
    .replace(/extra[\s-]?virgin olive oil/g, 'olive oil')
    .replace(/olive oil spray|spray olive oil/g, 'olive oil')
    .replace(/olive oil margarine spread/g, 'olive oil margarine spread')
    .replace(/\bno added salt\b/g, '')
    .replace(/\breduced[\s-]?salt\b/g, '')
    .replace(/\bunsalted\b/g, '')
    .replace(/\bgarlic cloves?\b/g, 'garlic')
    .replace(/\beschallots?\b/g, 'shallot')
    .replace(/\bbasil leaves?\b/g, 'basil')
    .replace(/\bbean shoots?\b/g, 'bean sprouts')
    .replace(/\bbean sprout\b/g, 'bean sprouts')
    .replace(/\bmango cheeks?\b/g, 'mango')
    .replace(/\borange rind\b/g, 'orange')
    .replace(/\borange zest\b/g, 'orange')
    .replace(/\blemon rind\b/g, 'lemon')
    .replace(/\blemon zest\b/g, 'lemon')
    .replace(/\bpomegranate seeds?\b/g, 'pomegranate')
    .replace(/\begg whites?\b/g, 'egg')
    .replace(/\bice[-\s]?cubes?\b/g, 'ice cube')
    .replace(/\bshallots?\b/g, 'shallot')
    .replace(/\bpepita seeds?\b/g, 'pepitas')
    .replace(/\bsunflower seeds?\b/g, 'sunflower seed')
    .replace(/\bpine nuts?\b/g, 'pine nut')
    .replace(/\balmonds?\b/g, 'almond')
    .replace(/\bcashews?\b/g, 'cashew')
    .replace(/\bwalnuts?\b/g, 'walnut')
    .replace(/\bto serve\b/g, '')
    .replace(/\bfresh coriander or parsley\b/g, 'coriander')
    .replace(/\bfor garnish(?:ing)?\b/g, '')
    .replace(/\bto garnish\b/g, '')
    .replace(/\bto sprinkle on top\b/g, '')
    .replace(/\bskin removed\b/g, '')
    .replace(/\bserves?\s+of\s+/g, '')
    .replace(/\blow sodium\b/g, '')
    .replace(/\bsoy sauce bok\b/g, 'soy sauce')
    .replace(/\balmond(?:s)?\s+cut\s+in\s+half(?:\s+and\s+toasted)?\b/g, 'almond')
    .replace(/\bthai basil\b/g, 'basil')
    .replace(/\blemon or lime\b/g, 'lemon')
    .replace(/\bsriracha or chilli\b/g, 'chilli')
    .replace(/\bleon juice\b/g, 'lemon juice')
    .replace(/\bjuice and rind of\b/g, '')
    .replace(/\bcoconut\b$/g, '')
    .replace(/\bextra chia seed\b/g, '')
    .replace(/\bfor cooking\b/g, '')
    .replace(/\bcut in half(?: and toasted)?\b/g, '')
    .replace(/\bfinely sliced\b/g, '')
    .replace(/\bthinly sliced\b/g, '')
    .replace(/\bwholegrain noodles?\b/g, 'wholegrain noodle')
    .replace(/^or\s+\d+\s+/g, '')
    .replace(/\bpieces?\s+of\s+/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  value = value.replace(/\b(halves|half|chunks|chunk|diced|sliced|chopped|minced|grated|crushed|washed|rinsed|trimmed|finely|roughly|thinly)\b$/g, '').trim();
  value = value
    .replace(/\bblueberrie\b/g, 'blueberry')
    .replace(/\bstrawberrie\b/g, 'strawberry')
    .replace(/\bpeache\b/g, 'peach')
    .replace(/\bpotatoe\b/g, 'potato')
    .replace(/\btomatoe\b/g, 'tomato')
    .replace(/\bcouscou\b/g, 'couscous')
    .trim();
  if (value.endsWith('ies') && value.length > 4) {
    value = `${value.slice(0, -3)}y`;
  } else if (/(ches|shes|xes|zes)$/.test(value) && value.length > 5) {
    value = value.slice(0, -2);
  } else if (value.endsWith('oes') && value.length > 4) {
    value = `${value.slice(0, -2)}`;
  } else if (value.endsWith('s') && !value.endsWith('ss') && !value.endsWith('ous') && value.length > 4) {
    value = value.slice(0, -1);
  }
  return value;
}

function toIngredientDisplayName(baseName: string) {
  const lower = normalizeText(baseName);
  return lower.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function inferGroceryCategory(baseName: string) {
  const text = normalizeText(baseName);
  if (
    containsAny(text, [
      'salt', 'pepper', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'masala', 'mustard', 'spice', 'ground coriander', 'herb', 'clove', 'zaatar', 'anise',
    ])
  ) {
    return 'herbs & spices';
  }
  if (containsAny(text, ['sauce', 'paste', 'marinade', 'vinegar', 'stock', 'honey', 'oil', 'sugar', 'water'])) {
    return 'pantry';
  }
  if (
    containsAny(text, [
      'chicken', 'beef', 'salmon', 'egg', 'tofu', 'beans', 'lentil', 'chickpea', 'steak', 'tuna', 'fillet', 'broth',
    ])
  ) {
    return 'protein';
  }
  if (containsAny(text, ['yoghurt', 'yogurt', 'milk', 'feta', 'ricotta', 'cheese', 'haloumi', 'bocconcini', 'chevre', 'kefir'])) {
    return 'dairy';
  }
  if (containsAny(text, ['rice', 'pasta', 'noodle', 'oats', 'flour', 'farro', 'freekeh', 'quinoa', 'couscous', 'tortilla', 'spaghetti', 'pita', 'polenta'])) {
    return 'grains';
  }
  if (
    containsAny(text, [
      'carrot', 'onion', 'tomato', 'capsicum', 'zucchini', 'spinach', 'kale', 'lettuce', 'mint', 'parsley',
      'coriander', 'basil', 'ginger', 'pumpkin', 'beetroot', 'cucumber', 'lemon', 'lime', 'fruit', 'berries', 'berry', 'blueberry', 'kiwi',
      'mushroom', 'snow pea', 'green pea', 'broccoli', 'celery', 'avocado', 'chilli', 'peach', 'date', 'banana', 'grape', 'apple',
      'potato', 'shallot', 'sprout', 'cabbage', 'garlic', 'mango', 'leek', 'orange', 'pomegranate',
    ])
  ) {
    return 'produce';
  }
  return 'pantry';
}

function shouldIgnoreCanonicalIngredient(baseName: string) {
  const normalized = normalizeText(baseName);
  if (!normalized) return true;
  if (IGNORED_CANONICAL_INGREDIENTS.has(normalized)) return true;
  if (GENERIC_CANONICAL_INGREDIENTS.has(normalized)) return true;
  if (/^water\s+as\s+needed\b/.test(normalized)) return true;
  if (/^arils?\s+from\b/.test(normalized)) return true;
  if (/^juice\s+of\b/.test(normalized)) return true;
  if (/^rind\s+of\b/.test(normalized)) return true;
  return false;
}

function toRecipeUsageMap(recipeUsage: string[] | Map<string, number>) {
  if (recipeUsage instanceof Map) return new Map(recipeUsage);
  const usage = new Map<string, number>();
  for (const recipeId of recipeUsage) {
    if (!recipeId) continue;
    usage.set(recipeId, (usage.get(recipeId) || 0) + 1);
  }
  return usage;
}

function groceryItemCategoryPriority(category: string) {
  const normalized = normalizeText(category);
  if (normalized === 'protein') return 6;
  if (normalized === 'produce') return 5;
  if (normalized === 'grains') return 4;
  if (normalized === 'dairy') return 4;
  if (normalized === 'herbs & spices') return 2;
  return 1;
}

function scoreGroceryItem(item: GroceryItem) {
  let score = groceryItemCategoryPriority(item.category) * 10;
  const quantities = Array.isArray(item.quantities) ? item.quantities : [];
  const hasParsedQuantity = quantities.some((entry) => /\d/.test(String(entry || '')));
  if (hasParsedQuantity) score += 8;
  score += Math.min(8, quantities.length * 2);
  if (item.name.length <= 20) score += 1;
  return score;
}

function capGroceryGroupsComplexity(groups: GroceryGroup[], recipeUsage: Map<string, number>) {
  const totalPortions = [...recipeUsage.values()].reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
  const maxItems = Math.max(24, Math.min(84, Math.round(totalPortions * 4.5)));

  const flat = groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      category: group.category || item.category,
      score: scoreGroceryItem(item),
    })),
  );

  if (flat.length <= maxItems) return groups;

  const perCategoryCaps: Record<string, number> = {
    protein: Math.ceil(maxItems * 0.22),
    produce: Math.ceil(maxItems * 0.32),
    grains: Math.ceil(maxItems * 0.16),
    dairy: Math.ceil(maxItems * 0.16),
    'herbs & spices': Math.ceil(maxItems * 0.1),
    pantry: Math.ceil(maxItems * 0.2),
  };
  const categoryCounts = new Map<string, number>();
  const selected: Array<GroceryItem & { score: number }> = [];

  const sorted = flat
    .slice()
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  for (const item of sorted) {
    if (selected.length >= maxItems) break;
    const category = item.category || 'pantry';
    const currentCount = categoryCounts.get(category) || 0;
    const categoryCap = perCategoryCaps[category] || Math.ceil(maxItems * 0.18);
    if (currentCount >= categoryCap) continue;
    selected.push(item);
    categoryCounts.set(category, currentCount + 1);
  }

  if (selected.length < Math.min(maxItems, sorted.length)) {
    for (const item of sorted) {
      if (selected.length >= maxItems) break;
      if (selected.some((entry) => entry.key === item.key)) continue;
      selected.push(item);
    }
  }

  const byCategory = new Map<string, GroceryItem[]>();
  for (const item of selected) {
    const groupItems = byCategory.get(item.category) || [];
    groupItems.push({
      key: item.key,
      name: item.name,
      category: item.category,
      quantities: item.quantities,
    });
    byCategory.set(item.category, groupItems);
  }

  return [...byCategory.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function buildGroceryListForRecipeIds(recipeUsage: string[] | Map<string, number>, recipeMap: Map<string, Recipe>) {
  const usage = toRecipeUsageMap(recipeUsage);
  const bucket = new Map<string, GroceryItem & { quantityTotals: Map<string, number>; unparsedCounts: Map<string, number> }>();

  for (const [recipeId, requiredPortions] of usage.entries()) {
    const recipe = recipeMap.get(recipeId);
    if (!recipe) continue;
    const serves = Math.max(1, parseRecipeServesCount(recipe));
    const scaleFactor = Math.max(0.01, requiredPortions / serves);

    for (const ingredient of recipe.ingredients) {
      const line = cleanIngredientLine(ingredient.name || '');
      if (!line || shouldIgnoreIngredientLine(line)) continue;

      const baseName = normalizeIngredientBaseName(line);
      if (!baseName) continue;
      const canonicalBaseName = canonicalizeIngredientBaseName(baseName);
      if (!canonicalBaseName) continue;
      if (shouldIgnoreCanonicalIngredient(canonicalBaseName)) continue;

      const displayName = toIngredientDisplayName(canonicalBaseName);
      const key = normalizeText(canonicalBaseName);
      const quantityLabel =
        [ingredient.quantity, ingredient.unit].filter(Boolean).join(' ').trim() || extractInlineQuantity(line);
      const aggregatedQuantity = extractAggregatedQuantity(quantityLabel) || extractAggregatedQuantity(line);
      if (aggregatedQuantity) {
        const tinyMeasure =
          (aggregatedQuantity.unit === 'g' || aggregatedQuantity.unit === 'ml') && aggregatedQuantity.amount * scaleFactor < 5;
        const tinySpoon =
          (aggregatedQuantity.unit === 'tbsp' || aggregatedQuantity.unit === 'tsp') && aggregatedQuantity.amount * scaleFactor < 0.25;
        const tinyCount =
          !MEASURE_UNITS.has(aggregatedQuantity.unit) && aggregatedQuantity.amount * scaleFactor < 0.2;
        if (tinyMeasure || tinySpoon || tinyCount) continue;
      }
      const category = inferGroceryCategory(canonicalBaseName);
      const existing = bucket.get(key);

      if (!existing) {
        const quantityTotals = new Map<string, number>();
        const unparsedCounts = new Map<string, number>();
        if (aggregatedQuantity) {
          quantityTotals.set(aggregatedQuantity.unit, aggregatedQuantity.amount * scaleFactor);
        } else if (quantityLabel) {
          unparsedCounts.set(quantityLabel, scaleFactor);
        }
        bucket.set(key, {
          key,
          name: displayName,
          category,
          quantities: [],
          quantityTotals,
          unparsedCounts,
        });
        continue;
      }

      if (aggregatedQuantity) {
        existing.quantityTotals.set(
          aggregatedQuantity.unit,
          (existing.quantityTotals.get(aggregatedQuantity.unit) || 0) + aggregatedQuantity.amount * scaleFactor
        );
      } else if (quantityLabel) {
        existing.unparsedCounts.set(quantityLabel, (existing.unparsedCounts.get(quantityLabel) || 0) + scaleFactor);
      }
    }
  }

  const byCategory = new Map<string, GroceryItem[]>();
  for (const item of bucket.values()) {
    const normalizedItem: GroceryItem = {
      key: item.key,
      name: item.name,
      category: item.category,
      quantities: formatQuantityLabels(item.quantityTotals, item.unparsedCounts),
    };
    if (!byCategory.has(normalizedItem.category)) byCategory.set(normalizedItem.category, []);
    byCategory.get(normalizedItem.category)?.push(normalizedItem);
  }

  const groups = [...byCategory.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return capGroceryGroupsComplexity(groups, usage);
}

export function buildGroceryListByMealType(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>): MealGroceryBreakdown[] {
  if (!mealPlan) return [];

  const usageByMealType: Record<MealType, Map<string, number>> = {
    breakfast: new Map<string, number>(),
    lunch: new Map<string, number>(),
    dinner: new Map<string, number>(),
    snack: new Map<string, number>(),
  };

  for (const day of mealPlan.days) {
    if (day.meals.breakfast) {
      usageByMealType.breakfast.set(day.meals.breakfast, (usageByMealType.breakfast.get(day.meals.breakfast) || 0) + 1);
    }
    if (day.meals.lunch) {
      usageByMealType.lunch.set(day.meals.lunch, (usageByMealType.lunch.get(day.meals.lunch) || 0) + 1);
    }
    if (day.meals.dinner) {
      usageByMealType.dinner.set(day.meals.dinner, (usageByMealType.dinner.get(day.meals.dinner) || 0) + 1);
    }
    for (const snackId of day.meals.snacks || []) {
      if (snackId) {
        usageByMealType.snack.set(snackId, (usageByMealType.snack.get(snackId) || 0) + 1);
      }
    }
  }

  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return order
    .map((mealType) => {
      const usage = usageByMealType[mealType];
      const recipeIds = [...usage.keys()];
      const recipeTitles = recipeIds
        .map((id) => recipeMap.get(id)?.title || '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return {
        mealType,
        recipeIds,
        recipeTitles,
        groups: buildGroceryListForRecipeIds(usage, recipeMap),
      };
    })
    .filter((entry) => entry.recipeTitles.length > 0 || entry.groups.length > 0);
}

export function buildGroceryListFromMealPlan(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>) {
  if (!mealPlan) return [];
  const usage = buildRecipeUsageMapFromMealPlan(mealPlan);
  return buildGroceryListForRecipeIds(usage, recipeMap);
}

export function getCurrentWeight(weightLogs: WeightLogEntry[], startingWeight?: number) {
  if (weightLogs.length > 0) return weightLogs[0].weight;
  return startingWeight;
}

export function calculateGoalProgress({
  startingWeight,
  goalWeight,
  currentWeight,
}: {
  startingWeight?: number;
  goalWeight?: number;
  currentWeight?: number;
}) {
  if (!startingWeight || !goalWeight || !currentWeight || startingWeight <= goalWeight) {
    return 0;
  }
  const totalToLose = startingWeight - goalWeight;
  const lost = Math.max(0, startingWeight - currentWeight);
  return Math.min(100, Math.round((lost / totalToLose) * 100));
}
