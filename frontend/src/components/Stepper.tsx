import type { BookingStep } from '../types';
import { useBooking } from '../consult-flow/state';
import {
    formatAud,
    getOneOffCertificateBandLabel,
    getOneOffCertificatePrice,
    UNLIMITED_MONTHLY_PRICE_AUD,
    ONE_OFF_BASE_PRICE_AUD,
} from '../consult-flow/pricing';

const PROGRESS_STEPS: BookingStep[] = [
    'purpose',
    'compliance',
    'safety',
    'description',
    'dates',
    'details',
    'checkout'
];

export function Stepper({ currentStep, showPricing = false }: { currentStep: BookingStep; showPricing?: boolean }) {
    const { durationDays, isUnlimited } = useBooking();
    if (currentStep === 'confirmation') return null;
    if (currentStep === 'upsell') return null; // Modal workflow, usually keeps underlying step visible or just progress bar

    // If in upsell, we are effectively between dates and details, but let's just show progress as if we are at 'dates' or arguably 'details'.
    // However, stepper is usually hidden or static behind modal.

    const currentIndex = PROGRESS_STEPS.indexOf(currentStep);
    const total = PROGRESS_STEPS.length;

    // If not in the list (e.g. upsell or confirmation), handle gracefully
    const displayIndex = currentIndex === -1 ? ((currentStep as string) === 'upsell' ? 4 : 0) : currentIndex;

    const progress = ((displayIndex + 1) / total) * 100;
    const pricingRevealed = displayIndex >= PROGRESS_STEPS.indexOf('dates');
    const oneOffPrice = getOneOffCertificatePrice(durationDays);

    const priceTitle = isUnlimited
        ? `${formatAud(UNLIMITED_MONTHLY_PRICE_AUD)} / month`
        : pricingRevealed
            ? `${formatAud(oneOffPrice)} one-time`
            : `${formatAud(ONE_OFF_BASE_PRICE_AUD)} from`;

    const priceSubtitle = isUnlimited
        ? 'All Access selected'
        : pricingRevealed
            ? getOneOffCertificateBandLabel(durationDays)
            : 'Updates when you choose duration';

    return (
        <div className="w-full">
            <div className="h-1.5 w-full bg-sand-100 rounded-full overflow-hidden mb-2">
                <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                <span>{`Step ${displayIndex + 1} of ${total}`}</span>
                {showPricing && <span className="price-numerals text-text-primary">{priceTitle}</span>}
            </div>
            {showPricing && <p className="mt-1 text-xs text-text-secondary">{priceSubtitle}</p>}
        </div>
    );
}
