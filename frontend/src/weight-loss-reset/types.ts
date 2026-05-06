export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type CoreMealType = 'breakfast' | 'lunch' | 'dinner';

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
  serves?: number;
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
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
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
  prepDayPlan?: {
    title: string;
    prepDay: string;
    totalPrepMinutes: number;
    sharedIngredients: string[];
    steps: string[];
  };
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
  primaryHealthFocus:
    | 'weight loss'
    | 'pcos'
    | 'gut health'
    | 'sports performance'
    | "women's health"
    | 'blood sugar balance'
    | 'family nutrition'
    | 'general healthy eating';
  dietaryRequirements: string[];
  favoriteFoods: string[];
  allergiesText: string;
  allergyChips: string[];
  dislikes: string;
  cookingSkill: 'beginner' | 'comfortable' | 'advanced';
  selectedMealTypes: CoreMealType[];
  mealsPerDay: number;
  daysPerWeek: number;
  budgetPreference: 'low cost' | 'balanced' | 'premium';
  groceryPreference: 'simple supermarket ingredients' | 'fastest meals possible' | 'high variety' | 'meal prep friendly';
  prepDay: string;
  preferredMealStyle:
    | 'quick and easy'
    | 'family friendly'
    | 'high protein'
    | 'low prep'
    | 'vegetarian leaning'
    | 'no preference';
  preferredCuisines: string[];
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
