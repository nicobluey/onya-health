import { ArrowRight, CheckCircle2, Clock3, FileCheck2, ShieldCheck } from 'lucide-react';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

const HERO_POINTS = [
    'From $9.71 for a 1-day request',
    'Australian doctor review',
    'Secure portal and email delivery',
];

const HOME_HIGHLIGHTS = [
    { icon: Clock3, title: '24/7', detail: 'Start the request anytime' },
    { icon: ShieldCheck, title: 'Reviewed', detail: 'Doctor decision pathway' },
    { icon: FileCheck2, title: 'Digital', detail: 'Clear status and delivery' },
];

const CERTIFICATE_OPTIONS = [
    {
        title: 'Work',
        label: 'Work certificates',
        body: 'Sick leave and workplace absence documentation for common short-term illness.',
        image: '/landing-work-certificate.webp',
        href: '/work',
    },
    {
        title: 'Study',
        label: 'Student certificates',
        body: 'Documentation support when illness affects class, placement, exams, or assessment deadlines.',
        image: '/landing-university-certificate.webp',
        href: '/student',
    },
    {
        title: 'Care',
        label: 'Carer certificates',
        body: 'Request documentation for carer responsibilities and family care scenarios.',
        image: '/landing-carers-certificate.webp',
        href: '/caretaker',
    },
];

const REQUEST_STEPS = [
    'Choose purpose',
    'Share symptoms',
    'Doctor reviews',
    'Outcome delivered',
];

export default function HomePage() {
    return (
        <div className="flex min-h-screen flex-col bg-white font-sans text-text-primary">
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden bg-[#f3f8ff]">
                    <div className="absolute inset-0">
                        <img
                            src="/Medical Certificate Landing.webp"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover object-[22%_center] md:object-center"
                        />
                    </div>

                    <div className="relative z-10 mx-auto flex min-h-[calc(100svh-64px)] max-w-7xl items-center px-5 py-10 md:min-h-[680px] md:px-8 md:py-20">
                        <div className="max-w-[760px]">
                            <p className="onya-kicker bg-white/95">Doctor-reviewed medical certificates</p>
                            <h1 className="onya-display mt-5 max-w-[9ch] text-[#06142b]">
                                Certificates online.
                            </h1>
                            <p className="mt-5 max-w-[560px] text-lg font-semibold leading-relaxed text-[#06142b] md:text-xl">
                                Request a medical certificate online without waiting room admin. A doctor reviews your details and issues documentation where clinically appropriate.
                            </p>

                            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                                <a href="/doctor#book" className="onya-button">
                                    Start certificate request
                                    <ArrowRight size={18} />
                                </a>
                                <a href="#certificate-options" className="onya-button-secondary">
                                    Choose certificate type
                                </a>
                            </div>

                            <div className="mt-7 grid gap-2 text-sm font-bold text-[#06142b] sm:grid-cols-3">
                                {HERO_POINTS.map((point) => (
                                    <div key={point} className="flex min-w-0 items-center gap-2">
                                        <CheckCircle2 size={17} className="shrink-0 text-primary" />
                                        <span>{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <div className="border-y border-border bg-white">
                    <div className="mx-auto grid max-w-7xl gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center md:px-8">
                        <div className="grid gap-3 sm:grid-cols-3">
                            {HOME_HIGHLIGHTS.map((item) => (
                                <div key={item.title} className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f8ff] text-primary">
                                        <item.icon size={18} />
                                    </span>
                                    <div>
                                        <p className="font-extrabold leading-tight text-[#06142b]">{item.title}</p>
                                        <p className="text-sm text-text-secondary">{item.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="max-w-xl text-sm font-medium text-text-secondary">
                            Clear pricing, secure payment, and a focused certificate flow built for mobile and desktop.
                        </p>
                    </div>
                </div>

                <section id="certificate-options" className="scroll-mt-24 bg-[#f5f7fa]">
                    <div className="onya-section mx-auto max-w-7xl px-5 md:px-8">
                        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
                            <div>
                                <p className="onya-kicker">Certificate type</p>
                                <h2 className="onya-heading-xl mt-4 max-w-[11ch] text-[#06142b]">
                                    Pick the path. Start the request.
                                </h2>
                                <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
                                    Work, study, and carer leave each start from the same secure doctor-reviewed pathway.
                                </p>
                            </div>

                            <div className="onya-panel grid gap-0 overflow-hidden sm:grid-cols-4">
                                {REQUEST_STEPS.map((step, idx) => (
                                    <div key={step} className="border-b border-border p-4 sm:border-b-0 sm:border-r last:border-r-0">
                                        <p className="text-2xl font-extrabold text-primary">{idx + 1}</p>
                                        <p className="mt-2 text-sm font-bold text-[#06142b]">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-10 grid gap-4 md:grid-cols-3">
                            {CERTIFICATE_OPTIONS.map((option) => (
                                <article key={option.title} className="onya-tile group flex h-full flex-col">
                                    <a href={option.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                                        <div className="aspect-[4/3] overflow-hidden bg-[#eef4fb]">
                                            <img
                                                src={option.image}
                                                alt=""
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                loading="lazy"
                                            />
                                        </div>
                                    </a>
                                    <div className="flex flex-1 flex-col p-5">
                                        <p className="text-sm font-extrabold uppercase text-primary">{option.title}</p>
                                        <h3 className="mt-2 text-2xl font-extrabold leading-none text-[#06142b]">{option.label}</h3>
                                        <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{option.body}</p>
                                        <a href={option.href} className="onya-button mt-5 w-full">
                                            Start this request
                                            <ArrowRight size={16} />
                                        </a>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks serviceSlug="doctor" />
                </div>

                <UsedByPatientsSection />
                <HomeReviews />
                <BlogsSection />

                <section id="faq" className="bg-white py-8">
                    <FAQ />
                </section>
            </main>

            <Footer consultHref="/doctor" />
        </div>
    );
}
