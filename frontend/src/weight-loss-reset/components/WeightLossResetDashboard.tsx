import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Dumbbell,
  Leaf,
  LoaderCircle,
  MessageCircle,
  MilkOff,
  RefreshCcw,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Sprout,
  UserRound,
  Weight,
  WheatOff,
  type LucideIcon,
} from 'lucide-react';
import {
  getHealthFocusDisplayLabel,
  WEIGHT_LOSS_RESET_PRICE_COPY,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import { buildGroceryListFromMealPlan, calculateGoalProgress, getCurrentWeight, getSwapCandidates } from '../mealPlanning';
import type { DietitianMessage, MealPlan, MealType, OnboardingAnswers, Recipe, WeightLogEntry } from '../types';

type DashboardTab = 'overview' | 'meal-plan' | 'grocery' | 'progress' | 'messages';
type PrimaryMealType = 'breakfast' | 'lunch' | 'dinner';
const PRIMARY_MEAL_TYPE_ORDER: PrimaryMealType[] = ['breakfast', 'lunch', 'dinner'];

function resolveCoreMealTypesFromAnswers(answers: OnboardingAnswers): PrimaryMealType[] {
  const fromSelection = Array.isArray(answers?.selectedMealTypes)
    ? [...new Set(
        answers.selectedMealTypes
          .map((entry) => String(entry || '').trim().toLowerCase())
          .filter((entry): entry is PrimaryMealType => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner')
      )]
    : [];
  if (fromSelection.length >= 2) {
    return PRIMARY_MEAL_TYPE_ORDER.filter((entry) => fromSelection.includes(entry));
  }
  return Number(answers.mealsPerDay || 3) <= 2 ? ['lunch', 'dinner'] : [...PRIMARY_MEAL_TYPE_ORDER];
}

function readSourceTime(recipe: Recipe, key: 'prepTime' | 'cookTime') {
  const raw = recipe.source?.[key];
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value === '-' || value.toLowerCase() === 'n/a') return '';
  return value;
}

function parseSourceMinutes(raw: string) {
  const text = String(raw || '').toLowerCase();
  if (!text) return undefined;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*min/);
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  let minutes = 0;
  if (hourMatch) minutes += Math.round(Number(hourMatch[1]) * 60);
  if (minuteMatch) minutes += Math.round(Number(minuteMatch[1]));
  if (!hourMatch && !minuteMatch && numberMatch) minutes += Math.round(Number(numberMatch[1]));
  return minutes > 0 ? minutes : undefined;
}

function parseNumberFromUnknown(value: unknown) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const text = String(value || '').trim();
  if (!text) return undefined;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveRecipeCalories(recipe: Recipe) {
  const direct = parseNumberFromUnknown(recipe?.calories);
  if (direct) return Math.round(direct);
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source as Record<string, unknown>
    : {};
  const nutritionRaw = source.nutritionRaw && typeof source.nutritionRaw === 'object' && !Array.isArray(source.nutritionRaw)
    ? source.nutritionRaw as Record<string, unknown>
    : {};
  const fromRaw = parseNumberFromUnknown(nutritionRaw.calories || nutritionRaw.Energy || nutritionRaw.Engery);
  return fromRaw ? Math.round(fromRaw) : undefined;
}

function resolveRecipeProtein(recipe: Recipe) {
  const direct = parseNumberFromUnknown(recipe?.protein);
  if (direct) return Math.round(direct * 10) / 10;
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source as Record<string, unknown>
    : {};
  const nutritionRaw = source.nutritionRaw && typeof source.nutritionRaw === 'object' && !Array.isArray(source.nutritionRaw)
    ? source.nutritionRaw as Record<string, unknown>
    : {};
  const fromRaw = parseNumberFromUnknown(nutritionRaw.protein || nutritionRaw.Protein);
  return fromRaw ? Math.round(fromRaw * 10) / 10 : undefined;
}

function buildRecipeTimeMeta(recipe: Recipe) {
  const defaultPrepMinutes = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 8;
    if (mealType === 'breakfast') return 10;
    return 12;
  };
  const defaultCookMinutes = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 5;
    if (mealType === 'breakfast') return 8;
    if (mealType === 'lunch') return 12;
    return 18;
  };
  const prepFromSource = readSourceTime(recipe, 'prepTime');
  const cookFromSource = readSourceTime(recipe, 'cookTime');
  const totalFromSource = parseSourceMinutes(String(recipe.source?.totalTime || recipe.source?.total_time || '').trim());
  const totalFromRecipe = typeof recipe.totalTimeMinutes === 'number' ? recipe.totalTimeMinutes : undefined;
  const totalMinutes = totalFromRecipe || totalFromSource;
  let prepMinutes = typeof recipe.prepTimeMinutes === 'number' ? recipe.prepTimeMinutes : parseSourceMinutes(prepFromSource);
  let cookMinutes = typeof recipe.cookTimeMinutes === 'number' ? recipe.cookTimeMinutes : parseSourceMinutes(cookFromSource);
  if (!prepMinutes && totalMinutes && cookMinutes && totalMinutes >= cookMinutes) {
    prepMinutes = Math.max(1, totalMinutes - cookMinutes);
  }
  if (!cookMinutes && totalMinutes) {
    cookMinutes = prepMinutes && totalMinutes >= prepMinutes ? Math.max(1, totalMinutes - prepMinutes) : totalMinutes;
  }
  if (!prepMinutes) prepMinutes = defaultPrepMinutes();
  if (!cookMinutes) cookMinutes = defaultCookMinutes();
  const prepLabel = Number.isFinite(prepMinutes) && prepMinutes && prepMinutes > 0 ? `${prepMinutes} min prep` : 'Prep time n/a';
  const cookLabel = Number.isFinite(cookMinutes) && cookMinutes && cookMinutes > 0 ? `${cookMinutes} min cook` : 'Cook time n/a';
  return `${prepLabel} • ${cookLabel}`;
}

type RecipeBadge = {
  key: string;
  shortLabel: string;
  fullLabel: string;
  icon: LucideIcon;
};

type PersonalizedSummary = {
  title: string;
  intro: string;
  detail: string;
  highlights: string[];
  qualityChecks: Array<{ label: string; value: string }>;
};

function normalizeToken(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function extractRecipeBadges(recipe: Recipe): RecipeBadge[] {
  const tags = new Set((recipe.dietaryTags || []).map((tag) => normalizeToken(tag)));
  const descriptor = `${recipe.title} ${recipe.description || ''} ${(recipe.dietaryTags || []).join(' ')}`.toLowerCase();
  const protein = Number(resolveRecipeProtein(recipe) || 0);

  const badges: RecipeBadge[] = [];
  const addBadge = (badge: RecipeBadge) => {
    if (badges.some((existing) => existing.key === badge.key)) return;
    badges.push(badge);
  };

  if (
    tags.has('high-protein') ||
    tags.has('high-protien') ||
    /\bhigh[-\s]?protein\b/i.test(descriptor) ||
    protein >= 25
  ) {
    addBadge({ key: 'high-protein', shortLabel: 'HP', fullLabel: 'High protein', icon: Dumbbell });
  }

  if (tags.has('gluten-free') || tags.has('gf') || /\bgluten[-\s]?free\b/i.test(descriptor)) {
    addBadge({ key: 'gluten-free', shortLabel: 'GF', fullLabel: 'Gluten free', icon: WheatOff });
  }

  if (tags.has('vegan') || /\bvegan\b/i.test(descriptor)) {
    addBadge({ key: 'vegan', shortLabel: 'VG', fullLabel: 'Vegan', icon: Sprout });
  } else if (tags.has('vegetarian') || /\bvegetarian\b/i.test(descriptor)) {
    addBadge({ key: 'vegetarian', shortLabel: 'V', fullLabel: 'Vegetarian', icon: Leaf });
  }

  if (tags.has('dairy-free') || tags.has('lactose-free') || /\b(dairy|lactose)[-\s]?free\b/i.test(descriptor)) {
    addBadge({ key: 'dairy-free', shortLabel: 'DF', fullLabel: 'Dairy free', icon: MilkOff });
  }

  return badges.slice(0, 4);
}

function extractQualityChecks(notes: string[]) {
  const text = notes.join(' ');
  const patterns = [
    { label: 'Servings', regex: /servings?\s*(\d+)%/i },
    { label: 'Quantities', regex: /quantities?\s*(\d+)%/i },
    { label: 'Detailed steps', regex: /detailed steps?\s*(\d+)%/i },
    { label: 'Ingredient reuse', regex: /ingredient reuse\s*(\d+)%/i },
  ];

  return patterns
    .map((entry) => {
      const match = text.match(entry.regex);
      if (!match) return null;
      return { label: entry.label, value: `${match[1]}%` };
    })
    .filter((entry): entry is { label: string; value: string } => Boolean(entry));
}

function buildPersonalizedSummary({
  answers,
  displayFirstName,
  notes,
}: {
  answers: OnboardingAnswers;
  displayFirstName?: string;
  notes: string[];
}): PersonalizedSummary {
  const firstName = displayFirstName || answers.firstName || 'there';
  const cleanedDietary = (answers.dietaryRequirements || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item && item !== 'no specific requirements');
  const dietaryLabel = cleanedDietary.length ? toDisplayList(cleanedDietary.slice(0, 3)) : 'your core nutrition preferences';
  const cuisines = (answers.preferredCuisines || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const cuisineLabel = cuisines.length ? toDisplayList(cuisines.slice(0, 3)) : 'your preferred flavour profile';
  const supportAreas = (answers.supportAreas || []).map((item) => String(item || '').trim()).filter(Boolean);
  const supportLabel = supportAreas.length ? toDisplayList(supportAreas.slice(0, 3)) : 'weekly accountability and routine';
  const prepDay = answers.prepDay || 'Sunday';
  const qualityChecks = extractQualityChecks(notes);

  const highlights = [
    `${answers.preferredMealStyle || 'balanced'} meal style`,
    `Prep day set to ${prepDay}`,
    `Focus: ${getHealthFocusDisplayLabel(answers.primaryHealthFocus)}`,
  ];
  if (supportAreas.length > 0) highlights.push(`Support priorities: ${supportLabel}`);

  return {
    title: `${firstName}, your week is crafted around ${answers.mainGoal || 'your goals'}.`,
    intro: `We prioritised ${dietaryLabel} meals with ${cuisineLabel} influences so every day feels aligned to you.`,
    detail: `Your plan is built to reduce decision fatigue, keep grocery overlap practical, and support ${supportLabel}.`,
    highlights,
    qualityChecks,
  };
}

function RecipeBadgePills({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const badges = extractRecipeBadges(recipe);
  if (badges.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
      {badges.map((badge) => {
        const Icon = badge.icon;
        return (
          <span
            key={`${recipe.id}-${badge.key}`}
            title={badge.fullLabel}
            className={`inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#f1f8ff] ${
              compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
            } font-semibold text-[#1f7be6]`}
          >
            <Icon size={compact ? 11 : 12} />
            {badge.shortLabel}
          </span>
        );
      })}
    </div>
  );
}

function isConcreteRecipeImage(url: string) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^data:image\/(?:webp|png|jpe?g|gif|avif);base64,/i.test(value)) return true;
  if (value.includes('/api/patient/meal-plan/recipe-image')) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.pathname === '/api/patient/meal-plan/recipe-image') return true;
    if (/\.(?:webp|png|jpe?g|gif|avif)$/i.test(parsed.pathname.toLowerCase())) return true;
    const format = String(parsed.searchParams.get('fm') || parsed.searchParams.get('format') || '').trim().toLowerCase();
    if (format && /^(?:webp|png|jpe?g|gif|avif)$/.test(format)) return true;
  } catch {
    return false;
  }
  return /(?:^|[?&])(fm|format)=(?:webp|png|jpe?g|gif|avif)(?:&|$)/i.test(value);
}

function resolveRecipeImageUrl(recipe: Recipe) {
  const candidate = String(recipe?.imageUrl || '').trim();
  if (isConcreteRecipeImage(candidate)) return candidate;
  const sourceCandidate = String(recipe?.source?.image_url || recipe?.source?.imageUrl || '').trim();
  if (isConcreteRecipeImage(sourceCandidate)) return sourceCandidate;
  return '';
}

function formatMinutesLabel(totalMinutes: number) {
  const value = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (!value) return 'n/a';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function readRecipeServes(recipe: Recipe) {
  const fallbackByMealType = () => {
    const mealType = String(recipe.mealType || '').toLowerCase();
    if (mealType === 'snack') return 4;
    if (mealType === 'breakfast') return 2;
    if (mealType === 'lunch' || mealType === 'dinner') return 3;
    return undefined;
  };
  const direct = Number(recipe.serves || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct * 10) / 10;
  const fromSource = String(recipe.source?.serves || recipe.source?.servings || '').trim().toLowerCase();
  const values = [...fromSource.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return fallbackByMealType();
  if (values.length === 1) return Math.round(values[0] * 10) / 10;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const parsed = Math.round(average * 10) / 10;
  if (parsed > 0) return parsed;
  return fallbackByMealType();
}

function buildServesExplanation(recipe: Recipe) {
  const serves = readRecipeServes(recipe);
  if (!serves) return 'Serving size was not provided in the source recipe.';
  const sourceServes = String(recipe.source?.serves || '').trim();
  if (sourceServes) {
    return `Serves ${serves}. Source reference: "${sourceServes}".`;
  }
  return `Serves ${serves}. Derived from available recipe metadata.`;
}

function MealCard({
  recipe,
  onViewDetails,
  onSwap,
}: {
  recipe: Recipe;
  onViewDetails: () => void;
  onSwap: () => void;
}) {
  const imageUrl = resolveRecipeImageUrl(recipe);
  const serves = readRecipeServes(recipe);
  const calories = resolveRecipeCalories(recipe);
  const protein = resolveRecipeProtein(recipe);
  return (
    <article className="overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white">
      <div className="relative">
        {imageUrl ? (
          <img src={imageUrl} alt={recipe.title} className="h-40 w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-40 w-full bg-[#e2e8f0]" />
        )}
        <div className="absolute left-2 top-2">
          <RecipeBadgePills recipe={recipe} compact />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div>
          <h4 className="line-clamp-2 text-sm font-semibold text-[#020617]">{recipe.title}</h4>
          <p className="mt-1 text-xs text-[#475569]">
            {calories || '—'} cal • {protein || '—'}g protein • {buildRecipeTimeMeta(recipe)}
          </p>
          {serves ? <p className="mt-1 text-[11px] text-[#475569]">Serves {serves}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[#cbd5e1] bg-white text-xs font-semibold text-[#334155]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#2e8cff] text-xs font-semibold text-white hover:bg-[#1f7be6]"
          >
            Swap meal
          </button>
        </div>
      </div>
    </article>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/55 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-[760px] overflow-auto rounded-2xl border border-[#cbd5e1] bg-white p-5 shadow-[0_30px_55px_-36px_rgba(15,23,42,0.6)]">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#cbd5e1] px-3 py-1 text-xs font-semibold text-[#475569]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 py-2 text-sm font-semibold transition ${
        active ? 'border-[#2e8cff] text-[#2e8cff]' : 'border-transparent text-[#475569] hover:text-[#020617]'
      }`}
    >
      {label}
    </button>
  );
}

function toDisplayList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildGenerationMessages(answers: OnboardingAnswers) {
  const normalizedDietary = (answers.dietaryRequirements || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item && item !== 'no specific requirements')
    .slice(0, 3);
  const dietaryLabel =
    normalizedDietary.length > 0 ? toDisplayList(normalizedDietary) : 'your general eating preferences';

  const allergyTerms = [
    ...answers.allergyChips,
    ...String(answers.allergiesText || '')
      .split(/[,\n;]/g)
      .map((item) => item.trim())
      .filter(Boolean),
  ].slice(0, 4);
  const allergyLabel = allergyTerms.length > 0 ? toDisplayList(allergyTerms) : 'no listed allergy triggers';
  const preferredCuisines = (answers.preferredCuisines || []).map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4);
  const cuisineLabel = preferredCuisines.length > 0 ? toDisplayList(preferredCuisines) : 'all cuisine styles';
  const favoriteFoods = (answers.favoriteFoods || []).map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 4);
  const favoriteFoodsLabel = favoriteFoods.length > 0 ? toDisplayList(favoriteFoods) : 'your usual favourite ingredients';

  const coreMealTypes = resolveCoreMealTypesFromAnswers(answers);
  const coreMealTypeLabel = toDisplayList(coreMealTypes);
  return [
    `Reading your intake preferences and priorities: ${dietaryLabel}.`,
    `Filtering every meal candidate for ${allergyLabel}.`,
    `Running dietitian quality checks for portions, macros, and practical steps.`,
    `Prioritising ${cuisineLabel} meals and ${favoriteFoodsLabel}.`,
    `Matching ${answers.preferredMealStyle} meals across ${coreMealTypeLabel}.`,
    `Balancing calories and protein for your ${answers.primaryHealthFocus || 'weight loss'} focus.`,
    'Finalising your weekly plan, swap options, and grocery list sync.',
  ];
}

export default function WeightLossResetDashboard({
  answers,
  displayFirstName,
  mealPlan,
  recipes,
  weightLogs,
  messages,
  groceryCheckedItems,
  onRegeneratePlan,
  onUpdatePreferences,
  onSwapMeal,
  onAddWeightLog,
  onAddMessage,
  onToggleGroceryItem,
  isGeneratingPlan = false,
}: {
  answers: OnboardingAnswers;
  displayFirstName?: string;
  mealPlan: MealPlan | null;
  recipes: Recipe[];
  weightLogs: WeightLogEntry[];
  messages: DietitianMessage[];
  groceryCheckedItems: string[];
  onRegeneratePlan: () => void;
  onUpdatePreferences: () => void;
  onSwapMeal: (dayIndex: number, mealType: MealType, recipeId: string) => void;
  onAddWeightLog: (payload: { date: string; weight: number; note?: string }) => void;
  onAddMessage: (payload: { role: 'user' | 'system'; text: string }) => void;
  onToggleGroceryItem: (itemKey: string) => void;
  isGeneratingPlan?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; mealType: MealType; current: Recipe | undefined } | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [weightValue, setWeightValue] = useState('');
  const [weightNote, setWeightNote] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMessageIndex, setGenerationMessageIndex] = useState(0);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const groceryGroups = useMemo(() => buildGroceryListFromMealPlan(mealPlan, recipeMap), [mealPlan, recipeMap]);
  const groceryRecipeSummaries = useMemo(() => {
    if (!mealPlan) return [] as Array<{ key: string; title: string; imageUrl: string; count: number }>;
    const byKey = new Map<string, { key: string; title: string; imageUrl: string; count: number }>();

    for (const day of mealPlan.days) {
      for (const recipeId of [day.meals.breakfast, day.meals.lunch, day.meals.dinner, ...(day.meals.snacks || [])]) {
        if (!recipeId) continue;
        const recipe = recipeMap.get(recipeId);
        if (!recipe) continue;
        const dedupeKey = String(recipe.source?.url || recipe.title || recipe.id).trim().toLowerCase();
        if (!dedupeKey) continue;
        const existing = byKey.get(dedupeKey);
        if (existing) {
          existing.count += 1;
          continue;
        }
        byKey.set(dedupeKey, {
          key: dedupeKey,
          title: recipe.title,
          imageUrl: resolveRecipeImageUrl(recipe),
          count: 1,
        });
      }
    }

    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [mealPlan, recipeMap]);
  const generationMessages = useMemo(() => buildGenerationMessages(answers), [answers]);
  const focusLabel = useMemo(() => getHealthFocusDisplayLabel(answers.primaryHealthFocus), [answers.primaryHealthFocus]);
  const visibleCoreMealTypes = useMemo<PrimaryMealType[]>(
    () => resolveCoreMealTypesFromAnswers(answers),
    [answers]
  );
  const showSnackMeals = false;
  const visiblePlanNotes = useMemo(
    () =>
      (mealPlan?.notes || []).filter((note) => {
        const normalized = String(note || '').toLowerCase();
        return !(
          normalized.includes('fallback') ||
          normalized.includes('deterministic') ||
          normalized.includes('quality warning')
        );
      }),
    [mealPlan?.notes]
  );
  const personalizedSummary = useMemo(
    () =>
      buildPersonalizedSummary({
        answers,
        displayFirstName,
        notes: visiblePlanNotes,
      }),
    [answers, displayFirstName, visiblePlanNotes]
  );
  const generationPercent = Math.round(Math.max(6, Math.min(100, generationProgress)));
  const generationStages = [
    { label: 'Preference alignment', threshold: 14 },
    { label: 'Dietitian quality checks', threshold: 40 },
    { label: 'Meal and image matching', threshold: 68 },
    { label: 'Final sync to your account', threshold: 94 },
  ];

  const currentWeight = getCurrentWeight(weightLogs, answers.currentWeightKg);
  const progressPercent = calculateGoalProgress({
    startingWeight: answers.currentWeightKg,
    goalWeight: answers.goalWeightKg,
    currentWeight,
  });

  const weekNumber = (() => {
    if (!mealPlan?.generatedAt) return 1;
    const generatedAtMs = new Date(mealPlan.generatedAt).getTime();
    if (!Number.isFinite(generatedAtMs)) return 1;
    const referenceMs = weightLogs.length > 0 ? new Date(weightLogs[0].date).getTime() : generatedAtMs;
    if (!Number.isFinite(referenceMs)) return 1;
    return Math.max(1, Math.floor((referenceMs - generatedAtMs) / (7 * 24 * 60 * 60 * 1000)) + 1);
  })();

  const swapCandidates = swapTarget
    ? getSwapCandidates({
        recipes,
        answers,
        mealType: swapTarget.mealType,
        currentRecipe: swapTarget.current,
        limit: 32,
      })
    : [];

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );
  const selectedRecipeServes = selectedRecipe ? readRecipeServes(selectedRecipe) : undefined;

  useEffect(() => {
    let disposed = false;
    const TARGET_DURATION_MS = 120_000;
    const MIN_PROGRESS = 8;
    const MAX_IN_PROGRESS = 98;

    if (!isGeneratingPlan) {
      const shouldDelayReset = generationProgress > 0;
      let resetTimer: number | null = null;
      const completionTimer = window.setTimeout(() => {
        if (disposed) return;
        if (shouldDelayReset) {
          setGenerationProgress(100);
        }
        resetTimer = window.setTimeout(() => {
          if (disposed) return;
          setGenerationProgress(0);
          setGenerationMessageIndex(0);
        }, shouldDelayReset ? 900 : 0);
      }, 0);
      return () => {
        disposed = true;
        window.clearTimeout(completionTimer);
        if (resetTimer) window.clearTimeout(resetTimer);
      };
    }

    const startedAt = Date.now();
    const initialTimer = window.setTimeout(() => {
      if (disposed) return;
      setGenerationProgress(MIN_PROGRESS);
      setGenerationMessageIndex(0);
    }, 0);

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const completion = Math.max(0, Math.min(1, elapsed / TARGET_DURATION_MS));
      const eased = 1 - (1 - completion) * (1 - completion);
      const next = MIN_PROGRESS + eased * (MAX_IN_PROGRESS - MIN_PROGRESS);
      setGenerationProgress((current) => Math.max(current, next));
    }, 500);

    const messageTimer = window.setInterval(() => {
      setGenerationMessageIndex((current) => (current + 1) % generationMessages.length);
    }, 2200);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(progressTimer);
      window.clearInterval(messageTimer);
    };
  }, [generationMessages.length, isGeneratingPlan]);

  const submitWeight = (event: FormEvent) => {
    event.preventDefault();
    const numericWeight = Number(weightValue);
    if (!Number.isFinite(numericWeight) || numericWeight < 30) return;
    onAddWeightLog({
      date: new Date(weightDate).toISOString(),
      weight: numericWeight,
      note: weightNote,
    });
    setWeightValue('');
    setWeightNote('');
    setActiveTab('progress');
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = messageInput.trim();
    if (!text) return;
    onAddMessage({ role: 'user', text });
    onAddMessage({
      role: 'system',
      text: 'Saved locally for demo mode. Live dietitian messaging can be connected later without losing your notes.',
    });
    setMessageInput('');
  };

  return (
    <section className="space-y-5">
      <header className="rounded-3xl border border-[#cbd5e1] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm font-medium text-[#475569]">
              {WEIGHT_LOSS_RESET_PROGRAM_NAME} • Week {weekNumber} • Focus: {focusLabel}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#020617]">Welcome back, {displayFirstName || answers.firstName || 'there'}</h1>
            <p className="mt-2 text-sm text-[#475569]">
              Small changes, consistent support. No perfect days required. Felicity can adjust your plan any time.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-[520px]">
              <button
                type="button"
                onClick={() => setActiveTab('progress')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white hover:bg-[#1f7be6]"
              >
                <Weight size={16} />
                Log weight
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <MessageCircle size={16} />
                Message Felicity
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('meal-plan')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <Shuffle size={16} />
                Swap a meal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('grocery')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <ShoppingCart size={16} />
                View grocery list
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#020617]">
                <UserRound size={15} className="text-[#2e8cff]" />
                Felicity
              </p>
              <p className="mt-1 text-sm text-[#475569]">Accredited Dietitian • practical, kind, realistic support.</p>
            </article>

            <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
              <p className="text-sm font-semibold text-[#020617]">{WEIGHT_LOSS_RESET_PRICE_COPY}</p>
              <p className="mt-1 text-xs text-[#475569]">
                Preference-led weekly planning with practical prep guidance. General nutrition support, not medical advice.
              </p>
            </article>

            <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
              <div className="flex items-center justify-between text-sm text-[#334155]">
                <span>Current {currentWeight || '—'} kg</span>
                <span>Goal {answers.goalWeightKg || '—'} kg</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
                <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold text-[#2e8cff]">{progressPercent}% toward your goal</p>
            </article>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-4 border-b border-[#cbd5e1]">
        <TabButton active={activeTab === 'overview'} label="Overview" onClick={() => setActiveTab('overview')} />
        <TabButton active={activeTab === 'meal-plan'} label="Meal plan" onClick={() => setActiveTab('meal-plan')} />
        <TabButton active={activeTab === 'grocery'} label="Grocery list" onClick={() => setActiveTab('grocery')} />
        <TabButton active={activeTab === 'progress'} label="Progress" onClick={() => setActiveTab('progress')} />
        <TabButton active={activeTab === 'messages'} label="Message Felicity" onClick={() => setActiveTab('messages')} />
      </nav>

      {(activeTab === 'overview' || activeTab === 'meal-plan') && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-[#020617]">Weekly meal plan</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUpdatePreferences}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#334155]"
              >
                Update intake preferences
              </button>
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCcw size={14} />
                {isGeneratingPlan ? 'Refreshing plan...' : 'Refresh weekly plan'}
              </button>
            </div>
          </div>

          {!mealPlan && (
            <article className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] p-5 text-sm text-[#475569]">
              Weekly meals are not generated yet.
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGeneratingPlan ? 'Generating weekly meals...' : 'Generate weekly meals'}
                <ArrowRight size={15} />
              </button>
            </article>
          )}

          {isGeneratingPlan ? (
            <article className="rounded-3xl border border-[#b7dcff] bg-gradient-to-br from-[#f8fbff] via-[#f1f8ff] to-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#020617]">
                    <LoaderCircle size={15} className="animate-spin text-[#2e8cff]" />
                    Building your updated weekly plan
                  </p>
                  <p className="mt-1 text-sm text-[#475569]">{generationMessages[generationMessageIndex]}</p>
                </div>
                <p className="rounded-full border border-[#b7dcff] bg-white px-3 py-1 text-xs font-semibold text-[#1f7be6]">
                  {generationPercent}%
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
                <div className="h-full rounded-full bg-[#2e8cff] transition-[width] duration-300" style={{ width: `${generationPercent}%` }} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {generationStages.map((stage) => {
                  const completed = generationPercent >= stage.threshold;
                  return (
                    <p
                      key={stage.label}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
                        completed
                          ? 'border-[#b7dcff] bg-white text-[#1f7be6]'
                          : 'border-[#dbeeff] bg-[#f8fbff] text-[#64748b]'
                      }`}
                    >
                      {stage.label}
                    </p>
                  );
                })}
              </div>
            </article>
          ) : null}

          {mealPlan ? (
            <article className="overflow-hidden rounded-3xl border border-[#cbd5e1] bg-white shadow-[0_20px_42px_-34px_rgba(15,23,42,0.38)]">
              <div className="border-b border-[#dbeeff] bg-gradient-to-r from-[#f8fbff] via-[#f1f8ff] to-white px-4 py-4 sm:px-5">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em] text-[#1f7be6]">
                  <Sparkles size={14} />
                  Crafted for you
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-[#020617]">{personalizedSummary.title}</h3>
                <p className="mt-2 text-sm text-[#334155]">{personalizedSummary.intro}</p>
                <p className="mt-1 text-sm text-[#475569]">{personalizedSummary.detail}</p>
              </div>

              <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-2">
                  {personalizedSummary.highlights.map((highlight) => (
                    <p key={highlight} className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-sm text-[#334155]">
                      {highlight}
                    </p>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#475569]">Quality checks</p>
                  {personalizedSummary.qualityChecks.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {personalizedSummary.qualityChecks.map((metric) => (
                        <div key={metric.label} className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#64748b]">{metric.label}</p>
                          <p className="mt-0.5 text-base font-semibold text-[#1f7be6]">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                      Dietitian safeguards for allergies, meal balance, and prep practicality are active.
                    </p>
                  )}
                </div>
              </div>
            </article>
          ) : null}

          {mealPlan?.prepDayPlan ? (
            <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#020617]">{mealPlan.prepDayPlan.title}</h3>
                <p className="rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs font-semibold text-[#334155]">
                  {mealPlan.prepDayPlan.prepDay || answers.prepDay || 'Sunday'} • ~{formatMinutesLabel(mealPlan.prepDayPlan.totalPrepMinutes)}
                </p>
              </div>

              {mealPlan.prepDayPlan.sharedIngredients.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[#cbd5e1] bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#475569]">Shared Ingredients</p>
                  <p className="mt-1 text-sm text-[#334155]">
                    {mealPlan.prepDayPlan.sharedIngredients.slice(0, 14).join(', ')}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 rounded-xl border border-[#cbd5e1] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#475569]">Step-By-Step</p>
                <ol className="mt-2 space-y-1 text-sm text-[#334155]">
                  {mealPlan.prepDayPlan.steps.map((step, index) => (
                    <li key={`prep-step-${index}`}>
                      {index + 1}. {step}
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          ) : null}

          {mealPlan?.days.map((day) => (
            <article key={day.dayIndex} className="rounded-2xl border border-[#cbd5e1] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-[#020617]">{day.label}</h3>
                <p className="text-xs text-[#475569]">
                  {day.totals?.calories || '—'} cal • {day.totals?.protein || '—'}g protein
                </p>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {visibleCoreMealTypes.map((mealType) => {
                  const recipeId = day.meals[mealType];
                  const recipe = recipeId ? recipeMap.get(recipeId) : null;
                  if (!recipe) {
                    return (
                      <div key={mealType} className="rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] p-4 text-xs text-[#475569]">
                        {mealType}
                        <p className="mt-1">No recipe available for this slot.</p>
                      </div>
                    );
                  }

                  return (
                    <div key={mealType}>
                      <p className="mb-2 text-sm font-semibold text-[#334155]">{mealType}</p>
                      <MealCard
                        recipe={recipe}
                        onViewDetails={() => setSelectedRecipe(recipe)}
                        onSwap={() => setSwapTarget({ dayIndex: day.dayIndex, mealType, current: recipe })}
                      />
                    </div>
                  );
                })}

                {showSnackMeals && day.meals.snacks?.[0] && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#334155]">snack</p>
                    {recipeMap.get(day.meals.snacks[0]) ? (
                      <MealCard
                        recipe={recipeMap.get(day.meals.snacks[0]) as Recipe}
                        onViewDetails={() => setSelectedRecipe(recipeMap.get(day.meals.snacks?.[0] || '') || null)}
                        onSwap={() =>
                          setSwapTarget({
                            dayIndex: day.dayIndex,
                            mealType: 'snack',
                            current: recipeMap.get(day.meals.snacks?.[0] || ''),
                          })
                        }
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'grocery' && (
        <section className="space-y-4 rounded-2xl border border-[#cbd5e1] bg-white p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[#020617]">Weekly grocery list</h2>
          {groceryGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
              Grocery ingredients will appear after your weekly meal plan is generated.
            </p>
          ) : (
            <div className="space-y-4">
              <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                <h3 className="text-sm font-semibold text-[#020617]">How quantities are calculated</h3>
                <p className="mt-1 text-xs text-[#475569]">
                  Weekly quantities are estimated by recipe usage count and serving size. Example: if a recipe serves 4 and is used in 2 meals,
                  ingredients are scaled to roughly 0.5x that recipe for the week.
                </p>
              </article>

              {groceryRecipeSummaries.length > 0 && (
                <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                  <h3 className="text-sm font-semibold text-[#020617]">Meals included in this week</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {groceryRecipeSummaries.map((entry) => {
                      return (
                        <div
                          key={`grocery-recipe-${entry.key}`}
                          className="inline-flex max-w-[280px] items-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-2 py-1"
                          title={entry.title}
                        >
                          <img
                            src={entry.imageUrl}
                            alt={entry.title}
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                          <span className="truncate text-xs text-[#334155]">{entry.title}</span>
                          {entry.count > 1 ? (
                            <span className="rounded-full bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
                              x{entry.count}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              )}

              <article className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                <h3 className="text-sm font-semibold text-[#020617]">Total ingredients across all selected meals</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {groceryGroups.map((group) => (
                    <article key={`grocery-total-${group.category}`} className="rounded-xl border border-[#cbd5e1] bg-white p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#475569]">{group.category}</h4>
                      <ul className="mt-2 space-y-2">
                        {group.items.map((item) => {
                          const checked = groceryCheckedItems.includes(item.key);
                          return (
                            <li key={`grocery-total-${item.key}`} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleGroceryItem(item.key)}
                                className="mt-0.5 h-4 w-4 rounded border-[#b7dcff]"
                              />
                              <div>
                                <p className={`text-sm ${checked ? 'text-[#94a3b8] line-through' : 'text-[#334155]'}`}>{item.name}</p>
                                {item.quantities.length > 0 && (
                                  <p className="text-xs text-[#475569]">Approx total: {item.quantities.join(' · ')}</p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          )}
          <p className="text-xs text-[#475569]">If ingredient details are incomplete in the source data, items may be simplified.</p>
        </section>
      )}

      {activeTab === 'progress' && (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-2xl border border-[#cbd5e1] bg-white p-4 sm:p-5">
            <h2 className="text-xl font-semibold text-[#020617]">Log weight</h2>
            <form className="mt-4 space-y-3" onSubmit={submitWeight}>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(event) => setWeightDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#2e8cff]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Weight (kg)</span>
                <input
                  type="number"
                  value={weightValue}
                  onChange={(event) => setWeightValue(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#2e8cff]"
                  placeholder="e.g. 78.4"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Note (optional)</span>
                <textarea
                  value={weightNote}
                  onChange={(event) => setWeightNote(event.target.value)}
                  className="min-h-20 w-full rounded-xl border border-[#cbd5e1] px-3 py-2 text-sm outline-none focus:border-[#2e8cff]"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white">
                Save entry
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-[#cbd5e1] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-[#020617]">Progress to goal</h2>
                <p className="text-sm text-[#475569]">
                  Current {currentWeight || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
                </p>
              </div>
              <div className="rounded-full border border-[#cbd5e1] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#2e8cff]">{progressPercent}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
              <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {weightLogs.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                  No entries yet. Add your first weight log above.
                </li>
              ) : (
                weightLogs.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#020617]">{entry.weight} kg</span>
                      <span className="text-xs text-[#475569]">{new Date(entry.date).toLocaleDateString('en-AU')}</span>
                    </div>
                    {entry.note && <p className="mt-1 text-xs text-[#475569]">{entry.note}</p>}
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      )}

      {activeTab === 'messages' && (
        <section className="rounded-2xl border border-[#cbd5e1] bg-white p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[#020617]">Message Felicity</h2>
          <p className="mt-1 text-sm text-[#475569]">
            Send Felicity a note about what you&apos;d like adjusted. In this demo, messages are saved locally until live dietitian messaging is
            connected.
          </p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
            {sortedMessages.length === 0 ? (
              <p className="text-sm text-[#475569]">Ask for meal adjustments, motivation support, grocery planning, or progress check-ins.</p>
            ) : (
              sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user' ? 'ml-auto bg-[#2e8cff] text-white' : 'bg-white text-[#334155] border border-[#cbd5e1]'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className={`mt-1 text-[11px] ${message.role === 'user' ? 'text-sunlight-100' : 'text-[#475569]'}`}>
                    {new Date(message.createdAt).toLocaleString('en-AU')}
                  </p>
                </article>
              ))
            )}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
            <input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder="Type your note for Felicity"
              className="h-10 flex-1 rounded-xl border border-[#cbd5e1] px-3 text-sm outline-none focus:border-[#2e8cff]"
            />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white">
              Send
            </button>
          </form>
        </section>
      )}

      {selectedRecipe && (
        <ModalShell onClose={() => setSelectedRecipe(null)}>
          <article>
            {resolveRecipeImageUrl(selectedRecipe) ? (
              <img src={resolveRecipeImageUrl(selectedRecipe)} alt={selectedRecipe.title} className="h-56 w-full rounded-2xl object-cover" />
            ) : (
              <div className="h-56 w-full rounded-2xl bg-[#e2e8f0]" />
            )}
            <h3 className="mt-4 text-2xl font-semibold text-[#020617]">{selectedRecipe.title}</h3>
            <RecipeBadgePills recipe={selectedRecipe} />
            {selectedRecipe.description && <p className="mt-2 text-sm text-[#475569]">{selectedRecipe.description}</p>}
            <p className="mt-2 text-sm text-[#475569]">
              {resolveRecipeCalories(selectedRecipe) || '—'} cal • {resolveRecipeProtein(selectedRecipe) || '—'}g protein • {selectedRecipe.carbs || '—'}g carbs •{' '}
              {selectedRecipe.fat || '—'}g fat
            </p>
            <p className="mt-1 text-sm text-[#475569]">{buildRecipeTimeMeta(selectedRecipe)}</p>
            {selectedRecipeServes ? (
              <p className="mt-1 text-sm text-[#475569]">{buildServesExplanation(selectedRecipe)}</p>
            ) : null}

            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#020617]">Ingredients</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecipe(null);
                      setActiveTab('grocery');
                    }}
                    className="rounded-lg border border-[#cbd5e1] bg-white px-2 py-1 text-xs font-semibold text-[#334155]"
                  >
                    View on grocery list
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-[#334155]">
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <li key={`${selectedRecipe.id}-${ingredient.name}`}>• {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ')}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#020617]">Instructions</h4>
                <ol className="mt-2 space-y-1 text-sm text-[#334155]">
                  {(selectedRecipe.instructions || []).map((instruction, index) => (
                    <li key={`${selectedRecipe.id}-step-${index}`}>
                      {index + 1}. {instruction}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <div className="mt-3 text-xs text-[#475569]">
              {selectedRecipe.dietaryTags.length > 0 && <p>Dietary tags: {selectedRecipe.dietaryTags.join(', ')}</p>}
              {selectedRecipe.allergens.length > 0 && <p>Allergens: {selectedRecipe.allergens.join(', ')}</p>}
              {typeof selectedRecipe.source?.dietitian === 'string' && selectedRecipe.source?.dietitian ? (
                <p>Recipe courtesy of: {selectedRecipe.source.dietitian}</p>
              ) : null}
              {typeof selectedRecipe.source?.url === 'string' && selectedRecipe.source?.url ? (
                <p>
                  Source:{' '}
                  <a
                    href={selectedRecipe.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#2e8cff] underline"
                  >
                    View original recipe
                  </a>
                </p>
              ) : null}
            </div>
          </article>
        </ModalShell>
      )}

      {swapTarget && (
        <ModalShell onClose={() => setSwapTarget(null)}>
          <article>
            <h3 className="text-xl font-semibold text-[#020617]">Swap this {swapTarget.mealType}</h3>
            <p className="mt-1 text-sm text-[#475569]">
              Alternatives are matched to your dietary preferences and allergy settings where possible.
            </p>
            {swapCandidates.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                No suitable swaps were found for this meal right now.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {swapCandidates.map((recipe) => (
                  <article key={recipe.id} className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
                    <div className="flex items-start gap-3">
                      {resolveRecipeImageUrl(recipe) ? (
                        <img
                          src={resolveRecipeImageUrl(recipe)}
                          alt={recipe.title}
                          className="h-14 w-14 shrink-0 rounded-lg border border-[#cbd5e1] object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-lg border border-[#cbd5e1] bg-[#e2e8f0]" />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-[#020617]">{recipe.title}</p>
                        <RecipeBadgePills recipe={recipe} compact />
                        <p className="mt-1 text-xs text-[#475569]">
                          {resolveRecipeCalories(recipe) || '—'} cal • {resolveRecipeProtein(recipe) || '—'}g protein • {buildRecipeTimeMeta(recipe)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSwapMeal(swapTarget.dayIndex, swapTarget.mealType, recipe.id);
                        setSwapTarget(null);
                      }}
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-[#2e8cff] px-3 text-xs font-semibold text-white"
                    >
                      Use this meal
                    </button>
                  </article>
                ))}
              </div>
            )}
          </article>
        </ModalShell>
      )}

      <footer className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] px-4 py-3 text-xs text-[#475569]">
        This is general nutrition support, not medical advice. For urgent or complex conditions, seek care from an appropriate healthcare
        professional.
      </footer>
    </section>
  );
}
