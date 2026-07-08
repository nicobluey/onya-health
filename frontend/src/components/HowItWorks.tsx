import { ArrowRight, ClipboardCheck, FileCheck2, MessageSquareText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Button } from './UI';
import type { ServiceSlug } from '../consult-flow/services';

interface TimelineStep {
    title: string;
    description: string;
    icon: LucideIcon;
}

const DOCTOR_TIMELINE_STEPS: TimelineStep[] = [
    {
        title: 'Say why you need it',
        description: 'Pick work, uni, or carer leave and add the symptoms, dates, and context behind the absence.',
        icon: ClipboardCheck,
    },
    {
        title: 'A doctor checks the request',
        description: 'An Australian-registered doctor reviews whether telehealth certificate evidence is clinically suitable.',
        icon: ShieldCheck,
    },
    {
        title: 'Know what happens next',
        description: 'If approved, the certificate is sent digitally. If not, you get clear guidance instead of being left guessing.',
        icon: FileCheck2,
    },
];

const GENERIC_TIMELINE_STEPS: TimelineStep[] = [
    {
        title: 'Start online',
        description: 'Share the reason for your consult and the key health details in a guided flow.',
        icon: ClipboardCheck,
    },
    {
        title: 'Clinical review',
        description: 'Your request is reviewed by the right clinical pathway, with follow-up where needed.',
        icon: ShieldCheck,
    },
    {
        title: 'Stay updated',
        description: 'Track the outcome and any next steps through secure digital communication.',
        icon: MessageSquareText,
    },
];

interface HowItWorksProps {
    onStartConsult?: () => void;
    serviceSlug?: ServiceSlug;
}

export function HowItWorks({ onStartConsult, serviceSlug }: HowItWorksProps) {
    const isDoctorFlow = serviceSlug === 'doctor';
    const timelineSteps = isDoctorFlow ? DOCTOR_TIMELINE_STEPS : GENERIC_TIMELINE_STEPS;
    const title = isDoctorFlow ? 'How the certificate request works' : 'How Onya works';
    const subtitle = isDoctorFlow
        ? 'For the common days when you are unwell, short on time, and need evidence handled properly.'
        : 'A simple online path from request to review and next steps.';
    const ctaLabel = isDoctorFlow ? 'Start my certificate request' : 'Start consult';

    return (
        <section className="border-y border-border bg-white">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-[0.92fr_1.08fr] md:items-center md:px-8 md:py-16">
                <div>
                    <p className="onya-kicker">How it works</p>
                    <h2 className="onya-heading-xl mt-4 max-w-[11ch] text-text-primary">{title}</h2>
                    <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-text-secondary md:text-lg">
                        {subtitle}
                    </p>

                    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                        {onStartConsult ? (
                            <Button onClick={onStartConsult} className="h-12 px-6 text-sm">
                                {ctaLabel}
                                <ArrowRight size={16} className="ml-2" />
                            </Button>
                        ) : (
                            <a href="/doctor#book" className="onya-button">
                                {ctaLabel}
                                <ArrowRight size={16} />
                            </a>
                        )}
                        <a href="#faq" className="onya-button-secondary">
                            Read FAQ
                        </a>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
                    <div className="grid gap-3">
                        {timelineSteps.map((step, idx) => {
                            const Icon = step.icon;
                            return (
                                <article key={step.title} className="border border-border bg-[#f5f7fa] p-4">
                                    <div className="flex items-start gap-4">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                            <Icon size={18} />
                                        </span>
                                        <div>
                                            <p className="text-xs font-extrabold uppercase text-primary">Step {idx + 1}</p>
                                            <h3 className="mt-1 text-xl font-extrabold leading-tight text-text-primary">{step.title}</h3>
                                            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.description}</p>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <div className="min-h-[320px] overflow-hidden border border-border bg-[#eef4fb]">
                        <img
                            src="/generated/medcert-doctor-review.webp"
                            alt="Doctor reviewing an online medical certificate request"
                            className="h-full min-h-[320px] w-full object-cover object-[62%_center]"
                            loading="lazy"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
