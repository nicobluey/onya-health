export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  ingredients: Ingredient[];
  instructions?: string[];
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  mealType?: MealType;
  dietaryTags: string[];
  allergens: string[];
  prepTimeMinutes?: number;
  estimatedCost?: string | number;
  source?: Record<string, unknown>;
}

export interface MealPlanDay {
  dayIndex: number;
  label: string;
  meals: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    snacks?: string[];
  };
  totals?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

export interface MealPlan {
  days: MealPlanDay[];
  generatedBy: 'rules' | 'openai';
  notes?: string[];
  generatedAt?: string;
}

export interface WeightLogEntry {
  id: string;
  date: string;
  weight: number;
  note?: string;
}

export interface DietitianMessage {
  id: string;
  role: 'user' | 'system';
  text: string;
  createdAt: string;
}

export interface OnboardingAnswers {
  firstName: string;
  age?: number;
  gender?: string;
  heightCm?: number;
  currentWeightKg?: number;
  goalWeightKg?: number;
  mainGoal: string;
  motivation: string;
  timeframeWeeks?: number;
  biggestChallenge: string;
  dietaryRequirements: string[];
  allergiesText: string;
  allergyChips: string[];
  dislikes: string;
  cookingSkill: 'beginner' | 'comfortable' | 'advanced';
  mealsPerDay: number;
  daysPerWeek: number;
  budgetPreference: 'low cost' | 'balanced' | 'premium';
  groceryPreference: 'simple supermarket ingredients' | 'fastest meals possible' | 'high variety' | 'meal prep friendly';
  preferredMealStyle:
    | 'quick and easy'
    | 'family friendly'
    | 'high protein'
    | 'low prep'
    | 'vegetarian leaning'
    | 'no preference';
  supportWanted: 'yes' | 'not sure' | 'no';
  supportAreas: string[];
}

export interface WeightLossResetState {
  onboardingAnswers: OnboardingAnswers;
  onboardingComplete: boolean;
  onboardingStep: number;
  matchedDietitianId: 'felicity' | null;
  dietitianBookingComplete: boolean;
  mealPlan: MealPlan | null;
  weightLogs: WeightLogEntry[];
  messages: DietitianMessage[];
  groceryCheckedItems: string[];
}

export type WeightLossResetCardState = 'not-started' | 'onboarding' | 'ready';

