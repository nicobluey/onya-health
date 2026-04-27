import type { OnboardingAnswers } from './types';

export const WEIGHT_LOSS_RESET_PROGRAM_NAME = 'Weight Loss Reset';
export const WEIGHT_LOSS_RESET_PRICE_COPY = 'Unlimited dietitian support from $75/week';
export const WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS = 8;
export const FELICITY_ID = 'felicity';

const configuredCalendly = String(import.meta.env.VITE_FELICITY_CALENDLY_URL || '').trim();
export const FELICITY_CALENDLY_URL = configuredCalendly || 'REPLACE_WITH_FELICITY_CALENDLY_URL';
export const HAS_REAL_CALENDLY_URL = /^https?:\/\//i.test(FELICITY_CALENDLY_URL);

export const STORAGE_KEYS = {
  onboarding: 'weightLossReset:onboarding',
  bookingComplete: 'weightLossReset:bookingComplete',
  mealPlan: 'weightLossReset:mealPlan',
  weightLogs: 'weightLossReset:weightLogs',
  messages: 'weightLossReset:messages',
  groceryList: 'weightLossReset:groceryList',
} as const;

export const MEAL_PLAN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const DEFAULT_ONBOARDING_ANSWERS: OnboardingAnswers = {
  firstName: '',
  age: undefined,
  gender: '',
  heightCm: undefined,
  currentWeightKg: undefined,
  goalWeightKg: undefined,
  mainGoal: 'Lose weight sustainably',
  motivation: '',
  timeframeWeeks: undefined,
  biggestChallenge: '',
  dietaryRequirements: ['no specific requirements'],
  allergiesText: '',
  allergyChips: [],
  dislikes: '',
  cookingSkill: 'comfortable',
  mealsPerDay: 3,
  daysPerWeek: 7,
  budgetPreference: 'balanced',
  groceryPreference: 'simple supermarket ingredients',
  preferredMealStyle: 'no preference',
  supportWanted: 'yes',
  supportAreas: ['meal planning', 'accountability'],
};

export const QUICK_ALLERGY_CHIPS = ['Peanuts', 'Tree nuts', 'Dairy', 'Egg', 'Soy', 'Shellfish', 'Gluten'];

export const DIETARY_REQUIREMENT_OPTIONS = [
  'vegetarian',
  'vegan',
  'gluten free',
  'dairy free',
  'nut free',
  'halal',
  'kosher',
  'low carb',
  'high protein',
  'no specific requirements',
];

export const BIGGEST_CHALLENGE_OPTIONS = [
  'cravings',
  'time',
  'meal planning',
  'portions',
  'emotional eating',
  'eating out',
  'consistency',
  'not sure',
];

export const SUPPORT_AREA_OPTIONS = [
  'accountability',
  'meal planning',
  'shopping list',
  'portion guidance',
  'motivation',
  'allergy/dietary substitutions',
  'progress tracking',
];

export const GROCERY_PREFERENCE_OPTIONS = [
  'simple supermarket ingredients',
  'fastest meals possible',
  'high variety',
  'meal prep friendly',
] as const;

export const PREFERRED_MEAL_STYLE_OPTIONS = [
  'quick and easy',
  'family friendly',
  'high protein',
  'low prep',
  'vegetarian leaning',
  'no preference',
] as const;

export const FALLBACK_RECIPE_IMAGE_URL = '/nutrionist.webp';
