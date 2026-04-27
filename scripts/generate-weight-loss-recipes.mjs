import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'frontend/public/Food Ingredients and Recipe Dataset with Image Name Mapping.csv');
const IMAGE_DIR = path.join(ROOT, 'frontend/public/Food Images/Food Images');
const OUTPUT_PATH = path.join(ROOT, 'frontend/public/weight-loss-reset-recipes.json');
const FALLBACK_IMAGE_URL = '/nutrionist.webp';

const MAX_RECIPES_BY_MEAL_TYPE = {
  breakfast: 520,
  lunch: 760,
  dinner: 900,
  snack: 360,
};

const MEAT_TERMS = [
  'beef',
  'pork',
  'chicken',
  'turkey',
  'lamb',
  'veal',
  'ham',
  'bacon',
  'sausage',
  'prosciutto',
  'salami',
  'anchovy',
  'tuna',
  'salmon',
  'shrimp',
  'prawn',
  'fish',
  'cod',
  'halibut',
  'sardine',
  'mussels',
  'clam',
  'oyster',
  'crab',
  'lobster',
];

const DAIRY_TERMS = ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'ricotta', 'parmesan', 'ghee'];
const HIGH_CARB_TERMS = ['rice', 'bread', 'pasta', 'noodle', 'potato', 'flour', 'tortilla', 'bagel', 'bun'];
const PROTEIN_TERMS = [
  'chicken',
  'turkey',
  'beef',
  'pork',
  'salmon',
  'tuna',
  'fish',
  'egg',
  'tofu',
  'tempeh',
  'lentil',
  'bean',
  'chickpea',
  'yogurt',
  'yoghurt',
  'cottage cheese',
  'prawn',
  'shrimp',
];
const PRODUCE_TERMS = [
  'apple',
  'banana',
  'berry',
  'spinach',
  'lettuce',
  'tomato',
  'onion',
  'broccoli',
  'carrot',
  'zucchini',
  'pepper',
  'cucumber',
  'mushroom',
  'avocado',
  'kale',
  'lemon',
  'lime',
  'garlic',
  'ginger',
];

const ALLERGEN_KEYWORDS = {
  gluten: ['wheat', 'bread', 'pasta', 'flour', 'barley', 'rye'],
  dairy: DAIRY_TERMS,
  nut: ['almond', 'walnut', 'cashew', 'peanut', 'pecan', 'hazelnut', 'pistachio', 'nut'],
  egg: ['egg'],
  soy: ['soy', 'tofu', 'tempeh', 'edamame'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'mussels', 'clam', 'oyster', 'scallop'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'sardine', 'halibut', 'trout'],
  sesame: ['sesame', 'tahini'],
};

const DESSERT_OR_DRINK_KEYWORDS = [
  'cocktail',
  'martini',
  'margarita',
  'spritz',
  'wine',
  'whisky',
  'bourbon',
  'vodka',
  'tequila',
  'beer',
  'cake',
  'cookie',
  'cupcake',
  'brownie',
  'fudge',
  'candy',
  'granita',
  'sorbet',
  'ice cream',
  'gelato',
  'popsicle',
  'pie',
  'tart',
  'shortcake',
  'mousse',
  'pudding',
  'donut',
  'doughnut',
  'trifle',
  'dessert',
];

const SNACK_KEYWORDS = ['snack', 'bar', 'energy bites', 'trail mix', 'dip', 'hummus', 'smoothie', 'shake', 'yogurt'];
const BREAKFAST_KEYWORDS = [
  'breakfast',
  'porridge',
  'oat',
  'muesli',
  'granola',
  'pancake',
  'omelet',
  'omelette',
  'frittata',
  'toast',
  'egg',
  'chia',
  'smoothie bowl',
];
const LUNCH_KEYWORDS = ['lunch', 'salad', 'sandwich', 'wrap', 'bowl', 'soup', 'quesadilla', 'roll', 'slaw'];

function canonicalSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stripTrailingNumericSuffix(slug) {
  return slug.replace(/-\d{5,}$/g, '');
}

function containsAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseListField(rawValue) {
  const source = String(rawValue || '').trim();
  if (!source) return [];

  const singleQuoteMatches = [...source.matchAll(/'((?:\\'|[^'])*)'/g)].map((match) =>
    match[1].replace(/\\'/g, "'").trim()
  );
  if (singleQuoteMatches.length > 0) {
    return singleQuoteMatches.filter(Boolean);
  }

  const doubleQuoteMatches = [...source.matchAll(/"((?:\\"|[^"])*)"/g)].map((match) =>
    match[1].replace(/\\"/g, '"').trim()
  );
  if (doubleQuoteMatches.length > 0) {
    return doubleQuoteMatches.filter(Boolean);
  }

  return source
    .split(/[\n;|]/g)
    .map((entry) => entry.replace(/^\[|\]$/g, '').trim())
    .filter(Boolean);
}

function splitInstructions(raw) {
  return String(raw || '')
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferMealType(title) {
  const normalized = title.toLowerCase();
  if (containsAny(normalized, BREAKFAST_KEYWORDS)) return 'breakfast';
  if (containsAny(normalized, SNACK_KEYWORDS)) return 'snack';
  if (containsAny(normalized, LUNCH_KEYWORDS)) return 'lunch';
  return 'dinner';
}

function inferIngredientCategory(name) {
  const normalized = name.toLowerCase();
  if (containsAny(normalized, PRODUCE_TERMS)) return 'produce';
  if (containsAny(normalized, PROTEIN_TERMS)) return 'protein';
  if (containsAny(normalized, ['rice', 'pasta', 'bread', 'flour', 'oat', 'quinoa', 'couscous'])) return 'grains';
  if (containsAny(normalized, DAIRY_TERMS)) return 'dairy';
  if (containsAny(normalized, ['salt', 'pepper', 'spice', 'paprika', 'oregano', 'thyme', 'cumin', 'chili'])) return 'spices';
  return 'pantry';
}

function parseIngredient(rawIngredient) {
  const compact = String(rawIngredient || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return {
      name: '',
    };
  }

  const quantityMatch = compact.match(
    /^([0-9]+(?:[./][0-9]+)?(?:\s*[0-9]+\/[0-9]+)?|[¼½¾⅓⅔⅛⅜⅝⅞]+)?\s*([a-zA-Z]+\.?)?\s*(.*)$/
  );
  if (!quantityMatch) {
    return {
      name: compact,
      category: inferIngredientCategory(compact),
    };
  }

  const quantity = quantityMatch[1]?.trim() || undefined;
  const unit = quantityMatch[2]?.trim() || undefined;
  const name = quantityMatch[3]?.trim() || compact;

  return {
    name,
    quantity,
    unit,
    category: inferIngredientCategory(name),
  };
}

function estimateMacros({ mealType, searchableText, dietaryTags }) {
  const baseCaloriesByType = {
    breakfast: 380,
    lunch: 500,
    dinner: 560,
    snack: 220,
  };
  const baseProteinByType = {
    breakfast: 20,
    lunch: 30,
    dinner: 34,
    snack: 10,
  };

  let calories = baseCaloriesByType[mealType];
  let protein = baseProteinByType[mealType];

  if (containsAny(searchableText, ['salad', 'broth', 'soup', 'grilled'])) {
    calories -= 60;
  }
  if (containsAny(searchableText, ['fried', 'cheese', 'creamy', 'butter', 'pasta', 'risotto'])) {
    calories += 90;
  }
  if (dietaryTags.includes('high-protein')) {
    calories += 70;
    protein += 12;
  }
  if (dietaryTags.includes('vegetarian')) {
    protein -= 3;
  }
  if (dietaryTags.includes('vegan')) {
    protein -= 2;
  }

  calories = Math.max(140, Math.round(calories));
  protein = Math.max(6, Math.round(protein));
  const carbs = Math.max(10, Math.round((calories * 0.42) / 4));
  const fat = Math.max(4, Math.round((calories - protein * 4 - carbs * 4) / 9));

  return { calories, protein, carbs, fat };
}

function detectAllergens(searchableText) {
  const allergens = [];
  for (const [label, terms] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (containsAny(searchableText, terms)) {
      allergens.push(label);
    }
  }
  return allergens;
}

function detectDietaryTags(searchableText) {
  const tags = [];
  const hasMeat = containsAny(searchableText, MEAT_TERMS);
  const hasDairy = containsAny(searchableText, DAIRY_TERMS);
  const hasEgg = searchableText.includes('egg');
  const hasHoney = searchableText.includes('honey');
  const hasHighCarb = containsAny(searchableText, HIGH_CARB_TERMS);
  const hasProtein = containsAny(searchableText, PROTEIN_TERMS);

  if (!hasMeat) tags.push('vegetarian');
  if (!hasMeat && !hasDairy && !hasEgg && !hasHoney) tags.push('vegan');
  if (!hasHighCarb) tags.push('low-carb');
  if (hasProtein) tags.push('high-protein');
  if (!containsAny(searchableText, ['wheat', 'barley', 'rye', 'bread', 'flour', 'pasta'])) {
    tags.push('gluten-free');
  }
  if (!hasDairy) tags.push('dairy-free');

  return [...new Set(tags)];
}

function estimateCostLabel(ingredientCount) {
  if (ingredientCount <= 7) return 'low cost';
  if (ingredientCount <= 13) return 'balanced';
  return 'premium';
}

function estimatePrepTime(title, instructionCount) {
  const explicit = title.match(/(\d+)\s*-\s*minute|(\d+)\s*minute|(\d+)\s*min/i);
  if (explicit) {
    const matchedValue = explicit.slice(1).find(Boolean);
    if (matchedValue) return Math.max(5, Number.parseInt(matchedValue, 10));
  }
  return Math.min(65, 14 + instructionCount * 4);
}

function buildImageMap(fileNames) {
  const map = new Map();
  const sorted = [...fileNames].sort((a, b) => a.localeCompare(b));
  for (const fileName of sorted) {
    const base = canonicalSlug(fileName);
    if (!map.has(base)) {
      map.set(base, fileName);
    }
    const stripped = stripTrailingNumericSuffix(base);
    if (!map.has(stripped)) {
      map.set(stripped, fileName);
    }
  }
  return map;
}

function pickImagePath({ title, imageName }, imageMap) {
  const titleSlug = canonicalSlug(title);
  const titleBase = stripTrailingNumericSuffix(titleSlug);
  const imageSlug = canonicalSlug(imageName);
  const imageBase = stripTrailingNumericSuffix(imageSlug);
  const candidates = [imageSlug, imageBase, titleSlug, titleBase].filter(Boolean);

  for (const candidate of candidates) {
    const found = imageMap.get(candidate);
    if (found) {
      return `/Food%20Images/Food%20Images/${encodeURIComponent(found)}`;
    }
  }

  return FALLBACK_IMAGE_URL;
}

function isWeightLossFriendlyCandidate(searchableText) {
  if (containsAny(searchableText, DESSERT_OR_DRINK_KEYWORDS)) return false;
  if (containsAny(searchableText, ['frosting', 'buttercream', 'liqueur', 'syrup'])) return false;
  return true;
}

function scoreRecipe(recipe) {
  let score = 0;
  const searchableText = recipe.title.toLowerCase();

  if (recipe.dietaryTags.includes('high-protein')) score += 8;
  if (recipe.dietaryTags.includes('low-carb')) score += 4;
  if (recipe.prepTimeMinutes <= 25) score += 3;
  if (recipe.calories && recipe.calories <= 620) score += 2;
  if (containsAny(searchableText, ['salad', 'bowl', 'grilled', 'roasted', 'stir-fry', 'soup'])) score += 3;
  if (containsAny(searchableText, ['fried', 'creamy', 'cheesy', 'bacon'])) score -= 3;
  if (recipe.ingredients.length < 4) score -= 2;

  return score;
}

function selectBalancedRecipeSet(recipes) {
  const grouped = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const recipe of recipes) {
    grouped[recipe.mealType].push(recipe);
  }

  const selected = [];
  for (const mealType of Object.keys(grouped)) {
    const ranked = grouped[mealType]
      .map((recipe) => ({ recipe, score: scoreRecipe(recipe) }))
      .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
      .slice(0, MAX_RECIPES_BY_MEAL_TYPE[mealType])
      .map((entry) => entry.recipe);

    selected.push(...ranked);
  }

  return selected.sort((a, b) => a.title.localeCompare(b.title));
}

function normalizeRecipeRow(row, headers, imageMap, rowNumber) {
  const title = String(row[headers.Title] || '').trim();
  if (!title) return null;

  const imageName = String(row[headers.Image_Name] || '').trim();
  const ingredientSource = parseListField(row[headers.Ingredients]);
  const cleanedIngredientSource = parseListField(row[headers.Cleaned_Ingredients]);
  const rawIngredients = cleanedIngredientSource.length > 0 ? cleanedIngredientSource : ingredientSource;
  const ingredients = rawIngredients.map(parseIngredient).filter((entry) => entry.name);
  const instructions = splitInstructions(row[headers.Instructions]);

  const searchableText = `${title} ${ingredientSource.join(' ')} ${cleanedIngredientSource.join(' ')}`.toLowerCase();
  if (!isWeightLossFriendlyCandidate(searchableText)) return null;

  const mealType = inferMealType(title);
  const dietaryTags = detectDietaryTags(searchableText);
  const allergens = detectAllergens(searchableText);
  const macros = estimateMacros({ mealType, searchableText, dietaryTags });
  const prepTimeMinutes = estimatePrepTime(title, instructions.length);

  const idBase = canonicalSlug(title) || `recipe-${rowNumber}`;
  const id = `${idBase}-${rowNumber}`;

  return {
    id,
    title,
    description: instructions[0] || undefined,
    imageUrl: pickImagePath({ title, imageName }, imageMap),
    ingredients,
    instructions,
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    mealType,
    dietaryTags,
    allergens,
    prepTimeMinutes,
    estimatedCost: estimateCostLabel(ingredients.length),
    source: {
      rowNumber,
      imageName,
    },
  };
}

async function main() {
  const [csvText, imageFileNames] = await Promise.all([
    fs.readFile(CSV_PATH, 'utf8'),
    fs.readdir(IMAGE_DIR),
  ]);

  const imageMap = buildImageMap(imageFileNames.filter((name) => /\.(png|jpe?g|webp|gif)$/i.test(name)));
  const rows = parseCsv(csvText);
  const headerRow = rows[0] || [];

  const headers = {
    Title: headerRow.indexOf('Title'),
    Ingredients: headerRow.indexOf('Ingredients'),
    Instructions: headerRow.indexOf('Instructions'),
    Image_Name: headerRow.indexOf('Image_Name'),
    Cleaned_Ingredients: headerRow.indexOf('Cleaned_Ingredients'),
  };

  if (Object.values(headers).some((index) => index < 0)) {
    throw new Error('CSV headers changed. Expected Title, Ingredients, Instructions, Image_Name, Cleaned_Ingredients.');
  }

  const normalized = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const recipe = normalizeRecipeRow(rows[rowIndex], headers, imageMap, rowIndex);
    if (recipe) {
      normalized.push(recipe);
    }
  }

  const selectedRecipes = selectBalancedRecipeSet(normalized);
  const imageMatchedCount = selectedRecipes.filter((recipe) => recipe.imageUrl !== FALLBACK_IMAGE_URL).length;

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceCsv: path.relative(ROOT, CSV_PATH),
    recipeCount: selectedRecipes.length,
    imageMatchedCount,
    fallbackImageUrl: FALLBACK_IMAGE_URL,
    recipes: selectedRecipes,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload), 'utf8');

  const byMealType = selectedRecipes.reduce(
    (acc, recipe) => {
      acc[recipe.mealType] += 1;
      return acc;
    },
    { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  );

  console.log(`Generated ${selectedRecipes.length} normalized Weight Loss Reset recipes.`);
  console.log(`Meal type split: ${JSON.stringify(byMealType)}`);
  console.log(`Image matches: ${imageMatchedCount}/${selectedRecipes.length}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

