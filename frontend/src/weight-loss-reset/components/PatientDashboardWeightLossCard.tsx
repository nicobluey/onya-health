import { ArrowRight, CalendarCheck2 } from 'lucide-react';
import {
  DEFAULT_DIETITIAN_PROFILE_IMAGE_URL,
  getDietitianExpertLabel,
  WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS,
  WEIGHT_LOSS_RESET_PRICE_COPY,
  WEIGHT_LOSS_RESET_PROGRAM_NAME,
} from '../constants';
import type { AssignedDietitianProfile, WeightLossResetCardState } from '../types';
import ProfileAvatar from './ProfileAvatar';

export default function PatientDashboardWeightLossCard({
  cardState,
  firstName,
  dietitian,
  primaryHealthFocus,
  currentWeight,
  goalWeight,
  progressPercent,
  onStart,
  onContinueBooking,
  onOpen,
}: {
  cardState: WeightLossResetCardState;
  firstName: string;
  dietitian?: AssignedDietitianProfile | null;
  primaryHealthFocus?: string;
  currentWeight?: number;
  goalWeight?: number;
  progressPercent: number;
  onStart: () => void;
  onContinueBooking: () => void;
  onOpen: () => void;
}) {
  const ctaLabel =
    cardState === 'not-started'
      ? 'Start nutrition plan'
      : cardState === 'onboarding'
        ? 'Continue onboarding'
        : 'Open nutrition plan';

  const ctaAction = cardState === 'not-started' ? onStart : cardState === 'onboarding' ? onContinueBooking : onOpen;
  const expertLabel = getDietitianExpertLabel(primaryHealthFocus);
  const dietitianName = String(dietitian?.fullName || '').trim() || 'Your dietitian';
  const dietitianImageUrl = String(dietitian?.profilePhotoUrl || '').trim() || DEFAULT_DIETITIAN_PROFILE_IMAGE_URL;
  const dietitianBio = String(dietitian?.bio || '').trim() || 'Practical, kind, realistic, non-judgemental support.';

  return (
    <section className="rounded-3xl border border-[#cbd5e1] bg-white p-5 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.24)] sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1.28fr_0.72fr]">
        <div>
          <p className="text-sm font-medium text-[#475569]">{WEIGHT_LOSS_RESET_PROGRAM_NAME}</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#020617]">Let&apos;s build a plan that fits your real life.</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#475569]">
            {cardState === 'not-started'
              ? `${WEIGHT_LOSS_RESET_PRICE_COPY}. Minimum plan length is ${WEIGHT_LOSS_RESET_MIN_PLAN_WEEKS} weeks.`
              : cardState === 'onboarding'
                ? `Your setup is saved, ${firstName || 'there'}. Finish booking your intro consult with ${dietitianName} to unlock the full dashboard.`
                : `Your dashboard is ready with meal swaps, progress tracking, grocery planning, and weekly support.`}
          </p>

          <button
            type="button"
            onClick={ctaAction}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2e8cff] px-5 text-sm font-semibold text-white transition hover:bg-[#1f7be6]"
          >
            {ctaLabel}
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-[#cbd5e1] bg-[#f8fbff] p-4">
          <div className="flex items-center gap-3">
            <ProfileAvatar
              name={dietitianName}
              imageUrl={dietitianImageUrl}
              fallbackImageUrl={DEFAULT_DIETITIAN_PROFILE_IMAGE_URL}
              alt={`${dietitianName} profile`}
              className="h-12 w-12 rounded-xl border border-[#b7dcff] object-cover"
            />
            <p className="text-sm font-semibold text-[#020617]">Matched with {dietitianName} • {expertLabel}</p>
          </div>
          <p className="mt-1 text-sm text-[#475569]">{dietitianBio}</p>

          {cardState === 'ready' ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm text-[#475569]">
                <span>Goal progress</span>
                <span className="font-semibold text-[#2e8cff]">{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
                <div className="h-full rounded-full bg-[#2e8cff]" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="text-sm text-[#475569]">
                {currentWeight ? `Current ${currentWeight} kg` : 'Current weight pending'}
                {goalWeight ? ` • Goal ${goalWeight} kg` : ''}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#475569]">
              <p className="inline-flex items-center gap-1 font-medium text-[#2e8cff]">
                <CalendarCheck2 size={13} />
                Next step
              </p>
              <p className="mt-1">
                {cardState === 'not-started'
                  ? 'Complete your onboarding to build your personalised plan.'
                  : `Book your intro consult with ${dietitianName} to unlock your dashboard.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
