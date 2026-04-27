import { useBooking } from '../consult-flow/state';
import { COPY } from '../consult-flow/copy';
import {
    formatAud,
    getOneOffCertificatePrice,
    UNLIMITED_MONTHLY_PRICE_AUD,
} from '../consult-flow/pricing';
import { Modal, Button } from './UI';
import { Star, Check } from 'lucide-react';
import { ShineButton } from './lightswind/ShineButton';

export function UpsellModal() {
    const { showUpsell, setUnlimited, nextStep, durationDays } = useBooking();
    // We use nextStep to proceed. nextStep handles transition from 'upsell' -> 'details'.

    if (!showUpsell) return null;

    const handleChoice = (unlimited: boolean) => {
        setUnlimited(unlimited);
        nextStep();
    };

    const { upsell } = COPY.steps;
    const oneOffPrice = getOneOffCertificatePrice(durationDays);
    const unlimitedPriceText = `${formatAud(UNLIMITED_MONTHLY_PRICE_AUD)} / month — cancel anytime`;
    const oneOffPriceText = `${formatAud(oneOffPrice)} one-time`;

    return (
        <Modal isOpen={showUpsell}>
            <div className="space-y-6 p-5 pb-[calc(env(safe-area-inset-bottom)+1.1rem)] md:p-6 md:pb-6">
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-text-primary">{upsell.title}</h3>
                    <p className="text-text-secondary">{upsell.subtitle}</p>
                </div>

                {/* Recommended Option */}
                <div className="relative border-2 border-sunlight-200 bg-sunlight-50/70 rounded-xl p-5 overflow-hidden">
                    <div className="absolute top-0 right-0 bg-bark-900 text-sand-50 text-xs font-bold px-3 py-1 rounded-bl-lg">
                        RECOMMENDED
                    </div>

                    <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Star className="text-sunlight-300 fill-sunlight-300" size={18} />
                            <h4 className="font-bold text-lg text-text-primary">{upsell.recommended.title}</h4>
                        </div>
                        <p className="price-numerals text-text-primary">{unlimitedPriceText}</p>
                    </div>

                    <ul className="space-y-2 mb-6">
                        {upsell.recommended.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                                <Check size={16} className="text-forest-700 mt-0.5" />
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>

                    <ShineButton
                        className="w-full rounded-xl py-3 text-base font-semibold"
                        trailColor="#2e8cff"
                        blurColor="#7dbdff"
                        onClick={() => handleChoice(true)}
                    >
                        {upsell.recommended.cta}
                    </ShineButton>
                    <p className="text-xs text-center text-text-secondary mt-2">{upsell.recommended.micro}</p>
                </div>

                {/* One-off Option */}
                <div className="border border-border rounded-xl p-5">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="font-bold text-text-primary">{upsell.oneoff.title}</h4>
                            <p className="price-numerals text-sm text-text-secondary">{oneOffPriceText}</p>
                        </div>
                    </div>

                    <Button variant="outline" fullWidth onClick={() => handleChoice(false)}>
                        {upsell.oneoff.cta}
                    </Button>
                </div>

                <p className="text-xs text-center text-bark-500">
                    {upsell.footer}
                </p>
            </div>
        </Modal>
    );
}
