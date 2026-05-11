import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_DIETITIAN_ID, DEFAULT_ONBOARDING_ANSWERS, STORAGE_KEYS } from './constants';
import { calculateGoalProgressFromHistory } from './mealPlanning';
import type {
  CookingEquipment,
  CoreMealType,
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

function isStorageQuotaExceeded(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; code?: number; message?: string };
  if (value.name === 'QuotaExceededError' || value.code === 22 || value.code === 1014) return true;
  return String(value.message || '').toLowerCase().includes('quota');
}

function safeLocalStorageSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch (errorObject) {
    if (isStorageQuotaExceeded(errorObject)) {
      console.warn(`Storage quota reached for key "${key}". Skipping cache write.`);
      return;
    }
    console.error(`Failed to write localStorage key "${key}".`, errorObject);
  }
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

function sanitizeSelectedMealTypes(value: unknown): CoreMealType[] {
  const fallback = [...DEFAULT_ONBOARDING_ANSWERS.selectedMealTypes];
  if (!Array.isArray(value)) return fallback;
  const normalized = [...new Set(
    value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry): entry is CoreMealType => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner')
  )] as CoreMealType[];
  if (normalized.length === 0) return fallback;
  if (normalized.length === 1) {
    const first = normalized[0];
    const second = first === 'dinner' ? 'lunch' : 'dinner';
    return [first, second];
  }
  if (normalized.length > 3) return normalized.slice(0, 3);
  return normalized;
}

const COOKING_EQUIPMENT_SET = new Set<CookingEquipment>(['stovetop', 'oven', 'air fryer', 'microwave']);

function sanitizeAvailableEquipment(value: unknown): CookingEquipment[] {
  const fallback = [...DEFAULT_ONBOARDING_ANSWERS.availableEquipment];
  if (!Array.isArray(value)) return fallback;
  const normalized = [...new Set(
    value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry): entry is CookingEquipment => COOKING_EQUIPMENT_SET.has(entry as CookingEquipment))
  )];
  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeOnboardingAnswers(input: Partial<OnboardingAnswers> | null | undefined): OnboardingAnswers {
  const source = input && typeof input === 'object' ? input : {};
  const selectedMealTypes: CoreMealType[] = Array.isArray(source.selectedMealTypes)
    ? sanitizeSelectedMealTypes(source.selectedMealTypes)
    : clampNumber(source.mealsPerDay, 2, 3, DEFAULT_ONBOARDING_ANSWERS.mealsPerDay) <= 2
    ? ['lunch', 'dinner']
    : [...DEFAULT_ONBOARDING_ANSWERS.selectedMealTypes];
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
    selectedMealTypes,
    mealsPerDay: selectedMealTypes.length,
    daysPerWeek: clampNumber(source.daysPerWeek, 2, 7, DEFAULT_ONBOARDING_ANSWERS.daysPerWeek),
    prepDay: String(source.prepDay || DEFAULT_ONBOARDING_ANSWERS.prepDay || 'Sunday').trim() || 'Sunday',
    dietaryRequirements: sanitizeStringArray(source.dietaryRequirements, DEFAULT_ONBOARDING_ANSWERS.dietaryRequirements),
    favoriteFoods: sanitizeStringArray(source.favoriteFoods, []),
    allergyChips: sanitizeStringArray(source.allergyChips, []),
    preferredCuisines: sanitizeStringArray(source.preferredCuisines, []),
    supportAreas: sanitizeStringArray(source.supportAreas, DEFAULT_ONBOARDING_ANSWERS.supportAreas),
    allergiesText: String(source.allergiesText || '').trim(),
    dislikes: String(source.dislikes || '').trim(),
    availableEquipment: sanitizeAvailableEquipment(source.availableEquipment),
  };
}

function readInitialState(): WeightLossResetState {
  const onboardingRaw = safeParseJson<{
    answers?: Partial<OnboardingAnswers>;
    onboardingComplete?: boolean;
    onboardingStep?: number;
    matchedDietitianId?: string | null;
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
    mealPlan: null,
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

    safeLocalStorageSetItem(STORAGE_KEYS.onboarding, JSON.stringify(onboardingPayload));
    safeLocalStorageSetItem(STORAGE_KEYS.bookingComplete, String(state.dietitianBookingComplete));
    safeLocalStorageSetItem(STORAGE_KEYS.weightLogs, JSON.stringify(state.weightLogs));
    safeLocalStorageSetItem(STORAGE_KEYS.messages, JSON.stringify(state.messages));
    safeLocalStorageSetItem(STORAGE_KEYS.groceryList, JSON.stringify(state.groceryCheckedItems));
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
    return calculateGoalProgressFromHistory({
      startingWeight: state.onboardingAnswers.currentWeightKg,
      goalWeight: state.onboardingAnswers.goalWeightKg,
      currentWeight: latestWeight,
      historicalWeights: state.weightLogs.map((entry) => Number(entry.weight)),
    });
  }, [state.onboardingAnswers.currentWeightKg, state.onboardingAnswers.goalWeightKg, latestWeight, state.weightLogs]);

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
      matchedDietitianId: DEFAULT_DIETITIAN_ID,
    }));
  };

  const markBookingComplete = () => {
    setState((current) => ({
      ...current,
      dietitianBookingComplete: true,
      onboardingComplete: true,
      matchedDietitianId: DEFAULT_DIETITIAN_ID,
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

  const updateWeightLog = (payload: { id: string; date: string; weight: number; note?: string }) => {
    const targetId = String(payload.id || '').trim();
    if (!targetId) return;

    setState((current) => {
      let didUpdate = false;
      const nextWeightLogs = current.weightLogs
        .map((entry) => {
          if (entry.id !== targetId) return entry;
          didUpdate = true;
          return {
            ...entry,
            date: payload.date,
            weight: payload.weight,
            note: payload.note?.trim() || '',
          };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (!didUpdate) return current;
      return {
        ...current,
        weightLogs: nextWeightLogs,
      };
    });
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
    updateWeightLog,
    addMessage,
    toggleGroceryItem,
    resetFlow,
  };
}
