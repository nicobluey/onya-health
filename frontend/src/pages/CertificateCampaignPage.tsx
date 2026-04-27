import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ArrowRight,
    Briefcase,
    ChevronDown,
    ClipboardCheck,
    GraduationCap,
    HeartHandshake,
    Lock,
    Send,
    ShieldCheck,
    Stethoscope,
    Timer,
} from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

type IntentKey = 'work' | 'university' | 'carers-leave';

type FaqItem = {
    question: string;
    answer: string;
};

type LandingConfig = {
    path: string;
    purposeParam: IntentKey;
    metaTitle: string;
    metaDescription: string;
    heroHeadline: string;
    heroSubheadline: string;
    heroCta: string;
    heroImageSrc: string;
    heroImageAlt: string;
    heroImageLabel: string;
    trustBullets: string[];
    trustLead: string;
    intentHeading: string;
    intentCopy: string;
    intentBullets: string[];
    seoHeading: string;
    seoParagraph: string;
    keywords: string[];
    faqItems: FaqItem[];
};

type CertificateOption = {
    key: IntentKey;
    href: string;
    title: string;
    description: string;
    icon: LucideIcon;
};

type SocialProofItem = {
    title: string;
    quote: string;
    meta: string;
};

type PricingTier = {
    label: string;
    title: string;
    note: string;
};

const CERTIFICATE_OPTIONS: CertificateOption[] = [
    {
        key: 'work',
        href: '/medical-certificate-work',
        title: 'Work Medical Certificate',
        description: 'For sick leave or illness affecting your ability to work.',
        icon: Briefcase,
    },
    {
        key: 'university',
        href: '/medical-certificate-university',
        title: 'University Medical Certificate',
        description: 'For illness affecting classes, exams, or assessments.',
        icon: GraduationCap,
    },
    {
        key: 'carers-leave',
        href: '/medical-certificate-carers-leave',
        title: "Carer's Leave Certificate",
        description: 'For when you need leave to care for someone under your care.',
        icon: HeartHandshake,
    },
];

const LANDING_CONFIGS: Record<string, LandingConfig> = {
    '/medical-certificate-work': {
        path: '/medical-certificate-work',
        purposeParam: 'work',
        metaTitle: 'Work Medical Certificate Online | OnyaHealth',
        metaDescription:
            'Work medical certificates from $9 delivered instantly online ($9.70 for 1 day). Anything above one day is $15 with Australian doctor review.',
        heroHeadline: 'Online Work Medical Certificates Reviewed by Australian Doctors',
        heroSubheadline:
            'Fast, secure medical certificates for sick leave and work absences without needing to visit a clinic.',
        heroCta: 'Get Work Certificate',
        heroImageSrc: '/landing-work-certificate.webp',
        heroImageAlt:
            'Australian doctor holding a medical certificate in a clean clinical setting.',
        heroImageLabel: 'Work certificate support',
        trustBullets: [
            'Designed for common workplace absence documentation',
            'Reviewed by Australian-registered doctors',
            'Secure online request and digital delivery',
        ],
        trustLead:
            'Built for Australian employees who need clear, professional documentation when illness impacts work.',
        intentHeading: 'Sick leave documentation for work absences',
        intentCopy:
            'If you are unwell and unable to work, OnyaHealth gives you a fast digital pathway to request documentation for common leave situations. Requests are reviewed by Australian doctors with clear outcomes.',
        intentBullets: [
            'Fast online process',
            'Suitable for common work absence needs',
            'Reviewed by Australian doctors',
        ],
        seoHeading: 'Work medical certificate requests online in Australia',
        seoParagraph:
            'Patients often search for terms like online work medical certificate, sick leave certificate online, and doctor certificate for work. This page is designed specifically for those intent-driven searches, with a straightforward mobile-friendly flow.',
        keywords: [
            'online work medical certificate',
            'sick leave certificate online',
            'doctor certificate for work',
            'medical certificate for work absence',
        ],
        faqItems: [
            {
                question: 'Will my employer accept this certificate?',
                answer:
                    'Many employers accept doctor-issued evidence. Final acceptance depends on workplace policy and applicable requirements.',
            },
            {
                question: 'How long does it take?',
                answer:
                    'Most requests are reviewed promptly. Timing varies based on clinical demand and case complexity.',
            },
            {
                question: 'Can I request a certificate online without visiting a clinic?',
                answer:
                    'Yes. You can request online and a doctor reviews your information to determine clinical appropriateness.',
            },
            {
                question: 'What if a certificate cannot be issued?',
                answer:
                    'If a certificate is not issued, you will receive clear guidance on next steps and alternative care pathways.',
            },
        ],
    },
    '/medical-certificate-university': {
        path: '/medical-certificate-university',
        purposeParam: 'university',
        metaTitle: 'University Medical Certificate Online | OnyaHealth',
        metaDescription:
            'University medical certificates from $9 delivered instantly online ($9.70 for 1 day). Anything above one day is $15 with doctor review.',
        heroHeadline: 'Online University Medical Certificates for Illness or Assessment Impact',
        heroSubheadline:
            'Fast, secure medical certificates for classes, exams, and assessment-related illness.',
        heroCta: 'Get University Certificate',
        heroImageSrc: '/landing-university-certificate.webp',
        heroImageAlt:
            'University-aged patient using a laptop and phone to complete a telehealth request.',
        heroImageLabel: 'Student telehealth request',
        trustBullets: [
            'Built for university and TAFE student needs',
            'Doctor review with clear documentation outcomes',
            'Secure, mobile-first digital experience',
        ],
        trustLead:
            'Designed for students needing documentation when illness affects classes, exams, or assessment deadlines.',
        intentHeading: 'Support when illness impacts classes or assessments',
        intentCopy:
            'OnyaHealth is designed to help students request documentation quickly during high-pressure periods. You can complete your request online, receive a doctor-reviewed outcome, and manage updates in one place.',
        intentBullets: [
            'Useful for missed classes or assessments',
            'Easy online request',
            'Fast turnaround',
        ],
        seoHeading: 'University and TAFE medical certificate requests online',
        seoParagraph:
            'Common searches include university medical certificate online, sick certificate for assessment impact, and exam illness documentation. This page focuses on that exact student intent with clear next steps.',
        keywords: [
            'university medical certificate online',
            'TAFE medical certificate',
            'exam illness certificate',
            'assessment extension medical certificate',
        ],
        faqItems: [
            {
                question: 'Can I use this for university or TAFE?',
                answer:
                    'Many students request documentation for university or TAFE. Final acceptance is determined by your institution policy.',
            },
            {
                question: 'Can this help if illness affects an exam or assessment?',
                answer:
                    'Yes, this pathway is designed for that scenario where telehealth review is clinically appropriate.',
            },
            {
                question: 'How long does it take?',
                answer:
                    'Most requests are reviewed promptly, with timing dependent on clinical demand and case complexity.',
            },
            {
                question: 'What if a certificate cannot be issued?',
                answer:
                    'If a certificate cannot be issued, you will receive guidance on suitable next steps.',
            },
        ],
    },
    '/medical-certificate-carers-leave': {
        path: '/medical-certificate-carers-leave',
        purposeParam: 'carers-leave',
        metaTitle: "Carer's Leave Certificate Online | OnyaHealth",
        metaDescription:
            "Carer's leave certificates from $9 delivered instantly online ($9.70 for 1 day). Anything above one day is $15 with Australian doctor review.",
        heroHeadline: "Online Carer's Leave Certificates Reviewed by Australian Doctors",
        heroSubheadline:
            'Fast, secure certificates when you need leave to care for someone under your care.',
        heroCta: "Get Carer's Certificate",
        heroImageSrc: '/landing-carers-certificate.webp',
        heroImageAlt: 'Australian doctor reviewing a carer leave certificate request online.',
        heroImageLabel: "Carer's leave review",
        trustBullets: [
            "Made for common carer's leave documentation needs",
            'Reviewed by Australian-registered doctors',
            'Fast digital process without clinic queues',
        ],
        trustLead:
            'Created for carers who need practical, credible documentation support while managing care responsibilities.',
        intentHeading: 'Documentation support for caring responsibilities',
        intentCopy:
            'When someone under your care needs support, OnyaHealth helps you request documentation quickly and securely. Requests are reviewed by Australian doctors with clear communication throughout.',
        intentBullets: [
            'For caring responsibilities',
            'Quick digital request',
            'Reviewed by Australian doctors',
        ],
        seoHeading: "Carer's leave certificate requests online in Australia",
        seoParagraph:
            "Users searching for carer's leave certificate online, carer medical certificate Australia, or family care leave documentation can use this page for a direct and low-friction request pathway.",
        keywords: [
            "carer's leave certificate online",
            'carer medical certificate australia',
            'family care leave documentation',
            "online doctor's certificate for carers leave",
        ],
        faqItems: [
            {
                question: "Can I request a certificate for carer's leave?",
                answer:
                    "Yes. This page is specifically built for carer's leave request intent where clinically appropriate.",
            },
            {
                question: 'Who counts as someone under my care?',
                answer:
                    'This generally includes immediate family or household members depending on your workplace or institution policy.',
            },
            {
                question: 'How long does it take?',
                answer:
                    'Most requests are reviewed promptly, with timelines varying by demand and clinical complexity.',
            },
            {
                question: 'What if a certificate cannot be issued?',
                answer:
                    'You will receive clear guidance if a certificate is not issued, including suggested next steps.',
            },
        ],
    },
};

const TRUST_ITEMS = [
    {
        title: 'Australian-registered doctors',
        text: 'Clinical review by Australian-registered doctors for appropriate telehealth requests.',
        icon: Stethoscope,
    },
    {
        title: 'Secure and confidential',
        text: 'Encrypted data handling and secure workflows designed for patient privacy.',
        icon: Lock,
    },
    {
        title: 'Fast online process',
        text: 'Mobile-first request flow built to reduce friction when you are unwell or under pressure.',
        icon: Timer,
    },
    {
        title: 'Clear documentation',
        text: 'Professional outcomes and clear communication for common leave documentation needs.',
        icon: ClipboardCheck,
    },
];

const HOW_IT_WORKS_STEPS = [
    {
        title: 'Complete a quick online request',
        text: 'Share relevant details in a short digital flow.',
        icon: ClipboardCheck,
    },
    {
        title: 'Doctor reviews your request',
        text: 'An Australian-registered doctor reviews clinical suitability.',
        icon: ShieldCheck,
    },
    {
        title: 'Receive your certificate by email if appropriate',
        text: 'If clinically appropriate, your certificate is sent digitally.',
        icon: Send,
    },
];

const PRICING_TIERS: PricingTier[] = [
    {
        label: '1 day',
        title: '$9.70 one-time',
        note: 'For short absence periods. Final pricing is shown clearly before payment.',
    },
    {
        label: '2+ days',
        title: '$15.00 one-time',
        note: 'For anything above one day. Extra clinical context may be requested where needed.',
    },
    {
        label: 'All Access',
        title: '$19.00 per month',
        note: 'Unlimited medical certificates with no lock-in contract.',
    },
];

const TRUST_LOGOS = [
    { src: '/logos/anz.webp', alt: 'ANZ' },
    { src: '/logos/bhp.webp', alt: 'BHP' },
    { src: '/logos/commbank.webp', alt: 'CommBank' },
    { src: '/logos/monash.webp', alt: 'Monash University' },
    { src: '/logos/nab.webp', alt: 'NAB' },
    { src: '/logos/qantas.webp', alt: 'Qantas' },
    { src: '/logos/telstra.webp', alt: 'Telstra' },
    { src: '/logos/unimelb.webp', alt: 'University of Melbourne' },
    { src: '/logos/unsw.webp', alt: 'UNSW' },
    { src: '/logos/usyd.webp', alt: 'University of Sydney' },
    { src: '/logos/wesfarmers.webp', alt: 'Wesfarmers' },
    { src: '/logos/woolworths.webp', alt: 'Woolworths' },
];

const SOCIAL_PROOF_ITEMS: SocialProofItem[] = [
    {
        title: 'Fast request completion',
        quote: 'Most patients can submit core details in a short online flow that avoids clinic admin friction.',
        meta: 'Experience highlight | Speed',
    },
    {
        title: 'Doctor-reviewed decision pathway',
        quote: 'Requests are routed to Australian-registered doctors with conservative suitability checks.',
        meta: 'Experience highlight | Clinical review',
    },
    {
        title: 'Clear status communication',
        quote: 'Patients receive straightforward updates on request progress and next steps.',
        meta: 'Experience highlight | Transparency',
    },
    {
        title: 'Secure digital delivery',
        quote: 'When clinically appropriate, documentation is delivered digitally with privacy-first handling.',
        meta: 'Experience highlight | Delivery',
    },
];

function Navbar({ ctaHref }: { ctaHref: string }) {
    return (
        <header className="sticky top-0 z-40 border-b border-border bg-white shadow-sm">
            <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                <HeaderBrand />
                <nav className="flex items-center gap-3 sm:gap-5">
                    <div className="hidden items-center gap-5 md:flex">
                        <a href="#how-it-works" className="text-sm font-semibold text-text-secondary hover:text-primary">
                            How it works
                        </a>
                        <a href="#faq" className="text-sm font-semibold text-text-secondary hover:text-primary">
                            FAQ
                        </a>
                    </div>
                    <HeaderDropdown buttonClassName="h-10 w-10 rounded-xl text-text-primary/90 flex items-center justify-center hover:bg-sand-75 transition-colors" />
                    <a
                        href={ctaHref}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        Get Certificate
                    </a>
                </nav>
            </div>
        </header>
    );
}

function Hero({
    config,
    bookingHref,
    selectedTitle,
}: {
    config: LandingConfig;
    bookingHref: string;
    selectedTitle: string;
}) {
    return (
        <section className="border-b border-border bg-bg">
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center md:px-6 md:py-20">
                <div className="max-w-xl">
                    <h1 className="text-4xl font-bold leading-tight text-text-primary md:text-5xl">{config.heroHeadline}</h1>
                    <p className="mt-5 text-lg leading-relaxed text-text-secondary">{config.heroSubheadline}</p>

                    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                        {config.trustBullets.map((bullet) => (
                            <li
                                key={bullet}
                                className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary"
                            >
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                                <span>{bullet}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-9">
                        <a
                            href={bookingHref}
                            className="inline-flex h-13 items-center justify-center rounded-xl bg-primary px-7 text-base font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            {config.heroCta}
                            <ArrowRight size={17} className="ml-2" />
                        </a>
                        <p className="mt-3 text-sm font-medium text-text-secondary">Takes less than 2 minutes</p>
                    </div>
                </div>

                <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm md:p-5">
                    <div className="relative overflow-hidden rounded-2xl">
                        <img
                            src={config.heroImageSrc}
                            alt={config.heroImageAlt}
                            className="h-72 w-full object-cover md:h-[340px]"
                            loading="lazy"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0f172a]/50 via-transparent to-transparent" />
                        <div className="absolute left-3 top-3 inline-flex rounded-full border border-white/40 bg-white/90 px-3 py-1 text-xs font-semibold text-text-primary">
                            {config.heroImageLabel}
                        </div>
                        <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/20 bg-[#0f172a]/70 p-3 backdrop-blur-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/80">Selected type</p>
                            <p className="mt-1 text-sm font-semibold text-white">{selectedTitle}</p>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {HOW_IT_WORKS_STEPS.map((step, index) => (
                            <div
                                key={step.title}
                                className="flex items-center gap-3 rounded-xl border border-border bg-bg px-4 py-3"
                            >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                    {index + 1}
                                </span>
                                <p className="text-sm text-text-secondary">{step.title}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-t border-border bg-surface/70">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-4 md:px-6">
                    <p className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">Trusted platform</p>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                        Australian doctors
                    </span>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                        Secure platform
                    </span>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                        Fast review
                    </span>
                </div>
            </div>
        </section>
    );
}

function PricingSection() {
    return (
        <section className="border-b border-border bg-surface">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Cost</p>
                        <h2 className="mt-2 text-3xl font-bold text-text-primary">Simple pricing that updates by duration</h2>
                    </div>
                    <p className="max-w-xl text-sm leading-relaxed text-text-secondary md:text-base">
                        $9.70 for 1 day, $15 for anything above one day, or choose All Access at $19/month.
                    </p>
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {PRICING_TIERS.map((tier) => (
                        <article key={tier.label} className="rounded-2xl border border-border bg-bg p-6">
                            <p className="inline-flex rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
                                {tier.label}
                            </p>
                            <h3 className="mt-4 text-xl font-semibold text-text-primary">{tier.title}</h3>
                            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{tier.note}</p>
                        </article>
                    ))}
                </div>
                <p className="mt-5 text-xs text-text-secondary">
                    All requests are subject to clinical review. Certificates are issued only when clinically appropriate.
                </p>
            </div>
        </section>
    );
}

function TrustLogoStrip() {
    const loopedLogos = [...TRUST_LOGOS, ...TRUST_LOGOS];

    return (
        <section className="border-b border-border bg-bg">
            <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-14">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                    Employers and institutions your patients recognise
                </p>
                <div className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-surface py-5">
                    <div className="absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-surface to-transparent" />
                    <div className="absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-surface to-transparent" />
                    <div className="logo-carousel-track gap-10 px-5">
                        {loopedLogos.map((logo, index) => (
                            <div
                                key={`${logo.src}-${index}`}
                                className="flex h-12 w-28 shrink-0 items-center justify-center rounded-xl border border-border bg-bg px-3"
                            >
                                <img src={logo.src} alt={logo.alt} className="max-h-7 w-full object-contain opacity-80" loading="lazy" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function SocialProofCarousel({ bookingHref }: { bookingHref: string }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (isPaused) return;

        const interval = window.setInterval(() => {
            setActiveIndex((previous) => (previous + 1) % SOCIAL_PROOF_ITEMS.length);
        }, 4800);

        return () => window.clearInterval(interval);
    }, [isPaused]);

    return (
        <section className="border-b border-border bg-surface">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Experience highlights</p>
                        <h2 className="mt-2 text-3xl font-bold text-text-primary">What this process is designed to deliver</h2>
                    </div>
                    <a
                        href={bookingHref}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 px-5 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
                    >
                        Start my request
                        <ArrowRight size={16} className="ml-2" />
                    </a>
                </div>

                <div
                    className="mt-8 overflow-hidden rounded-2xl border border-border bg-bg"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    <div
                        className="flex transition-transform duration-500 ease-out"
                        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                    >
                        {SOCIAL_PROOF_ITEMS.map((item) => (
                            <article key={item.title} className="w-full shrink-0 px-5 py-7 md:px-8 md:py-9">
                                <h3 className="text-xl font-semibold text-text-primary">{item.title}</h3>
                                <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary md:text-lg">{item.quote}</p>
                                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
                                    {item.meta}
                                </p>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                    {SOCIAL_PROOF_ITEMS.map((item, index) => (
                        <button
                            key={item.title}
                            type="button"
                            aria-label={`Go to highlight ${index + 1}`}
                            onClick={() => setActiveIndex(index)}
                            className={`h-2.5 rounded-full transition-all ${
                                index === activeIndex ? 'w-8 bg-primary' : 'w-2.5 bg-sand-300 hover:bg-sand-400'
                            }`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

function CertificateTypeSwitcher({ selectedPath }: { selectedPath: string }) {
    return (
        <section className="border-b border-border bg-bg">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <h2 className="text-3xl font-bold text-text-primary">What do you need today?</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary md:text-base">
                    Choose the certificate type that matches your situation. You can switch between options at any time.
                </p>
                <div className="mt-7 grid gap-4 md:grid-cols-3">
                    {CERTIFICATE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const selected = selectedPath === option.href;
                        return (
                            <a
                                key={option.key}
                                href={option.href}
                                aria-current={selected ? 'page' : undefined}
                                className={`rounded-2xl border bg-surface p-5 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                    selected
                                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                        : 'border-border hover:border-primary/40 hover:shadow-md'
                                }`}
                            >
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <Icon size={18} />
                                </div>
                                <h3 className="mt-4 text-base font-semibold text-text-primary">{option.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{option.description}</p>
                            </a>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function HowItWorks() {
    return (
        <section id="how-it-works" className="border-b border-border bg-surface">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <h2 className="text-3xl font-bold text-text-primary">How it works</h2>
                <div className="mt-7 grid gap-5 md:grid-cols-3">
                    {HOW_IT_WORKS_STEPS.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <article key={step.title} className="rounded-2xl border border-border bg-bg p-6">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                                    {index + 1}
                                </span>
                                <div className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon size={17} />
                                </div>
                                <h3 className="mt-4 text-lg font-semibold text-text-primary">{step.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.text}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function TrustSection({ lead }: { lead: string }) {
    return (
        <section className="border-b border-border bg-bg">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <h2 className="text-3xl font-bold text-text-primary">Why Australians use OnyaHealth</h2>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-base">{lead}</p>
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {TRUST_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <article key={item.title} className="rounded-2xl border border-border bg-surface p-6">
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                                    <Icon size={18} />
                                </div>
                                <h3 className="mt-4 text-lg font-semibold text-text-primary">{item.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function IntentSpecificSection({ config }: { config: LandingConfig }) {
    return (
        <section className="border-b border-border bg-surface">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <h2 className="text-3xl font-bold text-text-primary">{config.intentHeading}</h2>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-base">{config.intentCopy}</p>

                <div className="mt-8 grid gap-5 lg:grid-cols-2">
                    <article className="rounded-2xl border border-border bg-bg p-6">
                        <h3 className="text-lg font-semibold text-text-primary">What this is designed for</h3>
                        <ul className="mt-4 space-y-3">
                            {config.intentBullets.map((bullet) => (
                                <li key={bullet} className="flex items-start gap-3 text-sm text-text-secondary">
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                                    <span>{bullet}</span>
                                </li>
                            ))}
                        </ul>
                    </article>

                    <article className="rounded-2xl border border-border bg-bg p-6">
                        <h3 className="text-lg font-semibold text-text-primary">{config.seoHeading}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">{config.seoParagraph}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {config.keywords.map((keyword) => (
                                <span
                                    key={keyword}
                                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary"
                                >
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
}

function FAQAccordion({ items }: { items: FaqItem[] }) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section id="faq" className="border-b border-border bg-bg">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                <div className="mx-auto w-full max-w-4xl">
                    <h2 className="text-3xl font-bold text-text-primary">Frequently asked questions</h2>
                    <div className="mt-7 space-y-4">
                        {items.map((item, idx) => {
                            const isOpen = openIndex === idx;
                            const panelId = `faq-panel-${idx}`;
                            return (
                                <div key={item.question} className="rounded-2xl border border-border bg-surface px-5 py-4 md:px-6">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 text-left"
                                        aria-expanded={isOpen}
                                        aria-controls={panelId}
                                        onClick={() => setOpenIndex(isOpen ? null : idx)}
                                    >
                                        <span className="text-base font-semibold text-text-primary">{item.question}</span>
                                        <ChevronDown
                                            size={18}
                                            className={`shrink-0 text-text-secondary transition-transform ${
                                                isOpen ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>
                                    <div
                                        id={panelId}
                                        className={`grid transition-all duration-300 ${
                                            isOpen ? 'mt-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                        }`}
                                    >
                                        <p className="overflow-hidden text-sm leading-relaxed text-text-secondary">{item.answer}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}

function FinalCTA({ bookingHref }: { bookingHref: string }) {
    return (
        <section className="bg-primary/5">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 text-center md:px-6 md:py-16">
                <h2 className="text-3xl font-bold text-text-primary">Need a certificate today?</h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-text-secondary">
                    Start your request online in under 2 minutes.
                </p>
                <a
                    href={bookingHref}
                    className="mt-7 inline-flex h-13 items-center justify-center rounded-xl bg-primary px-7 text-base font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                    Start My Request
                </a>
            </div>
        </section>
    );
}

function StickyMobileCTA({ bookingHref, ctaLabel }: { bookingHref: string; ctaLabel: string }) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-8px_28px_rgba(15,23,42,0.14)] backdrop-blur md:hidden">
            <a
                href={bookingHref}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover"
            >
                {ctaLabel}
                <ArrowRight size={16} className="ml-2" />
            </a>
        </div>
    );
}

export default function CertificateCampaignPage() {
    const pathname = window.location.pathname.toLowerCase();
    const config = useMemo(
        () => LANDING_CONFIGS[pathname] || LANDING_CONFIGS['/medical-certificate-work'],
        [pathname]
    );
    const selectedOption = CERTIFICATE_OPTIONS.find((item) => item.key === config.purposeParam) || CERTIFICATE_OPTIONS[0];
    const bookingHref = '/doctor';

    useEffect(() => {
        document.title = config.metaTitle;
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute('content', config.metaDescription);
        }
    }, [config.metaDescription, config.metaTitle]);

    return (
        <main className="min-h-screen bg-bg pb-20 md:pb-0">
            <Navbar ctaHref={bookingHref} />
            <Hero config={config} bookingHref={bookingHref} selectedTitle={selectedOption.title} />
            <PricingSection />
            <CertificateTypeSwitcher selectedPath={config.path} />
            <HowItWorks />
            <TrustSection lead={config.trustLead} />
            <TrustLogoStrip />
            <IntentSpecificSection config={config} />
            <SocialProofCarousel bookingHref={bookingHref} />
            <FAQAccordion items={config.faqItems} />
            <FinalCTA bookingHref={bookingHref} />
            <Footer consultHref={bookingHref} />
            <StickyMobileCTA bookingHref={bookingHref} ctaLabel={config.heroCta} />
        </main>
    );
}
