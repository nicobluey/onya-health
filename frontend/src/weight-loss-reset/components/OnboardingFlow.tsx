import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import {
  BIGGEST_CHALLENGE_OPTIONS,
  DIETARY_REQUIREMENT_OPTIONS,
  FELICITY_CALENDLY_URL,
  GROCERY_PREFERENCE_OPTIONS,
  HAS_REAL_CALENDLY_URL,
  PREFERRED_MEAL_STYLE_OPTIONS,
  QUICK_ALLERGY_CHIPS,
  SUPPORT_AREA_OPTIONS,
  WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS,
  WEIGHT_LOSS_RESET_PRICE_COPY,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import type { OnboardingAnswers } from '../types';

const inputClassName =
  'h-11 w-full rounded-xl border border-[#dbe2d9] bg-white px-3 text-sm text-[#18251e] outline-none transition focus:border-[#1f5f3f]';
const textareaClassName =
  'min-h-20 w-full rounded-xl border border-[#dbe2d9] bg-white px-3 py-2 text-sm text-[#18251e] outline-none transition focus:border-[#1f5f3f]';

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
        active ? 'border-[#1f5f3f] bg-[#eff4ef] text-[#1f5f3f]' : 'border-[#dbe2d9] bg-white text-[#334155] hover:border-[#b9c8ba]'
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
    if (!answers.mealsPerDay || answers.mealsPerDay < 2 || answers.mealsPerDay > 5) return 'Meals per day should be between 2 and 5.';
    if (!answers.daysPerWeek || answers.daysPerWeek < 3 || answers.daysPerWeek > 7) return 'Days per week should be between 3 and 7.';
  }
  if (step === 6 && answers.supportWanted === 'yes' && answers.supportAreas.length === 0) {
    return 'Choose at least one support area so Felicity can tailor your plan.';
  }
  return '';
}

export default function OnboardingFlow({
  initialAnswers,
  initialStep,
  onSaveProgress,
  onMarkOnboardingComplete,
  onBookingComplete,
  onOpenDashboard,
}: {
  initialAnswers: OnboardingAnswers;
  initialStep: number;
  onSaveProgress: (answers: OnboardingAnswers, step: number) => void;
  onMarkOnboardingComplete: () => void;
  onBookingComplete: (answers: OnboardingAnswers) => Promise<void> | void;
  onOpenDashboard: () => void;
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), 10));
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const saveProgressRef = useRef(onSaveProgress);

  useEffect(() => {
    saveProgressRef.current = onSaveProgress;
  }, [onSaveProgress]);

  useEffect(() => {
    saveProgressRef.current(answers, step);
  }, [answers, step]);

  const progress = useMemo(() => {
    const activeIndex = Math.min(step, 9);
    return Math.round(((activeIndex + 1) / 10) * 100);
  }, [step]);

  const next = () => {
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
    <section className="mx-auto w-full max-w-[920px] rounded-3xl border border-[#dbe2d9] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-7">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-[#18251e]">{WEIGHT_LOSS_RESET_PROGRAM_NAME}</h1>
        <p className="mt-1 text-sm text-[#5f7063]">
          Step {Math.min(step + 1, 11)} of 11 • {WEIGHT_LOSS_RESET_PRICE_COPY} • Minimum {WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS}-week plan
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf1ec]">
          <div className="h-full rounded-full bg-[#1f5f3f] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {step === 0 && (
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#18251e]">Let&apos;s build your personalised nutrition plan.</h2>
          <p className="mt-2 max-w-[700px] text-sm leading-relaxed text-[#5f7063]">
            Small changes, consistent support. We&apos;ll build this around your preferences, budget, and routine.
          </p>
          <p className="mt-2 max-w-[700px] text-sm leading-relaxed text-[#5f7063]">
            Estimated time: 3 minutes.
          </p>
          <div className="mt-5 rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-4 text-xs leading-relaxed text-[#5f7063]">
            This is general nutrition support, not medical advice. If you have medical conditions, eating disorders, pregnancy, or complex
            allergies, consult a qualified healthcare professional.
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold text-[#18251e]">Tell us about you</h2>
            <p className="mt-1 text-sm text-[#5f7063]">We use this to personalise your meals and support style.</p>
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
            <h2 className="text-2xl font-semibold text-[#18251e]">Your goals</h2>
            <p className="mt-1 text-sm text-[#5f7063]">No judgement. This helps Felicity understand what support matters most.</p>
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
              <p className="text-xs text-[#5f7063]">Minimum plan length is {WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS} weeks.</p>
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

          <p className="rounded-xl border border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
            Your dietitian can help adjust this anytime as your week changes.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#18251e]">Dietary requirements</h2>
            <p className="mt-1 text-sm text-[#5f7063]">Choose all that apply.</p>
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
            <h2 className="text-2xl font-semibold text-[#18251e]">Allergies and dislikes</h2>
            <p className="mt-1 text-sm text-[#5f7063]">
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
            <h2 className="text-2xl font-semibold text-[#18251e]">Lifestyle and cooking preferences</h2>
            <p className="mt-1 text-sm text-[#5f7063]">Built around your preferences, budget, and routine.</p>
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

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Meals per day planned</span>
              <input
                type="number"
                value={answers.mealsPerDay}
                min={2}
                max={5}
                onChange={(event) => setAnswers((current) => ({ ...current, mealsPerDay: Number(event.target.value) || 3 }))}
                className={inputClassName}
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Days per week planned</span>
              <input
                type="number"
                value={answers.daysPerWeek}
                min={3}
                max={7}
                onChange={(event) => setAnswers((current) => ({ ...current, daysPerWeek: Number(event.target.value) || 7 }))}
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
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#18251e]">Support preferences</h2>
            <p className="mt-1 text-sm text-[#5f7063]">Tell Felicity how you want to work together.</p>
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
        </div>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#18251e]">Your summary</h2>
            <p className="mt-1 text-sm text-[#5f7063]">Review this before we generate your plan.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
              <p className="text-sm font-semibold text-[#18251e]">Personal details</p>
              <p className="mt-1 text-sm text-[#5f7063]">
                {answers.firstName || 'You'} • {answers.age || '—'} years • {answers.heightCm || '—'} cm
              </p>
              <p className="text-sm text-[#5f7063]">
                Current {answers.currentWeightKg || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
              </p>
            </div>

            <div className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3">
              <p className="text-sm font-semibold text-[#18251e]">Goal focus</p>
              <p className="mt-1 text-sm text-[#5f7063]">{answers.mainGoal}</p>
              <p className="text-sm text-[#5f7063]">Challenge: {answers.biggestChallenge || '—'}</p>
            </div>

            <div className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-3 md:col-span-2">
              <p className="text-sm font-semibold text-[#18251e]">Food and support preferences</p>
              <p className="mt-1 text-sm text-[#5f7063]">Dietary: {answers.dietaryRequirements.join(', ')}</p>
              <p className="text-sm text-[#5f7063]">Meal style: {answers.preferredMealStyle}</p>
              <p className="text-sm text-[#5f7063]">Support areas: {answers.supportAreas.join(', ') || 'Not selected yet'}</p>
            </div>
          </div>
          <p className="rounded-xl border border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
            This service provides general nutrition support only. No guaranteed outcomes are promised.
          </p>
        </div>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-[#18251e]">Based on your goals, Felicity is the best fit for your Weight Loss Reset plan.</h2>
          <p className="text-sm leading-relaxed text-[#5f7063]">
            Felicity specialises in practical, sustainable weight loss support and can help adjust your plan around your lifestyle, preferences,
            budget, and routine.
          </p>
          <div className="rounded-2xl border border-[#dbe2d9] bg-[#f8faf7] p-4">
            <p className="text-sm font-semibold text-[#18251e]">Felicity</p>
            <p className="text-sm text-[#5f7063]">Accredited Dietitian</p>
            <p className="mt-2 text-sm text-[#5f7063]">
              Support style: practical, kind, realistic, non-judgemental. {WEIGHT_LOSS_RESET_PRICE_COPY}.
            </p>
          </div>
        </div>
      )}

      {step === 9 && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[#1f5f3f]">
            <CalendarDays size={14} />
            Booking step
          </div>
          <h2 className="text-2xl font-semibold text-[#18251e]">Your next step is to book your intro consult.</h2>
          <p className="text-sm text-[#5f7063]">
            Open Felicity&apos;s booking link, then confirm below to unlock your dashboard.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <a
              href={HAS_REAL_CALENDLY_URL ? FELICITY_CALENDLY_URL : '#'}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold ${
                HAS_REAL_CALENDLY_URL ? 'bg-[#1f5f3f] text-white hover:bg-[#174830]' : 'border border-[#dbe2d9] bg-[#f8faf7] text-[#5f7063]'
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
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#1f5f3f] bg-white text-sm font-semibold text-[#1f5f3f] transition hover:bg-[#eff4ef] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {unlocking ? 'Unlocking dashboard...' : 'I’ve booked my consult'}
            </button>
          </div>
          {!HAS_REAL_CALENDLY_URL && (
            <p className="rounded-xl border border-[#dbe2d9] bg-[#f8faf7] px-3 py-2 text-sm text-[#5f7063]">
              Calendly URL is not configured yet. Set `VITE_FELICITY_CALENDLY_URL` to your real booking link.
            </p>
          )}
          <p className="text-xs text-[#5f7063]">
            In this MVP, booking confirmation is local/dev friendly and can later be replaced by webhook confirmation.
          </p>
        </div>
      )}

      {step === 10 && (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#b9c8ba] bg-[#eff4ef] text-[#1f5f3f]">
            <CheckCircle2 size={26} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-[#18251e]">You&apos;re all set.</h2>
          <p className="mt-2 text-sm text-[#5f7063]">
            Your Weight Loss Reset dashboard is unlocked with meal planning, grocery support, progress tracking, and messaging.
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1f5f3f] px-5 text-sm font-semibold text-white transition hover:bg-[#174830]"
          >
            Open Weight Loss Reset dashboard
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

      {step < 10 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe2d9] bg-white px-4 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft size={15} />
            Back
          </button>
          {step < 9 && (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1f5f3f] px-4 text-sm font-semibold text-white hover:bg-[#174830]"
            >
              Next
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
