import { MEAL_PLAN_DAYS } from './constants';
import type { MealPlan, MealPlanDay, MealType, OnboardingAnswers, Recipe, WeightLogEntry } from './types';

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

export interface MealPlanGenerationResult {
  mealPlan: MealPlan;
  notes: string[];
}

const CRITICAL_REQUIREMENTS = new Set(['vegetarian', 'vegan', 'gluten free', 'dairy free', 'nut free', 'halal', 'kosher']);
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
    if (normalized === 'gluten free' && (allergens.has('gluten') || !tags.has('gluten-free'))) return false;
    if (normalized === 'dairy free' && (allergens.has('dairy') || !tags.has('dairy-free'))) return false;
    if (normalized === 'nut free' && allergens.has('nut')) return false;
    if (normalized === 'low carb' && !tags.has('low-carb')) return false;
    if (normalized === 'high protein' && !tags.has('high-protein')) return false;
  }

  return true;
}

function recipePassesAllergyCheck(recipe: Recipe, allergyTerms: string[]) {
  if (allergyTerms.length === 0) return true;
  const text = recipeText(recipe);
  return !allergyTerms.some((term) => text.includes(term));
}

function recipePassesDislikes(recipe: Recipe, dislikes: string[]) {
  if (dislikes.length === 0) return true;
  const text = recipeText(recipe);
  return !dislikes.some((term) => text.includes(term));
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

  if (tags.includes('high-protein')) score += 5;
  if (tags.includes('low-carb')) score += 2;
  if ((recipe.calories || 0) > 0 && (recipe.calories || 0) <= 620) score += 2;
  if ((recipe.prepTimeMinutes || 40) <= 25) score += 3;

  if (answers.preferredMealStyle === 'high protein' && tags.includes('high-protein')) score += 4;
  if (answers.preferredMealStyle === 'low prep' && (recipe.prepTimeMinutes || 99) <= 20) score += 3;
  if (answers.preferredMealStyle === 'quick and easy' && (recipe.prepTimeMinutes || 99) <= 25) score += 3;
  if (answers.preferredMealStyle === 'vegetarian leaning' && tags.includes('vegetarian')) score += 3;

  if (answers.groceryPreference === 'fastest meals possible' && (recipe.prepTimeMinutes || 99) <= 20) score += 2;
  if (answers.groceryPreference === 'meal prep friendly' && containsAny(title, ['bowl', 'stew', 'roast', 'salad'])) score += 2;
  if (answers.groceryPreference === 'simple supermarket ingredients' && (recipe.ingredients.length || 0) <= 10) score += 2;
  if (answers.groceryPreference === 'high variety') score += 1;

  if (answers.budgetPreference === 'low cost' && String(recipe.estimatedCost).toLowerCase().includes('low')) score += 2;
  if (answers.budgetPreference === 'premium' && String(recipe.estimatedCost).toLowerCase().includes('premium')) score += 1;

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

  const withMealType = stage === 3
    ? recipes.filter((recipe) => recipe.mealType === mealType || (mealType === 'snack' && recipe.mealType === 'breakfast'))
    : recipes.filter((recipe) => recipe.mealType === mealType);

  return withMealType
    .filter((recipe) => recipePassesAllergyCheck(recipe, allergyTerms))
    .filter((recipe) => recipeMatchesDietaryRequirements(recipe, strictRequirements))
    .filter((recipe) => recipePassesDislikes(recipe, dislikes))
    .sort((a, b) => recipePreferenceScore(b, answers) - recipePreferenceScore(a, answers) || a.title.localeCompare(b.title));
}

function pickRecipe({
  candidates,
  random,
  usedCount,
  dayOffset,
}: {
  candidates: Recipe[];
  random: () => number;
  usedCount: Record<string, number>;
  dayOffset: number;
}) {
  if (candidates.length === 0) return undefined;

  const leastUsed = candidates.filter((recipe) => (usedCount[recipe.id] || 0) < 2);
  const pool = leastUsed.length > 0 ? leastUsed : candidates;
  const jitter = Math.floor(random() * Math.min(4, pool.length));
  const index = (dayOffset + jitter) % pool.length;
  const picked = pool[index];
  usedCount[picked.id] = (usedCount[picked.id] || 0) + 1;
  return picked;
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

export function generateMealPlan({
  recipes,
  answers,
}: {
  recipes: Recipe[];
  answers: OnboardingAnswers;
}): MealPlanGenerationResult {
  const notes: string[] = [];
  const random = seededRandom(
    `${answers.firstName}|${answers.age || ''}|${answers.goalWeightKg || ''}|${answers.biggestChallenge}|${answers.mainGoal}`
  );
  const usedCount: Record<string, number> = {};

  const requiresSnack = answers.mealsPerDay >= 4;
  const mealTypesForDay: MealType[] = requiresSnack ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner'];

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

  const days: MealPlanDay[] = [];
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  for (let dayIndex = 0; dayIndex < MEAL_PLAN_DAYS.length; dayIndex += 1) {
    const breakfastRecipe = pickRecipe({
      candidates: candidatePools.breakfast,
      random,
      usedCount,
      dayOffset: dayIndex,
    });
    const lunchRecipe = pickRecipe({
      candidates: candidatePools.lunch,
      random,
      usedCount,
      dayOffset: dayIndex + 1,
    });
    const dinnerRecipe = pickRecipe({
      candidates: candidatePools.dinner,
      random,
      usedCount,
      dayOffset: dayIndex + 2,
    });

    const snacks = requiresSnack
      ? [
          pickRecipe({
            candidates: candidatePools.snack.length > 0 ? candidatePools.snack : candidatePools.breakfast,
            random,
            usedCount,
            dayOffset: dayIndex + 3,
          }),
        ]
          .filter(Boolean)
          .map((recipe) => recipe?.id as string)
      : [];

    const day: MealPlanDay = {
      dayIndex,
      label: MEAL_PLAN_DAYS[dayIndex],
      meals: {
        breakfast: breakfastRecipe?.id,
        lunch: lunchRecipe?.id,
        dinner: dinnerRecipe?.id,
        snacks: snacks.length > 0 ? snacks : undefined,
      },
    };
    day.totals = calculateDayTotals(day, recipeMap);
    days.push(day);
  }

  if (days.some((day) => !day.meals.breakfast || !day.meals.lunch || !day.meals.dinner)) {
    notes.push('Some meals use fallback matching because available recipes were limited for your profile.');
  }

  return {
    mealPlan: {
      days,
      generatedBy: 'rules',
      notes,
      generatedAt: new Date().toISOString(),
    },
    notes,
  };
}

export function getSwapCandidates({
  recipes,
  answers,
  mealType,
  currentRecipe,
  limit = 12,
}: {
  recipes: Recipe[];
  answers: OnboardingAnswers;
  mealType: MealType;
  currentRecipe?: Recipe;
  limit?: number;
}) {
  const strict = buildCandidatePool({ recipes, mealType, answers, stage: 1 });
  const withFallback = strict.length >= limit ? strict : buildCandidatePool({ recipes, mealType, answers, stage: 2 });
  const loose = withFallback.length >= limit ? withFallback : buildCandidatePool({ recipes, mealType, answers, stage: 3 });
  const filtered = loose.filter((recipe) => recipe.id !== currentRecipe?.id);

  if (!currentRecipe) return filtered.slice(0, limit);

  return filtered
    .map((recipe) => {
      const calorieDelta = Math.abs((recipe.calories || 0) - (currentRecipe.calories || 0));
      const proteinDelta = Math.abs((recipe.protein || 0) - (currentRecipe.protein || 0));
      const delta = calorieDelta + proteinDelta * 2;
      return { recipe, delta };
    })
    .sort((a, b) => a.delta - b.delta || a.recipe.title.localeCompare(b.recipe.title))
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

export function withRecalculatedTotals(mealPlan: MealPlan, recipeMap: Map<string, Recipe>) {
  return {
    ...mealPlan,
    days: mealPlan.days.map((day) => ({
      ...day,
      totals: calculateDayTotals(day, recipeMap),
    })),
  };
}

export function buildGroceryListFromMealPlan(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>) {
  if (!mealPlan) return [];

  const bucket = new Map<string, GroceryItem>();

  for (const day of mealPlan.days) {
    const recipeIds = [
      day.meals.breakfast,
      day.meals.lunch,
      day.meals.dinner,
      ...(day.meals.snacks || []),
    ].filter(Boolean) as string[];

    for (const recipeId of recipeIds) {
      const recipe = recipeMap.get(recipeId);
      if (!recipe) continue;

      for (const ingredient of recipe.ingredients) {
        const name = ingredient.name.trim();
        if (!name) continue;
        const key = normalizeText(name);
        const quantityLabel = [ingredient.quantity, ingredient.unit].filter(Boolean).join(' ').trim();
        const existing = bucket.get(key);

        if (!existing) {
          bucket.set(key, {
            key,
            name,
            category: ingredient.category || 'pantry',
            quantities: quantityLabel ? [quantityLabel] : [],
          });
          continue;
        }

        if (quantityLabel && !existing.quantities.includes(quantityLabel)) {
          existing.quantities.push(quantityLabel);
        }
      }
    }
  }

  const byCategory = new Map<string, GroceryItem[]>();
  for (const item of bucket.values()) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)?.push(item);
  }

  return [...byCategory.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
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
