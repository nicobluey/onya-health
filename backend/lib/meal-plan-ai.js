const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const PLAN_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CORE_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const OPENAI_MEAL_PLAN_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_MEAL_PLAN_TIMEOUT_MS || 9000));
const OPENAI_GENERATED_RECIPES_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.OPENAI_GENERATED_RECIPES_TIMEOUT_MS || 17000),
);
const OPENAI_MEAL_IMAGE_TIMEOUT_MS = Math.max(2500, Number(process.env.OPENAI_MEAL_IMAGE_TIMEOUT_MS || 10000));
const OPENAI_MAX_GENERATED_RECIPE_IMAGES = Math.max(
  0,
  Math.min(24, Number(process.env.OPENAI_MAX_GENERATED_RECIPE_IMAGES || 14)),
);
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

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
}

function toPositiveNumber(value, { min = 0, max = 5000, precision = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const bounded = Math.min(max, Math.max(min, numeric));
  if (precision <= 0) return Math.round(bounded);
  const scale = 10 ** precision;
  return Math.round(bounded * scale) / scale;
}

function normalizeList(values, { limit = 12, lowercase = false } = {}) {
  if (!Array.isArray(values)) return [];
  const output = [];
  const seen = new Set();
  for (const entry of values) {
    const raw = String(entry || '').trim();
    if (!raw) continue;
    const normalized = lowercase ? raw.toLowerCase() : raw;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function tokenizeTextInput(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => tokenizeTextInput(entry));
  }
  return String(value || '')
    .split(/[\n,;/|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugifyRecipeId(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 56);
  if (slug) return slug;
  return String(fallback || `recipe-${Date.now()}`);
}

function normalizeGeneratedIngredient(entry, index = 0) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const name =
    typeof entry === 'string'
      ? entry
      : source?.name || source?.ingredient || source?.item || source?.label || source?.food || '';
  const quantity =
    typeof source?.quantity === 'string' || typeof source?.quantity === 'number' ? String(source.quantity).trim() : '';
  const unit = typeof source?.unit === 'string' ? source.unit.trim() : '';
  const category =
    typeof source?.category === 'string' ? source.category.trim().toLowerCase().slice(0, 30) : '';
  const normalizedName = truncateText(name, 72);
  if (!normalizedName) {
    return { name: `Ingredient ${index + 1}` };
  }
  return {
    name: normalizedName,
    quantity: quantity ? truncateText(quantity, 24) : undefined,
    unit: unit ? truncateText(unit, 24) : undefined,
    category: category || undefined,
  };
}

function resolveRecipeMealType(entry) {
  const explicit = normalizeMealType(entry?.mealType);
  if (explicit) return explicit;

  const descriptor = normalizeText(
    [
      entry?.title || '',
      entry?.description || '',
      ...(Array.isArray(entry?.dietaryTags) ? entry.dietaryTags : []),
      ...(Array.isArray(entry?.cuisines) ? entry.cuisines : []),
    ].join(' '),
  );
  if (/(breakfast|smoothie|porridge|muesli|omelette|omelet|granola)/.test(descriptor)) return 'breakfast';
  if (/(snack|balls|bar|bites|slice)/.test(descriptor)) return 'snack';
  if (/(dinner|roast|stew|curry)/.test(descriptor)) return 'dinner';
  return 'lunch';
}

function normalizeGeneratedRecipe(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const mealType = resolveRecipeMealType(entry);
  const titleCandidate = truncateText(entry?.title || '', 84);
  const title = titleCandidate || `${mealType[0].toUpperCase()}${mealType.slice(1)} recipe ${index + 1}`;

  const baseId = slugifyRecipeId(entry?.id || `${mealType}-${title}`, `${mealType}-${index + 1}`);
  const description = truncateText(entry?.description || '', 220);
  const ingredientSource = Array.isArray(entry?.ingredients)
    ? entry.ingredients
    : Array.isArray(entry?.ingredientList)
      ? entry.ingredientList
      : tokenizeTextInput(entry?.ingredientsText);
  const ingredients = ingredientSource
    .map((ingredient, ingredientIndex) => normalizeGeneratedIngredient(ingredient, ingredientIndex))
    .filter((ingredient) => Boolean(String(ingredient?.name || '').trim()))
    .slice(0, 24);

  const instructionsSource = Array.isArray(entry?.instructions)
    ? entry.instructions
    : Array.isArray(entry?.steps)
      ? entry.steps
      : tokenizeTextInput(entry?.instructionsText);
  const instructions = instructionsSource
    .map((step) => truncateText(step, 220))
    .filter(Boolean)
    .slice(0, 10);

  if (ingredients.length < 3 || instructions.length < 2) return null;

  const prepTimeMinutes = toPositiveNumber(entry?.prepTimeMinutes ?? entry?.prepMinutes, { max: 240 });
  const cookTimeMinutes = toPositiveNumber(entry?.cookTimeMinutes ?? entry?.cookMinutes, { max: 360 });
  const totalFromPayload = toPositiveNumber(entry?.totalTimeMinutes ?? entry?.totalMinutes, { max: 420 });
  const totalTimeMinutes = totalFromPayload || toPositiveNumber((prepTimeMinutes || 0) + (cookTimeMinutes || 0), { max: 420 });
  const serves = toPositiveNumber(entry?.serves, { min: 1, max: 12, precision: 1 });
  const calories = toPositiveNumber(entry?.calories, { max: 2200 });
  const protein = toPositiveNumber(entry?.protein, { max: 220, precision: 1 });
  const carbs = toPositiveNumber(entry?.carbs, { max: 300, precision: 1 });
  const fat = toPositiveNumber(entry?.fat, { max: 180, precision: 1 });
  const dietaryTags = normalizeList(entry?.dietaryTags, { limit: 8, lowercase: true });
  const allergens = normalizeList(entry?.allergens, { limit: 8, lowercase: true });
  const cuisines = normalizeList(
    [
      ...(Array.isArray(entry?.cuisines) ? entry.cuisines : []),
      ...(Array.isArray(entry?.source?.cuisines) ? entry.source.cuisines : []),
    ],
    { limit: 6, lowercase: true },
  );
  const cardTags = normalizeList(entry?.cardTags, { limit: 10 });
  const collections = normalizeList(entry?.collections, { limit: 8 });
  const estimatedCost = truncateText(entry?.estimatedCost || 'balanced', 18).toLowerCase() || 'balanced';

  return {
    id: baseId,
    title,
    description: description || undefined,
    ingredients,
    instructions,
    mealType,
    calories,
    protein,
    carbs,
    fat,
    dietaryTags,
    allergens,
    serves,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
    estimatedCost,
    source: {
      generatedBy: 'openai',
      cuisines,
      cardTags,
      collections,
    },
  };
}

function normalizeGeneratedPlanDays({
  days,
  validIds,
  includeSnack,
  recipesByMealType,
  idAliases,
}) {
  const inputDays = Array.isArray(days) ? days : [];
  const normalizedDays = [];
  for (let dayIndex = 0; dayIndex < PLAN_DAY_LABELS.length; dayIndex += 1) {
    const raw = inputDays[dayIndex] && typeof inputDays[dayIndex] === 'object' ? inputDays[dayIndex] : {};
    const resolveId = (value, fallbackMealType) => {
      const direct = String(value || '').trim();
      if (direct && validIds.has(direct)) return direct;
      const alias = idAliases.get(direct);
      if (alias && validIds.has(alias)) return alias;
      const slugAlias = idAliases.get(slugifyRecipeId(direct, ''));
      if (slugAlias && validIds.has(slugAlias)) return slugAlias;
      const fallbackPool = recipesByMealType[fallbackMealType] || [];
      if (fallbackPool.length === 0) return '';
      return fallbackPool[dayIndex % fallbackPool.length] || '';
    };

    const breakfast = resolveId(raw.breakfast, 'breakfast');
    const lunch = resolveId(raw.lunch, 'lunch');
    const dinner = resolveId(raw.dinner, 'dinner');
    const snackCandidates = includeSnack
      ? (Array.isArray(raw.snacks) ? raw.snacks : [raw.snack])
          .map((entry) => resolveId(entry, 'snack'))
          .filter(Boolean)
          .slice(0, 1)
      : [];

    normalizedDays.push({
      dayIndex,
      label: PLAN_DAY_LABELS[dayIndex],
      meals: {
        breakfast,
        lunch,
        dinner,
        snacks: snackCandidates.length > 0 ? snackCandidates : undefined,
      },
    });
  }
  return normalizedDays;
}

function buildOnboardingSummary(answers = {}) {
  const preferenceSummary = {
    mainGoal: truncateText(answers?.mainGoal || '', 120),
    primaryHealthFocus: truncateText(answers?.primaryHealthFocus || '', 80),
    biggestChallenge: truncateText(answers?.biggestChallenge || '', 120),
    dietaryRequirements: normalizeList(answers?.dietaryRequirements, { limit: 10, lowercase: true }),
    allergies: normalizeList([...(answers?.allergyChips || []), ...tokenizeTextInput(answers?.allergiesText)], {
      limit: 12,
      lowercase: true,
    }),
    dislikes: normalizeList(tokenizeTextInput(answers?.dislikes), { limit: 12, lowercase: true }),
    favoriteFoods: normalizeList(answers?.favoriteFoods, { limit: 10, lowercase: true }),
    preferredCuisines: normalizeList(answers?.preferredCuisines, { limit: 8, lowercase: true }),
    preferredMealStyle: truncateText(answers?.preferredMealStyle || '', 80).toLowerCase(),
    mealsPerDay: Math.max(2, Math.min(5, Number(answers?.mealsPerDay || 3))),
    daysPerWeek: Math.max(2, Math.min(7, Number(answers?.daysPerWeek || 7))),
    groceryPreference: truncateText(answers?.groceryPreference || '', 80).toLowerCase(),
    budgetPreference: truncateText(answers?.budgetPreference || '', 80).toLowerCase(),
    cookingSkill: truncateText(answers?.cookingSkill || '', 80).toLowerCase(),
  };
  return preferenceSummary;
}

function buildRecipeImagePrompt(recipe, answers = {}) {
  const cuisines = Array.isArray(recipe?.source?.cuisines) ? recipe.source.cuisines.slice(0, 2) : [];
  const cuisineLabel = cuisines.length > 0 ? cuisines.join(', ') : 'modern Australian';
  const dietaryContext = normalizeList(answers?.dietaryRequirements, { limit: 3, lowercase: true }).join(', ');
  const ingredients = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
        .map((entry) => String(entry?.name || '').trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(', ')
    : '';
  return [
    `Photorealistic plated food photo of "${recipe?.title || 'meal'}".`,
    recipe?.description ? `Dish context: ${recipe.description}.` : '',
    `Cuisine direction: ${cuisineLabel}.`,
    ingredients ? `Feature ingredients: ${ingredients}.` : '',
    dietaryContext ? `Suitable for: ${dietaryContext}.` : '',
    'Natural daylight food photography, clean ceramic plate or bowl, sharp details, appetizing colors.',
    'No text, no logo, no watermark, no packaging, no people, no hands.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function generateRecipeImageDataUri(recipe, answers = {}) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return '';

  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini';
  const outputFormat = process.env.OPENAI_IMAGE_OUTPUT_FORMAT || 'webp';
  const imageQuality = process.env.OPENAI_IMAGE_QUALITY || 'low';
  const imageSize = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
  const compression = Math.max(1, Math.min(100, Number(process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 70)));
  const prompt = buildRecipeImagePrompt(recipe, answers);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENAI_MEAL_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        n: 1,
        size: imageSize,
        quality: imageQuality,
        output_format: outputFormat,
        output_compression: compression,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || JSON.stringify(payload);
      throw new Error(`Meal image generation failed (${response.status}): ${detail}`);
    }

    const image = payload?.data?.[0] || null;
    if (image?.b64_json) {
      return `data:image/${outputFormat};base64,${image.b64_json}`;
    }
    if (typeof image?.url === 'string' && image.url) {
      return image.url;
    }
    return '';
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function withConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, source.length));
  const output = new Array(source.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < source.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(source[index], index);
      }
    }),
  );
  return output;
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

async function callOpenAiForGeneratedMeals({ answers, includeSnack, seedSalt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_GENERATED_RECIPES_MODEL || process.env.OPENAI_MEAL_PLAN_MODEL || 'gpt-5-nano';
  const onboarding = buildOnboardingSummary(answers);

  const systemPrompt = [
    'You are an Accredited Practising Dietitian (APD) and meal-planning specialist.',
    'Create a realistic weekly plan and full recipe set from the patient preferences only.',
    'Return valid JSON only and do not wrap in markdown.',
    'Respect allergies and dietary requirements first. Do not include unsafe ingredients.',
    'Prefer practical Australian supermarket ingredients and straightforward cooking steps.',
    'Meals must be nutritionally balanced and usable in a real weekly routine.',
    'Use unique recipe IDs, and ensure every plan meal references an ID from recipes.',
  ].join('\n');

  const userPrompt = JSON.stringify(
    {
      task: 'Generate weekly meal plan and recipe catalog from onboarding preferences.',
      includeSnack,
      seedSalt,
      onboarding,
      outputSchema: {
        notes: ['short string'],
        recipes: [
          {
            id: 'string',
            title: 'string',
            description: 'string',
            mealType: 'breakfast|lunch|dinner|snack',
            ingredients: [{ name: 'string', quantity: 'string', unit: 'string', category: 'string' }],
            instructions: ['string'],
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            dietaryTags: ['string'],
            allergens: ['string'],
            serves: 0,
            prepTimeMinutes: 0,
            cookTimeMinutes: 0,
            totalTimeMinutes: 0,
            estimatedCost: 'low cost|balanced|premium',
            cuisines: ['string'],
            cardTags: ['string'],
            collections: ['string'],
          },
        ],
        days: [
          {
            breakfast: 'recipe-id',
            lunch: 'recipe-id',
            dinner: 'recipe-id',
            snacks: ['recipe-id'],
          },
        ],
      },
      requirements: [
        'Generate 14-22 total recipes with enough variety for a 7-day plan.',
        'Include at least 4 breakfast recipes, 5 lunch recipes, and 5 dinner recipes.',
        includeSnack ? 'Include snack recipes and one snack per day.' : 'Do not include snack assignments unless explicitly needed.',
        'Meals should support the stated grocery and budget preferences.',
      ],
    },
    null,
    2,
  );

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENAI_GENERATED_RECIPES_TIMEOUT_MS);
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
        text: {
          format: {
            type: 'json_object',
          },
        },
        max_output_tokens: 7600,
      }),
      signal: controller.signal,
    });
  } catch (errorObject) {
    if (errorObject?.name === 'AbortError') {
      throw new Error(`OpenAI generated recipe request timed out after ${OPENAI_GENERATED_RECIPES_TIMEOUT_MS}ms`);
    }
    throw errorObject;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI generated recipe request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  return extractResponseText(payload);
}

function normalizeGeneratedBundle({ parsed, includeSnack }) {
  const rawRecipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
  const normalizedRecipes = [];
  const idAliases = new Map();
  const usedIds = new Set();
  for (let index = 0; index < rawRecipes.length; index += 1) {
    const sourceRecipe = rawRecipes[index];
    const normalized = normalizeGeneratedRecipe(sourceRecipe, index);
    if (!normalized) continue;
    let uniqueId = normalized.id;
    if (usedIds.has(uniqueId)) {
      uniqueId = `${uniqueId}-${index + 1}`;
    }
    usedIds.add(uniqueId);
    if (uniqueId !== normalized.id) normalized.id = uniqueId;
    normalizedRecipes.push(normalized);

    const rawId = String(sourceRecipe?.id || '').trim();
    if (rawId) idAliases.set(rawId, uniqueId);
    idAliases.set(slugifyRecipeId(rawId, uniqueId), uniqueId);
    idAliases.set(slugifyRecipeId(normalized.title, uniqueId), uniqueId);
  }

  if (normalizedRecipes.length < 8) return null;

  const recipesByMealType = {
    breakfast: normalizedRecipes.filter((recipe) => recipe.mealType === 'breakfast').map((recipe) => recipe.id),
    lunch: normalizedRecipes.filter((recipe) => recipe.mealType === 'lunch').map((recipe) => recipe.id),
    dinner: normalizedRecipes.filter((recipe) => recipe.mealType === 'dinner').map((recipe) => recipe.id),
    snack: normalizedRecipes.filter((recipe) => recipe.mealType === 'snack').map((recipe) => recipe.id),
  };

  if (recipesByMealType.breakfast.length === 0 || recipesByMealType.lunch.length === 0 || recipesByMealType.dinner.length === 0) {
    return null;
  }

  if (includeSnack && recipesByMealType.snack.length === 0) {
    recipesByMealType.snack = recipesByMealType.breakfast.slice(0, 3);
  }

  const validIds = new Set(normalizedRecipes.map((recipe) => recipe.id));
  const days = normalizeGeneratedPlanDays({
    days: parsed?.days,
    validIds,
    includeSnack,
    recipesByMealType,
    idAliases,
  });
  const hasMissingCoreMeals = days.some((day) =>
    CORE_MEAL_TYPES.some((mealType) => !String(day?.meals?.[mealType] || '').trim()),
  );
  if (hasMissingCoreMeals) return null;

  const notes = normalizeList(parsed?.notes, { limit: 6 }).filter(Boolean);
  return {
    recipes: normalizedRecipes,
    mealPlan: {
      days,
      generatedBy: 'openai',
      notes,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function generateOpenAiMealPlanWithGeneratedRecipes({ answers, includeSnack = false, seedSalt = '' }) {
  try {
    const outputText = await callOpenAiForGeneratedMeals({ answers, includeSnack, seedSalt });
    if (!outputText) return null;
    const parsed = parseJsonFromText(outputText);
    const normalized = normalizeGeneratedBundle({ parsed, includeSnack });
    if (!normalized) return null;

    const planIds = new Set(
      normalized.mealPlan.days
        .flatMap((day) => [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])])
        .filter(Boolean),
    );
    const recipesNeedingImages = normalized.recipes.filter((recipe) => planIds.has(recipe.id)).slice(0, OPENAI_MAX_GENERATED_RECIPE_IMAGES);
    await withConcurrency(recipesNeedingImages, 3, async (recipe) => {
      try {
        const imageUrl = await generateRecipeImageDataUri(recipe, answers);
        if (imageUrl) {
          recipe.imageUrl = imageUrl;
        }
        recipe.source = {
          ...(recipe.source && typeof recipe.source === 'object' ? recipe.source : {}),
          imagePrompt: buildRecipeImagePrompt(recipe, answers),
        };
      } catch (errorObject) {
        console.error(`Meal image generation failed for "${recipe?.title || recipe?.id}":`, errorObject?.message || String(errorObject));
      }
    });

    normalized.recipes = normalized.recipes.map((recipe) => ({
      ...recipe,
      imageUrl: String(recipe?.imageUrl || '').trim(),
    }));
    return normalized;
  } catch (errorObject) {
    console.error('Generated recipe AI generation failed:', errorObject?.message || String(errorObject));
    return null;
  }
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
