import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ONBOARDING_ANSWERS, FELICITY_ID, STORAGE_KEYS } from './constants';
import type {
  DietitianMessage,
  MealPlan,
  OnboardingAnswers,
  WeightLogEntry,
  WeightLossResetCardState,
  WeightLossResetState,
} from './types';

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeReadBoolean(raw: string | null, fallback = false) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function uniqueById<T extends { id: string }>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function sanitizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function sanitizeOnboardingAnswers(input: Partial<OnboardingAnswers> | null | undefined): OnboardingAnswers {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ...DEFAULT_ONBOARDING_ANSWERS,
    ...source,
    firstName: String(source.firstName || DEFAULT_ONBOARDING_ANSWERS.firstName).trim(),
    age:
      source.age === undefined || source.age === null
        ? DEFAULT_ONBOARDING_ANSWERS.age
        : clampNumber(source.age, 16, 120, DEFAULT_ONBOARDING_ANSWERS.age || 25),
    heightCm:
      source.heightCm === undefined || source.heightCm === null
        ? DEFAULT_ONBOARDING_ANSWERS.heightCm
        : clampNumber(source.heightCm, 100, 260, DEFAULT_ONBOARDING_ANSWERS.heightCm || 170),
    currentWeightKg:
      source.currentWeightKg === undefined || source.currentWeightKg === null
        ? DEFAULT_ONBOARDING_ANSWERS.currentWeightKg
        : clampNumber(source.currentWeightKg, 35, 350, DEFAULT_ONBOARDING_ANSWERS.currentWeightKg || 80),
    goalWeightKg:
      source.goalWeightKg === undefined || source.goalWeightKg === null
        ? DEFAULT_ONBOARDING_ANSWERS.goalWeightKg
        : clampNumber(source.goalWeightKg, 35, 350, DEFAULT_ONBOARDING_ANSWERS.goalWeightKg || 70),
    timeframeWeeks:
      source.timeframeWeeks === undefined || source.timeframeWeeks === null
        ? DEFAULT_ONBOARDING_ANSWERS.timeframeWeeks
        : clampNumber(source.timeframeWeeks, 1, 104, DEFAULT_ONBOARDING_ANSWERS.timeframeWeeks || 12),
    mealsPerDay: clampNumber(source.mealsPerDay, 2, 5, DEFAULT_ONBOARDING_ANSWERS.mealsPerDay),
    daysPerWeek: clampNumber(source.daysPerWeek, 2, 7, DEFAULT_ONBOARDING_ANSWERS.daysPerWeek),
    prepDay: String(source.prepDay || DEFAULT_ONBOARDING_ANSWERS.prepDay || 'Sunday').trim() || 'Sunday',
    dietaryRequirements: sanitizeStringArray(source.dietaryRequirements, DEFAULT_ONBOARDING_ANSWERS.dietaryRequirements),
    favoriteFoods: sanitizeStringArray(source.favoriteFoods, []),
    allergyChips: sanitizeStringArray(source.allergyChips, []),
    preferredCuisines: sanitizeStringArray(source.preferredCuisines, []),
    supportAreas: sanitizeStringArray(source.supportAreas, DEFAULT_ONBOARDING_ANSWERS.supportAreas),
    allergiesText: String(source.allergiesText || '').trim(),
    dislikes: String(source.dislikes || '').trim(),
  };
}

function readInitialState(): WeightLossResetState {
  const onboardingRaw = safeParseJson<{
    answers?: Partial<OnboardingAnswers>;
    onboardingComplete?: boolean;
    onboardingStep?: number;
    matchedDietitianId?: 'felicity' | null;
  } | null>(window.localStorage.getItem(STORAGE_KEYS.onboarding), null);

  const onboardingAnswers = sanitizeOnboardingAnswers(onboardingRaw?.answers);

  const weightLogs = safeParseJson<WeightLogEntry[]>(window.localStorage.getItem(STORAGE_KEYS.weightLogs), [])
    .filter((entry) => Number.isFinite(Number(entry.weight)))
    .map((entry) => ({
      ...entry,
      weight: Number(entry.weight),
      date: entry.date || new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const messages = safeParseJson<DietitianMessage[]>(window.localStorage.getItem(STORAGE_KEYS.messages), [])
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'system') && Boolean(entry.text));

  return {
    onboardingAnswers,
    onboardingComplete: Boolean(onboardingRaw?.onboardingComplete),
    onboardingStep: Number.isFinite(Number(onboardingRaw?.onboardingStep))
      ? Math.max(0, Number(onboardingRaw?.onboardingStep))
      : 0,
    matchedDietitianId: onboardingRaw?.matchedDietitianId || null,
    dietitianBookingComplete: safeReadBoolean(window.localStorage.getItem(STORAGE_KEYS.bookingComplete), false),
    mealPlan: safeParseJson<MealPlan | null>(window.localStorage.getItem(STORAGE_KEYS.mealPlan), null),
    weightLogs,
    messages,
    groceryCheckedItems: safeParseJson<string[]>(window.localStorage.getItem(STORAGE_KEYS.groceryList), []).filter(Boolean),
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useWeightLossResetState() {
  const [state, setState] = useState<WeightLossResetState>(readInitialState);

  useEffect(() => {
    const onboardingPayload = {
      answers: state.onboardingAnswers,
      onboardingComplete: state.onboardingComplete,
      onboardingStep: state.onboardingStep,
      matchedDietitianId: state.matchedDietitianId,
    };

    window.localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(onboardingPayload));
    window.localStorage.setItem(STORAGE_KEYS.bookingComplete, String(state.dietitianBookingComplete));
    window.localStorage.setItem(STORAGE_KEYS.mealPlan, JSON.stringify(state.mealPlan));
    window.localStorage.setItem(STORAGE_KEYS.weightLogs, JSON.stringify(state.weightLogs));
    window.localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(state.messages));
    window.localStorage.setItem(STORAGE_KEYS.groceryList, JSON.stringify(state.groceryCheckedItems));
  }, [state]);

  const cardState: WeightLossResetCardState = useMemo(() => {
    if (state.dietitianBookingComplete && state.onboardingComplete) return 'ready';
    if (state.onboardingComplete || state.onboardingStep > 0 || state.onboardingAnswers.firstName.trim()) return 'onboarding';
    return 'not-started';
  }, [state]);

  const latestWeight = useMemo(() => {
    if (state.weightLogs.length > 0) {
      return state.weightLogs[0].weight;
    }
    return state.onboardingAnswers.currentWeightKg;
  }, [state.weightLogs, state.onboardingAnswers.currentWeightKg]);

  const progressPercent = useMemo(() => {
    const start = state.onboardingAnswers.currentWeightKg;
    const goal = state.onboardingAnswers.goalWeightKg;
    const current = latestWeight;
    if (!start || !goal || !current || start <= goal) return 0;
    const totalToLose = start - goal;
    const lost = Math.max(0, start - current);
    return Math.min(100, Math.round((lost / totalToLose) * 100));
  }, [state.onboardingAnswers.currentWeightKg, state.onboardingAnswers.goalWeightKg, latestWeight]);

  const updateOnboardingAnswers = (updates: Partial<OnboardingAnswers>) => {
    setState((current) => ({
      ...current,
      onboardingAnswers: sanitizeOnboardingAnswers({
        ...current.onboardingAnswers,
        ...updates,
      }),
    }));
  };

  const saveOnboardingStep = (step: number) => {
    setState((current) => ({
      ...current,
      onboardingStep: step,
    }));
  };

  const completeOnboarding = () => {
    setState((current) => ({
      ...current,
      onboardingComplete: true,
      matchedDietitianId: FELICITY_ID,
    }));
  };

  const markBookingComplete = () => {
    setState((current) => ({
      ...current,
      dietitianBookingComplete: true,
      onboardingComplete: true,
      matchedDietitianId: FELICITY_ID,
    }));
  };

  const setMealPlan = (mealPlan: MealPlan) => {
    setState((current) => ({
      ...current,
      mealPlan,
    }));
  };

  const replaceMealPlan = (mealPlan: MealPlan | null) => {
    setState((current) => ({
      ...current,
      mealPlan,
    }));
  };

  const addWeightLog = (payload: { date: string; weight: number; note?: string }) => {
    const entry: WeightLogEntry = {
      id: createId('weight'),
      date: payload.date,
      weight: payload.weight,
      note: payload.note?.trim() || '',
    };

    setState((current) => ({
      ...current,
      weightLogs: [...current.weightLogs, entry].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));
  };

  const addMessage = (payload: { role: 'user' | 'system'; text: string }) => {
    const text = payload.text.trim();
    if (!text) return;

    const message: DietitianMessage = {
      id: createId('message'),
      role: payload.role,
      text,
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      messages: uniqueById([message, ...current.messages]).slice(0, 100),
    }));
  };

  const toggleGroceryItem = (itemKey: string) => {
    setState((current) => {
      const exists = current.groceryCheckedItems.includes(itemKey);
      return {
        ...current,
        groceryCheckedItems: exists
          ? current.groceryCheckedItems.filter((entry) => entry !== itemKey)
          : [...current.groceryCheckedItems, itemKey],
      };
    });
  };

  const resetFlow = () => {
    setState({
      onboardingAnswers: DEFAULT_ONBOARDING_ANSWERS,
      onboardingComplete: false,
      onboardingStep: 0,
      matchedDietitianId: null,
      dietitianBookingComplete: false,
      mealPlan: null,
      weightLogs: [],
      messages: [],
      groceryCheckedItems: [],
    });
  };

  return {
    state,
    cardState,
    latestWeight,
    progressPercent,
    updateOnboardingAnswers,
    saveOnboardingStep,
    completeOnboarding,
    markBookingComplete,
    setMealPlan,
    replaceMealPlan,
    addWeightLog,
    addMessage,
    toggleGroceryItem,
    resetFlow,
  };
}
