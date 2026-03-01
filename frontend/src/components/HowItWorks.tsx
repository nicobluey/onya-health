import { useRef, type CSSProperties } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { Button } from './UI';

interface TimelineStep {
    title: string;
    description: string;
    key: 'consult' | 'audio' | 'doctor';
}

const TIMELINE_STEPS: TimelineStep[] = [
    {
        key: 'consult',
        title: 'Book your consultation',
        description:
            'Select from medical certificates, prescriptions, specialist referrals, and general consults. Our secure online form takes just minutes to complete and is available 24/7.',
    },
    {
        key: 'audio',
        title: 'Complete your AI pre-consult',
        description:
            'You may receive a quick voice pre-consult to collect your history and symptom details so the clinical review is faster and more accurate.',
    },
    {
        key: 'doctor',
        title: 'Human doctors that deliver',
        description:
            'A registered Australian doctor reviews your pre-consult and chats with you if needed. Once approved, your documentation is delivered instantly by email.',
    },
];

const WAVE_PATTERN = [24, 36, 18, 44, 30, 22, 40, 28, 34, 20, 38, 26, 42, 23, 32, 46, 27, 35, 21, 39, 25, 33, 29, 37];

function ConsultationPreview() {
    return (
        <div className="mx-auto w-full max-w-[400px] rounded-2xl border-2 border-primary bg-white p-2.5 shadow-sm md:max-w-[432px] md:p-3.5">
            <div className="mb-4 flex items-center gap-3">
                <span aria-hidden="true" className="text-bark-500">←</span>
                <div className="h-1.5 flex-1 rounded-full bg-sand-100">
                    <div className="h-full w-1/3 rounded-full bg-primary" />
                </div>
                <span aria-hidden="true" className="text-bark-500">→</span>
            </div>

            <div className="space-y-2" aria-hidden="true">
                <div className="rounded-xl border border-border bg-sand-50 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bark-500">Consult type</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">Medical certificate</p>
                </div>

                <div className="rounded-xl border border-border bg-white p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bark-500">Symptoms</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <div className="flex min-w-0 items-center justify-between rounded-lg border border-primary bg-forest-50 px-2 py-1.5 text-xs font-medium text-primary">
                            <span className="truncate">Cold / Flu</span>
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">✓</span>
                        </div>
                        <div className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-text-secondary">Headache</div>
                        <div className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-text-secondary">Nausea</div>
                        <div className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-text-secondary">Fatigue</div>
                    </div>
                </div>

                <div className="hidden grid-cols-2 gap-1.5 sm:grid">
                    <div className="rounded-xl border border-border bg-white p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bark-500">Started</p>
                        <p className="mt-1 text-xs font-medium text-text-primary">Started yesterday</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-bark-500">Duration</p>
                        <p className="mt-1 text-xs font-medium text-text-primary">3 days</p>
                    </div>
                </div>

                <div className="flex h-7 items-center justify-center rounded-lg bg-bark-900 text-xs font-semibold text-white md:h-8">
                    Continue
                </div>
            </div>
        </div>
    );
}

function AudioPreview() {
    return (
        <div className="rounded-2xl border-2 border-primary bg-white p-4 shadow-sm">
            <div className="audio-wave" aria-hidden="true">
                {Array.from({ length: 48 }).map((_, idx) => {
                    const base = WAVE_PATTERN[idx % WAVE_PATTERN.length];
                    const style = {
                        '--wave-height': `${base}px`,
                        '--wave-delay': `${(idx * 0.05) % 0.75}s`,
                        '--wave-duration': `${1 + ((idx * 37) % 35) / 100}s`,
                    } as CSSProperties;
                    return <span key={idx} style={style} />;
                })}
            </div>
        </div>
    );
}

function DoctorPreview() {
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <img
                src="/HERO.png"
                alt="Doctor reviewing a patient consultation online"
                className="h-52 w-full object-cover md:h-60"
                style={{ objectPosition: '58% 76%' }}
            />
        </div>
    );
}

function StepVisual({ step }: { step: TimelineStep['key'] }) {
    if (step === 'consult') return <ConsultationPreview />;
    if (step === 'audio') return <AudioPreview />;
    return <DoctorPreview />;
}

interface StepStackCardProps {
    step: TimelineStep;
    idx: number;
    total: number;
    progress: MotionValue<number>;
}

function StepStackCard({ step, idx, total, progress }: StepStackCardProps) {
    const appearStart = idx === 0 ? 0 : 0.18 + (idx - 1) * 0.34;
    const appearEnd = Math.min(appearStart + 0.2, 1);
    const finalY = (total - 1 - idx) * 14;
    const finalScale = 1 - (total - 1 - idx) * 0.02;

    const opacity = idx === 0
        ? useTransform(progress, [0, 1], [1, 1])
        : useTransform(progress, [0, appearStart, appearEnd, 1], [0, 0, 1, 1]);
    const y = idx === 0
        ? useTransform(progress, [0, 1], [0, finalY])
        : useTransform(progress, [0, appearStart, appearEnd, 1], [120, 120, finalY, finalY]);
    const scale = idx === 0
        ? useTransform(progress, [0, 1], [1, finalScale])
        : useTransform(progress, [0, appearStart, appearEnd, 1], [1.03, 1.03, finalScale, finalScale]);

    return (
        <motion.article
            className="absolute inset-0 rounded-3xl border border-border bg-white p-4 shadow-[0_26px_58px_-42px_rgba(15,23,42,0.52)] md:p-8"
            style={{ opacity, y, scale, zIndex: idx + 1 }}
        >
            <span className="absolute left-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white md:left-8 md:top-8">
                {idx + 1}
            </span>
            <div className="grid h-full content-start gap-4 pt-8 md:grid-cols-[1fr_1fr] md:items-start md:gap-8 md:pt-12">
                <div className="md:pr-8">
                    <h3 className="mt-2 text-xl font-semibold text-text-primary md:text-2xl">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary md:mt-3 md:text-base">{step.description}</p>
                </div>

                <StepVisual step={step.key} />
            </div>
        </motion.article>
    );
}

interface HowItWorksProps {
    onStartConsult?: () => void;
}

export function HowItWorks({ onStartConsult }: HowItWorksProps) {
    const stackRef = useRef<HTMLDivElement | null>(null);
    const { scrollYProgress } = useScroll({
        target: stackRef,
        offset: ['start start', 'end end'],
    });

    return (
        <section className="bg-white py-12 md:py-16">
            <div className="mx-auto max-w-6xl px-6 md:px-8">
                <div ref={stackRef} className="relative h-[250vh] md:h-[300vh]">
                    <div className="sticky top-16 bg-white pt-7 md:top-20 md:pt-9">
                        <h2 className="text-center text-3xl font-bold text-text-primary md:text-4xl">The Onya accessible healthcare model</h2>
                        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-text-secondary md:text-base">
                            Scroll through each stage of the consult flow from booking to doctor-reviewed delivery.
                        </p>

                        <div className="relative mx-auto mt-6 h-[68vh] min-h-[500px] max-h-[660px] w-full max-w-5xl md:mt-8 md:h-[62vh] md:min-h-[500px] md:max-h-[640px]">
                            {TIMELINE_STEPS.map((step, idx) => (
                                <StepStackCard
                                    key={step.title}
                                    step={step}
                                    idx={idx}
                                    total={TIMELINE_STEPS.length}
                                    progress={scrollYProgress}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {onStartConsult && (
                    <div className="mt-10 flex justify-center">
                        <Button onClick={onStartConsult} className="h-11 px-6 text-sm">
                            Book your consult
                        </Button>
                    </div>
                )}
            </div>
        </section>
    );
}
