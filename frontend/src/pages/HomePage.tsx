import { ArrowRight, CheckCircle2, Clock3, FileCheck2, ShieldCheck } from 'lucide-react';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

const HOME_THEME = {
    pageBg: '#ffffff',
    heroBg: '#F1F8FF',
};

const HOME_HIGHLIGHTS = [
    { icon: Clock3, title: '24/7', detail: 'Start anytime' },
    { icon: ShieldCheck, title: 'Doctor-reviewed', detail: 'Australian clinical review' },
    { icon: FileCheck2, title: 'Digital', detail: 'Portal and email delivery' },
];

const HERO_TRUST_POINTS = [
    'From $9.71 for a 1-day request',
    'No clinic waiting room',
    'Secure patient portal',
];

const CERTIFICATE_OPTIONS = [
    {
        title: 'Work certificates',
        body: 'Sick leave and workplace absence documentation for common short-term illness.',
        image: '/landing-work-certificate.webp',
        href: '/work',
        badge: 'Most requested',
    },
    {
        title: 'Student certificates',
        body: 'Documentation support when illness affects class, placement, exams, or assessment deadlines.',
        image: '/landing-university-certificate.webp',
        href: '/student',
        badge: 'Study and exams',
    },
    {
        title: 'Carer certificates',
        body: 'Request documentation for carer responsibilities and family care scenarios.',
        image: '/landing-carers-certificate.webp',
        href: '/caretaker',
        badge: 'Family care',
    },
];

const REQUEST_STEPS = [
    'Choose your certificate purpose',
    'Tell the doctor what happened',
    'Receive an outcome if clinically appropriate',
];

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: HOME_THEME.pageBg }}>
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden" style={{ backgroundColor: HOME_THEME.heroBg }}>
                    <div className="absolute inset-0">
                        <img
                            src="/Medical Certificate Landing.webp"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover object-[18%_center] md:object-center"
                        />
                    </div>
                    <div className="relative z-10 mx-auto flex min-h-[500px] max-w-7xl items-center px-5 py-10 md:min-h-[620px] md:px-8 md:py-20">
                        <div className="max-w-[620px] pt-8 md:pt-8">
                            <p className="inline-flex items-center rounded-full border border-[#BFDFFF] bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1F7BE6] shadow-sm md:text-xs md:tracking-[0.14em]">
                                Doctor-reviewed medical certificates
                            </p>
                            <h1 className="mt-4 text-[42px] font-bold leading-[0.96] tracking-tight text-text-primary sm:text-6xl md:mt-5 md:text-7xl">
                                Medical certificates online, without the waiting room
                            </h1>
                            <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-bark-700 md:mt-5 md:text-xl">
                                Start a secure online request in minutes. An Australian doctor reviews your details and issues documentation where clinically appropriate.
                            </p>
                            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row md:mt-8 md:gap-3">
                                <a
                                    href="/doctor#book"
                                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2E8CFF] px-6 text-sm font-bold text-white shadow-[0_18px_36px_-24px_rgba(46,140,255,0.85)] transition hover:bg-[#1F7BE6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8CFF] focus-visible:ring-offset-2 md:h-12"
                                >
                                    Start certificate request
                                    <ArrowRight size={17} className="ml-2" />
                                </a>
                                <a
                                    href="#certificate-options"
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-[#BFDFFF] bg-white/90 px-6 text-sm font-bold text-[#0F2F57] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8CFF] focus-visible:ring-offset-2 md:h-12"
                                >
                                    Choose certificate type
                                </a>
                            </div>
                            <div className="mt-5 grid gap-1.5 text-[13px] font-semibold text-bark-700 sm:grid-cols-3 md:mt-7 md:gap-2 md:text-sm">
                                {HERO_TRUST_POINTS.map((point) => (
                                    <div key={point} className="flex min-w-0 items-center gap-2">
                                        <CheckCircle2 size={17} className="shrink-0 text-[#2E8CFF]" />
                                        <span>{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <div className="relative overflow-hidden border-y border-[#CFE4F8] bg-white py-4">
                    <div className="max-w-7xl mx-auto px-6 md:px-8">
                        <div className="relative z-10 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                            <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
                                {HOME_HIGHLIGHTS.map((item) => (
                                    <div key={item.title} className="flex min-w-0 items-center gap-2.5">
                                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#1F7BE6]">
                                            <item.icon size={18} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="break-words text-lg font-bold leading-tight text-text-primary">{item.title}</p>
                                            <p className="mt-0.5 text-xs font-medium text-bark-500">{item.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                                Clear pricing, secure payment, and a focused certificate flow built for mobile and desktop.
                            </p>
                        </div>
                    </div>
                </div>

                <section id="certificate-options" className="relative scroll-mt-24 overflow-hidden bg-[#F7FBFF]">
                    <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
                        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1F7BE6]">Start with the certificate you need</p>
                                <h2 className="mt-3 text-3xl font-bold leading-tight text-text-primary md:text-5xl">
                                    A direct path for work, study, and carer leave
                                </h2>
                                <p className="mt-4 text-base leading-relaxed text-text-secondary md:text-lg">
                                    Choose the closest reason, complete one focused intake, and keep every update in the patient portal.
                                </p>
                            </div>
                            <div className="grid gap-3 rounded-2xl border border-[#CFE4F8] bg-white p-4 shadow-sm sm:grid-cols-3">
                                {REQUEST_STEPS.map((step, idx) => (
                                    <div key={step} className="flex gap-3 sm:block">
                                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2E8CFF] text-sm font-bold text-white">
                                            {idx + 1}
                                        </span>
                                        <p className="text-sm font-semibold leading-snug text-text-primary sm:mt-3">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-8 grid gap-5 md:grid-cols-3">
                            {CERTIFICATE_OPTIONS.map((option) => (
                                <article
                                    key={option.title}
                                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#CFE4F8] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                >
                                    <a href={option.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8CFF] focus-visible:ring-offset-2">
                                        <div className="aspect-[4/3] overflow-hidden bg-[#EAF4FF]">
                                            <img
                                                src={option.image}
                                                alt=""
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                                                loading="lazy"
                                            />
                                        </div>
                                    </a>
                                    <div className="flex flex-1 flex-col p-5">
                                        <span className="inline-flex w-fit rounded-full bg-[#EAF4FF] px-3 py-1 text-xs font-bold text-[#1F7BE6]">
                                            {option.badge}
                                        </span>
                                        <h3 className="mt-4 text-2xl font-bold leading-tight text-text-primary">{option.title}</h3>
                                        <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{option.body}</p>
                                        <a
                                            href={option.href}
                                            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#0F2F57] px-4 text-sm font-bold text-white transition hover:bg-[#071C35] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E8CFF] focus-visible:ring-offset-2"
                                        >
                                            Start this request
                                            <ArrowRight size={16} className="ml-2" />
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
