import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Sparkles, UserRound } from 'lucide-react';
import {
  BIGGEST_CHALLENGE_OPTIONS,
  DIETARY_REQUIREMENT_OPTIONS,
  FELICITY_CALENDLY_URL,
  GROCERY_PREFERENCE_OPTIONS,
  HAS_REAL_CALENDLY_URL,
  PREFERRED_MEAL_STYLE_OPTIONS,
  QUICK_ALLERGY_CHIPS,
  SUPPORT_AREA_OPTIONS,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import type { OnboardingAnswers } from '../types';

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
        active ? 'border-[#2e8cff] bg-[#eff6ff] text-[#165fad]' : 'border-[#dbeeff] bg-white text-[#64748b]'
      }`}
    >
      {label}
    </span>
  );
}

function SelectChip({
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
        active ? 'border-[#2e8cff] bg-[#eff6ff] text-[#165fad]' : 'border-[#dbeeff] bg-white text-[#334155] hover:border-[#b7dcff]'
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
    <section className="mx-auto w-full max-w-[920px] rounded-3xl border border-[#dbeeff] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-7">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StepPill active label={WEIGHT_LOSS_RESET_PROGRAM_NAME} />
          <StepPill active={step >= 8} label="Dietitian Match" />
          <StepPill active={step >= 9} label="Booking" />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5edf9]">
          <div className="h-full rounded-full bg-[#2e8cff] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.09em] text-[#64748b]">Progress {progress}%</p>
      </div>

      {step === 0 && (
        <div>
          <p className="inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#165fad]">
            <Sparkles size={13} />
            Estimated time: 3 minutes
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#020617]">Let&apos;s build your personalised nutrition plan.</h1>
          <p className="mt-3 max-w-[680px] text-sm leading-relaxed text-[#475569]">
            Small changes, consistent support. Your plan is built around your preferences, budget, and routine. No perfect days required.
          </p>
          <div className="mt-6 rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-4 text-xs leading-relaxed text-[#475569]">
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
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. Sarah"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Age</span>
            <input
              type="number"
              value={answers.age || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, age: Number(event.target.value) || undefined }))}
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. 34"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Gender (optional)</span>
            <select
              value={answers.gender || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, gender: event.target.value }))}
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. 168"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Current weight (kg)</span>
            <input
              type="number"
              value={answers.currentWeightKg || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, currentWeightKg: Number(event.target.value) || undefined }))}
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. 84"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Goal weight (kg)</span>
            <input
              type="number"
              value={answers.goalWeightKg || ''}
              onChange={(event) => setAnswers((current) => ({ ...current, goalWeightKg: Number(event.target.value) || undefined }))}
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
              className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">What is motivating you right now?</span>
            <textarea
              value={answers.motivation}
              onChange={(event) => setAnswers((current) => ({ ...current, motivation: event.target.value }))}
              className="min-h-24 w-full rounded-xl border border-[#dbeeff] px-3 py-2 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. More energy, confidence, and consistency with meals."
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Timeframe (optional, weeks)</span>
              <input
                type="number"
                value={answers.timeframeWeeks || ''}
                onChange={(event) => setAnswers((current) => ({ ...current, timeframeWeeks: Number(event.target.value) || undefined }))}
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Biggest challenge</span>
              <select
                value={answers.biggestChallenge}
                onChange={(event) => setAnswers((current) => ({ ...current, biggestChallenge: event.target.value }))}
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
          <p className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">
            Your dietitian can help adjust this anytime as your week changes.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Dietary requirements</h2>
            <p className="mt-1 text-sm text-[#475569]">Choose all that apply. We&apos;ll use this when building your meal plan.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIETARY_REQUIREMENT_OPTIONS.map((item) => (
              <SelectChip
                key={item}
                active={answers.dietaryRequirements.map((entry) => entry.toLowerCase()).includes(item)}
                onClick={() => toggleDietaryRequirement(item)}
              >
                {item}
              </SelectChip>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Allergies and dislikes</h2>
            <p className="mt-1 text-sm text-[#475569]">
              We&apos;ll avoid these where possible. For severe or complex allergies, please discuss directly with your healthcare professional and
              dietitian.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ALLERGY_CHIPS.map((chip) => (
              <SelectChip key={chip} active={answers.allergyChips.includes(chip)} onClick={() => toggleAllergyChip(chip)}>
                {chip}
              </SelectChip>
            ))}
          </div>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Any other allergies</span>
            <textarea
              value={answers.allergiesText}
              onChange={(event) => setAnswers((current) => ({ ...current, allergiesText: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-[#dbeeff] px-3 py-2 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. sesame, specific preservatives, or anything else you avoid"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-semibold text-[#334155]">Foods you dislike</span>
            <textarea
              value={answers.dislikes}
              onChange={(event) => setAnswers((current) => ({ ...current, dislikes: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-[#dbeeff] px-3 py-2 text-sm outline-none focus:border-[#2e8cff]"
              placeholder="e.g. olives, sardines, mushrooms"
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
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-semibold text-[#334155]">Budget preference</span>
              <select
                value={answers.budgetPreference}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, budgetPreference: event.target.value as OnboardingAnswers['budgetPreference'] }))
                }
                className="h-11 w-full rounded-xl border border-[#dbeeff] px-3 text-sm outline-none focus:border-[#2e8cff]"
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
                <SelectChip
                  key={option}
                  active={answers.groceryPreference === option}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, groceryPreference: option as OnboardingAnswers['groceryPreference'] }))
                  }
                >
                  {option}
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">Preferred meal style</p>
            <div className="flex flex-wrap gap-2">
              {PREFERRED_MEAL_STYLE_OPTIONS.map((option) => (
                <SelectChip
                  key={option}
                  active={answers.preferredMealStyle === option}
                  onClick={() =>
                    setAnswers((current) => ({ ...current, preferredMealStyle: option as OnboardingAnswers['preferredMealStyle'] }))
                  }
                >
                  {option}
                </SelectChip>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Support preferences</h2>
            <p className="mt-1 text-sm text-[#475569]">Small changes, consistent support. Tell Felicity how you want to work together.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'yes', label: 'Yes, ongoing support' },
              { value: 'not sure', label: 'Not sure yet' },
              { value: 'no', label: 'I mainly want the meal plan' },
            ].map((item) => (
              <SelectChip
                key={item.value}
                active={answers.supportWanted === item.value}
                onClick={() => setAnswers((current) => ({ ...current, supportWanted: item.value as OnboardingAnswers['supportWanted'] }))}
              >
                {item.label}
              </SelectChip>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#334155]">What would you like help with?</p>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_AREA_OPTIONS.map((option) => (
                <SelectChip key={option} active={answers.supportAreas.includes(option)} onClick={() => toggleSupportArea(option)}>
                  {option}
                </SelectChip>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-[#020617]">Your personalised summary</h2>
            <p className="mt-1 text-sm text-[#475569]">Review your details before we generate your Weight Loss Reset plan.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Personal</p>
              <p className="mt-1 text-sm text-[#334155]">
                {answers.firstName || 'You'} • {answers.age || '—'} years • {answers.heightCm || '—'} cm
              </p>
              <p className="text-sm text-[#334155]">
                Current {answers.currentWeightKg || '—'} kg • Goal {answers.goalWeightKg || '—'} kg
              </p>
            </div>
            <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Goal focus</p>
              <p className="mt-1 text-sm text-[#334155]">{answers.mainGoal}</p>
              <p className="text-sm text-[#334155]">Challenge: {answers.biggestChallenge || '—'}</p>
            </div>
            <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-3 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Food and support preferences</p>
              <p className="mt-1 text-sm text-[#334155]">Dietary: {answers.dietaryRequirements.join(', ')}</p>
              <p className="text-sm text-[#334155]">Meal style: {answers.preferredMealStyle}</p>
              <p className="text-sm text-[#334155]">Support areas: {answers.supportAreas.join(', ') || 'Not selected yet'}</p>
            </div>
          </div>
          <p className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">
            This service provides general nutrition support only. No guaranteed outcomes are promised.
          </p>
        </div>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#165fad]">
            <UserRound size={13} />
            Matched dietitian
          </div>
          <h2 className="text-2xl font-semibold text-[#020617]">Based on your goals, Felicity is the best fit for your Weight Loss Reset plan.</h2>
          <p className="text-sm leading-relaxed text-[#475569]">
            Felicity specialises in practical, sustainable weight loss support and can help adjust your plan around your lifestyle, preferences,
            budget, and routine.
          </p>
          <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-4">
            <p className="text-sm font-semibold text-[#020617]">Felicity</p>
            <p className="text-sm text-[#475569]">Accredited Dietitian</p>
            <p className="mt-2 text-sm text-[#475569]">
              Support style: practical, kind, realistic, non-judgemental. Unlimited dietitian support from $7/week.
            </p>
          </div>
        </div>
      )}

      {step === 9 && (
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#165fad]">
            <CalendarDays size={13} />
            Booking step
          </div>
          <h2 className="text-2xl font-semibold text-[#020617]">Your next step is to book your intro consult.</h2>
          <p className="text-sm text-[#475569]">
            Open Felicity&apos;s booking link, then confirm below to unlock your Weight Loss Reset dashboard.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <a
              href={HAS_REAL_CALENDLY_URL ? FELICITY_CALENDLY_URL : '#'}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold ${
                HAS_REAL_CALENDLY_URL ? 'bg-[#2e8cff] text-white hover:bg-[#1f7be6]' : 'border border-[#dbeeff] bg-[#f8fbff] text-[#64748b]'
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
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#2e8cff] bg-white text-sm font-semibold text-[#165fad] transition hover:bg-[#eff6ff] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {unlocking ? 'Unlocking dashboard...' : 'I’ve booked my consult'}
            </button>
          </div>
          {!HAS_REAL_CALENDLY_URL && (
            <p className="rounded-xl border border-[#dbeeff] bg-[#f8fbff] px-3 py-2 text-xs text-[#475569]">
              Calendly URL is not configured yet. Set `VITE_FELICITY_CALENDLY_URL` to your real booking link.
            </p>
          )}
          <p className="text-xs text-[#64748b]">
            In this MVP, booking confirmation is local/dev friendly and can be replaced later with a real Calendly webhook.
          </p>
        </div>
      )}

      {step === 10 && (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#b7dcff] bg-[#eff6ff] text-[#2e8cff]">
            <CheckCircle2 size={26} />
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-[#020617]">You&apos;re all set.</h2>
          <p className="mt-2 text-sm text-[#475569]">
            Your Weight Loss Reset dashboard is unlocked with meal planning, grocery support, progress tracking, and messaging.
          </p>
          <button
            type="button"
            onClick={onOpenDashboard}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white transition hover:bg-[#1f7be6]"
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
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbeeff] bg-white px-4 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowLeft size={15} />
            Back
          </button>
          {step < 9 && (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2e8cff] px-4 text-sm font-semibold text-white hover:bg-[#1f7be6]"
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
