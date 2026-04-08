import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './UI';
import type { ServiceSlug } from '../consult-flow/services';

interface TimelineStep {
    title: string;
    description: string;
    key: 'consult' | 'audio' | 'doctor';
}

const GENERIC_TIMELINE_STEPS: TimelineStep[] = [
    {
        key: 'consult',
        title: 'Book your consultation',
        description:
            'Start your consult online and share the details needed for safe clinical review.',
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

const DOCTOR_TIMELINE_STEPS: TimelineStep[] = [
    {
        key: 'consult',
        title: 'Start your certificate consult',
        description:
            'Choose your purpose and share your symptoms in a short online form.',
    },
    {
        key: 'audio',
        title: 'Add context for safe review',
        description:
            'Include when symptoms started and what changed.',
    },
    {
        key: 'doctor',
        title: 'Doctor-reviewed outcome',
        description:
            'A doctor reviews your request and may ask follow-up questions before deciding.',
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
                src="/HERO.webp"
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
    progress: number;
}

function StepStackCard({ step, idx, total, progress }: StepStackCardProps) {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
    const appearStart = idx === 0 ? 0 : 0.18 + (idx - 1) * 0.34;
    const appearEnd = Math.min(appearStart + 0.2, 1);
    const finalY = (total - 1 - idx) * 14;
    const finalScale = 1 - (total - 1 - idx) * 0.02;

    const transitionProgress = idx === 0
        ? clamp(progress, 0, 1)
        : clamp((progress - appearStart) / Math.max(appearEnd - appearStart, 0.001), 0, 1);
    const opacity = idx === 0 ? 1 : transitionProgress;
    const y = idx === 0 ? mix(0, finalY, transitionProgress) : mix(120, finalY, transitionProgress);
    const scale = idx === 0 ? mix(1, finalScale, transitionProgress) : mix(1.03, finalScale, transitionProgress);

    return (
        <article
            className="absolute inset-0 rounded-3xl border border-border bg-white p-4 shadow-[0_26px_58px_-42px_rgba(15,23,42,0.52)] md:p-8"
            style={{
                opacity,
                zIndex: idx + 1,
                transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
                transition: 'opacity 240ms ease, transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
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
        </article>
    );
}

interface HowItWorksProps {
    onStartConsult?: () => void;
    serviceSlug?: ServiceSlug;
}

export function HowItWorks({ onStartConsult, serviceSlug }: HowItWorksProps) {
    const stackRef = useRef<HTMLDivElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const [stackProgress, setStackProgress] = useState(0);
    const isDoctorFlow = serviceSlug === 'doctor';
    const timelineSteps = isDoctorFlow ? DOCTOR_TIMELINE_STEPS : GENERIC_TIMELINE_STEPS;
    const sectionTitle = isDoctorFlow ? 'Medical certificate consult process' : 'The Onya accessible healthcare model';
    const sectionSubtitle = isDoctorFlow
        ? 'A conservative, doctor-reviewed process for non-emergency certificate requests.'
        : 'Scroll through each stage of the consult flow from booking to doctor-reviewed delivery.';

    useEffect(() => {
        const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
        const updateProgress = () => {
            if (!stackRef.current) return;
            const rect = stackRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight || 1;
            const travelDistance = Math.max(1, rect.height - viewportHeight);
            const scrolled = clamp(-rect.top, 0, travelDistance);
            setStackProgress(scrolled / travelDistance);
        };

        const onScrollOrResize = () => {
            if (animationFrameRef.current !== null) return;
            animationFrameRef.current = window.requestAnimationFrame(() => {
                animationFrameRef.current = null;
                updateProgress();
            });
        };

        updateProgress();
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize);

        return () => {
            window.removeEventListener('scroll', onScrollOrResize);
            window.removeEventListener('resize', onScrollOrResize);
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    return (
        <section className="relative bg-white py-12 md:py-16">
            <div className="relative mx-auto max-w-6xl px-6 md:px-8">
                <div ref={stackRef} className="relative h-[340vh] md:h-[320vh]">
                    <div className="sticky top-14 bg-white pt-7 md:top-20 md:pt-9">
                        <div>
                            <h2 className="relative z-10 text-center text-3xl font-bold text-text-primary md:text-4xl">
                                {sectionTitle}
                            </h2>
                            <p className="relative z-10 mx-auto mt-3 max-w-2xl text-center text-sm text-text-secondary md:text-base">
                                {sectionSubtitle}
                            </p>
                        </div>

                        <div className="relative mx-auto mt-6 h-[68vh] min-h-[500px] max-h-[680px] w-full max-w-5xl md:mt-8 md:h-[62vh] md:min-h-[500px] md:max-h-[640px]">
                            {timelineSteps.map((step, idx) => (
                                <StepStackCard
                                    key={step.title}
                                    step={step}
                                    idx={idx}
                                    total={timelineSteps.length}
                                    progress={stackProgress}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {onStartConsult && (
                    <div className="mt-10 flex justify-center">
                        <Button onClick={onStartConsult} className="h-11 px-6 text-sm">
                            {isDoctorFlow ? 'Start consult' : 'Book your consult'}
                        </Button>
                    </div>
                )}
            </div>
        </section>
    );
}
