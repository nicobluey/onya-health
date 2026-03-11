import { useBooking } from '../consult-flow/state';
import { COPY } from '../consult-flow/copy';
import { Modal, Button } from './UI';
import { Star, Check } from 'lucide-react';

export function UpsellModal() {
    const { showUpsell, setUnlimited, nextStep } = useBooking();
    // We use nextStep to proceed. nextStep handles transition from 'upsell' -> 'details'.

    if (!showUpsell) return null;

    const handleChoice = (unlimited: boolean) => {
        setUnlimited(unlimited);
        nextStep();
    };

    const { upsell } = COPY.steps;

    return (
        <Modal isOpen={showUpsell}>
            <div className="p-6 space-y-6">
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
                        <p className="text-text-primary font-medium">{upsell.recommended.price}</p>
                    </div>

                    <ul className="space-y-2 mb-6">
                        {upsell.recommended.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                                <Check size={16} className="text-forest-700 mt-0.5" />
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>

                    <Button fullWidth onClick={() => handleChoice(true)}>
                        {upsell.recommended.cta}
                    </Button>
                    <p className="text-xs text-center text-text-secondary mt-2">{upsell.recommended.micro}</p>
                </div>

                {/* One-off Option */}
                <div className="border border-border rounded-xl p-5">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="font-bold text-text-primary">{upsell.oneoff.title}</h4>
                            <p className="text-sm text-text-secondary">{upsell.oneoff.price}</p>
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
