import { COPY } from '../copy';

const STEP_IMAGES = ['/REQUEST%20A%20CONSULT.png', '/DOCTOR%20REVIEW.png', '/RELIEF.png'];

export function HowItWorks() {
    return (
        <section className="py-16 bg-white border-t border-border">
            <div className="max-w-5xl mx-auto px-4">
                <h2 className="text-3xl font-bold text-center text-text-primary mb-12">{COPY.howItWorks.title}</h2>
                <div className="grid md:grid-cols-3 gap-10">
                    {COPY.howItWorks.steps.map((step, i) => {
                        const stepImage = STEP_IMAGES[i];

                        return (
                            <div key={i} className="flex flex-col items-center text-center space-y-4">
                                <img
                                    src={stepImage}
                                    alt={`Step ${i + 1}: ${step.title}`}
                                    className="w-full max-w-[300px] aspect-square object-cover rounded-3xl"
                                />
                                <div>
                                    <div className="text-forest-700 font-bold text-sm uppercase tracking-wider mb-2">Step {i + 1}</div>
                                    <h3 className="font-bold text-xl text-text-primary mb-2 min-h-[3.5rem] flex items-center justify-center">{step.title}</h3>
                                    <p className="text-text-secondary leading-relaxed">{step.text}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    );
}
