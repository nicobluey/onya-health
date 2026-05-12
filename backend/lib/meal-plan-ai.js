const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const PLAN_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CORE_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const OPENAI_MEAL_PLAN_TIMEOUT_MS = Math.max(6000, Number(process.env.OPENAI_MEAL_PLAN_TIMEOUT_MS || 25000));
const OPENAI_GENERATED_RECIPES_TIMEOUT_MS = Math.max(
  20000,
  Number(process.env.OPENAI_GENERATED_RECIPES_TIMEOUT_MS || 60000),
);
const OPENAI_MEAL_IMAGE_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_MEAL_IMAGE_TIMEOUT_MS || 15000));
const OPENAI_MAX_GENERATED_RECIPE_IMAGES = Math.max(
  0,
  Math.min(12, Number(process.env.OPENAI_MAX_GENERATED_RECIPE_IMAGES || 8)),
);
const OPENAI_MEAL_PLAN_MAX_OUTPUT_TOKENS = Math.max(
  1600,
  Math.min(6500, Number(process.env.OPENAI_MEAL_PLAN_MAX_OUTPUT_TOKENS || 3400)),
);
const OPENAI_GENERATED_RECIPES_MAX_OUTPUT_TOKENS = Math.max(
  5200,
  Math.min(18000, Number(process.env.OPENAI_GENERATED_RECIPES_MAX_OUTPUT_TOKENS || 11200)),
);
const OPENAI_TEXT_VERBOSITY = String(process.env.OPENAI_TEXT_VERBOSITY || 'low')
  .trim()
  .toLowerCase();
const OPENAI_REASONING_EFFORT = String(process.env.OPENAI_REASONING_EFFORT || 'minimal')
  .trim()
  .toLowerCase();

function isWebpDataUri(value) {
  return /^data:image\/webp;base64,/i.test(String(value || '').trim());
}

function isWebpHttpImage(value) {
  const candidate = String(value || '').trim();
  if (!/^https?:\/\//i.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('.webp')) return true;
    return /(?:^|[?&])(fm|format)=webp(?:&|$)/i.test(candidate);
  } catch {
    return false;
  }
}

function normalizeRecipeImageToWebp(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (isWebpDataUri(candidate)) return candidate;
  if (isWebpHttpImage(candidate)) return candidate;
  return '';
}
const QUANTITY_UNIT_ALIASES = {
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',
  clove: 'clove',
  cloves: 'clove',
  bunch: 'bunch',
  bunches: 'bunch',
  slice: 'slice',
  slices: 'slice',
  piece: 'piece',
  pieces: 'piece',
  whole: 'whole',
};
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
const COOKING_EQUIPMENT_ORDER = ['stovetop', 'oven', 'air fryer', 'microwave'];
const INSTRUCTION_ACTION_KEYWORDS = [
  'mix',
  'stir',
  'whisk',
  'bake',
  'roast',
  'grill',
  'cook',
  'sear',
  'boil',
  'simmer',
  'saute',
  'fry',
  'toast',
  'chop',
  'slice',
  'dice',
  'marinate',
  'assemble',
  'toss',
  'preheat',
];
const VAGUE_INSTRUCTION_PATTERNS = [
  /\bserve\b/i,
  /\benjoy\b/i,
  /\bas desired\b/i,
  /\bto taste\b/i,
  /\bcooked through\b/i,
  /\buntil done\b/i,
  /\bready to eat\b/i,
];
const INGREDIENT_ALIGNMENT_STOP_WORDS = new Set([
  'salt',
  'pepper',
  'oil',
  'olive',
  'water',
  'fresh',
  'dried',
  'optional',
  'extra',
  'virgin',
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
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function containsAny(haystack, needles) {
  const source = normalizeText(haystack);
  return needles.some((needle) => source.includes(needle));
}

function normalizeCookingEquipmentToken(value) {
  const normalized = normalizeText(value).replace(/[_\s]+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized === 'stovetop' || normalized === 'stove top' || normalized === 'stove' || normalized === 'hob') return 'stovetop';
  if (normalized === 'oven') return 'oven';
  if (normalized === 'air fryer' || normalized === 'airfryer') return 'air fryer';
  if (normalized === 'microwave' || normalized === 'microwave oven') return 'microwave';
  return '';
}

function normalizeCookingEquipmentList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n;|/]+/g)
      : [];
  const normalized = [...new Set(
    source
      .map((entry) => normalizeCookingEquipmentToken(entry))
      .filter(Boolean)
  )];
  return COOKING_EQUIPMENT_ORDER.filter((entry) => normalized.includes(entry));
}

function inferEquipmentFromText(value) {
  const text = normalizeText(value);
  if (!text) return [];
  const inferred = new Set();
  if (/\bair[-\s]?fry(?:er|ing)?\b/.test(text)) inferred.add('air fryer');
  if (/\b(oven|preheat|bake|baked|roast|roasted|broil)\b/.test(text)) inferred.add('oven');
  if (/\bmicrowave|microwavable\b/.test(text)) inferred.add('microwave');
  if (/\b(stovetop|stove|hob|pan|skillet|saucepan|pot|boil|simmer|saute|stir[-\s]?fry|grill)\b/.test(text)) {
    inferred.add('stovetop');
  }
  return COOKING_EQUIPMENT_ORDER.filter((entry) => inferred.has(entry));
}

function resolveRecipeRequiredEquipment(recipe) {
  const explicit = normalizeCookingEquipmentList(recipe?.requiredEquipment);
  if (explicit.length > 0) return explicit;
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source) ? recipe.source : {};
  const fromSource = normalizeCookingEquipmentList(source?.requiredEquipment ?? source?.required_equipment ?? source?.equipment);
  if (fromSource.length > 0) return fromSource;
  const descriptor = [
    recipe?.title || '',
    recipe?.description || '',
    ...(Array.isArray(recipe?.instructions) ? recipe.instructions : []),
  ].join(' ');
  return inferEquipmentFromText(descriptor);
}

function normalizeInstructionStep(value) {
  return String(value || '')
    .replace(/^step\s*\d+\s*[:.)-]?\s*/i, '')
    .replace(/^\d+\s*[:.)-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function recipeInstructionSteps(recipe) {
  return (Array.isArray(recipe?.instructions) ? recipe.instructions : [])
    .map((step) => normalizeInstructionStep(step))
    .filter(Boolean);
}

function recipeInstructionIngredientCoverage(recipe) {
  const instructionBlob = recipeInstructionSteps(recipe).join(' ').toLowerCase();
  if (!instructionBlob) return 0;
  const tokens = [...ingredientTokenSet(recipe)].filter((token) => token.length >= 4 && !INGREDIENT_ALIGNMENT_STOP_WORDS.has(token)).slice(0, 14);
  if (tokens.length === 0) return 1;
  const matched = tokens.reduce((count, token) => (instructionBlob.includes(token) ? count + 1 : count), 0);
  return matched / tokens.length;
}

function recipeHasActionableInstructions(recipe, mealType, stage = 1) {
  const steps = recipeInstructionSteps(recipe);
  const minimumSteps = mealType === 'snack' ? (stage === 1 ? 2 : 1) : stage === 1 ? 3 : 2;
  if (steps.length < minimumSteps) return false;

  const longSteps = steps.filter((step) => step.split(/\s+/).filter(Boolean).length >= 6).length;
  if (stage <= 2 && longSteps < (mealType === 'snack' ? 1 : 2)) return false;

  const actionSteps = steps.filter((step) => INSTRUCTION_ACTION_KEYWORDS.some((keyword) => step.toLowerCase().includes(keyword))).length;
  if (stage === 1 && actionSteps < Math.min(2, steps.length)) return false;

  const vagueSteps = steps.filter((step) => VAGUE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(step))).length;
  if (stage <= 2 && vagueSteps >= Math.ceil(steps.length * 0.6)) return false;

  const containsGenericCookCue = steps.some((step) => /\b(cooked through|until done)\b/i.test(step));
  const containsTimeOrTempCue = steps.some((step) =>
    /(\d+\s*(?:-|to)?\s*\d*\s*(?:min|mins|minute|minutes|hour|hours|sec|seconds))|(\d+\s*°\s*[cf])|(\d{2,3}\s*[cf]\b)/i.test(step)
  );
  if (stage <= 2 && mealType !== 'snack' && containsGenericCookCue && !containsTimeOrTempCue) return false;

  if (stage <= 2 && recipeInstructionIngredientCoverage(recipe) < 0.34) return false;
  return true;
}

function normalizeAvailableEquipmentForAnswers(answers = {}) {
  const normalized = normalizeCookingEquipmentList(answers?.availableEquipment);
  return normalized.length > 0 ? normalized : COOKING_EQUIPMENT_ORDER;
}

function recipeMatchesAvailableEquipment(recipe, availableEquipment, stage = 1) {
  const required = resolveRecipeRequiredEquipment(recipe);
  if (required.length === 0) return true;
  const availableSet = new Set(Array.isArray(availableEquipment) ? availableEquipment : COOKING_EQUIPMENT_ORDER);
  const hasMissingEquipment = required.some((equipment) => !availableSet.has(equipment));
  if (!hasMissingEquipment) return true;
  return stage >= 3;
}

function modelSupportsReasoningControls(model) {
  const normalized = normalizeText(model);
  return (
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4')
  );
}

function resolveReasoningEffort() {
  const allowed = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
  if (allowed.has(OPENAI_REASONING_EFFORT)) return OPENAI_REASONING_EFFORT;
  return 'minimal';
}

function resolveTextVerbosity() {
  const allowed = new Set(['low', 'medium', 'high']);
  if (allowed.has(OPENAI_TEXT_VERBOSITY)) return OPENAI_TEXT_VERBOSITY;
  return 'low';
}

function buildReasoningOptions(model) {
  if (!modelSupportsReasoningControls(model)) return undefined;
  return { effort: resolveReasoningEffort() };
}

function summarizeResponseIssue(payload) {
  const status = String(payload?.status || '').trim().toLowerCase();
  const errorMessage = String(payload?.error?.message || '').trim();
  const incompleteReason = String(payload?.incomplete_details?.reason || '').trim();
  if (status === 'completed') return '';
  if (status === 'incomplete' && incompleteReason) return `incomplete: ${incompleteReason}`;
  if (status && errorMessage) return `${status}: ${errorMessage}`;
  if (status) return status;
  if (errorMessage) return errorMessage;
  return 'no response text';
}

function debugMealPlanAi(message, payload) {
  if (process.env.DEBUG_MEAL_PLAN_AI !== '1') return;
  if (typeof payload === 'undefined') {
    console.log(`[meal-plan-ai] ${message}`);
    return;
  }
  try {
    console.log(`[meal-plan-ai] ${message}`, JSON.stringify(payload));
  } catch {
    console.log(`[meal-plan-ai] ${message}`);
  }
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
  if (stage <= 2 && !recipeHasActionableInstructions(recipe, 'breakfast', stage)) return false;
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
  if (stage <= 2 && !recipeHasActionableInstructions(recipe, mealType, stage)) return false;
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

function buildRelaxedPoolByMealType(recipesById, mealType, availableEquipment = COOKING_EQUIPMENT_ORDER) {
  const source = [...recipesById.values()].filter((recipe) => recipe.mealType === mealType);
  if (mealType === 'breakfast') {
    return source
      .filter((recipe) => isBreakfastMealCandidate(recipe, 2))
      .filter((recipe) => recipeMatchesAvailableEquipment(recipe, availableEquipment, 2))
      .map((recipe) => recipe.id);
  }
  if (mealType === 'lunch' || mealType === 'dinner') {
    return source
      .filter((recipe) => isMainMealPlanningCandidate(recipe, mealType, 2))
      .filter((recipe) => recipeMatchesAvailableEquipment(recipe, availableEquipment, 2))
      .map((recipe) => recipe.id);
  }
  return source
    .filter((recipe) => recipeHasActionableInstructions(recipe, 'snack', 2))
    .filter((recipe) => recipeMatchesAvailableEquipment(recipe, availableEquipment, 2))
    .map((recipe) => recipe.id);
}

export function generateFallbackMealPlan({ recipes, includeSnack = false, seedSalt = '', answers = {} }) {
  const uniqueById = new Map();
  const preferredCuisines = normalizeCuisineList(answers?.preferredCuisines);
  const availableEquipment = normalizeAvailableEquipmentForAnswers(answers);
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
      instructions: Array.isArray(recipe?.instructions) ? recipe.instructions : [],
      requiredEquipment: resolveRecipeRequiredEquipment(recipe),
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
        allowed =
          !containsAny(descriptor, BREAKFAST_HEAVY_KEYWORDS) &&
          calories <= 550 &&
          totalMinutes <= 45 &&
          recipeHasActionableInstructions(recipe, 'snack', 1);
      }

      if (allowed && !recipeMatchesAvailableEquipment(recipe, availableEquipment, 1)) {
        allowed = false;
      }

      if (allowed) {
        poolByType[recipe.mealType].push(recipe.id);
        if (recipeMatchesPreferredCuisines(recipe, preferredCuisines)) {
          cuisinePoolByType[recipe.mealType].push(recipe.id);
        }
      }
    }
  }

  const relaxedBreakfastPool = buildRelaxedPoolByMealType(uniqueById, 'breakfast', availableEquipment);
  const relaxedLunchPool = buildRelaxedPoolByMealType(uniqueById, 'lunch', availableEquipment);
  const relaxedDinnerPool = buildRelaxedPoolByMealType(uniqueById, 'dinner', availableEquipment);
  const relaxedSnackPool = buildRelaxedPoolByMealType(uniqueById, 'snack', availableEquipment);

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

function extractResponseTextOrThrow(payload, label) {
  const text = extractResponseText(payload);
  if (text) return text;
  const summary = summarizeResponseIssue(payload);
  throw new Error(`${label} returned no usable text (${summary}).`);
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

function stableHashToken(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

function buildGeneratedRecipeStableId({
  baseId,
  title,
  mealType,
  ingredients,
  instructions,
}) {
  const fingerprintSource = JSON.stringify({
    title: String(title || '').trim().toLowerCase(),
    mealType: String(mealType || '').trim().toLowerCase(),
    ingredients: (Array.isArray(ingredients) ? ingredients : [])
      .map((entry) =>
        [
          String(entry?.name || '').trim().toLowerCase(),
          String(entry?.quantity || '').trim().toLowerCase(),
          String(entry?.unit || '').trim().toLowerCase(),
        ].join(':')
      )
      .filter(Boolean)
      .slice(0, 18),
    instructions: (Array.isArray(instructions) ? instructions : [])
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6),
  });
  const token = stableHashToken(fingerprintSource);
  const usableBase = String(baseId || 'meal')
    .replace(/-+$/g, '')
    .slice(0, Math.max(8, 56 - (token.length + 1)));
  return `${usableBase}-${token}`;
}

function normalizeQuantityUnit(value) {
  const normalized = normalizeText(value).replace(/[^a-z]/g, '');
  if (!normalized) return '';
  return QUANTITY_UNIT_ALIASES[normalized] || '';
}

function parseQuantityFromIngredientName(rawName) {
  const source = String(rawName || '')
    .replace(/[•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return null;

  const match = source.match(
    /^(\d+(?:\.\d+)?|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/,
  );
  if (!match) return null;

  const quantity = match[1];
  const unit = normalizeQuantityUnit(match[2]);
  const name = match[3].trim();
  if (!unit || !name) return null;
  return {
    quantity,
    unit,
    name,
  };
}

function inferIngredientCategory(name) {
  const value = normalizeText(name);
  if (!value) return 'pantry';
  if (/\b(chicken|beef|turkey|lamb|fish|tuna|salmon|egg|tofu|tempeh|yogurt|yoghurt|cottage cheese)\b/.test(value)) {
    return 'protein';
  }
  if (/\b(spinach|kale|lettuce|tomato|cucumber|capsicum|pepper|onion|garlic|zucchini|broccoli|carrot|herb|parsley|basil|mint|lemon|lime|banana|apple|berries)\b/.test(value)) {
    return 'produce';
  }
  if (/\b(rice|quinoa|oats|bread|wrap|pasta|noodle|flour)\b/.test(value)) {
    return 'grains';
  }
  if (/\b(milk|cheese|feta|ricotta|cream|butter)\b/.test(value)) {
    return 'dairy';
  }
  if (/\b(cumin|paprika|oregano|thyme|pepper|salt|spice|chilli|cinnamon)\b/.test(value)) {
    return 'herbs & spices';
  }
  return 'pantry';
}

function inferAllergensFromIngredients(ingredients) {
  const text = Array.isArray(ingredients)
    ? ingredients.map((entry) => String(entry?.name || '')).join(' ').toLowerCase()
    : '';
  if (!text) return [];
  const allergens = new Set();
  if (/\b(wheat|flour|bread|pasta|barley|rye|crumb|gluten)\b/.test(text)) allergens.add('gluten');
  if (/\b(milk|yoghurt|yogurt|cheese|feta|ricotta|cream|butter)\b/.test(text)) allergens.add('dairy');
  if (/\begg(s)?\b/.test(text)) allergens.add('egg');
  if (/\b(nut|almond|cashew|walnut|pecan|hazelnut|pistachio|peanut)\b/.test(text)) allergens.add('nut');
  if (/\b(soy|tofu|tempeh)\b/.test(text)) allergens.add('soy');
  if (/\b(salmon|tuna|fish)\b/.test(text)) allergens.add('fish');
  if (/\b(prawn|shrimp|shellfish|mussel|oyster|crab)\b/.test(text)) allergens.add('shellfish');
  if (/\b(sesame)\b/.test(text)) allergens.add('sesame');
  return [...allergens];
}

function deriveGeneratedDietaryTags({ dietaryTags, protein, calories, totalTimeMinutes }) {
  const merged = normalizeList(dietaryTags, { limit: 12, lowercase: true });
  const tagSet = new Set(merged);
  const proteinValue = Number(protein || 0);
  const caloriesValue = Number(calories || 0);
  const totalMinutesValue = Number(totalTimeMinutes || 0);
  if (proteinValue >= 24) tagSet.add('high-protein');
  if (totalMinutesValue > 0 && totalMinutesValue <= 25) tagSet.add('quick-and-easy');
  if (caloriesValue > 0 && caloriesValue <= 420) tagSet.add('light-meal');
  return [...tagSet].slice(0, 10);
}

function defaultServesForMealType(mealType) {
  if (mealType === 'snack') return 4;
  if (mealType === 'breakfast') return 2;
  return 3;
}

function normalizeGeneratedIngredient(entry, index = 0) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const rawName =
    typeof entry === 'string'
      ? entry
      : source?.name || source?.ingredient || source?.item || source?.label || source?.food || '';
  const parsedInline = parseQuantityFromIngredientName(rawName);
  const name = parsedInline?.name || rawName;
  const quantity =
    typeof source?.quantity === 'string' || typeof source?.quantity === 'number'
      ? String(source.quantity).trim()
      : parsedInline?.quantity || '';
  const rawUnit = typeof source?.unit === 'string' ? source.unit.trim() : parsedInline?.unit || '';
  const unit = normalizeQuantityUnit(rawUnit) || truncateText(rawUnit, 24);
  const category =
    typeof source?.category === 'string' ? source.category.trim().toLowerCase().slice(0, 30) : inferIngredientCategory(name);
  const normalizedName = truncateText(name, 72);
  if (!normalizedName) {
    return { name: `Ingredient ${index + 1}` };
  }
  return {
    name: normalizedName,
    quantity: quantity ? truncateText(quantity, 24) : undefined,
    unit: unit || undefined,
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
  const titleCandidate = truncateText(entry?.title || entry?.name || '', 84);
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
      : Array.isArray(entry?.method)
        ? entry.method
        : tokenizeTextInput(entry?.instructionsText || entry?.directionsText);
  const instructions = instructionsSource
    .map((step) => normalizeInstructionStep(truncateText(step, 220)))
    .filter(Boolean)
    .slice(0, 10);

  if (ingredients.length < 3 || instructions.length < 2) return null;
  const stableId = buildGeneratedRecipeStableId({
    baseId,
    title,
    mealType,
    ingredients,
    instructions,
  });

  const prepTimeMinutes = toPositiveNumber(entry?.prepTimeMinutes ?? entry?.prepMinutes, { max: 240 });
  const cookTimeMinutes = toPositiveNumber(entry?.cookTimeMinutes ?? entry?.cookMinutes, { max: 360 });
  const totalFromPayload = toPositiveNumber(entry?.totalTimeMinutes ?? entry?.totalMinutes, { max: 420 });
  const totalTimeMinutes = totalFromPayload || toPositiveNumber((prepTimeMinutes || 0) + (cookTimeMinutes || 0), { max: 420 });
  const serves =
    toPositiveNumber(entry?.serves ?? entry?.servings, { min: 1, max: 12, precision: 1 }) || defaultServesForMealType(mealType);
  const calories = toPositiveNumber(entry?.calories ?? entry?.nutrition?.calories, { max: 2200 });
  const protein = toPositiveNumber(entry?.protein ?? entry?.nutrition?.protein, { max: 220, precision: 1 });
  const carbs = toPositiveNumber(entry?.carbs ?? entry?.nutrition?.carbs, { max: 300, precision: 1 });
  const fat = toPositiveNumber(entry?.fat ?? entry?.nutrition?.fat, { max: 180, precision: 1 });
  const dietaryTags = deriveGeneratedDietaryTags({
    dietaryTags: entry?.dietaryTags,
    protein,
    calories,
    totalTimeMinutes,
  });
  const allergens = normalizeList(
    [...normalizeList(entry?.allergens, { limit: 8, lowercase: true }), ...inferAllergensFromIngredients(ingredients)],
    { limit: 10, lowercase: true },
  );
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
  let requiredEquipment = normalizeCookingEquipmentList(entry?.requiredEquipment ?? entry?.required_equipment ?? entry?.equipment);
  if (requiredEquipment.length === 0) {
    requiredEquipment = inferEquipmentFromText(
      [title, description, ...instructions].join(' ')
    );
  }

  return {
    id: stableId,
    title,
    description: description || undefined,
    ingredients,
    instructions,
    mealType,
    requiredEquipment,
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
  requiredCoreMealTypes = CORE_MEAL_TYPES,
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
  return normalizedDays.map((day) => ({
    ...day,
    meals: {
      ...day.meals,
      breakfast: requiredCoreMealTypes.includes('breakfast') ? day.meals.breakfast : day.meals.breakfast || day.meals.dinner,
      lunch: requiredCoreMealTypes.includes('lunch') ? day.meals.lunch : day.meals.lunch || day.meals.dinner,
      dinner: requiredCoreMealTypes.includes('dinner') ? day.meals.dinner : day.meals.dinner || day.meals.lunch,
    },
  }));
}

function resolveCoreMealTypesFromMealsPerDay(mealsPerDayValue, selectedMealTypes = []) {
  const explicit = Array.isArray(selectedMealTypes)
    ? [...new Set(
        selectedMealTypes
          .map((entry) => normalizeMealType(entry))
          .filter((entry) => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner'),
      )]
    : [];
  if (explicit.length >= 2) {
    return CORE_MEAL_TYPES.filter((mealType) => explicit.includes(mealType));
  }

  const mealsPerDay = Math.max(2, Math.min(3, Number(mealsPerDayValue || 3)));
  if (mealsPerDay <= 2) return ['breakfast', 'dinner'];
  return ['breakfast', 'lunch', 'dinner'];
}

function calculateGeneratedRecipeQuality(recipes) {
  const source = Array.isArray(recipes) ? recipes : [];
  if (source.length === 0) {
    return {
      servesCoverage: 0,
      quantityCoverage: 0,
      richInstructionCoverage: 0,
      ingredientReuseRatio: 0,
      uniqueIngredientCount: 0,
      valid: false,
    };
  }

  let totalIngredients = 0;
  let ingredientsWithQtyAndUnit = 0;
  let recipesWithServes = 0;
  let recipesWithRichInstructions = 0;
  const uniqueIngredients = new Set();

  for (const recipe of source) {
    const serves = Number(recipe?.serves || 0);
    if (Number.isFinite(serves) && serves > 0) recipesWithServes += 1;

    const mealType = normalizeMealType(recipe?.mealType) || 'lunch';
    if (recipeHasActionableInstructions(recipe, mealType, 2)) {
      recipesWithRichInstructions += 1;
    }

    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    for (const ingredient of ingredients) {
      totalIngredients += 1;
      const key = normalizeText(String(ingredient?.name || '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' '));
      if (key) uniqueIngredients.add(key);
      const quantity = String(ingredient?.quantity || '').trim();
      const unit = String(ingredient?.unit || '').trim();
      if (quantity && unit) ingredientsWithQtyAndUnit += 1;
    }
  }

  const servesCoverage = recipesWithServes / source.length;
  const quantityCoverage = totalIngredients > 0 ? ingredientsWithQtyAndUnit / totalIngredients : 0;
  const richInstructionCoverage = recipesWithRichInstructions / source.length;
  const ingredientReuseRatio =
    totalIngredients > 0
      ? Math.max(0, Math.min(1, 1 - uniqueIngredients.size / totalIngredients))
      : 0;
  const valid =
    servesCoverage >= 0.95 &&
    quantityCoverage >= 0.8 &&
    richInstructionCoverage >= 0.72 &&
    ingredientReuseRatio >= 0.32;

  return {
    servesCoverage,
    quantityCoverage,
    richInstructionCoverage,
    ingredientReuseRatio,
    uniqueIngredientCount: uniqueIngredients.size,
    valid,
  };
}

function buildOnboardingSummary(answers = {}, includeSnack = false) {
  const coreMealTypes = resolveCoreMealTypesFromMealsPerDay(answers?.mealsPerDay, answers?.selectedMealTypes);
  const hasTwoCoreMeals = coreMealTypes.length === 2;
  const mealsPerDay = coreMealTypes.length;
  const daysPerWeek = Math.max(2, Math.min(7, Number(answers?.daysPerWeek || 7)));
  const twoMealMode = coreMealTypes.length === 2 && coreMealTypes.includes('breakfast') && coreMealTypes.includes('dinner');
  const groceryPreference = truncateText(answers?.groceryPreference || '', 80).toLowerCase();
  const availableEquipment = normalizeAvailableEquipmentForAnswers(answers);
  const fastPrepTargetMinutes =
    groceryPreference === 'fastest meals possible'
      ? 22
      : groceryPreference === 'meal prep friendly'
        ? 30
        : 35;
  const ingredientOverlapTarget = groceryPreference === 'meal prep friendly' ? 0.62 : 0.5;

  return {
    intakeVersion: 'v2',
    person: {
      firstName: truncateText(answers?.firstName || '', 48),
      age: toPositiveNumber(answers?.age, { min: 10, max: 99 }),
      gender: truncateText(answers?.gender || '', 24).toLowerCase() || undefined,
      heightCm: toPositiveNumber(answers?.heightCm, { min: 100, max: 240 }),
      currentWeightKg: toPositiveNumber(answers?.currentWeightKg, { min: 30, max: 260, precision: 1 }),
      goalWeightKg: toPositiveNumber(answers?.goalWeightKg, { min: 30, max: 260, precision: 1 }),
    },
    goals: {
      mainGoal: truncateText(answers?.mainGoal || '', 200),
      motivation: truncateText(answers?.motivation || '', 240),
      primaryHealthFocus: truncateText(answers?.primaryHealthFocus || '', 80),
      timeframeWeeks: toPositiveNumber(answers?.timeframeWeeks, { min: 1, max: 104 }),
      biggestChallenge: truncateText(answers?.biggestChallenge || '', 160),
    },
    restrictions: {
      dietaryRequirements: normalizeList(answers?.dietaryRequirements, { limit: 10, lowercase: true }),
      allergies: normalizeList([...(answers?.allergyChips || []), ...tokenizeTextInput(answers?.allergiesText)], {
        limit: 14,
        lowercase: true,
      }),
      dislikes: normalizeList(tokenizeTextInput(answers?.dislikes), { limit: 14, lowercase: true }),
    },
    preferences: {
      favoriteFoods: normalizeList(answers?.favoriteFoods, { limit: 12, lowercase: true }),
      preferredCuisines: normalizeList(answers?.preferredCuisines, { limit: 8, lowercase: true }),
      preferredMealStyle: truncateText(answers?.preferredMealStyle || '', 80).toLowerCase(),
      cookingSkill: truncateText(answers?.cookingSkill || '', 80).toLowerCase(),
      availableEquipment,
      budgetPreference: truncateText(answers?.budgetPreference || '', 80).toLowerCase(),
      groceryPreference,
      prepDay: truncateText(answers?.prepDay || '', 24),
      includeSnack,
      mealsPerDay,
      daysPerWeek,
      coreMealTypes,
    },
    generationConstraints: {
      planDays: 7,
      targetRecipeCountMin: twoMealMode ? 2 : hasTwoCoreMeals ? (includeSnack ? 4 : 3) : includeSnack ? 8 : 7,
      targetRecipeCountMax: twoMealMode ? (includeSnack ? 4 : 3) : hasTwoCoreMeals ? (includeSnack ? 6 : 5) : includeSnack ? 12 : 10,
      maxPrepMinutesDefault: fastPrepTargetMinutes,
      maxDinnerMinutes: 45,
      maxBreakfastMinutes: 18,
      targetIngredientOverlapRatio: ingredientOverlapTarget,
      maxUniqueCoreIngredients: twoMealMode ? 16 : groceryPreference === 'meal prep friendly' ? 34 : 42,
      servingsRange: { min: 2, max: 4 },
      snackServingsRange: { min: 4, max: 8 },
      strictTwoMealMode: twoMealMode,
      requiredFields: [
        'recipes[].title',
        'recipes[].serves',
        'recipes[].ingredients[].name',
        'recipes[].ingredients[].quantity',
        'recipes[].ingredients[].unit',
        'recipes[].instructions[]',
      ],
    },
  };
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
  const outputFormat = 'webp';
  const imageQuality = process.env.OPENAI_IMAGE_QUALITY || 'low';
  const imageSize = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
  const compression = Math.max(1, Math.min(100, Number(process.env.OPENAI_IMAGE_OUTPUT_COMPRESSION || 70)));
  const prompt = buildRecipeImagePrompt(recipe, answers);

  const createRequestBody = (includeCompression) => {
    const body = {
      model: imageModel,
      prompt,
      n: 1,
      size: imageSize,
      quality: imageQuality,
      output_format: outputFormat,
    };
    if (includeCompression && (outputFormat === 'webp' || outputFormat === 'jpeg')) {
      body.output_compression = compression;
    }
    return body;
  };

  const requestImage = async (includeCompression) => {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createRequestBody(includeCompression)),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || JSON.stringify(payload);
      const errorObject = new Error(`Meal image generation failed (${response.status}): ${detail}`);
      errorObject.status = response.status;
      throw errorObject;
    }
    return payload;
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENAI_MEAL_IMAGE_TIMEOUT_MS);
  try {
    let payload;
    try {
      payload = await requestImage(true);
    } catch (errorObject) {
      const message = String(errorObject?.message || '');
      if (
        message.toLowerCase().includes('output_compression') ||
        message.toLowerCase().includes('unsupported') ||
        message.toLowerCase().includes('invalid parameter')
      ) {
        payload = await requestImage(false);
      } else {
        throw errorObject;
      }
    }

    const image = payload?.data?.[0] || null;
    if (image?.b64_json) {
      return `data:image/${outputFormat};base64,${image.b64_json}`;
    }
    if (typeof image?.url === 'string' && image.url) {
      return normalizeRecipeImageToWebp(image.url);
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
    requiredEquipment: resolveRecipeRequiredEquipment(recipe),
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
      instructions: Array.isArray(recipe?.instructions) ? recipe.instructions : [],
      ingredientTokens: ingredientTokenSet(recipe),
      requiredEquipment: resolveRecipeRequiredEquipment(recipe),
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
  const availableEquipment = new Set(normalizeAvailableEquipmentForAnswers(answers));
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
    const hasUnavailableEquipment = [breakfastMeta, lunchMeta, dinnerMeta].some((meta) =>
      (Array.isArray(meta?.requiredEquipment) ? meta.requiredEquipment : []).some((equipment) => !availableEquipment.has(equipment))
    );
    if (hasUnavailableEquipment) {
      criticalIssues.push(`A meal on ${day?.label || 'a day'} requires unavailable equipment.`);
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

async function requestOpenAiTextOutput({
  apiKey,
  model,
  input,
  timeoutMs,
  maxOutputTokens,
  label,
  textFormat,
  allowExtendedRetry = true,
}) {
  const baseAttempt = {
    tokenBudget: maxOutputTokens,
    timeout: timeoutMs,
    reasoningEffort: resolveReasoningEffort(),
  };
  const attempts = [
    baseAttempt,
    ...(allowExtendedRetry
      ? [
          {
            tokenBudget: Math.min(20000, Math.round(maxOutputTokens * 1.35)),
            timeout: Math.min(180000, Math.round(timeoutMs * 1.35)),
            reasoningEffort: 'minimal',
          },
        ]
      : []),
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), attempt.timeout);
    try {
      const body = {
        model,
        input,
        text: {
          ...(textFormat && typeof textFormat === 'object' ? textFormat : {}),
          verbosity: resolveTextVerbosity(),
        },
        max_output_tokens: attempt.tokenBudget,
      };
      const reasoning = buildReasoningOptions(model);
      if (reasoning?.effort) {
        body.reasoning = { effort: attempt.reasoningEffort || reasoning.effort };
      }

      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload?.error?.message || JSON.stringify(payload || {});
        throw new Error(`${label} request failed (${response.status}): ${detail}`);
      }

      return extractResponseTextOrThrow(payload, label);
    } catch (errorObject) {
      if (errorObject?.name === 'AbortError') {
        lastError = new Error(`${label} request timed out after ${attempt.timeout}ms`);
      } else {
        const message = String(errorObject?.message || errorObject || '');
        lastError = errorObject;
        const isRetryableEmptyOutput =
          message.includes('returned no usable text (incomplete: max_output_tokens)') ||
          message.includes('returned no usable text (incomplete)');
        if (!isRetryableEmptyOutput) {
          throw errorObject;
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw lastError || new Error(`${label} request failed.`);
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
    'Respect availableEquipment from onboardingAnswers and avoid meals that require unavailable equipment when alternatives exist.',
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
  return requestOpenAiTextOutput({
    apiKey,
    model,
    label: 'OpenAI meal plan',
    timeoutMs: OPENAI_MEAL_PLAN_TIMEOUT_MS,
    maxOutputTokens: OPENAI_MEAL_PLAN_MAX_OUTPUT_TOKENS,
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
  });
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
    'Respect availableEquipment from onboardingAnswers and avoid meals that require unavailable equipment when alternatives exist.',
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
  return requestOpenAiTextOutput({
    apiKey,
    model,
    label: 'OpenAI meal plan repair',
    timeoutMs: OPENAI_MEAL_PLAN_TIMEOUT_MS,
    maxOutputTokens: OPENAI_MEAL_PLAN_MAX_OUTPUT_TOKENS,
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
  });
}

async function callOpenAiForGeneratedMeals({ answers, includeSnack, seedSalt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_GENERATED_RECIPES_MODEL || process.env.OPENAI_MEAL_PLAN_MODEL || 'gpt-5-nano';
  const onboarding = buildOnboardingSummary(answers, includeSnack);
  const coreMealTypes = Array.isArray(onboarding?.preferences?.coreMealTypes)
    ? onboarding.preferences.coreMealTypes
    : CORE_MEAL_TYPES;
  const twoMealMode = coreMealTypes.length === 2 && coreMealTypes.includes('breakfast') && coreMealTypes.includes('dinner');
  const requiredMealsLabel = coreMealTypes.length > 0 ? coreMealTypes.join(', ') : CORE_MEAL_TYPES.join(', ');
  const recipeCountMin = Number(onboarding?.generationConstraints?.targetRecipeCountMin || 8);
  const recipeCountMax = Number(onboarding?.generationConstraints?.targetRecipeCountMax || 12);

  const systemPrompt = [
    'You are an Accredited Practising Dietitian (APD) and meal-planning specialist.',
    'This is stage 2 of a two-stage pipeline: stage 1 already produced intakeProfile JSON from the intake form.',
    'Use intakeProfile as the source of truth and generate a practical weekly meal plan plus recipe catalog.',
    'Return one valid JSON object only. No markdown.',
    'Safety first: strictly avoid allergens and explicitly disliked foods from intakeProfile.',
    'All recipes must include full ingredient quantities/units and complete numbered cooking steps.',
    'Respect availableEquipment from intakeProfile.preferences.availableEquipment. Do not require unavailable equipment unless unavoidable.',
    'Prioritize overlapping ingredients across recipes to minimize unique groceries and reduce waste.',
    'Prefer short prep/cook times and practical Australian supermarket ingredients.',
    `Each day must include the required meal types: ${requiredMealsLabel}. Include snack only when requested.`,
    'Every meal id in days must reference an id present in recipes.',
    'Keep output concise and avoid unnecessary metadata.',
  ].join('\n');

  const userPrompt = JSON.stringify(
    {
      stage: 'meal_plan_generation_v2',
      task: 'Generate weekly meal plan, grocery-friendly recipe catalog, and meal assignments from intakeProfile.',
      includeSnack,
      seedSalt,
      intakeProfile: onboarding,
      outputSchema: {
        notes: ['short string'],
        recipes: [
          {
            id: 'string',
            title: 'string',
            description: 'string',
            mealType: 'breakfast|lunch|dinner|snack',
            serves: 0,
            requiredEquipment: ['stovetop|oven|air fryer|microwave'],
            ingredients: [{ name: 'string', quantity: 'string|number', unit: 'string', category: 'protein|produce|grains|dairy|herbs & spices|pantry' }],
            instructions: ['string'],
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            dietaryTags: ['string'],
            allergens: ['string'],
            prepTimeMinutes: 0,
            cookTimeMinutes: 0,
            totalTimeMinutes: 0,
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
      hardRequirements: [
        `Generate ${recipeCountMin}-${recipeCountMax} total recipes with quality over quantity.`,
        'Each recipe must have at least 4 ingredients and at least 3 clear instruction steps.',
        'Each ingredient entry must include: name, quantity, unit, category.',
        'Each recipe must include calories and protein as positive numbers.',
        'Each recipe must include a realistic serves value (breakfast/lunch/dinner typically 2-4, snack 4-8).',
        'Each recipe must include requiredEquipment as an array from: stovetop, oven, air fryer, microwave (empty array allowed for no-cook meals).',
        'At least 60% of recipes should reuse core ingredients from the weekly base pantry/protein set.',
        'Keep prep practical: breakfast mostly <=18 min, lunch/dinner mostly <=35 min total.',
        'No placeholder values like N/A, to taste, as needed, some, handful as quantity.',
        twoMealMode
          ? 'Strict two-meal mode: only breakfast and dinner are required core meals. Generate exactly 1 breakfast and 1 dinner recipe, then repeat these across the week for maximum overlap.'
          : `Generate practical recipes covering the required core meal types: ${requiredMealsLabel}.`,
        includeSnack ? 'Include snack recipes and one snack per day.' : 'Do not include snack assignments unless explicitly needed.',
        'Respect dietary requirements and allergies as hard constraints.',
        'Keep each recipe compact: concise description, 3-6 ingredients, 2-5 steps.',
      ],
      formatExample: {
        notes: ['string'],
        recipes: [
          {
            id: 'high-protein-overnight-oats',
            title: 'High-Protein Overnight Oats',
            mealType: 'breakfast',
            serves: 2,
            requiredEquipment: [],
            ingredients: [
              { name: 'rolled oats', quantity: 1, unit: 'cup', category: 'grains' },
              { name: 'greek yogurt', quantity: 200, unit: 'g', category: 'dairy' },
            ],
            instructions: ['Step 1...', 'Step 2...', 'Step 3...'],
          },
        ],
        days: [
          { breakfast: 'high-protein-overnight-oats', lunch: 'recipe-id', dinner: 'recipe-id', snacks: ['snack-id'] },
        ],
      },
    },
    null,
    2,
  );
  return requestOpenAiTextOutput({
    apiKey,
    model,
    label: 'OpenAI generated recipe',
    timeoutMs: OPENAI_GENERATED_RECIPES_TIMEOUT_MS,
    maxOutputTokens: OPENAI_GENERATED_RECIPES_MAX_OUTPUT_TOKENS,
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
    textFormat: {
      format: {
        type: 'json_object',
      },
    },
    allowExtendedRetry: false,
  });
}

function normalizeGeneratedBundle({ parsed, includeSnack, coreMealTypes = CORE_MEAL_TYPES }) {
  const requiredCoreMealTypes = Array.isArray(coreMealTypes) && coreMealTypes.length > 0
    ? coreMealTypes.filter((entry) => CORE_MEAL_TYPES.includes(entry))
    : CORE_MEAL_TYPES;
  const twoMealMode =
    requiredCoreMealTypes.length === 2 &&
    requiredCoreMealTypes.includes('breakfast') &&
    requiredCoreMealTypes.includes('dinner');
  const minimumRecipeCount = requiredCoreMealTypes.length <= 2 ? 2 : 6;
  const rawRecipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
  debugMealPlanAi('normalizeGeneratedBundle.input', {
    rawRecipeCount: rawRecipes.length,
    hasDays: Array.isArray(parsed?.days),
    dayCount: Array.isArray(parsed?.days) ? parsed.days.length : 0,
  });
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

  if (normalizedRecipes.length < minimumRecipeCount) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.recipe_count', {
      normalizedRecipeCount: normalizedRecipes.length,
      minimumRecipeCount,
      requiredCoreMealTypes,
    });
    return null;
  }

  const recipesByMealType = {
    breakfast: normalizedRecipes.filter((recipe) => recipe.mealType === 'breakfast').map((recipe) => recipe.id),
    lunch: normalizedRecipes.filter((recipe) => recipe.mealType === 'lunch').map((recipe) => recipe.id),
    dinner: normalizedRecipes.filter((recipe) => recipe.mealType === 'dinner').map((recipe) => recipe.id),
    snack: normalizedRecipes.filter((recipe) => recipe.mealType === 'snack').map((recipe) => recipe.id),
  };

  const hasMissingRequiredType = requiredCoreMealTypes.some((mealType) => (recipesByMealType[mealType] || []).length === 0);
  if (hasMissingRequiredType) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.missing_core_meal_type', {
      counts: {
        breakfast: recipesByMealType.breakfast.length,
        lunch: recipesByMealType.lunch.length,
        dinner: recipesByMealType.dinner.length,
        snack: recipesByMealType.snack.length,
      },
      requiredCoreMealTypes,
    });
    return null;
  }
  const minVarietyPerRequiredType = 1;
  const hasLowVariety = requiredCoreMealTypes.some((mealType) => {
    const count = (recipesByMealType[mealType] || []).length;
    return count < minVarietyPerRequiredType;
  });
  if (hasLowVariety) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.low_meal_type_variety', {
      counts: {
        breakfast: recipesByMealType.breakfast.length,
        lunch: recipesByMealType.lunch.length,
        dinner: recipesByMealType.dinner.length,
        snack: recipesByMealType.snack.length,
      },
      requiredCoreMealTypes,
    });
    notes.push(
      'Recipe variety was relaxed to preserve a clinically safe plan while maintaining your key meal structure.',
    );
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
    requiredCoreMealTypes,
  });
  const hasMissingCoreMeals = days.some((day) =>
    requiredCoreMealTypes.some((mealType) => !String(day?.meals?.[mealType] || '').trim()),
  );
  if (hasMissingCoreMeals) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.missing_core_day_assignment');
    return null;
  }

  const notes = normalizeList(parsed?.notes, { limit: 6 }).filter(Boolean);
  const caloriesCoverage =
    normalizedRecipes.length > 0
      ? normalizedRecipes.filter((recipe) => Number.isFinite(Number(recipe?.calories || 0)) && Number(recipe?.calories || 0) > 0).length /
        normalizedRecipes.length
      : 0;
  const proteinCoverage =
    normalizedRecipes.length > 0
      ? normalizedRecipes.filter((recipe) => Number.isFinite(Number(recipe?.protein || 0)) && Number(recipe?.protein || 0) > 0).length /
        normalizedRecipes.length
      : 0;
  if (caloriesCoverage < 0.5 || proteinCoverage < 0.5) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.macro_coverage', {
      caloriesCoverage,
      proteinCoverage,
      recipeCount: normalizedRecipes.length,
    });
    return null;
  }
  if (caloriesCoverage < 0.9 || proteinCoverage < 0.9) {
    notes.push(
      'Some nutrition fields were estimated to keep delivery reliable while preserving the weekly structure.',
    );
  }
  const quality = calculateGeneratedRecipeQuality(normalizedRecipes);
  if (!quality.valid) {
    debugMealPlanAi('normalizeGeneratedBundle.fail.quality', quality);
    const twoCoreMealsSelected = requiredCoreMealTypes.length === 2;
    const hardQualityFailure =
      quality.servesCoverage < (twoCoreMealsSelected ? 0.62 : 0.72) ||
      quality.quantityCoverage < (twoCoreMealsSelected ? 0.5 : 0.58) ||
      quality.richInstructionCoverage < (twoCoreMealsSelected ? 0.38 : 0.45);
    if (hardQualityFailure) {
      return null;
    }
    notes.push(
      'Quality safeguards were partially relaxed to return a usable plan while preserving allergy and meal-type constraints.',
    );
  }
  return {
    recipes: normalizedRecipes,
    mealPlan: {
      days,
      generatedBy: 'openai',
      notes: [
        ...notes,
        `AI quality checks: servings ${Math.round(quality.servesCoverage * 100)}%, quantities ${Math.round(
          quality.quantityCoverage * 100,
        )}%, detailed steps ${Math.round(quality.richInstructionCoverage * 100)}%, ingredient reuse ${Math.round(
          quality.ingredientReuseRatio * 100,
        )}% (${quality.uniqueIngredientCount} unique items).`,
      ].slice(0, 6),
      generatedAt: new Date().toISOString(),
    },
  };
}

function compactBundleForTwoMealMode(bundle, includeSnack = false) {
  if (!bundle || !Array.isArray(bundle.recipes) || !bundle.mealPlan) return bundle;
  const recipes = bundle.recipes;
  const breakfasts = recipes.filter((recipe) => recipe.mealType === 'breakfast');
  const dinners = recipes.filter((recipe) => recipe.mealType === 'dinner');
  if (breakfasts.length === 0 || dinners.length === 0) return bundle;

  const breakfast = breakfasts[0];
  const breakfastTokens = ingredientTokenSet(breakfast);
  const bestDinner = dinners
    .map((dinner) => ({
      dinner,
      overlap: tokenOverlapCount(breakfastTokens, ingredientTokenSet(dinner)),
    }))
    .sort((left, right) => right.overlap - left.overlap)[0]?.dinner;
  if (!bestDinner) return bundle;

  const snack = includeSnack ? recipes.find((recipe) => recipe.mealType === 'snack') : null;
  const keepIds = new Set([breakfast.id, bestDinner.id, ...(snack ? [snack.id] : [])]);
  const compactRecipes = recipes.filter((recipe) => keepIds.has(recipe.id));
  const compactDays = (Array.isArray(bundle.mealPlan.days) ? bundle.mealPlan.days : []).map((day, dayIndex) => ({
    ...day,
    dayIndex,
    meals: {
      breakfast: breakfast.id,
      lunch: bestDinner.id,
      dinner: bestDinner.id,
      snacks: includeSnack && snack ? [snack.id] : undefined,
    },
  }));

  return {
    recipes: compactRecipes,
    mealPlan: {
      ...bundle.mealPlan,
      days: compactDays,
      notes: [
        ...(Array.isArray(bundle.mealPlan.notes) ? bundle.mealPlan.notes : []),
        'Two-meal mode applied: one breakfast and one dinner recipe repeated for maximum ingredient overlap.',
      ].slice(0, 6),
    },
  };
}

export async function generateOpenAiMealPlanWithGeneratedRecipes({ answers, includeSnack = false, seedSalt = '' }) {
  try {
    const intakeProfile = buildOnboardingSummary(answers, includeSnack);
    const coreMealTypes = Array.isArray(intakeProfile?.preferences?.coreMealTypes)
      ? intakeProfile.preferences.coreMealTypes
      : CORE_MEAL_TYPES;
    const twoMealMode =
      coreMealTypes.length === 2 &&
      coreMealTypes.includes('breakfast') &&
      coreMealTypes.includes('dinner');
    let normalized = null;
    let lastError = null;
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptSeed =
        attempt === 0
          ? seedSalt
          : `${seedSalt || 'meal-plan'}|retry:${attempt}|ts:${Date.now()}`;
      try {
        const outputText = await callOpenAiForGeneratedMeals({
          answers,
          includeSnack,
          seedSalt: attemptSeed,
        });
        if (!outputText) {
          debugMealPlanAi('generateOpenAiMealPlanWithGeneratedRecipes.empty_output', { attempt });
          continue;
        }
        const parsed = parseJsonFromText(outputText);
        if (!parsed || typeof parsed !== 'object') {
          debugMealPlanAi('generateOpenAiMealPlanWithGeneratedRecipes.invalid_json', { attempt });
          continue;
        }
        normalized = normalizeGeneratedBundle({ parsed, includeSnack, coreMealTypes });
        if (normalized) {
          const planQuality = calculatePlanQuality(normalized.mealPlan, buildRecipeMetaMap(normalized.recipes), answers);
          if (!planQuality.valid) {
            const issues = Array.isArray(planQuality.issues) ? planQuality.issues : [];
            const hasFatalIssue = issues.some((issue) => {
              const message = String(issue || '').toLowerCase();
              if (!message) return false;
              return message.includes('missing recipe metadata') || message.includes('requires unavailable equipment');
            });
            if (!hasFatalIssue) {
              normalized.mealPlan.notes = [
                ...(Array.isArray(normalized.mealPlan.notes) ? normalized.mealPlan.notes : []),
                'Plan quality safeguards were partially relaxed to return a complete weekly plan without violating core constraints.',
              ].slice(0, 8);
              break;
            }
            debugMealPlanAi('generateOpenAiMealPlanWithGeneratedRecipes.fail.plan_quality', {
              attempt,
              issues: planQuality.issues,
            });
            normalized = null;
            continue;
          }
          break;
        }
      } catch (errorObject) {
        lastError = errorObject;
        debugMealPlanAi('generateOpenAiMealPlanWithGeneratedRecipes.attempt_error', {
          attempt,
          message: errorObject?.message || String(errorObject),
        });
      }
    }

    if (!normalized) {
      if (lastError) throw lastError;
      return null;
    }

    if (twoMealMode) {
      normalized = compactBundleForTwoMealMode(normalized, includeSnack);
    }

    const hasConcreteRecipeImage = (value) => Boolean(normalizeRecipeImageToWebp(value));
    const recipesNeedingImages = normalized.recipes
      .filter((recipe) => !hasConcreteRecipeImage(recipe?.imageUrl))
      .slice(0, OPENAI_MAX_GENERATED_RECIPE_IMAGES);
    await withConcurrency(recipesNeedingImages, 4, async (recipe) => {
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
      imageUrl: normalizeRecipeImageToWebp(recipe?.imageUrl) || '',
    }));
    const imageCoverage =
      normalized.recipes.length > 0
        ? normalized.recipes.filter((recipe) => hasConcreteRecipeImage(recipe?.imageUrl)).length / normalized.recipes.length
        : 0;
    if (imageCoverage < 0.85) {
      debugMealPlanAi('generateOpenAiMealPlanWithGeneratedRecipes.fail.image_coverage', {
        imageCoverage,
        recipeCount: normalized.recipes.length,
      });
      if (normalized?.mealPlan && Array.isArray(normalized.mealPlan.notes)) {
        normalized.mealPlan.notes = [
          ...normalized.mealPlan.notes,
          'Meal imagery coverage was reduced for this run; recipe content and swap logic remain fully available.',
        ].slice(0, 8);
      }
    }
    return {
      ...normalized,
      intakeProfile,
    };
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
