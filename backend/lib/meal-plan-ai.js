const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const PLAN_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CORE_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const OPENAI_MEAL_PLAN_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_MEAL_PLAN_TIMEOUT_MS || 9000));
const MEAL_PREP_PATTERNS = {
  breakfast: [0, 0, 1, 1, 0, 1, 0],
  lunch: [0, 0, 1, 1, 2, 2, 1],
  dinner: [0, 0, 1, 1, 2, 2, 1],
  snack: [0, 1, 0, 1, 0, 1, 0],
};
const MEAL_PREP_BASE_COUNTS = {
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
const INGREDIENT_TOKEN_STOP_WORDS = new Set([
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
  'teaspoon',
  'teaspoons',
  'tablespoon',
  'tablespoons',
]);

function hashSeed(input) {
  const text = String(input || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeMealType(value) {
  const mealType = String(value || '').trim().toLowerCase();
  if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner' || mealType === 'snack') {
    return mealType;
  }
  return '';
}

function normalizeCuisineList(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((entry) => String(entry || '').trim().toLowerCase()).filter((entry) => entry && entry !== 'not specified' && entry !== 'no preference'))];
}

function readRecipeCuisines(recipe) {
  const fromSource = Array.isArray(recipe?.source?.cuisines) ? recipe.source.cuisines : [];
  const fromDirect = Array.isArray(recipe?.cuisines) ? recipe.cuisines : [];
  return normalizeCuisineList([...fromSource, ...fromDirect]);
}

function recipeMatchesPreferredCuisines(recipe, preferredCuisines) {
  if (!Array.isArray(preferredCuisines) || preferredCuisines.length === 0) return true;
  const recipeCuisines = readRecipeCuisines(recipe);
  if (recipeCuisines.length === 0) return false;
  return preferredCuisines.some((preference) =>
    recipeCuisines.some((cuisine) => cuisine === preference || cuisine.includes(preference) || preference.includes(cuisine)),
  );
}

function pickBaseIds(pool, target, seedOffset) {
  const unique = [...new Set(Array.isArray(pool) ? pool.filter(Boolean) : [])];
  if (unique.length === 0) return [];
  const size = Math.max(1, Math.min(target, unique.length));
  const start = Math.abs(Number(seedOffset || 0)) % unique.length;
  const rotated = [...unique.slice(start), ...unique.slice(0, start)];
  return rotated.slice(0, size);
}

function selectMealPrepId({ baseIds, fallbackPool, dayIndex, mealType }) {
  const source = baseIds.length > 0 ? baseIds : fallbackPool;
  if (source.length === 0) return '';
  const pattern = MEAL_PREP_PATTERNS[mealType] || [0];
  const slot = pattern[dayIndex % pattern.length] || 0;
  return source[slot % source.length] || '';
}

function pickVariedId({ pool, dayIndex, seedOffset = 0, lastId = '' }) {
  const source = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (source.length === 0) return '';
  const index = Math.abs(Number(seedOffset || 0) + dayIndex) % source.length;
  let picked = source[index] || '';
  if (source.length > 1 && lastId && picked === lastId) {
    picked = source[(index + 1) % source.length] || picked;
  }
  return picked;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function containsAny(haystack, needles) {
  const source = normalizeText(haystack);
  return needles.some((needle) => source.includes(needle));
}

function recipeDescriptor(recipe) {
  const cardTags = Array.isArray(recipe?.source?.cardTags) ? recipe.source.cardTags : [];
  const collections = Array.isArray(recipe?.source?.collections) ? recipe.source.collections : [];
  const cuisines = Array.isArray(recipe?.source?.cuisines) ? recipe.source.cuisines : [];
  const dietaryTags = Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags : [];
  return normalizeText([
    recipe?.title || '',
    recipe?.description || '',
    ...dietaryTags,
    ...cardTags,
    ...collections,
    ...cuisines,
  ].join(' '));
}

function estimateTotalMinutes(recipe) {
  const total = Number(recipe?.totalTimeMinutes || 0);
  if (Number.isFinite(total) && total > 0) return total;
  const prep = Number(recipe?.prepTimeMinutes || 0);
  const cook = Number(recipe?.cookTimeMinutes || 0);
  if (Number.isFinite(prep) && Number.isFinite(cook) && prep > 0 && cook > 0) return prep + cook;
  if (Number.isFinite(prep) && prep > 0) return prep;
  if (Number.isFinite(cook) && cook > 0) return cook;
  return 0;
}

function parseServesCount(recipe) {
  const raw = recipe?.serves ?? recipe?.source?.serves ?? '';
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return 1;
  const values = [...text.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return 1;
  if (values.length === 1) return values[0];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ingredientTokenSet(recipe) {
  const tokens = new Set();
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  for (const ingredient of ingredients) {
    const parts = normalizeText(ingredient?.name || '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const part of parts) {
      if (part.length < 3) continue;
      if (INGREDIENT_TOKEN_STOP_WORDS.has(part)) continue;
      tokens.add(part);
    }
  }
  return tokens;
}

function tokenOverlapCount(left, right) {
  if (!(left instanceof Set) || !(right instanceof Set) || left.size === 0 || right.size === 0) return 0;
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function isMainMealCandidate(recipe) {
  const calories = Number(recipe?.calories || 0);
  const protein = Number(recipe?.protein || 0);
  const descriptor = recipeDescriptor(recipe);
  if (containsAny(descriptor, SWEET_OR_SNACK_KEYWORDS)) return false;
  if (calories > 0 && calories < 260 && protein < 16) return false;
  return true;
}

function isBreakfastMealCandidate(recipe, stage = 1) {
  const descriptor = recipeDescriptor(recipe);
  const calories = Number(recipe?.calories || 0);
  const totalMinutes = estimateTotalMinutes(recipe);
  const ingredientCount = Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0;

  if (containsAny(
    descriptor,
    SWEET_OR_SNACK_KEYWORDS.filter((entry) => !['bircher', 'muesli', 'smoothie'].includes(entry)),
  )) {
    return false;
  }
  if (stage === 1 && containsAny(descriptor, BREAKFAST_HEAVY_KEYWORDS)) return false;
  if (stage <= 2 && calories > (stage === 1 ? BREAKFAST_MAX_CALORIES_STRICT : BREAKFAST_MAX_CALORIES_RELAXED)) return false;
  if (stage <= 2 && totalMinutes > (stage === 1 ? BREAKFAST_MAX_TOTAL_MINUTES_STRICT : BREAKFAST_MAX_TOTAL_MINUTES_RELAXED)) return false;
  if (stage === 1 && ingredientCount > BREAKFAST_MAX_INGREDIENTS_STRICT) return false;
  return true;
}

function isMainMealPlanningCandidate(recipe, mealType, stage = 1) {
  if (!isMainMealCandidate(recipe)) return false;
  const descriptor = recipeDescriptor(recipe);
  const calories = Number(recipe?.calories || 0);
  const protein = Number(recipe?.protein || 0);
  const totalMinutes = estimateTotalMinutes(recipe);
  const isStrict = stage === 1;

  if (containsAny(descriptor, SWEET_OR_SNACK_KEYWORDS)) return false;
  if (stage <= 2 && totalMinutes > (isStrict ? MAIN_MEAL_MAX_TOTAL_MINUTES_STRICT : MAIN_MEAL_MAX_TOTAL_MINUTES_RELAXED)) return false;
  if (isStrict) {
    const minCalories = mealType === 'dinner' ? DINNER_MIN_CALORIES_STRICT : LUNCH_MIN_CALORIES_STRICT;
    const minProtein = mealType === 'dinner' ? DINNER_MIN_PROTEIN_STRICT : LUNCH_MIN_PROTEIN_STRICT;
    if (calories > 0 && calories < minCalories && protein < minProtein) return false;
  }
  if (stage <= 2 && calories > 1200) return false;
  return true;
}

function prioritizeByCuisine(pool, cuisinePool) {
  const preferred = Array.isArray(cuisinePool) ? cuisinePool.filter(Boolean) : [];
  const base = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (preferred.length === 0) return [...new Set(base)];
  const preferredSet = new Set(preferred);
  const remaining = base.filter((id) => !preferredSet.has(id));
  return [...new Set([...preferred, ...remaining])];
}

function buildRelaxedPoolByMealType(recipesById, mealType) {
  const source = [...recipesById.values()].filter((recipe) => recipe.mealType === mealType);
  if (mealType === 'breakfast') {
    return source.filter((recipe) => isBreakfastMealCandidate(recipe, 2)).map((recipe) => recipe.id);
  }
  if (mealType === 'lunch' || mealType === 'dinner') {
    return source.filter((recipe) => isMainMealPlanningCandidate(recipe, mealType, 2)).map((recipe) => recipe.id);
  }
  return source.map((recipe) => recipe.id);
}

export function generateFallbackMealPlan({ recipes, includeSnack = false, seedSalt = '', answers = {} }) {
  const uniqueById = new Map();
  const preferredCuisines = normalizeCuisineList(answers?.preferredCuisines);
  const useMealPrepPattern = String(answers?.groceryPreference || '').toLowerCase() === 'meal prep friendly';
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const id = String(recipe?.id || '').trim();
    if (!id || uniqueById.has(id)) continue;
    uniqueById.set(id, {
      id,
      title: String(recipe?.title || ''),
      description: String(recipe?.description || ''),
      mealType: normalizeMealType(recipe?.mealType),
      cuisines: readRecipeCuisines(recipe),
      calories: Number(recipe?.calories || 0),
      protein: Number(recipe?.protein || 0),
      prepTimeMinutes: Number(recipe?.prepTimeMinutes || 0),
      cookTimeMinutes: Number(recipe?.cookTimeMinutes || 0),
      totalTimeMinutes: Number(recipe?.totalTimeMinutes || 0),
      dietaryTags: Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags : [],
      ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients : [],
      source: recipe?.source && typeof recipe.source === 'object' ? recipe.source : {},
    });
  }

  const allRecipeIds = [...uniqueById.keys()];
  if (allRecipeIds.length === 0) return null;

  const poolByType = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  const cuisinePoolByType = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const recipe of uniqueById.values()) {
    if (recipe.mealType && poolByType[recipe.mealType]) {
      let allowed = false;
      if (recipe.mealType === 'breakfast') {
        allowed = isBreakfastMealCandidate(recipe, 1);
      } else if (recipe.mealType === 'lunch' || recipe.mealType === 'dinner') {
        allowed = isMainMealPlanningCandidate(recipe, recipe.mealType, 1);
      } else if (recipe.mealType === 'snack') {
        const descriptor = recipeDescriptor(recipe);
        const calories = Number(recipe?.calories || 0);
        const totalMinutes = estimateTotalMinutes(recipe);
        allowed = !containsAny(descriptor, BREAKFAST_HEAVY_KEYWORDS) && calories <= 550 && totalMinutes <= 45;
      }

      if (allowed) {
        poolByType[recipe.mealType].push(recipe.id);
        if (recipeMatchesPreferredCuisines(recipe, preferredCuisines)) {
          cuisinePoolByType[recipe.mealType].push(recipe.id);
        }
      }
    }
  }

  const relaxedBreakfastPool = buildRelaxedPoolByMealType(uniqueById, 'breakfast');
  const relaxedLunchPool = buildRelaxedPoolByMealType(uniqueById, 'lunch');
  const relaxedDinnerPool = buildRelaxedPoolByMealType(uniqueById, 'dinner');
  const relaxedSnackPool = buildRelaxedPoolByMealType(uniqueById, 'snack');

  const breakfastPool = poolByType.breakfast.length > 0
    ? prioritizeByCuisine(poolByType.breakfast, cuisinePoolByType.breakfast)
    : (relaxedBreakfastPool.length > 0 ? relaxedBreakfastPool : allRecipeIds);
  const lunchPool = poolByType.lunch.length > 0
    ? prioritizeByCuisine(poolByType.lunch, cuisinePoolByType.lunch)
    : (relaxedLunchPool.length > 0 ? relaxedLunchPool : allRecipeIds);
  const dinnerPool = poolByType.dinner.length > 0
    ? prioritizeByCuisine(poolByType.dinner, cuisinePoolByType.dinner)
    : (relaxedDinnerPool.length > 0 ? relaxedDinnerPool : allRecipeIds);
  const snackPool =
    poolByType.snack.length > 0
      ? prioritizeByCuisine(poolByType.snack, cuisinePoolByType.snack)
      : relaxedSnackPool.length > 0
        ? relaxedSnackPool
        : poolByType.breakfast.length > 0
          ? poolByType.breakfast
        : allRecipeIds;

  const seedSource = `${seedSalt}|${JSON.stringify(answers || {})}|${allRecipeIds.length}`;
  const notes = [];
  const recipeMetaMap = buildRecipeMetaMap(recipes);

  const buildDays = (attemptIndex) => {
    const seed = hashSeed(`${seedSource}|attempt:${attemptIndex}`);
    const breakfastBase = pickBaseIds(breakfastPool, MEAL_PREP_BASE_COUNTS.breakfast, seed + 11);
    const lunchBase = pickBaseIds(lunchPool, MEAL_PREP_BASE_COUNTS.lunch, seed + 23);
    const dinnerBase = pickBaseIds(dinnerPool, MEAL_PREP_BASE_COUNTS.dinner, seed + 37);
    const snackBase = pickBaseIds(snackPool, MEAL_PREP_BASE_COUNTS.snack, seed + 41);

    let lastBreakfastId = '';
    let lastLunchId = '';
    let lastDinnerId = '';
    let lastSnackId = '';

    return PLAN_DAY_LABELS.map((label, dayIndex) => {
      const breakfast = useMealPrepPattern
        ? selectMealPrepId({
            baseIds: breakfastBase,
            fallbackPool: breakfastPool,
            dayIndex,
            mealType: 'breakfast',
          })
        : pickVariedId({
            pool: breakfastPool,
            dayIndex,
            seedOffset: seed + 11,
            lastId: lastBreakfastId,
          });
      const lunch = useMealPrepPattern
        ? selectMealPrepId({
            baseIds: lunchBase,
            fallbackPool: lunchPool,
            dayIndex,
            mealType: 'lunch',
          })
        : pickVariedId({
            pool: lunchPool,
            dayIndex,
            seedOffset: seed + 23,
            lastId: lastLunchId,
          });
      const dinner = useMealPrepPattern
        ? selectMealPrepId({
            baseIds: dinnerBase,
            fallbackPool: dinnerPool,
            dayIndex,
            mealType: 'dinner',
          })
        : pickVariedId({
            pool: dinnerPool,
            dayIndex,
            seedOffset: seed + 37,
            lastId: lastDinnerId,
          });
      const snack = includeSnack
        ? useMealPrepPattern
          ? selectMealPrepId({
              baseIds: snackBase,
              fallbackPool: snackPool,
              dayIndex,
              mealType: 'snack',
            })
          : pickVariedId({
              pool: snackPool,
              dayIndex,
              seedOffset: seed + 41,
              lastId: lastSnackId,
            })
        : '';

      lastBreakfastId = breakfast || lastBreakfastId;
      lastLunchId = lunch || lastLunchId;
      lastDinnerId = dinner || lastDinnerId;
      lastSnackId = snack || lastSnackId;

      return {
        dayIndex,
        label,
        meals: {
          breakfast: breakfast || allRecipeIds[(seed + dayIndex) % allRecipeIds.length],
          lunch: lunch || allRecipeIds[(seed + dayIndex + 1) % allRecipeIds.length],
          dinner: dinner || allRecipeIds[(seed + dayIndex + 2) % allRecipeIds.length],
          snacks: includeSnack && snack ? [snack] : undefined,
        },
      };
    });
  };

  let selectedDays = [];
  let selectedQuality = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attemptIndex = 0; attemptIndex < 8; attemptIndex += 1) {
    const attemptDays = buildDays(attemptIndex);
    const quality = calculatePlanQuality({ days: attemptDays }, recipeMetaMap, answers);
    if (quality.score > bestScore) {
      bestScore = quality.score;
      selectedDays = attemptDays;
      selectedQuality = quality;
    }
    if (quality.valid) {
      selectedDays = attemptDays;
      selectedQuality = quality;
      if (attemptIndex > 0) {
        notes.push('Plan reshuffled for better practicality and variety.');
      }
      break;
    }
  }

  const days = selectedDays;

  const hasMissingCoreMeals = days.some((day) =>
    CORE_MEAL_TYPES.some((mealType) => !String(day?.meals?.[mealType] || '').trim()),
  );
  if (hasMissingCoreMeals) return null;
  if (selectedQuality && !selectedQuality.valid && selectedQuality.issues.length > 0) {
    notes.push(`Plan quality warning: ${selectedQuality.issues[0]}`);
  }

  return {
    days,
    generatedBy: 'rules',
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function extractResponseText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) chunks.push(part.text.trim());
      if (typeof part?.output_text === 'string' && part.output_text.trim()) chunks.push(part.output_text.trim());
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const direct = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(direct);
  } catch {
    // Continue and attempt bracket extraction.
  }

  const start = direct.indexOf('{');
  const end = direct.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = direct.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

function compactRecipe(recipe) {
  const serves = parseServesCount(recipe);
  return {
    id: String(recipe?.id || ''),
    title: String(recipe?.title || ''),
    description: String(recipe?.description || ''),
    mealType: String(recipe?.mealType || ''),
    calories: Number.isFinite(Number(recipe?.calories)) ? Number(recipe.calories) : null,
    protein: Number.isFinite(Number(recipe?.protein)) ? Number(recipe.protein) : null,
    carbs: Number.isFinite(Number(recipe?.carbs)) ? Number(recipe.carbs) : null,
    fat: Number.isFinite(Number(recipe?.fat)) ? Number(recipe.fat) : null,
    prepTimeMinutes: Number.isFinite(Number(recipe?.prepTimeMinutes)) ? Number(recipe.prepTimeMinutes) : null,
    cookTimeMinutes: Number.isFinite(Number(recipe?.cookTimeMinutes)) ? Number(recipe.cookTimeMinutes) : null,
    totalTimeMinutes: Number.isFinite(Number(recipe?.totalTimeMinutes)) ? Number(recipe.totalTimeMinutes) : null,
    dietaryTags: Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags.slice(0, 8) : [],
    allergens: Array.isArray(recipe?.allergens) ? recipe.allergens.slice(0, 8) : [],
    cuisines: Array.isArray(recipe?.source?.cuisines) ? recipe.source.cuisines.slice(0, 6) : [],
    cardTags: Array.isArray(recipe?.source?.cardTags) ? recipe.source.cardTags.slice(0, 12) : [],
    collections: Array.isArray(recipe?.source?.collections) ? recipe.source.collections.slice(0, 10) : [],
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients.map((entry) => String(entry?.name || '').trim()).filter(Boolean).slice(0, 18) : [],
    serves: Number.isFinite(serves) && serves > 0 ? Math.round(serves * 100) / 100 : 1,
    estimatedCost: recipe?.estimatedCost ? String(recipe.estimatedCost) : '',
    dietitian: String(recipe?.source?.dietitian || ''),
  };
}

function validateAndNormalizePlan(payload, validIds, includeSnack) {
  const rawDays = Array.isArray(payload?.days) ? payload.days : [];
  if (rawDays.length !== 7) return null;

  const notes = Array.isArray(payload?.notes)
    ? payload.notes.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 6)
    : [];

  const days = [];
  for (let i = 0; i < PLAN_DAY_LABELS.length; i += 1) {
    const sourceDay = rawDays[i] || {};
    const breakfast = String(sourceDay.breakfast || '').trim();
    const lunch = String(sourceDay.lunch || '').trim();
    const dinner = String(sourceDay.dinner || '').trim();
    if (!validIds.has(breakfast) || !validIds.has(lunch) || !validIds.has(dinner)) return null;

    const snacks = includeSnack
      ? (Array.isArray(sourceDay.snacks) ? sourceDay.snacks : [sourceDay.snack])
          .map((entry) => String(entry || '').trim())
          .filter((entry) => validIds.has(entry))
          .slice(0, 1)
      : [];

    days.push({
      dayIndex: i,
      label: PLAN_DAY_LABELS[i],
      meals: {
        breakfast,
        lunch,
        dinner,
        snacks: snacks.length > 0 ? snacks : undefined,
      },
    });
  }

  return {
    days,
    generatedBy: 'openai',
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function buildRecipeMetaMap(recipes) {
  const map = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const id = String(recipe?.id || '').trim();
    if (!id) continue;
    map.set(id, {
      id,
      mealType: normalizeMealType(recipe?.mealType),
      calories: Number(recipe?.calories || 0),
      protein: Number(recipe?.protein || 0),
      title: String(recipe?.title || ''),
      description: String(recipe?.description || ''),
      prepTimeMinutes: Number(recipe?.prepTimeMinutes || 0),
      cookTimeMinutes: Number(recipe?.cookTimeMinutes || 0),
      totalTimeMinutes: Number(recipe?.totalTimeMinutes || 0),
      ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients : [],
      ingredientTokens: ingredientTokenSet(recipe),
      serves: parseServesCount(recipe),
      dietaryTags: Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags : [],
      source: recipe?.source && typeof recipe.source === 'object' ? recipe.source : {},
    });
  }
  return map;
}

function ingredientOverlapAverageForPlan(plan, recipeMetaMap) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) return 0;
  const overlaps = [];
  const coreIds = [];

  for (const day of plan.days) {
    const breakfast = String(day?.meals?.breakfast || '').trim();
    const lunch = String(day?.meals?.lunch || '').trim();
    const dinner = String(day?.meals?.dinner || '').trim();
    if (breakfast) coreIds.push(breakfast);
    if (lunch) coreIds.push(lunch);
    if (dinner) coreIds.push(dinner);

    const lunchMeta = recipeMetaMap.get(lunch);
    const dinnerMeta = recipeMetaMap.get(dinner);
    if (lunchMeta && dinnerMeta) {
      overlaps.push(tokenOverlapCount(lunchMeta.ingredientTokens, dinnerMeta.ingredientTokens));
    }
  }

  for (let index = 1; index < coreIds.length; index += 1) {
    const previousMeta = recipeMetaMap.get(coreIds[index - 1]);
    const currentMeta = recipeMetaMap.get(coreIds[index]);
    if (!previousMeta || !currentMeta) continue;
    overlaps.push(tokenOverlapCount(previousMeta.ingredientTokens, currentMeta.ingredientTokens));
  }

  if (overlaps.length === 0) return 0;
  return overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
}

function calculatePlanQuality(plan, recipeMetaMap, answers = {}) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7) {
    return { valid: false, score: 0, issues: ['Plan must include 7 days.'] };
  }

  let score = 100;
  const issues = [];
  const criticalIssues = [];
  const breakfastCounts = new Map();
  const lunchCounts = new Map();
  const dinnerCounts = new Map();

  for (const day of plan.days) {
    const breakfast = String(day?.meals?.breakfast || '').trim();
    const lunch = String(day?.meals?.lunch || '').trim();
    const dinner = String(day?.meals?.dinner || '').trim();

    const breakfastMeta = recipeMetaMap.get(breakfast);
    const lunchMeta = recipeMetaMap.get(lunch);
    const dinnerMeta = recipeMetaMap.get(dinner);
    if (!breakfastMeta || !lunchMeta || !dinnerMeta) {
      criticalIssues.push(`Missing recipe metadata for ${day?.label || 'a day'}.`);
      continue;
    }

    if (!isBreakfastMealCandidate(breakfastMeta, 1)) {
      criticalIssues.push(`Breakfast is too heavy or impractical on ${day?.label || 'a day'}.`);
    }
    if (!isMainMealPlanningCandidate(lunchMeta, 'lunch', 1)) {
      criticalIssues.push(`Lunch is too light, too sweet, or impractical on ${day?.label || 'a day'}.`);
    }
    if (!isMainMealPlanningCandidate(dinnerMeta, 'dinner', 1)) {
      criticalIssues.push(`Dinner is too light, too sweet, or impractical on ${day?.label || 'a day'}.`);
    }

    if (breakfast === lunch || breakfast === dinner || lunch === dinner) {
      score -= 8;
      issues.push(`Repeated core meal in the same day (${day?.label || 'day'}).`);
    }

    breakfastCounts.set(breakfast, (breakfastCounts.get(breakfast) || 0) + 1);
    lunchCounts.set(lunch, (lunchCounts.get(lunch) || 0) + 1);
    dinnerCounts.set(dinner, (dinnerCounts.get(dinner) || 0) + 1);

    const dailyCalories = Number(breakfastMeta.calories || 0) + Number(lunchMeta.calories || 0) + Number(dinnerMeta.calories || 0);
    if (dailyCalories > 2400) {
      score -= 6;
      issues.push(`Daily energy is too high on ${day?.label || 'a day'}.`);
    }
    if (dailyCalories > 0 && dailyCalories < 900) {
      score -= 10;
      issues.push(`Daily energy is likely too low on ${day?.label || 'a day'}.`);
    }
  }

  const useMealPrepPattern = String(answers?.groceryPreference || '').toLowerCase() === 'meal prep friendly';
  const breakfastMax = useMealPrepPattern ? 5 : 4;
  const lunchMax = useMealPrepPattern ? 4 : 3;
  const dinnerMax = useMealPrepPattern ? 4 : 3;
  if ([...breakfastCounts.values()].some((count) => count > breakfastMax)) {
    score -= 10;
    issues.push('Breakfast variety is too low for the week.');
  }
  if ([...lunchCounts.values()].some((count) => count > lunchMax)) {
    score -= 8;
    issues.push('Lunch variety is too low for the week.');
  }
  if ([...dinnerCounts.values()].some((count) => count > dinnerMax)) {
    score -= 8;
    issues.push('Dinner variety is too low for the week.');
  }

  const averageIngredientOverlap = ingredientOverlapAverageForPlan(plan, recipeMetaMap);
  const minOverlapTarget = useMealPrepPattern ? 3 : 1.5;
  if (averageIngredientOverlap < minOverlapTarget) {
    score -= useMealPrepPattern ? 14 : 8;
    issues.push('Meals do not share enough core ingredients for practical weekly prep.');
  }

  if (criticalIssues.length > 0) {
    return {
      valid: false,
      score: Math.max(0, score - 30 - criticalIssues.length * 8),
      issues: [...criticalIssues, ...issues].slice(0, 8),
    };
  }

  return {
    valid: score >= 70,
    score: Math.max(0, score),
    issues: issues.slice(0, 8),
  };
}

async function callOpenAiForMealPlan({ answers, recipes, includeSnack, seedSalt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_MEAL_PLAN_MODEL || process.env.OPENAI_NOTES_MODEL || 'gpt-5-nano';
  const compactRecipes = recipes.map(compactRecipe).filter((recipe) => recipe.id && recipe.title);

  const systemPrompt = [
    'You are an Accredited Practising Dietitian (APD) creating practical weekly meal plans.',
    'Return valid JSON only. Do not include markdown.',
    'Build a 7-day plan with exactly one breakfast, lunch, and dinner each day.',
    includeSnack ? 'Include one snack id per day in snacks array.' : 'Do not include snacks unless explicitly requested.',
    'Use only recipe ids from the provided catalog. Never invent ids.',
    'Use the full recipe catalog JSON and the onboarding requirements JSON to plan meals that are realistic for normal weekdays.',
    'Prefer high-protein options when possible and match dietary requirements/allergies.',
    'If preferredCuisines is provided, prioritize those cuisines while still ensuring a complete plan.',
    'Avoid heavy or long-prep breakfasts unless no practical alternatives exist.',
    'For lunch and dinner, avoid very light snack-like options and avoid dessert-style meals when substantial options exist.',
    'Prefer ingredient overlap across the week so grocery shopping is manageable and meal-prep is realistic.',
    'Use recipe serves metadata and avoid unrealistic combinations (e.g., dessert as dinner unless explicitly required).',
    'Avoid assigning the same recipe to all 7 days unless the catalog is extremely limited.',
    'Treat cuisine and meal-style preferences as soft preferences, not hard exclusions.',
    'Output schema:',
    '{"notes": string[], "days": [{"breakfast": "id","lunch":"id","dinner":"id","snacks":["id"]}]}',
  ].join('\n');

  const userPrompt = JSON.stringify(
    {
      seedSalt,
      includeSnack,
      onboardingAnswers: answers,
      recipeCatalog: compactRecipes,
    },
    null,
    2,
  );

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENAI_MEAL_PLAN_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userPrompt }],
          },
        ],
        max_output_tokens: 2600,
      }),
      signal: controller.signal,
    });
  } catch (errorObject) {
    if (errorObject?.name === 'AbortError') {
      throw new Error(`OpenAI meal plan request timed out after ${OPENAI_MEAL_PLAN_TIMEOUT_MS}ms`);
    }
    throw errorObject;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI meal plan request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  return extractResponseText(payload);
}

async function callOpenAiForPlanRepair({ answers, recipes, includeSnack, seedSalt, invalidPlan, qualityIssues }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_MEAL_PLAN_MODEL || process.env.OPENAI_NOTES_MODEL || 'gpt-5-nano';
  const compactRecipes = recipes.map(compactRecipe).filter((recipe) => recipe.id && recipe.title);
  const issueList = Array.isArray(qualityIssues) ? qualityIssues.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 8) : [];

  const systemPrompt = [
    'You are an Accredited Practising Dietitian (APD) reviewing and repairing a weekly meal plan.',
    'Return valid JSON only. Do not include markdown.',
    'Repair the weekly plan so it is practical, not repetitive, and aligned to user needs.',
    'Use only recipe ids from the provided catalog. Never invent ids.',
    'Keep breakfasts practical and avoid heavy long-prep breakfast picks when alternatives exist.',
    'Keep lunch and dinner substantial (not dessert/snack-like) when alternatives exist.',
    'Increase ingredient overlap where reasonable so the grocery list stays practical.',
    includeSnack ? 'Include one snack id per day in snacks array.' : 'Do not include snacks unless requested.',
    'Output schema:',
    '{"notes": string[], "days": [{"breakfast":"id","lunch":"id","dinner":"id","snacks":["id"]}]}',
  ].join('\n');

  const userPrompt = JSON.stringify(
    {
      mode: 'repair',
      seedSalt,
      includeSnack,
      onboardingAnswers: answers,
      qualityIssues: issueList,
      invalidPlan,
      recipeCatalog: compactRecipes,
    },
    null,
    2,
  );

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENAI_MEAL_PLAN_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userPrompt }],
          },
        ],
        max_output_tokens: 2600,
      }),
      signal: controller.signal,
    });
  } catch (errorObject) {
    if (errorObject?.name === 'AbortError') {
      throw new Error(`OpenAI meal plan repair request timed out after ${OPENAI_MEAL_PLAN_TIMEOUT_MS}ms`);
    }
    throw errorObject;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI meal plan repair request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  return extractResponseText(payload);
}

export async function generateOpenAiMealPlan({ answers, recipes, includeSnack = false, seedSalt = '' }) {
  const validIds = new Set(recipes.map((recipe) => String(recipe?.id || '').trim()).filter(Boolean));
  const recipeMetaMap = buildRecipeMetaMap(recipes);
  if (validIds.size === 0) return null;

  try {
    const outputText = await callOpenAiForMealPlan({ answers, recipes, includeSnack, seedSalt });
    const parsed = parseJsonFromText(outputText);
    const plan = validateAndNormalizePlan(parsed, validIds, includeSnack);
    if (!plan) return null;
    const quality = calculatePlanQuality(plan, recipeMetaMap, answers);
    if (quality.valid) return plan;

    const repairedOutputText = await callOpenAiForPlanRepair({
      answers,
      recipes,
      includeSnack,
      seedSalt,
      invalidPlan: plan,
      qualityIssues: quality.issues,
    });
    const repairedParsed = parseJsonFromText(repairedOutputText);
    const repairedPlan = validateAndNormalizePlan(repairedParsed, validIds, includeSnack);
    if (!repairedPlan) return null;
    const repairedQuality = calculatePlanQuality(repairedPlan, recipeMetaMap, answers);
    if (!repairedQuality.valid) return null;
    repairedPlan.notes = [...(repairedPlan.notes || []), 'Dietitian quality review pass applied before finalising this plan.'].slice(0, 6);
    return repairedPlan;
  } catch (error) {
    console.error('Meal plan AI generation failed:', error?.message || String(error));
    return null;
  }
}
