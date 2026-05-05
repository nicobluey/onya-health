import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  MessageCircle,
  RefreshCcw,
  ShoppingCart,
  Shuffle,
  UserRound,
  Weight,
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

function buildRecipeTimeMeta(recipe: Recipe) {
  const prepFromSource = readSourceTime(recipe, 'prepTime');
  const cookFromSource = readSourceTime(recipe, 'cookTime');
  const prepMinutes = typeof recipe.prepTimeMinutes === 'number' ? recipe.prepTimeMinutes : parseSourceMinutes(prepFromSource);
  const cookMinutes = typeof recipe.cookTimeMinutes === 'number' ? recipe.cookTimeMinutes : parseSourceMinutes(cookFromSource);
  const prepLabel = Number.isFinite(prepMinutes) && prepMinutes && prepMinutes > 0 ? `${prepMinutes} min prep` : 'Prep time n/a';
  const cookLabel = Number.isFinite(cookMinutes) && cookMinutes && cookMinutes > 0 ? `${cookMinutes} min cook` : 'Cook time n/a';
  return `${prepLabel} • ${cookLabel}`;
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
  const direct = Number(recipe.serves || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct * 10) / 10;
  const fromSource = String(recipe.source?.serves || '').trim().toLowerCase();
  const values = [...fromSource.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return undefined;
  if (values.length === 1) return Math.round(values[0] * 10) / 10;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 10) / 10;
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
  const serves = readRecipeServes(recipe);
  return (
    <article className="overflow-hidden rounded-2xl border border-[#dbe2d9] bg-white">
      <img src={recipe.imageUrl || '/nutrionist.webp'} alt={recipe.title} className="h-40 w-full object-cover" loading="lazy" />
      <div className="space-y-2 p-3">
        <div>
          <h4 className="line-clamp-2 text-sm font-semibold text-[#18251e]">{recipe.title}</h4>
          <p className="mt-1 text-xs text-[#5f7063]">
            {recipe.calories || '—'} cal • {recipe.protein || '—'}g protein • {buildRecipeTimeMeta(recipe)}
          </p>
          {serves ? <p className="mt-1 text-[11px] text-[#5f7063]">Serves {serves}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[#dbe2d9] bg-white text-xs font-semibold text-[#334155]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#1f5f3f] text-xs font-semibold text-white hover:bg-[#174830]"
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
      <div className="max-h-[90vh] w-full max-w-[760px] overflow-auto rounded-2xl border border-[#dbe2d9] bg-white p-5 shadow-[0_30px_55px_-36px_rgba(15,23,42,0.6)]">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#dbe2d9] px-3 py-1 text-xs font-semibold text-[#475569]"
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
        active ? 'border-[#1f5f3f] text-[#1f5f3f]' : 'border-transparent text-[#5f7063] hover:text-[#18251e]'
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

  return [
    `Reviewing your intake preferences: ${dietaryLabel}.`,
    `Filtering recipes for ${allergyLabel}.`,
    `Prioritising ${cuisineLabel} meals for your plan.`,
    `Biasing meal picks toward ${favoriteFoodsLabel}.`,
    `Matching ${answers.preferredMealStyle} meals across ${answers.mealsPerDay} meals per day.`,
    `Balancing calories and protein for your ${answers.primaryHealthFocus || 'weight loss'} focus.`,
    'Crafting your weekly plan and syncing groceries to each selected meal.',
  ];
}

export default function WeightLossResetDashboard({
  answers,
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
          imageUrl: recipe.imageUrl || '/nutrionist.webp',
          count: 1,
        });
      }
    }

    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [mealPlan, recipeMap]);
  const generationMessages = useMemo(() => buildGenerationMessages(answers), [answers]);
  const focusLabel = useMemo(() => getHealthFocusDisplayLabel(answers.primaryHealthFocus), [answers.primaryHealthFocus]);
  const visibleCoreMealTypes = useMemo<PrimaryMealType[]>(
    () => (Number(answers.mealsPerDay || 3) <= 2 ? ['lunch', 'dinner'] : ['breakfast', 'lunch', 'dinner']),
    [answers.mealsPerDay]
  );
  const showSnackMeals = Number(answers.mealsPerDay || 3) >= 4;
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
        limit: 12,
      })
    : [];

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );
  const selectedRecipeServes = selectedRecipe ? readRecipeServes(selectedRecipe) : undefined;

  useEffect(() => {
    let disposed = false;

    if (!isGeneratingPlan) {
      const resetTimer = window.setTimeout(() => {
        if (disposed) return;
        setGenerationProgress(0);
        setGenerationMessageIndex(0);
      }, 0);
      return () => {
        disposed = true;
        window.clearTimeout(resetTimer);
      };
    }

    const initialTimer = window.setTimeout(() => {
      if (disposed) return;
      setGenerationProgress(6);
      setGenerationMessageIndex(0);
    }, 0);

    const progressTimer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= 92) return current;
        const increment = 0.8 + Math.random() * 2.2;
        return Math.min(92, current + increment);
      });
    }, 180);

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
      <header className="rounded-3xl border border-[#dbe2d9] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm font-medium text-[#5f7063]">
              {WEIGHT_LOSS_RESET_PROGRAM_NAME} • Week {weekNumber} • Focus: {focusLabel}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#18251e]">Welcome back, {answers.firstName || 'there'}</h1>
            <p className="mt-2 text-sm text-[#5f7063]">
              Small changes, consistent support. No perfect days required. Felicity can adjust your plan any time.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-[520px]">
              <button
                type="button"
                onClick={() => setActiveTab('progress')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1f5f3f] px-4 text-sm font-semibold text-white hover:bg-[#174830]"
              >
                <Weight size={16} />
                Log weight
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbe2d9] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <MessageCircle size={16} />
                Message Felicity
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('meal-plan')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbe2d9] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <Shuffle size={16} />
                Swap a meal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('grocery')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbe2d9] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <ShoppingCart size={16} />
                View grocery list
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#18251e]">
                <UserRound size={15} className="text-[#1f5f3f]" />
                Felicity
              </p>
              <p className="mt-1 text-sm text-[#5f7063]">Accredited Dietitian • practical, kind, realistic support.</p>
            </article>

            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
              <p className="text-sm font-semibold text-[#18251e]">{WEIGHT_LOSS_RESET_PRICE_COPY}</p>
              <p className="mt-1 text-xs text-[#5f7063]">
                Preference-led weekly planning with practical prep guidance. General nutrition support, not medical advice.
              </p>
            </article>

            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
              <div className="flex items-center justify-between text-sm text-[#334155]">
                <span>Current {currentWeight || '—'} kg</span>
                <span>Goal {answers.goalWeightKg || '—'} kg</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dbe2d9]">
                <div className="h-full rounded-full bg-[#1f5f3f]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold text-[#1f5f3f]">{progressPercent}% toward your goal</p>
            </article>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-4 border-b border-[#dbe2d9]">
        <TabButton active={activeTab === 'overview'} label="Overview" onClick={() => setActiveTab('overview')} />
        <TabButton active={activeTab === 'meal-plan'} label="Meal plan" onClick={() => setActiveTab('meal-plan')} />
        <TabButton active={activeTab === 'grocery'} label="Grocery list" onClick={() => setActiveTab('grocery')} />
        <TabButton active={activeTab === 'progress'} label="Progress" onClick={() => setActiveTab('progress')} />
        <TabButton active={activeTab === 'messages'} label="Message Felicity" onClick={() => setActiveTab('messages')} />
      </nav>

      {(activeTab === 'overview' || activeTab === 'meal-plan') && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-[#18251e]">Weekly meal plan</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUpdatePreferences}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2d9] bg-white px-3 text-xs font-semibold text-[#334155]"
              >
                Update intake preferences
              </button>
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe2d9] bg-white px-3 text-xs font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCcw size={14} />
                {isGeneratingPlan ? 'Refreshing plan...' : 'Refresh weekly plan'}
              </button>
            </div>
          </div>

          {!mealPlan && (
            <article className="rounded-2xl border border-dashed border-[#dbe2d9] bg-[#f8faf7] p-5 text-sm text-[#5f7063]">
              Weekly meals are not generated yet.
              <button
                type="button"
                onClick={onRegeneratePlan}
                disabled={isGeneratingPlan}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#1f5f3f] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGeneratingPlan ? 'Generating weekly meals...' : 'Generate weekly meals'}
                <ArrowRight size={15} />
              </button>
            </article>
          )}

          {isGeneratingPlan ? (
            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-4">
              <p className="text-sm font-semibold text-[#18251e]">Generating your updated meal plan...</p>
              <p className="mt-1 text-sm text-[#5f7063]">{generationMessages[generationMessageIndex]}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbe2d9]">
                <div
                  className="h-full rounded-full bg-[#1f5f3f] transition-[width] duration-300"
                  style={{ width: `${Math.max(6, Math.min(100, generationProgress))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[#5f7063]">{Math.round(Math.max(6, Math.min(100, generationProgress)))}%</p>
            </article>
          ) : null}

          {visiblePlanNotes.length ? (
            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3 text-sm text-[#5f7063]">{visiblePlanNotes.join(' ')}</article>
          ) : null}

          {mealPlan?.prepDayPlan ? (
            <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#18251e]">{mealPlan.prepDayPlan.title}</h3>
                <p className="rounded-full border border-[#dbe2d9] bg-white px-3 py-1 text-xs font-semibold text-[#334155]">
                  {mealPlan.prepDayPlan.prepDay || answers.prepDay || 'Sunday'} • ~{formatMinutesLabel(mealPlan.prepDayPlan.totalPrepMinutes)}
                </p>
              </div>

              {mealPlan.prepDayPlan.sharedIngredients.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[#dbe2d9] bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[#475569]">Shared Ingredients</p>
                  <p className="mt-1 text-sm text-[#334155]">
                    {mealPlan.prepDayPlan.sharedIngredients.slice(0, 14).join(', ')}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 rounded-xl border border-[#dbe2d9] bg-white p-3">
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
            <article key={day.dayIndex} className="rounded-2xl border border-[#dbe2d9] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-[#18251e]">{day.label}</h3>
                <p className="text-xs text-[#5f7063]">
                  {day.totals?.calories || '—'} cal • {day.totals?.protein || '—'}g protein
                </p>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {visibleCoreMealTypes.map((mealType) => {
                  const recipeId = day.meals[mealType];
                  const recipe = recipeId ? recipeMap.get(recipeId) : null;
                  if (!recipe) {
                    return (
                      <div key={mealType} className="rounded-2xl border border-dashed border-[#dbe2d9] bg-[#f8faf7] p-4 text-xs text-[#5f7063]">
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
        <section className="space-y-4 rounded-2xl border border-[#dbe2d9] bg-white p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[#18251e]">Weekly grocery list</h2>
          {groceryGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
              Grocery ingredients will appear after your weekly meal plan is generated.
            </p>
          ) : (
            <div className="space-y-4">
              {groceryRecipeSummaries.length > 0 && (
                <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
                  <h3 className="text-sm font-semibold text-[#18251e]">Meals included in this week</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {groceryRecipeSummaries.map((entry) => {
                      return (
                        <div
                          key={`grocery-recipe-${entry.key}`}
                          className="inline-flex max-w-[280px] items-center gap-2 rounded-full border border-[#dbe2d9] bg-white px-2 py-1"
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

              <article className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
                <h3 className="text-sm font-semibold text-[#18251e]">Total ingredients across all selected meals</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {groceryGroups.map((group) => (
                    <article key={`grocery-total-${group.category}`} className="rounded-xl border border-[#dbe2d9] bg-white p-3">
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
                                className="mt-0.5 h-4 w-4 rounded border-[#b9c8ba]"
                              />
                              <div>
                                <p className={`text-sm ${checked ? 'text-[#94a3b8] line-through' : 'text-[#334155]'}`}>{item.name}</p>
                                {item.quantities.length > 0 && <p className="text-xs text-[#5f7063]">{item.quantities.join(' + ')}</p>}
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
          <p className="text-xs text-[#5f7063]">If ingredient details are incomplete in the source data, items may be simplified.</p>
        </section>
      )}

      {activeTab === 'progress' && (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-2xl border border-[#dbe2d9] bg-white p-4 sm:p-5">
            <h2 className="text-xl font-semibold text-[#18251e]">Log weight</h2>
            <form className="mt-4 space-y-3" onSubmit={submitWeight}>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(event) => setWeightDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#dbe2d9] px-3 text-sm outline-none focus:border-[#1f5f3f]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Weight (kg)</span>
                <input
                  type="number"
                  value={weightValue}
                  onChange={(event) => setWeightValue(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#dbe2d9] px-3 text-sm outline-none focus:border-[#1f5f3f]"
                  placeholder="e.g. 78.4"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-[#334155]">Note (optional)</span>
                <textarea
                  value={weightNote}
                  onChange={(event) => setWeightNote(event.target.value)}
                  className="min-h-20 w-full rounded-xl border border-[#dbe2d9] px-3 py-2 text-sm outline-none focus:border-[#1f5f3f]"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1f5f3f] px-4 text-sm font-semibold text-white">
                Save entry
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-[#dbe2d9] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-[#18251e]">Progress to goal</h2>
                <p className="text-sm text-[#5f7063]">
                  Current {currentWeight || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
                </p>
              </div>
              <div className="rounded-full border border-[#dbe2d9] bg-[#f8faf7] px-3 py-1 text-sm font-semibold text-[#1f5f3f]">{progressPercent}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbe2d9]">
              <div className="h-full rounded-full bg-[#1f5f3f]" style={{ width: `${progressPercent}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {weightLogs.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
                  No entries yet. Add your first weight log above.
                </li>
              ) : (
                weightLogs.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-[#dbe2d9] bg-[#f8faf7] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#18251e]">{entry.weight} kg</span>
                      <span className="text-xs text-[#5f7063]">{new Date(entry.date).toLocaleDateString('en-AU')}</span>
                    </div>
                    {entry.note && <p className="mt-1 text-xs text-[#5f7063]">{entry.note}</p>}
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      )}

      {activeTab === 'messages' && (
        <section className="rounded-2xl border border-[#dbe2d9] bg-white p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-[#18251e]">Message Felicity</h2>
          <p className="mt-1 text-sm text-[#5f7063]">
            Send Felicity a note about what you&apos;d like adjusted. In this demo, messages are saved locally until live dietitian messaging is
            connected.
          </p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
            {sortedMessages.length === 0 ? (
              <p className="text-sm text-[#5f7063]">Ask for meal adjustments, motivation support, grocery planning, or progress check-ins.</p>
            ) : (
              sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user' ? 'ml-auto bg-[#1f5f3f] text-white' : 'bg-white text-[#334155] border border-[#dbe2d9]'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className={`mt-1 text-[11px] ${message.role === 'user' ? 'text-green-100' : 'text-[#5f7063]'}`}>
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
              className="h-10 flex-1 rounded-xl border border-[#dbe2d9] px-3 text-sm outline-none focus:border-[#1f5f3f]"
            />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1f5f3f] px-4 text-sm font-semibold text-white">
              Send
            </button>
          </form>
        </section>
      )}

      {selectedRecipe && (
        <ModalShell onClose={() => setSelectedRecipe(null)}>
          <article>
            <img src={selectedRecipe.imageUrl || '/nutrionist.webp'} alt={selectedRecipe.title} className="h-56 w-full rounded-2xl object-cover" />
            <h3 className="mt-4 text-2xl font-semibold text-[#18251e]">{selectedRecipe.title}</h3>
            {selectedRecipe.description && <p className="mt-2 text-sm text-[#5f7063]">{selectedRecipe.description}</p>}
            <p className="mt-2 text-sm text-[#5f7063]">
              {selectedRecipe.calories || '—'} cal • {selectedRecipe.protein || '—'}g protein • {selectedRecipe.carbs || '—'}g carbs •{' '}
              {selectedRecipe.fat || '—'}g fat
            </p>
            <p className="mt-1 text-sm text-[#5f7063]">{buildRecipeTimeMeta(selectedRecipe)}</p>
            {selectedRecipeServes ? (
              <p className="mt-1 text-sm text-[#5f7063]">Serves: {selectedRecipeServes}</p>
            ) : null}

            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#18251e]">Ingredients</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecipe(null);
                      setActiveTab('grocery');
                    }}
                    className="rounded-lg border border-[#dbe2d9] bg-white px-2 py-1 text-xs font-semibold text-[#334155]"
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
                <h4 className="text-sm font-semibold text-[#18251e]">Instructions</h4>
                <ol className="mt-2 space-y-1 text-sm text-[#334155]">
                  {(selectedRecipe.instructions || []).map((instruction, index) => (
                    <li key={`${selectedRecipe.id}-step-${index}`}>
                      {index + 1}. {instruction}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <div className="mt-3 text-xs text-[#5f7063]">
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
                    className="font-semibold text-[#1f5f3f] underline"
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
            <h3 className="text-xl font-semibold text-[#18251e]">Swap this {swapTarget.mealType}</h3>
            <p className="mt-1 text-sm text-[#5f7063]">
              Alternatives are matched to your dietary preferences and allergy settings where possible.
            </p>
            {swapCandidates.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
                No suitable swaps were found for this meal right now.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {swapCandidates.map((recipe) => (
                  <article key={recipe.id} className="rounded-xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
                    <div className="flex items-start gap-3">
                      <img
                        src={recipe.imageUrl || '/nutrionist.webp'}
                        alt={recipe.title}
                        className="h-14 w-14 shrink-0 rounded-lg border border-[#dbe2d9] object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-[#18251e]">{recipe.title}</p>
                        <p className="mt-1 text-xs text-[#5f7063]">
                          {recipe.calories || '—'} cal • {recipe.protein || '—'}g protein • {buildRecipeTimeMeta(recipe)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSwapMeal(swapTarget.dayIndex, swapTarget.mealType, recipe.id);
                        setSwapTarget(null);
                      }}
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1f5f3f] px-3 text-xs font-semibold text-white"
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

      <footer className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] px-4 py-3 text-xs text-[#5f7063]">
        This is general nutrition support, not medical advice. For urgent or complex conditions, seek care from an appropriate healthcare
        professional.
      </footer>
    </section>
  );
}
