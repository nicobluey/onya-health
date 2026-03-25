import { useEffect } from 'react';
import { ArrowRight, HeartPulse, Stethoscope, Users } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

const PRINCIPLES = [
    {
        title: 'Doctor-founded clinical quality',
        body: 'Clinical governance, safe triage, and doctor-reviewed decisions are built into the platform from day one.',
        icon: Stethoscope,
    },
    {
        title: 'Patient-founded lived experience',
        body: 'Real patient pain points shaped the experience: less waiting, clearer updates, and simpler digital follow-up.',
        icon: HeartPulse,
    },
    {
        title: 'One shared mission',
        body: 'We combine clinician insight and patient perspective to build a next-generation platform that works for everyone in care.',
        icon: Users,
    },
];

const EXPERIENCE_AREAS = [
    {
        title: 'For patients',
        points: [
            'Faster access to care pathways without avoidable friction',
            'Clear status updates from request through clinical outcome',
            'Secure digital records and straightforward follow-up',
        ],
    },
    {
        title: 'For providers',
        points: [
            'Better pre-consult context for safer, faster review',
            'Structured workflows that reduce repetitive admin',
            'A platform designed to protect clinical time and judgment',
        ],
    },
];

export default function AboutPage() {
    useEffect(() => {
        document.title = 'About Onya Health | Doctor and Patient Founded';
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute(
                'content',
                'Onya Health is doctor and patient founded. We combine shared lived experience to build a next-generation platform that improves care for both patients and providers.'
            );
        }
    }, []);

    return (
        <main className="min-h-screen bg-bg">
            <header className="sticky top-0 z-40 border-b border-border bg-white shadow-sm">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                    <HeaderBrand />
                    <div className="flex items-center gap-3">
                        <HeaderDropdown buttonClassName="h-10 w-10 rounded-xl text-text-primary/90 flex items-center justify-center hover:bg-sand-75 transition-colors" />
                        <a
                            href="/doctor"
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                    </div>
                </div>
            </header>

            <section className="border-b border-border bg-sunlight-50">
                <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-20">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">About Onya Health</p>
                    <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight text-text-primary md:text-5xl">
                        Doctor and patient founded, built for better care on both sides
                    </h1>
                    <p className="mt-5 max-w-3xl text-lg leading-relaxed text-text-secondary">
                        Onya Health was created by people who have lived healthcare from both perspectives. By combining clinical expertise
                        with patient experience, we are building a next-generation platform that improves outcomes, trust, and efficiency
                        for patients and providers.
                    </p>
                </div>
            </section>

            <section className="border-b border-border bg-surface">
                <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                    <h2 className="text-3xl font-bold text-text-primary">Why we exist</h2>
                    <div className="mt-8 grid gap-4 md:grid-cols-3">
                        {PRINCIPLES.map((principle) => {
                            const Icon = principle.icon;
                            return (
                                <article key={principle.title} className="rounded-2xl border border-border bg-bg p-6">
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <Icon size={18} />
                                    </div>
                                    <h3 className="mt-4 text-lg font-semibold text-text-primary">{principle.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{principle.body}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="border-b border-border bg-bg">
                <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-16">
                    <h2 className="text-3xl font-bold text-text-primary">Improving the patient and provider experience</h2>
                    <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary">
                        We believe better healthcare platforms should support both compassionate patient journeys and sustainable clinician
                        workflows. Onya Health is designed to move both forward together.
                    </p>

                    <div className="mt-8 grid gap-5 md:grid-cols-2">
                        {EXPERIENCE_AREAS.map((area) => (
                            <article key={area.title} className="rounded-2xl border border-border bg-surface p-6">
                                <h3 className="text-xl font-semibold text-text-primary">{area.title}</h3>
                                <ul className="mt-4 space-y-3">
                                    {area.points.map((point) => (
                                        <li key={point} className="flex items-start gap-3 text-sm text-text-secondary">
                                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                                            <span>{point}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="bg-primary/5">
                <div className="mx-auto w-full max-w-6xl px-4 py-14 text-center md:px-6 md:py-16">
                    <h2 className="text-3xl font-bold text-text-primary">Building the next generation of digital care</h2>
                    <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
                        Every product decision we make is grounded in one question: does this make care safer, clearer, and better for both
                        patients and providers?
                    </p>
                    <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <a
                            href="/doctor"
                            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start a medical certificate consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                        <a
                            href="/patient-login"
                            className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-text-primary transition hover:border-primary/40"
                        >
                            Patient login
                        </a>
                    </div>
                </div>
            </section>

            <Footer consultHref="/doctor" />
        </main>
    );
}
