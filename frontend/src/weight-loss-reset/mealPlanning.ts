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
  lunch: 3,
  dinner: 3,
  snack: 2,
};

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
  const cuisinePreferences = normalizeCuisinePreferences(answers.preferredCuisines || []);
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
  const cuisinePreferences = normalizeCuisinePreferences(answers.preferredCuisines || []);
  const dislikes = stage === 3 ? [] : extractDislikes(answers);

  const withMealType = stage === 3
    ? recipes.filter((recipe) => recipe.mealType === mealType || (mealType === 'snack' && recipe.mealType === 'breakfast'))
    : recipes.filter((recipe) => recipe.mealType === mealType);

  return withMealType
    .filter((recipe) => (stage === 1 && cuisinePreferences.length > 0 ? recipeMatchesCuisinePreferences(recipe, cuisinePreferences) : true))
    .filter((recipe) => recipePassesAllergyCheck(recipe, allergyTerms))
    .filter((recipe) => recipeMatchesDietaryRequirements(recipe, strictRequirements))
    .filter((recipe) => recipePassesDislikes(recipe, dislikes))
    .sort((a, b) => recipePreferenceScore(b, answers) - recipePreferenceScore(a, answers) || a.title.localeCompare(b.title));
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
  return rotated.slice(0, Math.max(1, Math.min(targetCount, rotated.length)));
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

  const random = seededRandom(
    `${answers.firstName}|${answers.age || ''}|${answers.goalWeightKg || ''}|${answers.biggestChallenge}|${answers.mainGoal}|${seedSalt}`
  );

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

  const fallbackCatalog = catalog;
  if (candidatePools.breakfast.length === 0) candidatePools.breakfast = fallbackCatalog;
  if (candidatePools.lunch.length === 0) candidatePools.lunch = fallbackCatalog;
  if (candidatePools.dinner.length === 0) candidatePools.dinner = fallbackCatalog;
  if (candidatePools.snack.length === 0) {
    candidatePools.snack = candidatePools.breakfast.length > 0 ? candidatePools.breakfast : fallbackCatalog;
  }

  const mealPrepBases = {
    breakfast: pickMealPrepBaseRecipes({ candidates: candidatePools.breakfast, mealType: 'breakfast', random }),
    lunch: pickMealPrepBaseRecipes({ candidates: candidatePools.lunch, mealType: 'lunch', random }),
    dinner: pickMealPrepBaseRecipes({ candidates: candidatePools.dinner, mealType: 'dinner', random }),
    snack: pickMealPrepBaseRecipes({ candidates: candidatePools.snack, mealType: 'snack', random }),
  };
  const days: MealPlanDay[] = [];
  const recipeMap = new Map(catalog.map((recipe) => [recipe.id, recipe]));

  for (let dayIndex = 0; dayIndex < MEAL_PLAN_DAYS.length; dayIndex += 1) {
    const breakfastRecipe = selectMealPrepRecipe({
      baseRecipes: mealPrepBases.breakfast,
      dayIndex,
      mealType: 'breakfast',
      fallbackPool: candidatePools.breakfast,
    });
    const lunchRecipe = selectMealPrepRecipe({
      baseRecipes: mealPrepBases.lunch,
      dayIndex,
      mealType: 'lunch',
      fallbackPool: candidatePools.lunch,
    });
    const dinnerRecipe = selectMealPrepRecipe({
      baseRecipes: mealPrepBases.dinner,
      dayIndex,
      mealType: 'dinner',
      fallbackPool: candidatePools.dinner,
    });

    const breakfastId =
      breakfastRecipe?.id ||
      candidatePools.breakfast[dayIndex % candidatePools.breakfast.length]?.id ||
      fallbackCatalog[dayIndex % fallbackCatalog.length]?.id;
    const lunchId =
      lunchRecipe?.id ||
      candidatePools.lunch[dayIndex % candidatePools.lunch.length]?.id ||
      fallbackCatalog[(dayIndex + 1) % fallbackCatalog.length]?.id;
    const dinnerId =
      dinnerRecipe?.id ||
      candidatePools.dinner[dayIndex % candidatePools.dinner.length]?.id ||
      fallbackCatalog[(dayIndex + 2) % fallbackCatalog.length]?.id;

    const snackRecipe = requiresSnack
      ? selectMealPrepRecipe({
          baseRecipes: mealPrepBases.snack,
          dayIndex,
          mealType: 'snack',
          fallbackPool: candidatePools.snack.length > 0 ? candidatePools.snack : candidatePools.breakfast,
        })
      : undefined;
    const snacks = snackRecipe?.id ? [snackRecipe.id] : [];

    const day: MealPlanDay = {
      dayIndex,
      label: MEAL_PLAN_DAYS[dayIndex],
      meals: {
        breakfast: breakfastId,
        lunch: lunchId,
        dinner: dinnerId,
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
const LEADING_DESCRIPTORS = new Set([
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
  date: 'date',
  dates: 'date',
  peach: 'peach',
  peaches: 'peach',
  leek: 'leek',
  leeks: 'leek',
  avocado: 'avocado',
  avocados: 'avocado',
  banana: 'banana',
  bananas: 'banana',
  carrot: 'carrot',
  carrots: 'carrot',
  onion: 'onion',
  onions: 'onion',
  capsicum: 'capsicum',
  potato: 'potato',
  potatoes: 'potato',
  tomato: 'tomato',
  tomatoes: 'tomato',
  zucchini: 'zucchini',
  zucchinis: 'zucchini',
  mango: 'mango',
  mangoes: 'mango',
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
  'date',
  'peach',
  'leek',
];

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
  if (rangeParts.length > 1) return Math.max(...rangeParts);
  return parseAmountToken(expression);
}

function normalizeQuantityUnitToken(token: string) {
  const cleaned = normalizeText(token).replace(/[^a-z]/g, '');
  if (!cleaned) return '';
  return QUANTITY_UNIT_ALIASES[cleaned] || '';
}

function extractAggregatedQuantity(line: string) {
  const source = normalizeFractionCharacters(cleanIngredientLine(line).toLowerCase())
    .replace(/^(?:about|approx(?:\.|imately)?)\s+/i, '')
    .trim();
  if (!source) return null;

  const compactUnitMatch = source.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l)\b/i);
  if (compactUnitMatch) {
    return {
      amount: Number(compactUnitMatch[1]),
      unit: normalizeQuantityUnitToken(compactUnitMatch[2]) || compactUnitMatch[2].toLowerCase(),
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
      return {
        amount,
        unit: normalizeQuantityUnitToken(multipliedMatch[2]) || multipliedMatch[2].toLowerCase(),
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
  for (const token of unitTokens.slice(0, 4)) {
    unit = normalizeQuantityUnitToken(token);
    if (unit) break;
  }

  return unit ? { amount, unit } : null;
}

function formatAggregatedAmount(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function formatQuantityUnit(unit: string, amount: number) {
  if (!unit) return '';
  if (MEASURE_UNITS.has(unit)) return unit;
  if (Math.abs(amount - 1) < 0.000001) return unit;
  return unit.endsWith('s') ? unit : `${unit}s`;
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
      const unitLabel = formatQuantityUnit(unit, amount);
      return [formatAggregatedAmount(amount), unitLabel].filter(Boolean).join(' ');
    });

  const looseTotals = new Map<string, number>();
  const remainingUnparsed: Array<{ label: string; count: number }> = [];
  for (const [label, count] of unparsedCounts.entries()) {
    const cleanedLabel = cleanIngredientLine(label);
    const looseMatch = cleanedLabel.match(
      /^((?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)(?:\s*-\s*(?:\d+\s+\d+\/\d+|\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?)\s+(.+)$/i
    );
    if (!looseMatch) {
      remainingUnparsed.push({ label: cleanedLabel, count });
      continue;
    }
    const looseAmount = parseAmountExpression(looseMatch[1]);
    const looseUnitText = cleanIngredientLine(looseMatch[2]).replace(/\s+/g, ' ').trim();
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
    .map(({ label, count }) => (count > 1 ? `${label} x${count}` : label));

  return [...totals, ...looseLabels, ...unparsed];
}

function shouldIgnoreIngredientLine(line: string) {
  const normalized = normalizeText(line);
  if (!normalized) return true;
  const lettersOnly = line.replace(/[^A-Za-z]/g, '');
  const isUpperHeading =
    lettersOnly.length >= 4 &&
    lettersOnly === lettersOnly.toUpperCase() &&
    line.split(/\s+/).filter(Boolean).length <= 6;
  if (isUpperHeading) return true;
  if (line.trim().endsWith(':')) return true;
  if (/\sand\s*$/i.test(line)) return true;
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
    .replace(/\bbasil leaves?\b/g, 'basil')
    .replace(/\bbean shoots?\b/g, 'bean sprouts')
    .replace(/\bbean sprout\b/g, 'bean sprouts')
    .replace(/\bmango cheeks?\b/g, 'mango')
    .replace(/\bice[-\s]?cubes?\b/g, 'ice cube')
    .replace(/\bshallots?\b/g, 'shallot')
    .replace(/\bpepita seeds?\b/g, 'pepitas')
    .replace(/\bsunflower seeds?\b/g, 'sunflower seed')
    .replace(/\bpine nuts?\b/g, 'pine nut')
    .replace(/\balmonds?\b/g, 'almond')
    .replace(/\bcashews?\b/g, 'cashew')
    .replace(/\bwalnuts?\b/g, 'walnut')
    .replace(/\bto serve\b/g, '')
    .replace(/\bfor garnish(?:ing)?\b/g, '')
    .replace(/\bto garnish\b/g, '')
    .replace(/\bto sprinkle on top\b/g, '')
    .replace(/\bskin removed\b/g, '')
    .replace(/^or\s+\d+\s+/g, '')
    .replace(/\bpieces?\s+of\s+/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  value = value.replace(/\b(halves|half|chunks|chunk|diced|sliced|chopped|minced|grated|crushed|washed|rinsed|trimmed)\b$/g, '').trim();
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
      'chicken', 'beef', 'salmon', 'egg', 'tofu', 'beans', 'lentil', 'chickpea', 'steak', 'tuna',
    ])
  ) {
    return 'protein';
  }
  if (containsAny(text, ['yoghurt', 'yogurt', 'milk', 'feta', 'ricotta', 'cheese', 'haloumi', 'bocconcini', 'chevre'])) {
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
  if (/^water\s+as\s+needed\b/.test(normalized)) return true;
  return false;
}

function buildGroceryListForRecipeIds(recipeIds: string[], recipeMap: Map<string, Recipe>) {
  const bucket = new Map<string, GroceryItem & { quantityTotals: Map<string, number>; unparsedCounts: Map<string, number> }>();

  for (const recipeId of recipeIds) {
    const recipe = recipeMap.get(recipeId);
    if (!recipe) continue;

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
      const preferredCategory = normalizeText(ingredient.category || '');
      const category =
        preferredCategory && preferredCategory !== 'pantry' ? preferredCategory : inferGroceryCategory(canonicalBaseName);
      const existing = bucket.get(key);

      if (!existing) {
        const quantityTotals = new Map<string, number>();
        const unparsedCounts = new Map<string, number>();
        if (aggregatedQuantity) {
          quantityTotals.set(aggregatedQuantity.unit, aggregatedQuantity.amount);
        } else if (quantityLabel) {
          unparsedCounts.set(quantityLabel, 1);
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
          (existing.quantityTotals.get(aggregatedQuantity.unit) || 0) + aggregatedQuantity.amount
        );
      } else if (quantityLabel) {
        existing.unparsedCounts.set(quantityLabel, (existing.unparsedCounts.get(quantityLabel) || 0) + 1);
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

  return [...byCategory.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function buildGroceryListByMealType(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>): MealGroceryBreakdown[] {
  if (!mealPlan) return [];

  const idsByMealType: Record<MealType, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const day of mealPlan.days) {
    if (day.meals.breakfast) idsByMealType.breakfast.push(day.meals.breakfast);
    if (day.meals.lunch) idsByMealType.lunch.push(day.meals.lunch);
    if (day.meals.dinner) idsByMealType.dinner.push(day.meals.dinner);
    for (const snackId of day.meals.snacks || []) {
      if (snackId) idsByMealType.snack.push(snackId);
    }
  }

  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  return order
    .map((mealType) => {
      const uniqueIds = [...new Set(idsByMealType[mealType])];
      const recipeTitles = uniqueIds
        .map((id) => recipeMap.get(id)?.title || '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return {
        mealType,
        recipeIds: uniqueIds,
        recipeTitles,
        groups: buildGroceryListForRecipeIds(uniqueIds, recipeMap),
      };
    })
    .filter((entry) => entry.recipeTitles.length > 0 || entry.groups.length > 0);
}

export function buildGroceryListFromMealPlan(mealPlan: MealPlan | null, recipeMap: Map<string, Recipe>) {
  if (!mealPlan) return [];
  const recipeIds = mealPlan.days.flatMap((day) =>
    [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])].filter(Boolean),
  ) as string[];
  return buildGroceryListForRecipeIds(recipeIds, recipeMap);
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
