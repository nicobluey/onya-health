import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  Beef,
  CalendarDays,
  CheckCircle2,
  Cherry,
  Citrus,
  CookingPot,
  Fish,
  Leaf,
  LoaderCircle,
  Salad,
  Sandwich,
  ShieldCheck,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import {
  BIGGEST_CHALLENGE_OPTIONS,
  CUISINE_PREFERENCE_OPTIONS,
  DIETARY_REQUIREMENT_OPTIONS,
  FAVORITE_FOOD_OPTIONS,
  FELICITY_CALENDLY_URL,
  getFelicityExpertLabel,
  getHealthFocusDisplayLabel,
  GROCERY_PREFERENCE_OPTIONS,
  HEALTH_FOCUS_OPTIONS,
  HAS_REAL_CALENDLY_URL,
  PREFERRED_MEAL_STYLE_OPTIONS,
  QUICK_ALLERGY_CHIPS,
  SUPPORT_AREA_OPTIONS,
  WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS,
  WEIGHT_LOSS_RESET_PRICE_COPY,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import type { CoreMealType, OnboardingAnswers } from '../types';

const inputClassName =
  'h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm text-[#020617] outline-none transition focus:border-[#2e8cff]';
const textareaClassName =
  'min-h-20 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#020617] outline-none transition focus:border-[#2e8cff]';
const CORE_MEAL_TYPE_ORDER: CoreMealType[] = ['breakfast', 'lunch', 'dinner'];

const foodOptionIcons: Record<(typeof FAVORITE_FOOD_OPTIONS)[number]['value'], LucideIcon> = {
  apple: Apple,
  pear: Apple,
  berries: Cherry,
  citrus: Citrus,
  'leafy greens': Leaf,
  'salad bowls': Salad,
  seafood: Fish,
  'lean meats': Beef,
  'stir-fry': UtensilsCrossed,
  soups: CookingPot,
  'rice bowls': Sandwich,
  pasta: Wheat,
};

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
        active ? 'border-[#2e8cff] bg-[#f1f8ff] text-[#2e8cff]' : 'border-[#cbd5e1] bg-white text-[#334155] hover:border-[#b7dcff]'
      }`}
    >
      {children}
    </button>
  );
}

function stepValidation(step: number, answers: OnboardingAnswers) {
  if (step === 1) {
    if (!answers.firstName.trim()) return 'Please add your first name.';
    if (!answers.age || answers.age < 16) return 'Please enter a valid age.';
    if (!answers.heightCm || answers.heightCm < 100) return 'Please enter your height in cm.';
    if (!answers.currentWeightKg || answers.currentWeightKg < 35) return 'Please enter your current weight.';
    if (!answers.goalWeightKg || answers.goalWeightKg < 35) return 'Please enter your goal weight.';
  }
  if (step === 2) {
    if (!answers.mainGoal.trim()) return 'Please confirm your main goal.';
    if (!answers.motivation.trim()) return 'Please share what is motivating you right now.';
    if (!answers.biggestChallenge.trim()) return 'Please choose your biggest challenge.';
    if (answers.timeframeWeeks && answers.timeframeWeeks < WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS) {
      return `Minimum plan length is ${WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS} weeks.`;
    }
  }
  if (step === 3) {
    if (!answers.dietaryRequirements.length) return 'Please choose at least one dietary preference.';
  }
  if (step === 5) {
    if (!answers.cookingSkill) return 'Please choose your cooking skill level.';
    if (!Array.isArray(answers.selectedMealTypes) || answers.selectedMealTypes.length < 2 || answers.selectedMealTypes.length > 3) {
      return 'Choose at least 2 meal types (up to 3): breakfast, lunch, and/or dinner.';
    }
    if (!answers.daysPerWeek || answers.daysPerWeek < 2 || answers.daysPerWeek > 7) return 'Days per week should be between 2 and 7.';
  }
  if (step === 6) {
    if (!answers.primaryHealthFocus.trim()) return 'Choose the main area you want expert support with.';
    if (answers.supportWanted === 'yes' && answers.supportAreas.length === 0) {
      return 'Choose at least one support area so Felicity can tailor your plan.';
    }
  }
  return '';
}

function clampInteger(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toDisplayList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildUnlockMessages(answers: OnboardingAnswers) {
  const dietary = (answers.dietaryRequirements || [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item && item !== 'no specific requirements')
    .slice(0, 3);
  const dietaryLabel = dietary.length > 0 ? toDisplayList(dietary) : 'your intake preferences';
  const allergies = [
    ...(answers.allergyChips || []),
    ...String(answers.allergiesText || '')
      .split(/[,\n;]/g)
      .map((item) => item.trim())
      .filter(Boolean),
  ].slice(0, 4);
  const allergyLabel = allergies.length > 0 ? toDisplayList(allergies) : 'your listed allergy profile';
  const cuisines = (answers.preferredCuisines || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  const cuisineLabel = cuisines.length > 0 ? toDisplayList(cuisines) : 'your preferred cuisine profile';
  return [
    `Saving your updated intake profile and preferences for ${dietaryLabel}.`,
    `Running dietitian quality checks and filtering for ${allergyLabel}.`,
    `Aligning meals with ${cuisineLabel} flavours and your selected meal schedule.`,
    'Preparing swap options and syncing your weekly plan across your account.',
  ];
}

export default function OnboardingFlow({
  initialAnswers,
  initialStep,
  mode = 'initial',
  onSaveProgress,
  onMarkOnboardingComplete,
  onBookingComplete,
  onCompletePreferenceUpdate,
  onOpenDashboard,
}: {
  initialAnswers: OnboardingAnswers;
  initialStep: number;
  mode?: 'initial' | 'update';
  onSaveProgress: (answers: OnboardingAnswers, step: number) => void;
  onMarkOnboardingComplete: () => void;
  onBookingComplete: (answers: OnboardingAnswers) => Promise<void> | void;
  onCompletePreferenceUpdate?: (answers: OnboardingAnswers) => Promise<void> | void;
  onOpenDashboard: () => void;
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), 10));
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockProgress, setUnlockProgress] = useState(0);
  const [unlockMessageIndex, setUnlockMessageIndex] = useState(0);
  const saveProgressRef = useRef(onSaveProgress);
  const isPreferenceUpdate = mode === 'update';
  const unlockMessages = useMemo(() => buildUnlockMessages(answers), [answers]);

  useEffect(() => {
    saveProgressRef.current = onSaveProgress;
  }, [onSaveProgress]);

  useEffect(() => {
    saveProgressRef.current(answers, step);
  }, [answers, step]);

  useEffect(() => {
    if (!unlocking) {
      setUnlockProgress(0);
      setUnlockMessageIndex(0);
      return;
    }

    const TARGET_DURATION_MS = 110_000;
    const MIN_PROGRESS = 6;
    const MAX_IN_PROGRESS = 97;
    const startedAt = Date.now();

    setUnlockProgress(MIN_PROGRESS);
    setUnlockMessageIndex(0);

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const completion = Math.max(0, Math.min(1, elapsed / TARGET_DURATION_MS));
      const eased = 1 - (1 - completion) * (1 - completion);
      const next = MIN_PROGRESS + eased * (MAX_IN_PROGRESS - MIN_PROGRESS);
      setUnlockProgress((current) => Math.max(current, next));
    }, 450);

    const messageTimer = window.setInterval(() => {
      setUnlockMessageIndex((current) => (current + 1) % unlockMessages.length);
    }, 2300);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(messageTimer);
    };
  }, [unlocking, unlockMessages.length]);

  const progress = useMemo(() => {
    const activeIndex = Math.min(step, 9);
    return Math.round(((activeIndex + 1) / 10) * 100);
  }, [step]);

  const next = () => {
    if (isPreferenceUpdate && step === 7) {
      const message = stepValidation(step, answers);
      if (message) {
        setError(message);
        return;
      }
      setUnlocking(true);
      setError('');
      Promise.resolve(onCompletePreferenceUpdate?.(answers))
        .then(() => {
          onMarkOnboardingComplete();
          setStep(10);
        })
        .catch((errorObject) => {
          setError(errorObject instanceof Error ? errorObject.message : 'Unable to save your updated preferences right now.');
        })
        .finally(() => {
          setUnlocking(false);
        });
      return;
    }

    if (step === 9) {
      setError('Please complete booking first using the button above.');
      return;
    }

    const message = stepValidation(step, answers);
    if (message) {
      setError(message);
      return;
    }

    setError('');
    if (step === 7) {
      onMarkOnboardingComplete();
    }
    setStep((current) => Math.min(10, current + 1));
  };

  const back = () => {
    setError('');
    setStep((current) => Math.max(0, current - 1));
  };

  const toggleDietaryRequirement = (value: string) => {
    setAnswers((current) => {
      const normalized = value.toLowerCase();
      const existing = new Set(current.dietaryRequirements.map((entry) => entry.toLowerCase()));

      if (normalized === 'no specific requirements') {
        return {
          ...current,
          dietaryRequirements: ['no specific requirements'],
        };
      }

      existing.delete('no specific requirements');
      if (existing.has(normalized)) {
        existing.delete(normalized);
      } else {
        existing.add(normalized);
      }

      return {
        ...current,
        dietaryRequirements: existing.size > 0 ? [...existing] : ['no specific requirements'],
      };
    });
  };

  const toggleAllergyChip = (value: string) => {
    setAnswers((current) => {
      const existing = new Set(current.allergyChips);
      if (existing.has(value)) existing.delete(value);
      else existing.add(value);
      return {
        ...current,
        allergyChips: [...existing],
      };
    });
  };

  const toggleSupportArea = (value: string) => {
    setAnswers((current) => {
      const existing = new Set(current.supportAreas);
      if (existing.has(value)) existing.delete(value);
      else existing.add(value);
      return {
        ...current,
        supportAreas: [...existing],
      };
    });
  };

  const togglePreferredCuisine = (value: string) => {
    setAnswers((current) => {
      const existing = new Set((current.preferredCuisines || []).map((entry) => entry.toLowerCase()));
      const normalized = value.toLowerCase();
      if (existing.has(normalized)) existing.delete(normalized);
      else existing.add(normalized);

      return {
        ...current,
        preferredCuisines: CUISINE_PREFERENCE_OPTIONS.filter((entry) => existing.has(entry.toLowerCase())),
      };
    });
  };

  const toggleFavoriteFood = (value: string) => {
    setAnswers((current) => {
      const existing = new Set((current.favoriteFoods || []).map((entry) => entry.toLowerCase()));
      const normalized = value.toLowerCase();
      if (existing.has(normalized)) existing.delete(normalized);
      else existing.add(normalized);

      return {
        ...current,
        favoriteFoods: FAVORITE_FOOD_OPTIONS.filter((entry) => existing.has(entry.value.toLowerCase())).map((entry) => entry.value),
      };
    });
  };

  const toggleSelectedMealType = (mealType: CoreMealType) => {
    setAnswers((current) => {
      const selected = new Set((current.selectedMealTypes || []).map((entry) => String(entry || '').toLowerCase()));
      if (selected.has(mealType)) {
        selected.delete(mealType);
      } else {
        selected.add(mealType);
      }

      let ordered = CORE_MEAL_TYPE_ORDER.filter((entry) => selected.has(entry));
      if (ordered.length < 2) {
        const fallback = mealType === 'dinner' ? 'lunch' : 'dinner';
        if (!ordered.includes(fallback)) ordered = [...ordered, fallback];
      }
      if (ordered.length > 3) ordered = ordered.slice(0, 3);

      return {
        ...current,
        selectedMealTypes: ordered,
        mealsPerDay: ordered.length,
      };
    });
  };

  const activeFocus = HEALTH_FOCUS_OPTIONS.find((entry) => entry.value === answers.primaryHealthFocus);
  const felicityExpertLabel = getFelicityExpertLabel(answers.primaryHealthFocus);
  const focusLabel = getHealthFocusDisplayLabel(answers.primaryHealthFocus);
  const selectedFavoriteFoodLabels = FAVORITE_FOOD_OPTIONS.filter((entry) =>
    (answers.favoriteFoods || []).map((value) => value.toLowerCase()).includes(entry.value.toLowerCase())
  ).map((entry) => entry.label);

  const completeBooking = async () => {
    try {
      setUnlocking(true);
      setError('');
      await onBookingComplete(answers);
      setStep(10);
    } catch (errorObject) {
      setError(errorObject instanceof Error ? errorObject.message : 'Unable to unlock your dashboard right now.');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[920px] rounded-3xl border border-[#cbd5e1] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-7">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[#020617]">{WEIGHT_LOSS_RESET_PROGRAM_NAME}</h1>
        <p className="mt-1 text-sm text-[#475569]">
          {isPreferenceUpdate
            ? 'Update your intake preferences'
            : `Step ${Math.min(step + 1, 11)} of 11 • ${focusLabel} support with Felicity`} • {WEIGHT_LOSS_RESET_PRICE_COPY}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef5ff]">
          <div className="h-full rounded-full bg-[#2e8cff] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {step === 0 && (
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#020617]">Let&apos;s build your personalised nutrition plan.</h2>
          <p className="mt-2 max-w-[700px] text-sm leading-relaxed text-[#475569]">
            Small changes, consistent support. We&apos;ll build this around your preferences, budget, and routine.
          </p>
          <p className="mt-2 max-w-[700px] text-sm leading-relaxed text-[#475569]">
            Estimated time: 3 minutes.
          </p>
          <div className="mt-5 rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-4 text-xs leading-relaxed text-[#475569]">
            This is general nutrition support, not medical advice. If you have medical conditions, eating disorders, pregnancy, or complex
            allergies, consult a qualified healthcare professional.
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold text-[#020617]">Tell us about you</h2>
            <p className="mt-1 text-sm text-[#475569]">We use this to personalise your meals and support style.</p>
          </div>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">First name</span>
            <input
              value={answers.firstName}
              onChange={(event) => setAnswers((current) => ({ ...current, firstName: event.target.value }))}
              className={inputClassName}
              placeholder="e.g. Sarah"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Age</span>
            <input
              type="number"
              value={answers.age || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, age: Number(event.target.value) || undefined }))}
              className={inputClassName}
              placeholder="e.g. 34"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Gender (optional)</span>
            <select
              value={answers.gender || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, gender: event.target.value }))}
              className={inputClassName}
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non-binary">Non-binary</option>
              <option value="self-describe">Self-describe</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Height (cm)</span>
            <input
              type="number"
              value={answers.heightCm || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, heightCm: Number(event.target.value) || undefined }))}
              className={inputClassName}
              placeholder="e.g. 168"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Current weight (kg)</span>
            <input
              type="number"
              value={answers.currentWeightKg || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, currentWeightKg: Number(event.target.value) || undefined }))}
              className={inputClassName}
              placeholder="e.g. 84"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Goal weight (kg)</span>
            <input
              type="number"
              value={answers.goalWeightKg || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, goalWeightKg: Number(event.target.value) || undefined }))}
              className={inputClassName}
              placeholder="e.g. 72"
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Your goals</h2>
            <p className="mt-1 text-sm text-[#475569]">No judgement. This helps Felicity understand what support matters most.</p>
          </div>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Main goal</span>
            <input
              value={answers.mainGoal}
              onChange={(event) => setAnswers((current) => ({ ...current, mainGoal: event.target.value }))}
              className={inputClassName}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">What is motivating you right now?</span>
            <textarea
              value={answers.motivation}
              onChange={(event) => setAnswers((current) => ({ ...current, motivation: event.target.value }))}
              className={textareaClassName}
              placeholder="e.g. More energy, confidence, and consistency with meals."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Target duration (weeks)</span>
              <input
                type="number"
                min={WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS}
                value={answers.timeframeWeeks || ''}
                onChange={(event) => setAnswers((current) => ({ ...current, timeframeWeeks: Number(event.target.value) || undefined }))}
                className={inputClassName}
              />
              <p className="text-xs text-[#475569]">Minimum plan length is {WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS} weeks.</p>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Biggest challenge</span>
              <select
                value={answers.biggestChallenge}
                onChange={(event) => setAnswers((current) => ({ ...current, biggestChallenge: event.target.value }))}
                className={inputClassName}
              >
                <option value="">Select one</option>
                {BIGGEST_CHALLENGE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
            Your dietitian can help adjust this anytime as your week changes.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Dietary requirements</h2>
            <p className="mt-1 text-sm text-[#475569]">Choose all that apply.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIETARY_REQUIREMENT_OPTIONS.map((item) => (
              <ChoiceButton
                key={item}
                active={answers.dietaryRequirements.map((entry) => entry.toLowerCase()).includes(item)}
                onClick={() => toggleDietaryRequirement(item)}
              >
                {item}
              </ChoiceButton>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Allergies and dislikes</h2>
            <p className="mt-1 text-sm text-[#475569]">
              For severe or complex allergies, please discuss directly with your healthcare professional and dietitian.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_ALLERGY_CHIPS.map((chip) => (
              <ChoiceButton key={chip} active={answers.allergyChips.includes(chip)} onClick={() => toggleAllergyChip(chip)}>
                {chip}
              </ChoiceButton>
            ))}
          </div>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Any other allergies</span>
            <textarea
              value={answers.allergiesText}
              onChange={(event) => setAnswers((current) => ({ ...current, allergiesText: event.target.value }))}
              className={textareaClassName}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Foods you dislike</span>
            <textarea
              value={answers.dislikes}
              onChange={(event) => setAnswers((current) => ({ ...current, dislikes: event.target.value }))}
              className={textareaClassName}
            />
          </label>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Lifestyle and cooking preferences</h2>
            <p className="mt-1 text-sm text-[#475569]">Built around your preferences, budget, and routine.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Cooking skill</span>
              <select
                value={answers.cookingSkill}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, cookingSkill: event.target.value as OnboardingAnswers['cookingSkill'] }))
                }
                className={inputClassName}
              >
                <option value="beginner">beginner</option>
                <option value="comfortable">comfortable</option>
                <option value="advanced">advanced</option>
              </select>
            </label>

            <div className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Meals you want to cook</span>
              <div className="flex flex-wrap gap-2">
                {CORE_MEAL_TYPE_ORDER.map((mealType) => {
                  const active = (answers.selectedMealTypes || []).includes(mealType);
                  return (
                    <ChoiceButton key={mealType} active={active} onClick={() => toggleSelectedMealType(mealType)}>
                      {mealType}
                    </ChoiceButton>
                  );
                })}
              </div>
              <p className="text-xs text-[#475569]">Pick 2 or 3: breakfast, lunch, and/or dinner.</p>
            </div>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Days per week planned</span>
              <input
                type="number"
                value={answers.daysPerWeek}
                min={2}
                max={7}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    daysPerWeek: clampInteger(event.target.value, 2, 7, current.daysPerWeek || 7),
                  }))
                }
                className={inputClassName}
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Budget preference</span>
              <select
                value={answers.budgetPreference}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, budgetPreference: event.target.value as OnboardingAnswers['budgetPreference'] }))
                }
                className={inputClassName}
              >
                <option value="low cost">low cost</option>
                <option value="balanced">balanced</option>
                <option value="premium">premium</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Preferred prep day</span>
              <select
                value={answers.prepDay || 'Sunday'}
                onChange={(event) => setAnswers((current) => ({ ...current, prepDay: event.target.value }))}
                className={inputClassName}
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">Grocery preference</p>
            <div className="flex flex-wrap gap-2">
              {GROCERY_PREFERENCE_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option}
                  active={answers.groceryPreference === option}
                  onClick={() => setAnswers((current) => ({ ...current, groceryPreference: option as OnboardingAnswers['groceryPreference'] }))}
                >
                  {option}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">Preferred meal style</p>
            <div className="flex flex-wrap gap-2">
              {PREFERRED_MEAL_STYLE_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option}
                  active={answers.preferredMealStyle === option}
                  onClick={() => setAnswers((current) => ({ ...current, preferredMealStyle: option as OnboardingAnswers['preferredMealStyle'] }))}
                >
                  {option}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">Cuisine preferences (optional)</p>
            <div className="flex flex-wrap gap-2">
              {CUISINE_PREFERENCE_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option}
                  active={(answers.preferredCuisines || []).map((entry) => entry.toLowerCase()).includes(option.toLowerCase())}
                  onClick={() => togglePreferredCuisine(option)}
                >
                  {option}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Focus and support preferences</h2>
            <p className="mt-1 text-sm text-[#475569]">Tell us what you want help with and what foods you enjoy most.</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">What do you want expert support for most?</p>
            <div className="grid gap-2 md:grid-cols-2">
              {HEALTH_FOCUS_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setAnswers((current) => ({ ...current, primaryHealthFocus: option.value }))}
                  className={`rounded-xl border p-3 text-left transition ${
                    answers.primaryHealthFocus === option.value
                      ? 'border-[#2e8cff] bg-[#f1f8ff]'
                      : 'border-[#cbd5e1] bg-white hover:border-[#b7dcff]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[#020617]">{option.label}</p>
                  <p className="mt-1 text-xs text-[#475569]">{option.supportingCopy}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">Foods and meal styles you want more of (optional)</p>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {FAVORITE_FOOD_OPTIONS.map((option) => {
                const Icon = foodOptionIcons[option.value];
                const active = (answers.favoriteFoods || []).map((entry) => entry.toLowerCase()).includes(option.value.toLowerCase());
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => toggleFavoriteFood(option.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      active ? 'border-[#2e8cff] bg-[#f1f8ff] text-[#2e8cff]' : 'border-[#cbd5e1] bg-white text-[#334155] hover:border-[#b7dcff]'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: 'yes', label: 'Yes, ongoing support' },
              { value: 'not sure', label: 'Not sure yet' },
              { value: 'no', label: 'I mainly want the meal plan' },
            ].map((item) => (
              <ChoiceButton
                key={item.value}
                active={answers.supportWanted === item.value}
                onClick={() => setAnswers((current) => ({ ...current, supportWanted: item.value as OnboardingAnswers['supportWanted'] }))}
              >
                {item.label}
              </ChoiceButton>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">What would you like help with?</p>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_AREA_OPTIONS.map((option) => (
                <ChoiceButton key={option} active={answers.supportAreas.includes(option)} onClick={() => toggleSupportArea(option)}>
                  {option}
                </ChoiceButton>
              ))}
            </div>
          </div>

          <p className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
            Current match preview: Felicity, your <span className="font-semibold text-[#2e8cff]">{felicityExpertLabel}</span>.
          </p>
        </div>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Your summary</h2>
            <p className="mt-1 text-sm text-[#475569]">Review this before we generate your plan.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
              <p className="text-sm font-semibold text-[#020617]">Personal details</p>
              <p className="mt-1 text-sm text-[#475569]">
                {answers.firstName || 'You'} • {answers.age || '—'} years • {answers.heightCm || '—'} cm
              </p>
              <p className="text-sm text-[#475569]">
                Current {answers.currentWeightKg || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
              </p>
            </div>

            <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3">
              <p className="text-sm font-semibold text-[#020617]">Goal focus</p>
              <p className="mt-1 text-sm text-[#475569]">{answers.mainGoal}</p>
              <p className="text-sm text-[#475569]">Challenge: {answers.biggestChallenge || '—'}</p>
            </div>

            <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-3 md:col-span-2">
              <p className="text-sm font-semibold text-[#020617]">Food and support preferences</p>
              <p className="mt-1 text-sm text-[#475569]">
                Focus match: {activeFocus?.label || 'General healthy eating'} with Felicity ({felicityExpertLabel})
              </p>
              <p className="mt-1 text-sm text-[#475569]">Dietary: {answers.dietaryRequirements.join(', ')}</p>
              <p className="text-sm text-[#475569]">Meal style: {answers.preferredMealStyle}</p>
              <p className="text-sm text-[#475569]">Prep day: {answers.prepDay || 'Sunday'}</p>
              <p className="text-sm text-[#475569]">
                Favourite foods: {selectedFavoriteFoodLabels.join(', ') || 'No favourite foods selected'}
              </p>
              <p className="text-sm text-[#475569]">Cuisines: {answers.preferredCuisines.join(', ') || 'No cuisine preference selected'}</p>
              <p className="text-sm text-[#475569]">Support areas: {answers.supportAreas.join(', ') || 'Not selected yet'}</p>
            </div>
          </div>
          <p className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
            This service provides general nutrition support only. No guaranteed outcomes are promised.
          </p>
        </div>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-[#020617]">
            You&apos;re matched with Felicity, your {felicityExpertLabel}.
          </h2>
          <p className="text-sm leading-relaxed text-[#475569]">
            Based on your focus area ({activeFocus?.label || 'General healthy eating'}), Felicity will tailor your plan around your lifestyle,
            food preferences, budget, and routine.
          </p>
          <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-4">
            <p className="text-sm font-semibold text-[#020617]">Felicity • {felicityExpertLabel}</p>
            <p className="text-sm text-[#475569]">Accredited Dietitian</p>
            <p className="mt-2 text-sm text-[#475569]">
              Support style: practical, kind, realistic, non-judgemental. {WEIGHT_LOSS_RESET_PRICE_COPY}.
            </p>
          </div>
        </div>
      )}

      {step === 9 && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[#2e8cff]">
            <CalendarDays size={14} />
            Booking step
          </div>
          <h2 className="text-2xl font-semibold text-[#020617]">Your next step is to book your intro consult.</h2>
          <p className="text-sm text-[#475569]">
            Open Felicity&apos;s booking link, then confirm below to unlock your dashboard.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <a
              href={HAS_REAL_CALENDLY_URL ? FELICITY_CALENDLY_URL : '#'}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold ${
                HAS_REAL_CALENDLY_URL ? 'bg-[#2e8cff] text-white hover:bg-[#1f7be6]' : 'border border-[#cbd5e1] bg-[#f8fbff] text-[#475569]'
              }`}
              onClick={(event) => {
                if (!HAS_REAL_CALENDLY_URL) event.preventDefault();
              }}
            >
              Book your intro consult
            </a>
            <button
              type="button"
              onClick={() => {
                void completeBooking();
              }}
              disabled={unlocking}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#2e8cff] bg-white text-sm font-semibold text-[#2e8cff] transition hover:bg-[#f1f8ff] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {unlocking ? 'Generating your plan...' : 'I’ve booked my consult'}
            </button>
          </div>
          {!HAS_REAL_CALENDLY_URL && (
            <p className="rounded-xl border border-[#cbd5e1] bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
              Calendly URL is not configured yet. Set `VITE_FELICITY_CALENDLY_URL` to your real booking link.
            </p>
          )}
          <p className="text-xs text-[#475569]">
            In this MVP, booking confirmation is local/dev friendly and can later be replaced by webhook confirmation.
          </p>
        </div>
      )}

      {step === 10 && (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#b7dcff] bg-[#f1f8ff] text-[#2e8cff]">
            <CheckCircle2 size={26} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-[#020617]">{isPreferenceUpdate ? 'Preferences updated.' : 'You&apos;re all set.'}</h2>
          <p className="mt-2 text-sm text-[#475569]">
            {isPreferenceUpdate
              ? 'Your meal plan has been refreshed using your latest intake preferences.'
              : 'Your nutrition dashboard is unlocked with meal planning, grocery support, progress tracking, and messaging.'}
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white transition hover:bg-[#1f7be6]"
          >
            Open nutrition dashboard
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

      {unlocking && (
        <article className="mt-5 rounded-2xl border border-[#b7dcff] bg-gradient-to-br from-[#f8fbff] via-[#f1f8ff] to-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#020617]">
                <LoaderCircle size={15} className="animate-spin text-[#2e8cff]" />
                {isPreferenceUpdate ? 'Refreshing your weekly plan' : 'Preparing your nutrition dashboard'}
              </p>
              <p className="mt-1 text-sm text-[#475569]">{unlockMessages[unlockMessageIndex]}</p>
            </div>
            <p className="rounded-full border border-[#b7dcff] bg-white px-3 py-1 text-xs font-semibold text-[#1f7be6]">
              {Math.round(Math.max(6, Math.min(100, unlockProgress)))}%
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
            <div
              className="h-full rounded-full bg-[#2e8cff] transition-[width] duration-300"
              style={{ width: `${Math.round(Math.max(6, Math.min(100, unlockProgress)))}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {['Preferences saved', 'Dietitian quality checks', 'Plan and swaps built', 'Synced across devices'].map((item, index) => {
              const completedThreshold = (index + 1) * 24;
              const completed = unlockProgress >= completedThreshold;
              return (
                <p
                  key={item}
                  className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
                    completed ? 'border-[#b7dcff] bg-white text-[#1f7be6]' : 'border-[#dbeeff] bg-[#f8fbff] text-[#64748b]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={12} />
                    {item}
                  </span>
                </p>
              );
            })}
          </div>
        </article>
      )}

      {step < 10 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft size={15} />
            Back
          </button>
          {step < 9 && (
            <button
              type="button"
              onClick={next}
              disabled={unlocking}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white hover:bg-[#1f7be6] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {unlocking ? 'Building your plan...' : 'Next'}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
