import { ArrowRight, CalendarCheck2, Sparkles, UserRound } from 'lucide-react';
import { WEIGHT_LOSS_RESET_PRICE_COPY, WEIGHT_LOSS_RESET_PROGRAM_NAME } from '../constants';
import type { WeightLossResetCardState } from '../types';

export default function PatientDashboardWeightLossCard({
  cardState,
  firstName,
  currentWeight,
  goalWeight,
  progressPercent,
  onStart,
  onContinueBooking,
  onOpen,
}: {
  cardState: WeightLossResetCardState;
  firstName: string;
  currentWeight?: number;
  goalWeight?: number;
  progressPercent: number;
  onStart: () => void;
  onContinueBooking: () => void;
  onOpen: () => void;
}) {
  const ctaLabel =
    cardState === 'not-started'
      ? 'Start Weight Loss Reset'
      : cardState === 'onboarding'
        ? 'Continue booking with Felicity'
        : 'Open Weight Loss Reset';

  const ctaAction = cardState === 'not-started' ? onStart : cardState === 'onboarding' ? onContinueBooking : onOpen;

  return (
    <section className="rounded-3xl border border-[#b7dcff] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#b7dcff] bg-[#f1f8ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#165fad]">
          <Sparkles size={12} />
          New in your plan
        </span>
        <span className="rounded-full border border-[#dbeeff] bg-[#f8fbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#475569]">
          {WEIGHT_LOSS_RESET_PROGRAM_NAME}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#020617]">Let&apos;s build a plan that actually fits your life.</h2>
          <p className="mt-2 text-sm text-[#475569]">
            {cardState === 'not-started'
              ? 'Get a personalised meal plan and unlimited dietitian support from $7/week.'
              : cardState === 'onboarding'
                ? `Nice progress, ${firstName || 'there'}. Your onboarding is saved and Felicity is ready when you are.`
                : 'Your Weight Loss Reset dashboard is unlocked with meal swaps, progress tracking, and support tools.'}
          </p>
          <p className="mt-2 text-sm font-semibold text-[#1f5f3f]">{WEIGHT_LOSS_RESET_PRICE_COPY}</p>

          <button
            type="button"
            onClick={ctaAction}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white transition hover:bg-[#1f7be6]"
          >
            {ctaLabel}
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#dbeeff] bg-[#f8fbff] p-4">
          <div className="flex items-center gap-2">
            <UserRound size={16} className="text-[#2e8cff]" />
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">Dietitian match</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#020617]">Felicity</p>
          <p className="text-sm text-[#475569]">Practical, kind, realistic nutrition coaching.</p>

          {cardState === 'ready' && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#64748b]">
                <span>Goal progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#dbeeff]">
                <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="text-xs text-[#475569]">
                {currentWeight ? `Current ${currentWeight} kg` : 'Current weight pending'} {goalWeight ? `• Goal ${goalWeight} kg` : ''}
              </p>
            </div>
          )}

          {cardState !== 'ready' && (
            <div className="mt-4 rounded-xl border border-[#dbeeff] bg-white px-3 py-2 text-xs text-[#475569]">
              <div className="inline-flex items-center gap-1 text-[#165fad]">
                <CalendarCheck2 size={13} />
                Next step
              </div>
              <p className="mt-1">
                {cardState === 'not-started'
                  ? 'Complete your 3-minute setup to get matched.'
                  : 'Book your intro consult with Felicity to unlock your dashboard.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

