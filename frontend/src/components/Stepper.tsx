import type { BookingStep } from '../types';

const PROGRESS_STEPS: BookingStep[] = [
    'purpose',
    'compliance',
    'description',
    'dates',
    'details',
    'checkout'
];

export function Stepper({ currentStep }: { currentStep: BookingStep }) {
    if (currentStep === 'confirmation') return null;
    if (currentStep === 'upsell') return null; // Modal workflow, usually keeps underlying step visible or just progress bar

    // If in upsell, we are effectively between dates and details, but let's just show progress as if we are at 'dates' or arguably 'details'.
    // However, stepper is usually hidden or static behind modal.

    const currentIndex = PROGRESS_STEPS.indexOf(currentStep);
    const total = PROGRESS_STEPS.length;

    // If not in the list (e.g. upsell or confirmation), handle gracefully
    const displayIndex = currentIndex === -1 ? ((currentStep as string) === 'upsell' ? 4 : 0) : currentIndex;

    const progress = ((displayIndex + 1) / total) * 100;

    return (
        <div className="w-full">
            <div className="h-1.5 w-full bg-sand-100 rounded-full overflow-hidden mb-2">
                <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
