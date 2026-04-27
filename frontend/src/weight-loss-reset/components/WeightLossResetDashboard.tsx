import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  ArrowRight,
  MessageCircle,
  RefreshCcw,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Weight,
} from 'lucide-react';
import { buildGroceryListFromMealPlan, calculateGoalProgress, getCurrentWeight, getSwapCandidates } from '../mealPlanning';
import type { DietitianMessage, MealPlan, MealType, OnboardingAnswers, Recipe, WeightLogEntry } from '../types';

type DashboardTab = 'overview' | 'meal-plan' | 'grocery' | 'progress' | 'messages';
type PrimaryMealType = 'breakfast' | 'lunch' | 'dinner';

function macroLabel(label: string, value?: number) {
  if (!value) return null;
  return (
    <span className="rounded-full border border-[#dbeeff] bg-[#f8fbff] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
      {label} {Math.round(value)}
    </span>
  );
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
  return (
    <article className="overflow-hidden rounded-2xl border border-[#dbeeff] bg-white">
      <img src={recipe.imageUrl || '/nutrionist.webp'} alt={recipe.title} className="h-40 w-full object-cover" />
      <div className="space-y-3 p-3">
        <div>
          <h4 className="line-clamp-2 text-sm font-semibold text-[#020617]">{recipe.title}</h4>
          <p className="mt-1 text-xs text-[#64748b]">{recipe.prepTimeMinutes || 25} min prep</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {macroLabel('Cal', recipe.calories)}
          {macroLabel('Protein', recipe.protein)}
          {recipe.dietaryTags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full border border-[#dbeeff] bg-[#f8fbff] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[#dbeeff] bg-white text-xs font-semibold text-[#334155]"
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
      <div className="max-h-[90vh] w-full max-w-[760px] overflow-auto rounded-2xl border border-[#dbeeff] bg-white p-5 shadow-[0_30px_55px_-36px_rgba(15,23,42,0.6)]">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#dbeeff] px-3 py-1 text-xs font-semibold text-[#475569]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function WeightLossResetDashboard({
  answers,
  mealPlan,
  recipes,
  weightLogs,
  messages,
  groceryCheckedItems,
  onRegeneratePlan,
  onSwapMeal,
  onAddWeightLog,
  onAddMessage,
  onToggleGroceryItem,
}: {
  answers: OnboardingAnswers;
  mealPlan: MealPlan | null;
  recipes: Recipe[];
  weightLogs: WeightLogEntry[];
  messages: DietitianMessage[];
  groceryCheckedItems: string[];
  onRegeneratePlan: () => void;
  onSwapMeal: (dayIndex: number, mealType: MealType, recipeId: string) => void;
  onAddWeightLog: (payload: { date: string; weight: number; note?: string }) => void;
  onAddMessage: (payload: { role: 'user' | 'system'; text: string }) => void;
  onToggleGroceryItem: (itemKey: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; mealType: MealType; current: Recipe | undefined } | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [weightValue, setWeightValue] = useState('');
  const [weightNote, setWeightNote] = useState('');

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const groceryGroups = useMemo(() => buildGroceryListFromMealPlan(mealPlan, recipeMap), [mealPlan, recipeMap]);

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
      <header className="rounded-3xl border border-[#b7dcff] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#165fad]">
            <Sparkles size={12} />
            Weight Loss Reset
          </span>
          <span className="rounded-full border border-[#dbeeff] bg-[#f8fbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
            Week {weekNumber}
          </span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">Welcome back, {answers.firstName || 'there'}</h1>
            <p className="mt-2 text-sm text-[#475569]">
              Small changes, consistent support. No perfect days required. Felicity can adjust your plan anytime.
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbeeff] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <MessageCircle size={16} />
                Message Felicity
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('meal-plan')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbeeff] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <Shuffle size={16} />
                Swap a meal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('grocery')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dbeeff] bg-white px-4 text-sm font-semibold text-[#334155]"
              >
                <ShoppingCart size={16} />
                View grocery list
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <article className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Dietitian support</p>
              <p className="mt-1 text-sm font-semibold text-[#020617]">Felicity</p>
              <p className="text-sm text-[#475569]">Practical, kind, realistic, non-judgemental support.</p>
            </article>
            <article className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Plan value</p>
              <p className="mt-1 text-sm font-semibold text-[#020617]">Unlimited dietitian support from $7/week</p>
              <p className="text-xs text-[#64748b]">General nutrition support only. This is not medical advice.</p>
            </article>
            <article className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
              <div className="flex items-center justify-between text-sm text-[#334155]">
                <span>Current {currentWeight || '—'} kg</span>
                <span>Goal {answers.goalWeightKg || '—'} kg</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dbeeff]">
                <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs font-semibold text-[#165fad]">{progressPercent}% toward your goal</p>
            </article>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {[
          { id: 'overview' as const, label: 'Overview' },
          { id: 'meal-plan' as const, label: 'Meal plan' },
          { id: 'grocery' as const, label: 'Grocery list' },
          { id: 'progress' as const, label: 'Progress' },
          { id: 'messages' as const, label: 'Message Felicity' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              activeTab === item.id ? 'border-[#2e8cff] bg-[#eff6ff] text-[#165fad]' : 'border-[#dbeeff] bg-white text-[#334155]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {(activeTab === 'overview' || activeTab === 'meal-plan') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#020617]">Weekly meal plan</h2>
            <button
              type="button"
              onClick={onRegeneratePlan}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbeeff] bg-white px-3 text-xs font-semibold text-[#334155]"
            >
              <RefreshCcw size={14} />
              Regenerate plan
            </button>
          </div>

          {!mealPlan && (
            <article className="rounded-2xl border border-dashed border-[#b7dcff] bg-[#f8fbff] p-5 text-sm text-[#475569]">
              Meal plan hasn&apos;t been generated yet. Generate now to unlock meals, swaps, and your grocery list.
              <button
                type="button"
                onClick={onRegeneratePlan}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white"
              >
                Generate 7-day plan
                <ArrowRight size={15} />
              </button>
            </article>
          )}

          {mealPlan?.notes?.length ? (
            <article className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3 text-xs text-[#475569]">{mealPlan.notes.join(' ')}</article>
          ) : null}

          {mealPlan?.days.map((day) => (
            <article key={day.dayIndex} className="rounded-2xl border border-[#dbeeff] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-[#020617]">{day.label}</h3>
                <div className="flex items-center gap-2 text-xs text-[#64748b]">
                  {macroLabel('Cal', day.totals?.calories)}
                  {macroLabel('Protein', day.totals?.protein)}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(['breakfast', 'lunch', 'dinner'] as PrimaryMealType[]).map((mealType) => {
                  const recipeId = day.meals[mealType];
                  const recipe = recipeId ? recipeMap.get(recipeId) : null;
                  if (!recipe) {
                    return (
                      <div key={mealType} className="rounded-2xl border border-dashed border-[#dbeeff] bg-[#f8fbff] p-4 text-xs text-[#64748b]">
                        {mealType}
                        <p className="mt-1">No recipe available for this slot.</p>
                      </div>
                    );
                  }

                  return (
                    <div key={mealType}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#64748b]">{mealType}</p>
                      <MealCard
                        recipe={recipe}
                        onViewDetails={() => setSelectedRecipe(recipe)}
                        onSwap={() => setSwapTarget({ dayIndex: day.dayIndex, mealType, current: recipe })}
                      />
                    </div>
                  );
                })}

                {day.meals.snacks?.[0] && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#64748b]">snack</p>
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
        <section className="space-y-4 rounded-2xl border border-[#dbeeff] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <ShoppingCart size={17} className="text-[#2e8cff]" />
            <h2 className="text-xl font-semibold text-[#020617]">Weekly grocery list</h2>
          </div>
          {groceryGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
              Grocery ingredients will appear after your meal plan is generated.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {groceryGroups.map((group) => (
                <article key={group.category} className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.11em] text-[#64748b]">{group.category}</h3>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => {
                      const checked = groceryCheckedItems.includes(item.key);
                      return (
                        <li key={item.key} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleGroceryItem(item.key)}
                            className="mt-0.5 h-4 w-4 rounded border-[#b7dcff]"
                          />
                          <div>
                            <p className={`text-sm ${checked ? 'text-[#94a3b8] line-through' : 'text-[#334155]'}`}>{item.name}</p>
                            {item.quantities.length > 0 && <p className="text-xs text-[#64748b]">{item.quantities.join(' / ')}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          )}
          <p className="text-xs text-[#64748b]">If ingredient details are incomplete in the source data, items may be simplified.</p>
        </section>
      )}

      {activeTab === 'progress' && (
        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-2xl border border-[#dbeeff] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Weight size={17} className="text-[#2e8cff]" />
              <h2 className="text-xl font-semibold text-[#020617]">Log weight</h2>
            </div>
            <form className="mt-4 space-y-3" onSubmit={submitWeight}>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(event) => setWeightDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Weight (kg)</span>
                <input
                  type="number"
                  value={weightValue}
                  onChange={(event) => setWeightValue(event.target.value)}
                  className="h-10 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
                  placeholder="e.g. 78.4"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Note (optional)</span>
                <textarea
                  value={weightNote}
                  onChange={(event) => setWeightNote(event.target.value)}
                  className="min-h-20 w-full rounded-xl border border-[#dbeeff] px-3 py-2 text-sm outline-none focus:border-[#2e8cff]"
                  placeholder="How this week felt"
                />
              </label>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white">
                Save entry
              </button>
            </form>
          </article>

          <article className="rounded-2xl border border-[#dbeeff] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-[#020617]">Progress to goal</h2>
                <p className="text-sm text-[#475569]">
                  Current {currentWeight || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
                </p>
              </div>
              <div className="rounded-full border border-[#dbeeff] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#165fad]">
                {progressPercent}%
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dbeeff]">
              <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {weightLogs.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                  No entries yet. Add your first weight log above.
                </li>
              ) : (
                weightLogs.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#020617]">{entry.weight} kg</span>
                      <span className="text-xs text-[#64748b]">{new Date(entry.date).toLocaleDateString('en-AU')}</span>
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
        <section className="rounded-2xl border border-[#dbeeff] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <MessageCircle size={17} className="text-[#2e8cff]" />
            <h2 className="text-xl font-semibold text-[#020617]">Message Felicity</h2>
          </div>
          <p className="mt-1 text-sm text-[#475569]">
            Send Felicity a note about what you&apos;d like adjusted. In this demo, messages are saved locally until live dietitian messaging is
            connected.
          </p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
            {sortedMessages.length === 0 ? (
              <p className="text-sm text-[#475569]">
                Ask for meal adjustments, motivation support, grocery planning, or progress check-ins.
              </p>
            ) : (
              sortedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user' ? 'ml-auto bg-[#2e8cff] text-white' : 'bg-white text-[#334155] border border-[#dbeeff]'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className={`mt-1 text-[11px] ${message.role === 'user' ? 'text-blue-100' : 'text-[#64748b]'}`}>
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
              className="h-10 flex-1 rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
            <img src={selectedRecipe.imageUrl || '/nutrionist.webp'} alt={selectedRecipe.title} className="h-56 w-full rounded-2xl object-cover" />
            <h3 className="mt-4 text-2xl font-semibold text-[#020617]">{selectedRecipe.title}</h3>
            {selectedRecipe.description && <p className="mt-2 text-sm text-[#475569]">{selectedRecipe.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {macroLabel('Calories', selectedRecipe.calories)}
              {macroLabel('Protein', selectedRecipe.protein)}
              {macroLabel('Carbs', selectedRecipe.carbs)}
              {macroLabel('Fat', selectedRecipe.fat)}
            </div>
            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#64748b]">Ingredients</h4>
                <ul className="mt-2 space-y-1 text-sm text-[#334155]">
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <li key={`${selectedRecipe.id}-${ingredient.name}`}>• {[ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ')}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#64748b]">Instructions</h4>
                <ol className="mt-2 space-y-1 text-sm text-[#334155]">
                  {(selectedRecipe.instructions || []).map((instruction, index) => (
                    <li key={`${selectedRecipe.id}-step-${index}`}>{index + 1}. {instruction}</li>
                  ))}
                </ol>
              </div>
            </section>
            <div className="mt-3 text-xs text-[#64748b]">
              {selectedRecipe.dietaryTags.length > 0 && <p>Dietary tags: {selectedRecipe.dietaryTags.join(', ')}</p>}
              {selectedRecipe.allergens.length > 0 && <p>Allergens: {selectedRecipe.allergens.join(', ')}</p>}
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
              <p className="mt-4 rounded-xl border border-dashed border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
                No suitable swaps were found for this meal right now.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {swapCandidates.map((recipe) => (
                  <article key={recipe.id} className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] p-3">
                    <p className="text-sm font-semibold text-[#020617]">{recipe.title}</p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {recipe.calories || '—'} cal • {recipe.protein || '—'}g protein • {recipe.prepTimeMinutes || '—'} min
                    </p>
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

      <footer className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] px-4 py-3 text-xs text-[#64748b]">
        This is general nutrition support, not medical advice. For urgent or complex conditions, seek care from an appropriate healthcare
        professional.
      </footer>
    </section>
  );
}
