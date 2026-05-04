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
  primaryHealthFocus: 'weight loss',
  dietaryRequirements: ['no specific requirements'],
  favoriteFoods: [],
  allergiesText: '',
  allergyChips: [],
  dislikes: '',
  cookingSkill: 'comfortable',
  mealsPerDay: 3,
  daysPerWeek: 7,
  budgetPreference: 'balanced',
  groceryPreference: 'simple supermarket ingredients',
  preferredMealStyle: 'no preference',
  preferredCuisines: [],
  supportWanted: 'yes',
  supportAreas: ['meal planning', 'accountability'],
};

export const HEALTH_FOCUS_OPTIONS: Array<{
  value: OnboardingAnswers['primaryHealthFocus'];
  label: string;
  supportingCopy: string;
}> = [
  { value: 'weight loss', label: 'Weight loss', supportingCopy: 'Sustainable fat loss and consistency.' },
  { value: 'pcos', label: 'PCOS', supportingCopy: 'Hormone-aware food structure and symptom support.' },
  { value: 'blood sugar balance', label: 'Blood sugar balance', supportingCopy: 'Steadier energy and fewer crashes.' },
  { value: 'gut health', label: 'Gut health', supportingCopy: 'Bloating, digestion, and fibre balance support.' },
  { value: "women's health", label: "Women's health", supportingCopy: 'Cycle-friendly nutrition and daily routine support.' },
  { value: 'sports performance', label: 'Sports performance', supportingCopy: 'Fuelling, recovery, and protein timing support.' },
  { value: 'family nutrition', label: 'Family nutrition', supportingCopy: 'Practical meals that suit household needs.' },
  { value: 'general healthy eating', label: 'General healthy eating', supportingCopy: 'Simple structure for everyday health.' },
];

export const FAVORITE_FOOD_OPTIONS = [
  { value: 'apple', label: 'Apples' },
  { value: 'pear', label: 'Pears' },
  { value: 'berries', label: 'Berries' },
  { value: 'citrus', label: 'Citrus' },
  { value: 'leafy greens', label: 'Leafy greens' },
  { value: 'salad bowls', label: 'Salad bowls' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'lean meats', label: 'Lean meats' },
  { value: 'stir-fry', label: 'Stir-fry' },
  { value: 'soups', label: 'Soups' },
  { value: 'rice bowls', label: 'Rice bowls' },
  { value: 'pasta', label: 'Pasta' },
] as const;

export function getFelicityExpertLabel(primaryHealthFocus?: string) {
  const normalized = String(primaryHealthFocus || '').trim().toLowerCase();
  if (!normalized) return 'nutrition support expert';

  if (normalized === 'pcos') return 'PCOS expert';
  if (normalized === 'weight loss') return 'weight loss expert';
  if (normalized === 'blood sugar balance') return 'blood sugar balance expert';
  if (normalized === 'gut health') return 'gut health expert';
  if (normalized === 'sports performance') return 'sports performance expert';
  if (normalized === "women's health") return "women's health expert";
  if (normalized === 'family nutrition') return 'family nutrition expert';
  if (normalized === 'general healthy eating') return 'healthy eating expert';

  return `${normalized} expert`;
}

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

export const CUISINE_PREFERENCE_OPTIONS = [
  'Modern Australian',
  'Asian',
  'Indian',
  'Mediterranean',
  'Thai',
  'Italian',
  'Mexican',
  'Turkish',
  'Middle Eastern',
  'Vietnamese',
  'Chinese',
  'American',
  'Japanese',
  'Malaysian',
] as const;

export const FALLBACK_RECIPE_IMAGE_URL = '/nutrionist.webp';
