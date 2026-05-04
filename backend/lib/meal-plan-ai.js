const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const PLAN_DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CORE_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const OPENAI_MEAL_PLAN_TIMEOUT_MS = Math.max(3000, Number(process.env.OPENAI_MEAL_PLAN_TIMEOUT_MS || 9000));

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

function pickRecipeId(pool, usedCounts, offset) {
  if (!Array.isArray(pool) || pool.length === 0) return '';

  const sorted = [...pool].sort((a, b) => {
    const useDelta = (usedCounts[a] || 0) - (usedCounts[b] || 0);
    if (useDelta !== 0) return useDelta;
    return a.localeCompare(b);
  });

  const chosenId = sorted[offset % sorted.length] || '';
  if (chosenId) {
    usedCounts[chosenId] = (usedCounts[chosenId] || 0) + 1;
  }
  return chosenId;
}

export function generateFallbackMealPlan({ recipes, includeSnack = false, seedSalt = '', answers = {} }) {
  const uniqueById = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const id = String(recipe?.id || '').trim();
    if (!id || uniqueById.has(id)) continue;
    uniqueById.set(id, {
      id,
      mealType: normalizeMealType(recipe?.mealType),
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

  for (const recipe of uniqueById.values()) {
    if (recipe.mealType && poolByType[recipe.mealType]) {
      poolByType[recipe.mealType].push(recipe.id);
    }
  }

  const breakfastPool = poolByType.breakfast.length > 0 ? poolByType.breakfast : allRecipeIds;
  const lunchPool = poolByType.lunch.length > 0 ? poolByType.lunch : allRecipeIds;
  const dinnerPool = poolByType.dinner.length > 0 ? poolByType.dinner : allRecipeIds;
  const snackPool =
    poolByType.snack.length > 0
      ? poolByType.snack
      : poolByType.breakfast.length > 0
        ? poolByType.breakfast
        : allRecipeIds;

  const usedCounts = {};
  const seedSource = `${seedSalt}|${JSON.stringify(answers || {})}|${allRecipeIds.length}`;
  const seed = hashSeed(seedSource);
  const notes = [
    'Plan generated with deterministic fallback to guarantee a complete breakfast, lunch, and dinner schedule.',
  ];

  const days = PLAN_DAY_LABELS.map((label, dayIndex) => {
    const breakfast = pickRecipeId(breakfastPool, usedCounts, seed + dayIndex * 3 + 0);
    const lunch = pickRecipeId(lunchPool, usedCounts, seed + dayIndex * 3 + 1);
    const dinner = pickRecipeId(dinnerPool, usedCounts, seed + dayIndex * 3 + 2);
    const snack = includeSnack ? pickRecipeId(snackPool, usedCounts, seed + dayIndex * 3 + 3) : '';

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

  const hasMissingCoreMeals = days.some((day) =>
    CORE_MEAL_TYPES.some((mealType) => !String(day?.meals?.[mealType] || '').trim()),
  );
  if (hasMissingCoreMeals) return null;

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
  return {
    id: String(recipe?.id || ''),
    title: String(recipe?.title || ''),
    mealType: String(recipe?.mealType || ''),
    calories: Number.isFinite(Number(recipe?.calories)) ? Number(recipe.calories) : null,
    protein: Number.isFinite(Number(recipe?.protein)) ? Number(recipe.protein) : null,
    prepTimeMinutes: Number.isFinite(Number(recipe?.prepTimeMinutes)) ? Number(recipe.prepTimeMinutes) : null,
    dietaryTags: Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags.slice(0, 8) : [],
    allergens: Array.isArray(recipe?.allergens) ? recipe.allergens.slice(0, 8) : [],
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

async function callOpenAiForMealPlan({ answers, recipes, includeSnack, seedSalt }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_MEAL_PLAN_MODEL || process.env.OPENAI_NOTES_MODEL || 'gpt-5-nano';
  const compactRecipes = recipes.map(compactRecipe).filter((recipe) => recipe.id && recipe.title);

  const systemPrompt = [
    'You are a clinical nutrition meal planner.',
    'Return valid JSON only. Do not include markdown.',
    'Build a 7-day plan with exactly one breakfast, lunch, and dinner each day.',
    includeSnack ? 'Include one snack id per day in snacks array.' : 'Do not include snacks unless explicitly requested.',
    'Use only recipe ids from the provided catalog. Never invent ids.',
    'Prefer high-protein options when possible and match dietary requirements/allergies.',
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
        max_output_tokens: 2200,
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

export async function generateOpenAiMealPlan({ answers, recipes, includeSnack = false, seedSalt = '' }) {
  const validIds = new Set(recipes.map((recipe) => String(recipe?.id || '').trim()).filter(Boolean));
  if (validIds.size === 0) return null;

  try {
    const outputText = await callOpenAiForMealPlan({ answers, recipes, includeSnack, seedSalt });
    const parsed = parseJsonFromText(outputText);
    return validateAndNormalizePlan(parsed, validIds, includeSnack);
  } catch (error) {
    console.error('Meal plan AI generation failed:', error?.message || String(error));
    return null;
  }
}
